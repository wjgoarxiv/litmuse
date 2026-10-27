import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { latestFile, readLiveness, readStage, stageFile, workspaceHash } from '../plugin/hooks/lib/stage.mjs';
import { newerThan } from '../plugin/hooks/lib/common.mjs';
import { readManifest } from './bundle.mjs';
import { paths } from './paths.mjs';
import { gauge } from '../plugin/lib/rewind/gauge.mjs';
import { REVIEW_LANES, projectKey, resolveProjectStateRoot } from '../plugin/hooks/lib/workflow-stack.mjs';

// The hooks write `.litmuse` at the project state root, which may sit above the card's cwd.
const stacksDir = (cwd) => join(resolveProjectStateRoot(cwd), '.litmuse', 'workflow-stack');

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Plan rows are `- [ ] N. text` / `- [x] N. text`, read live from the plan file.
export function planProgress(cwd, planFile) {
  try {
    let file = planFile;
    if (!file) {
      const dir = join(cwd, 'plans');
      if (!existsSync(dir)) return null;
      let best = null;
      for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        const m = statSync(join(dir, name)).mtimeMs;
        if (/^- \[[ xX]\] \d+\./m.test(readFileSync(join(dir, name), 'utf8')) && (!best || m > best.m)) best = { name, m };
      }
      if (!best) return null;
      file = `plans/${best.name}`;
    }
    const rows = [...readFileSync(join(cwd, file), 'utf8').matchAll(/^- \[([ xX])\] (\d+)\.\s*(.*)$/gm)];
    if (!rows.length) return null;
    const open = rows.find((r) => r[1] === ' ');
    let mtimeMs = null;
    try {
      mtimeMs = statSync(join(cwd, file)).mtimeMs;
    } catch {
      // Readable just now but stat fails: freshness stays unknown.
    }
    return {
      file, total: rows.length, done: rows.filter((r) => r[1] !== ' ').length,
      next: open ? { row: Number(open[2]), text: open[3].slice(0, 120) } : null,
      mtimeMs,
    };
  } catch {
    return null;
  }
}

export function activeGoal(cwd) {
  try {
    const dir = join(cwd, '.litmuse', 'goals');
    let best = null;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const g = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        const m = statSync(join(dir, name)).mtimeMs;
        if (g && g.status === 'active' && (!best || m > best.m)) best = { g, m };
      } catch { /* skip unreadable goal */ }
    }
    if (!best) return null;
    const criteria = Array.isArray(best.g.criteria) ? best.g.criteria : [];
    return {
      slug: best.g.slug ?? null, objective: String(best.g.objective ?? '').slice(0, 200),
      met: criteria.filter((c) => c.status === 'pass').length, total: criteria.length,
      open: criteria.filter((c) => c.status !== 'pass').map((c) => ({ id: c.id, text: String(c.text ?? '').slice(0, 120) })),
      mtimeMs: best.m,
    };
  } catch {
    return null;
  }
}

export function loadStage({ cwd, session, env = process.env }) {
  if (session) return readStage(stageFile(cwd, session, env));
  const ptr = readStage(latestFile(env));
  const entry = ptr && ptr[workspaceHash(cwd)];
  return entry && entry.session ? readStage(stageFile(cwd, entry.session, env)) : null;
}

// One rainbow-tinted line at most: a static ANSI gradient, no animation, no blinking, no
// full-field luminance swing, so it stays flash-safe on any terminal. It marks the adhd turn.
const RAINBOW = [196, 208, 226, 46, 51, 21, 201];
export function rainbowLine(text) {
  let color = 0;
  let out = '';
  for (const ch of String(text)) {
    out += ch === ' ' ? ch : `\u001b[38;5;${RAINBOW[color++ % RAINBOW.length]}m${ch}`;
  }
  return `${out}\u001b[0m`;
}

// Fresh workflow stacks mean recent sessions worth briefing: any stack file touched in 24 h.
export function freshStacks(cwd, now = Date.now()) {
  try {
    const dir = stacksDir(cwd);
    const day = 24 * 60 * 60 * 1000;
    return readdirSync(dir).some((name) => name.endsWith('.json') && now - statSync(join(dir, name)).mtimeMs <= day);
  } catch {
    return false;
  }
}

// Thread rows for the status card, read from the workflow stacks at render time. Every count
// resolves from exactly one source, in this order: the frame's recorded k/n, the named plan's
// rows, the active goal's criteria, otherwise the indeterminate pulse. Frames without a stage
// (a pure `record` spine) and frames older than 24 h are dropped; sibling sessions older than
// 15 minutes are skipped. Order is fixed (own stack, then other sessions as below), so a repaint
// with no change is byte-identical.
const THREAD_CAP = 6;
const THREAD_STALE_MS = 24 * 60 * 60 * 1000;
const SIBLING_FRESH_MS = 15 * 60 * 1000;

const readStackFile = (path) => {
  try {
    const text = readFileSync(path, 'utf8');
    if (text.length > 64 * 1024) return null;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.frames) ? parsed : null;
  } catch {
    return null;
  }
};

const frameGauge = (frame, cwd, goal) => {
  if (Number.isInteger(frame.n) && Number.isInteger(frame.total)) return gauge(frame.n, frame.total);
  if (frame.ref?.plan) {
    const plan = planProgress(cwd, frame.ref.plan);
    if (plan) return gauge(plan.done, plan.total);
  }
  if (goal) return gauge(goal.met, goal.total);
  return gauge(null, null);
};

const frameRow = (frame, session, cwd, goal) => ({
  session,
  skill: typeof frame.skill === 'string' ? frame.skill : 'unknown',
  stage: typeof frame.stage === 'string' ? frame.stage : null,
  status: frame.status === 'paused' ? 'paused' : 'active',
  gauge: frameGauge(frame, cwd, goal),
  verdicts: frame.verdicts && typeof frame.verdicts === 'object' ? { ...frame.verdicts } : undefined,
});

// Other sessions of this project come from two sources: their fresh workflow stacks and their liveness
// records (alive, idle, ended, written by the hooks). Each reads `running`, `idle` or `done`; a session
// that ended, or whose start-work plan is fully ticked, reads `done` for a minute and then leaves the
// card. Running rows come first, then paused and idle ones, then done; ties keep the name order. A
// session started in a herdr pane is named `<skill> · <pane>` instead of by its id, and a session with
// no stack still gets a row (skill from its stage record, else `session`), even as the only row.
const DONE_SHOW_MS = 60 * 1000;
const OTHER_RANK = Object.freeze({ running: 0, paused: 1, idle: 1, done: 2 });
const fileKey = (session) => String(session).replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 128);

const finishedAt = (frame, live, cwd) => {
  if (live?.state === 'ended') return Date.parse(live.at);
  if (frame?.skill === 'start-work' && frame.ref?.plan) {
    const plan = planProgress(cwd, frame.ref.plan);
    if (plan && plan.total > 0 && plan.done >= plan.total && Number.isFinite(plan.mtimeMs)) return plan.mtimeMs;
  }
  return null;
};

function otherRows({ cwd, own, names, stacks, env, now, goal }) {
  const others = new Map();
  for (const name of names) {
    const path = join(stacks, name);
    let mtime = 0;
    try {
      mtime = statSync(path).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtime > SIBLING_FRESH_MS) continue;
    const top = readStackFile(path)?.frames.at(-1);
    if (top?.stage) others.set(name.replace(/\.json$/, ''), { frame: top });
  }
  const root = projectKey(cwd);
  for (const live of readLiveness(env)) {
    if (typeof live.session !== 'string' || typeof live.cwd !== 'string' || live.session === own) continue;
    if (projectKey(live.cwd) !== root) continue;
    const entry = others.get(live.session);
    if (!entry && live.state !== 'ended' && now - Date.parse(live.at) > SIBLING_FRESH_MS) continue;
    others.set(live.session, { ...entry, live });
  }
  const rows = [];
  for (const [id, { frame, live }] of [...others].sort(([a], [b]) => a.localeCompare(b))) {
    const done = finishedAt(frame, live, cwd);
    if (done !== null && !(now - done <= DONE_SHOW_MS)) continue;
    const word = done !== null ? 'done' : live?.state === 'idle' ? 'idle' : 'running';
    const route = frame ? null : readStage(stageFile(cwd, id, env))?.route;
    const row = frame ? frameRow(frame, id, cwd, goal) : { session: id, skill: typeof route === 'string' && route ? route : 'session', stage: null, gauge: '' };
    // The status word already says running; an unknown count adds nothing.
    if (row.gauge === gauge(null, null)) row.gauge = '';
    rows.push({
      ...row,
      status: frame?.status === 'paused' && word !== 'done' ? 'paused' : word,
      pane: typeof live?.pane === 'string' ? live.pane : null,
      sibling: true,
    });
  }
  return rows.sort((a, b) => OTHER_RANK[a.status] - OTHER_RANK[b.status]);
}

export function threadRows({ cwd, session, env = process.env, now = Date.now() }) {
  const goal = activeGoal(cwd);
  const stacks = stacksDir(cwd);
  let dir = [];
  try {
    dir = readdirSync(stacks);
  } catch { /* no stacks yet: liveness may still name other sessions */ }
  const own = session ? fileKey(session) : null;
  const rows = [];
  if (own) {
    const stack = readStackFile(join(stacks, `${own}.json`));
    for (const frame of stack?.frames ?? []) {
      if (!frame.stage) continue;
      if (frame.at && now - Date.parse(frame.at) > THREAD_STALE_MS) continue;
      rows.push(frameRow(frame, session, cwd, goal));
    }
  }
  const names = dir.filter((entry) => entry.endsWith('.json') && entry !== `${own}.json`);
  rows.push(...otherRows({ cwd, own, names, stacks, env, now, goal }));
  return { rows: rows.slice(0, THREAD_CAP), omitted: Math.max(0, rows.length - THREAD_CAP) };
}

// The restart chip: the installed bundle carries a newer version than the code this session loaded at
// SessionStart, so the hooks and skills in use are older until Muse restarts. Unknown either way: no chip.
function restartTo(rec, env) {
  if (typeof rec?.loadedVersion !== 'string') return null;
  try {
    const installed = readManifest(paths(env).stage).version;
    return typeof installed === 'string' && newerThan(installed, rec.loadedVersion) ? installed : null;
  } catch {
    return null;
  }
}

export function buildCard({ cwd, session, env = process.env, now = Date.now() }) {
  const rec = loadStage({ cwd, session, env });
  const goal = activeGoal(cwd);
  const threads = threadRows({ cwd, session: rec?.session ?? session ?? null, env, now });
  if (!rec) return { active: false, route: null, goal, plan: planProgress(cwd, null), lanes: [], threads, idle: freshStacks(cwd, now), now, noColor: Boolean(env.NO_COLOR) };
  const lanes = (rec.lanes ?? []).map((l) => ({
    id: l.id, type: l.type, status: l.status,
    elapsedMs: (l.endedAt ?? now) - l.startedAt,
  }));
  return {
    active: Boolean(rec.route), route: rec.route ?? null, keyword: rec.keyword ?? null, kind: rec.kind ?? null,
    session: rec.session ?? null, activeMs: rec.route && rec.activatedAt ? now - rec.activatedAt : null,
    plan: planProgress(cwd, rec.plan ?? null), lanes, goal, threads, idle: !rec.route && freshStacks(cwd, now), updated: rec.updated ?? null, now, noColor: Boolean(env.NO_COLOR),
    restartTo: restartTo(rec, env),
  };
}

// Skill looks (BRIEF-mod-looks). Static TTY only: colour plus a label, never animation —
// the host has no card animation surface, and NO_COLOR strips even the static colour.
// The registry maps a card state to its headline paint; the lanes strip and the done burst
// are extra lines drawn from real reports only, never placeholders.
const paint = (code, text, color) => (color ? `\u001b[${code}m${text}\u001b[0m` : text);

// Waiting on the user: a paused thread, or a lane that reported failure. A turn where the
// model asked a question but left no tool state is not visible to the card.
const waitingOf = (card) => (card.threads?.rows ?? []).some((row) => row.status === 'paused')
  || (card.lanes ?? []).some((lane) => lane.status === 'failed');

const headlineFor = (card, color) => {
  if (!card.active) return 'LIT · no active route in this workspace';
  const route = card.route ?? 'lit-loop';
  if (waitingOf(card)) return paint('33;1', `LIT · ${route} · YOUR TURN`, color);
  if (route === 'lit-adhd') return color ? rainbowLine('LIT · lit-adhd · brief on screen') : 'LIT · lit-adhd · brief on screen';
  return `LIT · ${route}${card.activeMs !== null ? ` · active ${fmtDuration(card.activeMs)}` : ''}${card.kind && card.kind !== 'ignite' ? ` (${card.kind})` : ''}`;
};

// Canonical review-lane display names, in REVIEW_LANES order; the strip reads the same
// list, so the two cannot drift apart.
const REVIEW_LANE_LABELS = Object.freeze({ goal: 'scope', quality: 'package', security: 'security', qa: 'tests+evidence', context: 'surface' });
const VERDICT_DOT = Object.freeze({ pass: ['32;1', '●'], fail: ['31;1', '●'], running: ['33;1', '◐'], pending: ['33', '○'] });

const laneSegment = (id, verdict, color) => {
  const label = REVIEW_LANE_LABELS[id] ?? id;
  const known = verdict ? VERDICT_DOT[verdict] : null;
  if (!known) return paint('2', `${label} ○`, color);
  return paint(known[0], `${label} ${known[1]}`, color);
};

const lanesStrip = (card, color) => {
  const frame = (card.threads?.rows ?? []).find((row) => row.skill === 'review-work' && row.verdicts);
  const verdicts = frame?.verdicts ?? {};
  return `review lanes: ${REVIEW_LANES.map(({ id }) => laneSegment(id, verdicts[id], color)).join(' · ')}`;
};

// Static TTY cannot play a one-shot animation and settle: a freshly completed plan or goal
// prints one celebratory line until the freshness window passes, then the card settles on
// its own. A published release has no signal the card can see.
const BURST_FRESH_MS = 15 * 60 * 1000;
const burstOf = (card, now) => {
  const plan = card.plan;
  if (plan && plan.total > 0 && plan.done >= plan.total && Number.isFinite(plan.mtimeMs) && now - plan.mtimeMs <= BURST_FRESH_MS) {
    return `✨ done: ${plan.file} · ${plan.done}/${plan.total} rows ticked ✨`;
  }
  const goal = card.goal;
  if (goal && goal.total > 0 && goal.met >= goal.total && Number.isFinite(goal.mtimeMs) && now - goal.mtimeMs <= BURST_FRESH_MS) {
    return `✨ goal done: ${goal.objective} ✨`;
  }
  return null;
};

export function renderCard(card) {
  const out = [];
  const color = !card.noColor;
  out.push(headlineFor(card, color));
  if (card.restartTo) out.push(`restart to ${card.restartTo}: LitMuse was updated after this session loaded it`);
  if (!card.active && card.idle) out.push('idle — say `lit adhd` for the cross-session brief');
  const threads = card.threads?.rows ?? [];
  if (threads.length) {
    out.push('threads:');
    threads.forEach((thread, index) => {
      const branch = index === threads.length - 1 && !card.threads.omitted ? '└─' : '├─';
      const name = thread.pane ? `${thread.skill} · ${thread.pane}` : thread.skill;
      const where = thread.sibling && !thread.pane ? ` (${thread.session})` : '';
      out.push(`${branch} ${name}${thread.stage ? ` ${thread.stage}` : ''} ${thread.status}${thread.gauge ? ` ${thread.gauge}` : ''}${where}`);
    });
    if (card.threads.omitted) out.push(`+${card.threads.omitted} more`);
  }
  if (card.plan) {
    out.push(`plan ${card.plan.done}/${card.plan.total} · ${card.plan.file}${card.plan.next ? ` · next ${card.plan.next.row}. ${card.plan.next.text}` : ' · all rows ticked'}`);
  }
  const running = card.lanes.filter((l) => l.status === 'running');
  const finished = card.lanes.filter((l) => l.status !== 'running');
  if (running.length) out.push(`lanes running: ${running.map((l) => `${l.type} ${fmtDuration(l.elapsedMs)}`).join(', ')}`);
  if (finished.length) out.push(`lanes finished: ${finished.map((l) => `${l.type} ${l.status} ${fmtDuration(l.elapsedMs)}`).join(', ')}`);
  if (card.route === 'review-work') out.push(lanesStrip(card, color));
  if (card.goal) {
    out.push(`goal: ${card.goal.objective} (${card.goal.met}/${card.goal.total} criteria met)`);
    for (const c of card.goal.open.slice(0, 5)) out.push(`  open ${c.id}: ${c.text}`);
  }
  const burst = burstOf(card, card.now ?? Date.now());
  if (burst) out.push(burst);
  return out.join('\n');
}
