// The lit-adhd record collector behind `litmuse rewind`. It reads what is on disk for every
// worktree of this repo (Muse transcripts, the litgoal records, plan rows, handoff headings, git
// log, workflow stacks and the session's stage record, and herdr when HERDR_ENV=1) and returns one
// redacted, capped JSON brief. A source that is not there reads `unknown`; nothing is inferred.
// It writes one file only: this session's next-step record for `go`.
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { parsePlanTaskRows } from '../plan-task-rows.mjs';
import { PULSE_UNKNOWN, aggregateProgress, clipToWidth, displayWidth, progressOf } from './gauge.mjs';
import { chooseNextStep, writeNextStep } from './next-step.mjs';
import { makeRedactor } from './redact.mjs';
import { findTranscripts, makeBudget, readTranscriptLines, sessionRecord } from './transcripts.mjs';
import { rainbowLine } from '../../../lib/stage-card.mjs';

const SMALL_FILE_BYTES = 1024 * 1024;
const HERDR_TIMEOUT_MS = 2000;
const GIT_TIMEOUT_MS = 5000;
const DEFAULT_SINCE = '7d';
const DEFAULT_MAX = 12;
const NAME_MAX = 90;
const PLAN_LIMIT = 8;

/** `7d`, `12h`, `30m` in milliseconds, or null. */
export const parseSince = (text) => {
  const match = /^(\d{1,4})([dhm])$/u.exec(String(text ?? ''));
  if (!match) return null;
  return Number(match[1]) * { d: 86_400_000, h: 3_600_000, m: 60_000 }[match[2]];
};

const readSmallFile = (path, budget) => {
  let fd;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    const length = Math.min(size, SMALL_FILE_BYTES, budget.limit - budget.used);
    if (length < size) budget.exhausted = budget.exhausted || length < Math.min(size, SMALL_FILE_BYTES);
    const buffer = Buffer.alloc(Math.max(0, length));
    const read = length > 0 ? readSync(fd, buffer, 0, length, 0) : 0;
    budget.used += read;
    return buffer.subarray(0, read).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};
const readJson = (path, budget) => {
  const text = readSmallFile(path, budget);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const entries = (directory) => {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
};

const defaultExec = (file, args, options) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...options });

const outermostRoot = (startDir) => {
  const start = resolve(startDir);
  let root = null;
  let current = start;
  for (;;) {
    if (existsSync(join(current, '.git'))) root = current;
    const parent = dirname(current);
    if (parent === current) return root ?? start;
    current = parent;
  }
};

const worktreesOf = (cwd, exec) => {
  try {
    const out = exec('git', ['worktree', 'list', '--porcelain'], { cwd, timeout: GIT_TIMEOUT_MS });
    const paths = out.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice(9).trim()).filter(Boolean);
    return paths.length ? paths : null;
  } catch {
    return null;
  }
};

// A plan scaffold nobody filled in: a row that is still a `<placeholder>`, or every row the same.
const isTemplate = (rows) => rows.some((row) => /<[^<>]{1,40}>/u.test(row.text)) || (rows.length > 1 && new Set(rows.map((row) => row.text.trim())).size === 1);
const mtimeOf = (path) => {
  try {
    return lstatSync(path).mtimeMs;
  } catch {
    return null;
  }
};

const plansIn = (root, budget, redact, local) => {
  const list = entries(join(root, 'plans'));
  if (!list) return null;
  return list.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const text = readSmallFile(join(root, 'plans', entry.name), budget);
    if (text === null) return [];
    const rows = parsePlanTaskRows(text);
    if (!rows.length || isTemplate(rows)) return [];
    const open = rows.filter((row) => !row.checked);
    if (!open.length) return [];
    const done = rows.length - open.length;
    return [{
      worktree: redact(root),
      plan: `plans/${entry.name}`,
      local,
      changedMs: mtimeOf(join(root, 'plans', entry.name)),
      rows: rows.map((row) => ({ checked: row.checked, title: clipToWidth(redact(row.text), NAME_MAX) })),
      current: clipToWidth(redact(open[0].text), NAME_MAX),
      progress: progressOf(done, rows.length, open.map((row) => clipToWidth(redact(row.text), NAME_MAX))),
    }];
  });
};

const goalsOf = (root, budget, redact) => {
  const dir = join(root, '.litmuse', 'goals');
  const list = entries(dir);
  if (!list) return null;
  return list.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const goal = readJson(join(dir, entry.name), budget);
    if (!goal || !Array.isArray(goal.criteria)) return [];
    const passed = goal.criteria.filter((criterion) => criterion?.status === 'pass');
    const remaining = goal.criteria.filter((criterion) => criterion?.status !== 'pass').map((criterion) => clipToWidth(redact(String(criterion?.text ?? criterion?.id ?? 'unknown')), NAME_MAX));
    return [{
      worktree: redact(root),
      file: entry.name,
      status: typeof goal.status === 'string' ? goal.status : 'unknown',
      objective: clipToWidth(redact(String(goal.objective ?? 'unknown').split('\n')[0]), 120),
      progress: progressOf(passed.length, goal.criteria.length, remaining),
    }];
  });
};

const handoffsOf = (root, budget, redact) => {
  const files = (entries(root) ?? [])
    .filter((entry) => entry.isFile() && /^HANDOFF.*\.md$/u.test(entry.name))
    .map((entry) => join(root, entry.name));
  const latest = join(root, '.litmuse', 'handoff', 'latest.md');
  if (existsSync(latest)) files.push(latest);
  return files.map((path) => {
    const text = readSmallFile(path, budget) ?? '';
    const headings = text.split('\n').slice(0, 40).filter((line) => /^#{1,3} /u.test(line)).map((line) => clipToWidth(redact(line), 100));
    return { worktree: redact(root), file: basename(path), headings };
  });
};

const commitsOf = (root, sinceMs, now, exec, redact) => {
  try {
    const since = new Date(now - sinceMs).toISOString();
    const branch = exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, timeout: GIT_TIMEOUT_MS }).trim();
    const out = exec('git', ['log', `--since=${since}`, '--max-count=20', '--format=%H%x09%cI%x09%s'], { cwd: root, timeout: GIT_TIMEOUT_MS });
    return out.split('\n').filter(Boolean).map((line) => {
      const [hash, at, ...subject] = line.split('\t');
      return { worktree: redact(root), branch: redact(branch), hash: hash.slice(0, 7), at, atMs: Date.parse(at), subject: clipToWidth(redact(subject.join('\t')), 100) };
    });
  } catch {
    return null;
  }
};

const stacksOf = (root, budget, redact) => {
  const directory = join(root, '.litmuse', 'workflow-stack');
  const list = entries(directory);
  if (!list) return null;
  return list.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).flatMap((entry) => {
    const stack = readJson(join(directory, entry.name), budget);
    if (!stack || !Array.isArray(stack.frames)) return [];
    return stack.frames.slice(0, 3).map((frame) => ({
      worktree: redact(root),
      sessionId: typeof stack.sessionId === 'string' ? stack.sessionId : null,
      id8: typeof stack.sessionId === 'string' ? stack.sessionId.slice(0, 8) : 'unknown',
      skill: typeof frame.skill === 'string' ? frame.skill : 'unknown',
      stage: typeof frame.stage === 'string' ? frame.stage : 'unknown',
      role: frame.role === 'spine' ? 'spine' : 'side',
      status: frame.status === 'paused' ? 'paused' : 'active',
      at: typeof frame.at === 'string' ? frame.at : 'unknown',
      progress: progressOf(frame.n, frame.total, Array.isArray(frame.remaining) ? frame.remaining.map((name) => clipToWidth(redact(String(name)), NAME_MAX)) : undefined),
    }));
  });
};

// This host has no start-work lifecycle state: the session's own stage record says whether a
// start-work run is the live route and which plan it carries. Boundaries are not tracked here,
// so a paused boundary never comes from this source.
const startWorkOf = (root, budget, redact, env, sessionId) => {
  const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state');
  const file = sessionId ? join(stateHome, 'litmuse', 'stage', `${String(sessionId).replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 128)}.json`) : null;
  const record = file ? readJson(file, budget) : null;
  if (!record || record.route !== 'start-work') return null;
  const plan = typeof record.plan === 'string' && /^plans\/[A-Za-z0-9._-]+\.md$/u.test(record.plan) ? record.plan : null;
  const planText = plan ? readSmallFile(join(root, plan), budget) : null;
  const rows = planText === null ? [] : parsePlanTaskRows(planText);
  const open = rows.filter((row) => !row.checked);
  return [{
    worktree: redact(root),
    workId: `stage-${record.session ?? sessionId ?? 'unknown'}`,
    plan: plan ?? 'unknown',
    status: 'active',
    sessionId: typeof record.session === 'string' ? record.session : sessionId ?? null,
    id8: typeof (record.session ?? sessionId) === 'string' ? String(record.session ?? sessionId).slice(0, 8) : 'unknown',
    progress: rows.length
      ? progressOf(rows.length - open.length, rows.length, open.map((row) => clipToWidth(redact(row.text), NAME_MAX)))
      : progressOf(null, null),
  }];
};

const herdrOf = (env, exec, redact) => {
  if (env.HERDR_ENV !== '1') return { status: 'unknown', agents: [] };
  try {
    const out = exec('herdr', ['agent', 'list'], { timeout: HERDR_TIMEOUT_MS });
    return { status: 'ok', agents: out.split('\n').filter((line) => line.trim()).slice(0, 20).map((line) => clipToWidth(redact(line.trim()), 120)) };
  } catch {
    return { status: 'unknown', agents: [] };
  }
};

const sessionStoreDir = (env) => {
  if (env.LITMUSE_SESSION_STORE) return env.LITMUSE_SESSION_STORE;
  const dataHome = env.XDG_DATA_HOME || join(env.HOME || homedir(), '.local', 'share');
  return join(dataHome, 'muse', 'sessions');
};

const known = (list) => (list === null ? 'unknown' : 'ok');
const statusRank = { 'waiting-on-user': 0, active: 1, ended: 2, unknown: 3 };

/**
 * Collects the brief. Options: `cwd`, `here` (cwd only), `since` (`7d`), `max` (12), `sessionId`
 * (this session, for the next step and waiting state), `env`, `now`, `exec` (git/herdr runner).
 */
export const collectRewind = ({
  cwd = process.cwd(),
  here = false,
  since = DEFAULT_SINCE,
  max = DEFAULT_MAX,
  sessionId = null,
  env = process.env,
  now = Date.now(),
  exec = defaultExec,
  record = true,
} = {}) => {
  const home = env.HOME || homedir();
  const redact = makeRedactor({ env, home });
  const budget = makeBudget();
  const sinceMs = parseSince(since) ?? parseSince(DEFAULT_SINCE);
  const limit = Number.isInteger(max) && max > 0 ? Math.min(max, 50) : DEFAULT_MAX;
  const start = resolve(cwd);
  const stateRoot = outermostRoot(start);
  const listed = here ? null : worktreesOf(start, exec);
  const roots = [...new Set([start, ...(here ? [] : listed ?? [stateRoot])])];

  const transcripts = findTranscripts(sessionStoreDir(env), roots);
  const sessions = [];
  for (const file of transcripts.files) {
    if (sessions.length >= limit || budget.exhausted) break;
    const lines = readTranscriptLines(file.path, budget);
    const session = lines ? sessionRecord(file.sessionId, lines, { redact, now }) : null;
    if (!session || (session.lastMs !== null && now - session.lastMs > sinceMs)) continue;
    if (here && session.cwd && resolve(session.cwd) !== start) continue;
    sessions.push(session);
  }

  const collectEach = (read) => {
    const results = roots.map(read);
    return results.every((value) => value === null) ? null : results.flatMap((value) => value ?? []);
  };
  const plans = collectEach((root) => plansIn(root, budget, redact, resolve(root) === stateRoot || resolve(root) === start));
  const litgoal = collectEach((root) => {
    const goals = goalsOf(root, budget, redact);
    return goals ? goals.map((goal) => ({ ...goal, local: resolve(root) === stateRoot || resolve(root) === start })) : null;
  });
  const handoffs = roots.flatMap((root) => handoffsOf(root, budget, redact));
  const commits = collectEach((root) => commitsOf(root, sinceMs, now, exec, redact));
  const workflows = collectEach((root) => stacksOf(root, budget, redact));
  const startWork = collectEach((root) => startWorkOf(root, budget, redact, env, sessionId));
  const herdr = herdrOf(env, exec, redact);

  // A session waits on the user when it asked something, or holds a paused frame or a boundary.
  for (const session of sessions) {
    const frames = (workflows ?? []).filter((frame) => frame.sessionId === session.sessionId);
    const top = frames.at(-1);
    const work = (startWork ?? []).find((item) => item.sessionId === session.sessionId);
    if (frames.some((frame) => frame.status === 'paused') && session.status !== 'waiting-on-user') {
      session.status = 'waiting-on-user';
      session.waitingReason = 'paused workflow';
    }
    if (work?.status === 'paused') {
      session.status = 'waiting-on-user';
      session.waitingReason = 'start-work boundary';
    }
    session.route = top?.skill ?? (work ? 'start-work' : 'unknown');
    session.progress = top?.progress ?? work?.progress ?? progressOf(null, null);
    session.worked = workedOf(session);
    session.done.commits = (commits ?? [])
      .filter((commit) => session.lastMs !== null && Date.parse(session.started) <= commit.atMs && commit.atMs <= session.lastMs + 5 * 60_000
        && (session.branch === 'unknown' || commit.branch === session.branch))
      .slice(0, 5)
      .map(({ hash, subject }) => ({ hash, subject }));
  }
  sessions.sort((a, b) => statusRank[a.status] - statusRank[b.status] || (b.lastMs ?? 0) - (a.lastMs ?? 0));

  // This worktree's open plans and the ones another worktree touched inside the window are listed,
  // this one's first, then the most recently changed, up to a short cap; a stale plan elsewhere is
  // left out entirely. Unfilled scaffolds never reach the list (plansIn drops them). The roadmap gauge
  // counts this worktree only, since a sum over unrelated branches measures nothing.
  const recent = (plan) => plan.local || (plan.changedMs !== null && now - plan.changedMs <= sinceMs);
  const orderedPlans = (plans ?? []).filter(recent).sort((a, b) => Number(b.local) - Number(a.local) || (b.changedMs ?? 0) - (a.changedMs ?? 0));
  const shownPlans = orderedPlans.slice(0, PLAN_LIMIT);
  const localGoals = (litgoal ?? []).filter((goal) => goal.local);
  const roadmapItems = [...orderedPlans.filter((plan) => plan.local).map((plan) => plan.progress), ...localGoals.map((goal) => goal.progress)];
  const data = {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    scope: { here, since: sinceMs === parseSince(since) ? since : DEFAULT_SINCE, max: limit, worktrees: roots.map(redact) },
    sources: {
      transcripts: transcripts.status,
      litgoal: known(litgoal),
      plans: known(plans),
      handoffs: handoffs.length ? 'ok' : 'unknown',
      git: known(commits),
      workflowStack: known(workflows),
      startWork: known(startWork),
      herdr: herdr.status,
    },
    budget: { bytesRead: budget.used, limit: budget.limit, exhausted: budget.exhausted },
    summary: {
      sessions: sessions.length,
      waitingOnUser: sessions.filter((session) => session.status === 'waiting-on-user').length,
      active: sessions.filter((session) => session.status === 'active').length,
    },
    sessions: sessions.map(({ cwd: _cwd, lastMs: _lastMs, sessionId: id, ...rest }) => ({ ...rest, self: Boolean(sessionId) && id === sessionId })),
    roadmap: {
      plans: shownPlans,
      plansOmitted: orderedPlans.length - shownPlans.length,
      // Another worktree's finished objective is history, not roadmap.
      litgoal: (litgoal ?? []).filter((goal) => goal.local || goal.status !== 'complete'),
      progress: roadmapItems.length ? aggregateProgress(roadmapItems) : progressOf(null, null),
    },
    workflows: (workflows ?? []).map((frame) => ({ ...frame, self: Boolean(sessionId) && frame.sessionId === sessionId })),
    startWork: startWork ?? [],
    handoffs,
    commits: (commits ?? []).slice(0, 20).map(({ atMs: _atMs, ...commit }) => commit),
    herdr,
  };
  const next = chooseNextStep(data, sessionId);
  data.next = next;
  data.nextRecorded = false;
  if (record && sessionId) {
    try {
      writeNextStep(stateRoot, sessionId, next, new Date(now));
      data.nextRecorded = true;
    } catch {
      data.nextRecorded = false;
    }
  }
  for (const frame of data.workflows) delete frame.sessionId;
  for (const work of data.startWork) delete work.sessionId;
  return data;
};

const remainingLine = (names, width) => {
  if (!names.length || (names.length === 1 && names[0] === 'unknown')) return null;
  let out = '  left:';
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const piece = ` ${name}${index < names.length - 1 ? ',' : ''}`;
    if (displayWidth(out + piece) > width - 4) return `${out} …(+${names.length - index})`;
    out += piece;
  }
  return out;
};

// ANSI pieces never reach the width math: every row is clipped raw, then painted.
const ESC = '\u001b[';
const paint = (code, text) => `${ESC}${code}m${text}${ESC}0m`;
const STATUS_BADGE = { 'waiting-on-user': '● waiting on you', active: '● ACTIVE', ended: '○ Ended', unknown: '○ unknown' };
const BADGE_PAINT = {
  'waiting-on-user': (text) => paint('33;1', text),
  active: (text) => paint('32;1', text),
  ended: (text) => paint('2', text),
  unknown: (text) => paint('2', text),
};

// Source keys never reach the user; the footer names what was not read in plain words.
const SOURCE_LABELS = {
  transcripts: 'sessions', litgoal: 'goals', plans: 'plans', handoffs: 'handoffs',
  git: 'commits', workflowStack: 'workflows', startWork: 'start-work', herdr: 'agents',
};

/** Pads raw text (no escapes) to `columns` display columns. */
const pad = (text, columns) => {
  const missing = columns - displayWidth(text);
  return missing > 0 ? `${text}${' '.repeat(missing)}` : text;
};

// Head-and-tail reads undercount calls, so tools are named, never counted.
const toolsLine = (tools) => {
  const names = Object.keys(tools ?? {}).sort();
  return names.length ? names.join(' · ') : null;
};

const sessionNext = (session, data) => {
  const frame = data.workflows.find((item) => item.id8 === session.id8 && item.status === 'paused' && data.next.say);
  if (frame) return `say "${data.next.say}" to resume the paused ${frame.skill}`;
  if (session.status === 'waiting-on-user') return session.waitingReason === 'start-work boundary' ? 'answer the boundary: `lit approve` or `lit deny`' : 'answer its question';
  return null;
};

/**
 * Emits one row from `[text, paint|null]` segments. The joined raw text is clipped first, so
 * ANSI pieces never reach the width math; each surviving slice keeps its segment's paint.
 */
const emit = (out, color, width, segments) => {
  const raw = segments.map(([text]) => text).join('');
  const clipped = clipToWidth(raw, width);
  if (!color) {
    out.push(clipped);
    return;
  }
  const target = displayWidth(clipped);
  const cut = clipped.endsWith('…') && raw !== clipped;
  let used = 0;
  let row = '';
  for (const [text, fn] of segments) {
    if (used >= target) break;
    const room = target - used - (cut ? 1 : 0);
    let slice = text;
    if (displayWidth(text) > room) {
      slice = '';
      let taken = 0;
      for (const ch of text) {
        const w = displayWidth(ch);
        if (taken + w > Math.max(room - 1, 0)) break;
        slice += ch;
        taken += w;
      }
    }
    if (slice) row += fn ? fn(slice) : slice;
    used += displayWidth(slice);
    if (slice !== text) break;
  }
  if (cut) row += '…';
  out.push(row);
};

/** `Nm of work` between the first and last stamp, or null when either end is unknown. */
const workedOf = (session) => {
  const start = Date.parse(session.started);
  const end = session.lastMs ?? null;
  if (!Number.isFinite(start) || end === null || end < start) return null;
  const s = Math.floor((end - start) / 1000);
  if (s < 60) return `${s}s of work`;
  if (s < 3600) return `${Math.floor(s / 60)}m of work`;
  if (s < 172800) return `${Math.floor(s / 3600)}h of work`;
  return `${Math.floor(s / 86400)}d of work`;
};

/** One session card: status badge, goal in plain words, facts, gauge, done, now, next. */
const sessionCard = (session, data, emitLine, now) => {
  const head = [[STATUS_BADGE[session.status] ?? session.status, BADGE_PAINT[session.status] ?? null], [' · ', null], [session.id8, (text) => paint('33;1', text)]];
  if (session.route && session.route !== 'unknown') head.push([' · ', null], [session.route, (text) => paint('36', text)]);
  head.push([' · ', null], [`${agoOf(session.last, now)} ago`, (text) => paint('2', text)]);
  emitLine(head);
  if (session.title && session.title !== 'unknown') emitLine([[session.title, (text) => paint('1', text)]]);
  const facts = [];
  const worked = session.worked ?? workedOf(session);
  if (worked) facts.push(`⏳ ${worked}`);
  const asks = (session.asked ?? []).filter((text) => text !== 'unknown');
  if (asks.length) facts.push(`last ask: "${clipToWidth(asks.at(-1), 60)}"`);
  if (facts.length) emitLine([[facts.join(' · '), (text) => paint('2', text)]]);
  // A card whose progress is fully unknown shows no pulse line: the badge, the
  // elapsed time and the last action already say what is known. A known
  // finished count (`[…] 3 steps`) still shows.
  const { gauge: pace, remaining } = session.progress ?? { gauge: PULSE_UNKNOWN, remaining: [] };
  const leftovers = (remaining ?? []).filter((name) => name !== 'unknown');
  if (pace.startsWith('[▉') || pace.startsWith('[░')) emitLine([[`${pace} · left: ${leftovers.join(', ') || '—'}`, null]]);
  else if (leftovers.length) emitLine([[`${pace} · ${leftovers.join(', ')}`, null]]);
  else if (pace !== PULSE_UNKNOWN) emitLine([[pace, null]]);
  const tools = toolsLine(session.done?.tools);
  const commits = (session.done?.commits ?? []).map((commit) => `${commit.hash} ${commit.subject}`);
  if (tools || commits.length) emitLine([['✅ Done: ', (text) => paint('32', text)], [[tools, ...commits].filter(Boolean).join(' · '), null]]);
  // A card with no recorded edit yet names what it is doing now: its last tool call, name only.
  // (This host's log keeps no file list, so commits are the only edits it can show.)
  if (!commits.length && !(session.done?.files ?? []).length && session.lastAction?.tool) emitLine([['▶ Now: ', (text) => paint('33', text)], [session.lastAction.tool, null]]);
  const next = sessionNext(session, data);
  if (next) emitLine([['➤ Next: ', (text) => paint('36;1', text)], [next, null]]);
};

// Short cells, so an ended row fits the frame: id, place, goal, age, and done.
const ENDED_ROWS = 8;
const agoOf = (last, now) => {
  const at = Date.parse(last);
  if (!Number.isFinite(at)) return '·';
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 172800) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** One ended session as table cells: id, place, goal, age, done. */
const endedCells = (session, now) => {
  const commits = session.done?.commits?.length ?? 0;
  const files = session.done?.files?.length ?? 0;
  const done = commits ? `${commits} ${commits === 1 ? 'commit' : 'commits'}` : files ? `${files} files` : '·';
  const place = session.worktree && session.worktree !== 'unknown' ? basename(String(session.worktree)) : '·';
  const goal = session.title && session.title !== 'unknown' ? session.title : session.asked?.[0] ?? 'unknown';
  return [session.id8, place, goal, agoOf(session.last, now), done];
};

const ENDED_HEAD = ['id', 'tree', 'goal', 'ago', 'done'];

/**
 * The ended sessions as a ruled table, or plain one-line rows when the frame is too narrow
 * for columns. Column widths: id 8, tree 14, ago 4, done 10, the goal takes the rest.
 */
const endedTable = (sessions, now, emitLine, width) => {
  const rows = sessions.slice(0, ENDED_ROWS).map((session) => endedCells(session, now));
  const title = ` Ended · ${sessions.length} `;
  if (width >= 60) {
    const tree = 14;
    const goal = Math.max(width - 38 - tree, 16);
    const widths = [8, tree, goal, 4, 10];
    const rule = (left, mid, right) => left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;
    const cells = (items) => `│ ${items.map((item, i) => pad(clipToWidth(item, widths[i]), widths[i])).join(' │ ')} │`;
    const cap = Math.max(width - title.length - 2, 2);
    emitLine([[`┌${title}${'─'.repeat(cap)}┐`, null]]);
    emitLine([[cells(ENDED_HEAD), (text) => paint('1', text)]]);
    emitLine([[rule('├', '┼', '┤'), null]]);
    for (const row of rows) emitLine([[cells(row), null]]);
    emitLine([[rule('└', '┴', '┘'), null]]);
  } else {
    emitLine([[`-- ended (${sessions.length}) --`, null]]);
    for (const [id, place, goal, ago, done] of rows) emitLine([[`${id} · ${place} · ${clipToWidth(goal, 44)} · ${ago} · ${done}`, null]]);
  }
  if (sessions.length > ENDED_ROWS) emitLine([[`  …(+${sessions.length - ENDED_ROWS} more ended)`, null]]);
};

const planMark = (plan) => (plan.progress.total !== null && plan.progress.done >= plan.progress.total ? '✓' : plan.current ? '▶' : '○');

// When no step can run on `go`, the brief still recommends one from what it read, in this order:
// a session that waits on the user, a paused workflow, the next item of an open plan, the most
// recent other active session, the most recent ended one. It is shown, never recorded.
const suggestion = (data) => {
  const sessions = data.sessions ?? [];
  const place = (session) => (session.worktree && session.worktree !== 'unknown' ? basename(String(session.worktree)) : 'unknown');
  const goal = (session) => clipToWidth(String(session.title && session.title !== 'unknown' ? session.title : session.asked?.[0] ?? 'unknown'), 50);
  const waiting = sessions.find((session) => session.status === 'waiting-on-user' && !session.self);
  if (waiting) return { text: `Answer ${waiting.id8} in ${place(waiting)}`, say: null };
  const paused = (data.workflows ?? []).find((frame) => frame.status === 'paused');
  const owner = paused ? sessions.find((session) => session.id8 === paused.id8) : null;
  if (paused) return { text: `Resume ${paused.skill} at ${paused.stage} in ${paused.id8} (${owner ? place(owner) : 'unknown'})`, say: 'lit continue' };
  // A plan in the worktree of a live session comes first, then this worktree's, then the newest.
  const liveTrees = new Set(sessions.filter((session) => session.status !== 'ended').map((session) => session.worktree));
  const open = (data.roadmap?.plans ?? []).filter((plan) => plan.current);
  const plan = open.find((item) => liveTrees.has(item.worktree)) ?? open.find((item) => item.local) ?? open[0];
  if (plan) return { text: `Next in ${plan.local ? plan.plan : `${basename(String(plan.worktree))}/${plan.plan}`}: ${clipToWidth(String(plan.current), 60)}`, say: 'go' };
  const active = sessions.find((session) => session.status === 'active' && !session.self);
  if (active) return { text: `Check on ${active.id8} in ${place(active)} (${goal(active)})`, say: null };
  const ended = sessions.find((session) => session.status === 'ended' && !session.self);
  if (ended) return { text: `Pick up ${ended.id8} in ${place(ended)}: ${goal(ended)}`, say: null };
  return { text: 'No session or plan in this window: say what to start', say: null };
};

// Wraps a step to the box at word breaks, three lines at most, the last one clipped.
const wrap = (text, width, rows = 3) => {
  const out = [''];
  for (const word of String(text).split(' ').filter(Boolean)) {
    const joined = out.at(-1) ? `${out.at(-1)} ${word}` : word;
    if (displayWidth(joined) <= width || !out.at(-1)) out[out.length - 1] = joined;
    else out.push(word);
  }
  const kept = out.slice(0, rows);
  if (out.length > rows) kept[rows - 1] = `${kept[rows - 1]} ${out.slice(rows).join(' ')}`;
  return kept.map((row) => clipToWidth(row, width));
};

/** Plain-text brief: headline, one card per live session, ended table, roadmap, one next step in a box. */
export const renderRewind = (data, width = 100, { color = false } = {}) => {
  const out = [];
  const emitLine = (segments) => emit(out, color, width, segments);
  const put = (raw, fn = null) => emitLine([[raw, fn]]);
  const frame = Math.max(width, 20);
  const step = data.next?.kind && data.next.kind !== 'none' ? null : suggestion(data);
  const nextKind = data.next.kind.replace(/-/g, ' ');
  const nextSay = data.next.say ? ` (say "${data.next.say}")` : '';
  // The one static rainbow line of this surface marks the adhd turn (no animation on this host).
  const headline = `lit-adhd: ${data.summary.sessions} session(s) · ${data.summary.waitingOnUser} waiting on you · next: ${step ? step.text : `${nextKind}${nextSay}`}`;
  put(headline, color ? (text) => rainbowLine(text) : null);
  if (data.scope) {
    const folders = data.scope.worktrees?.length ?? 1;
    put(`last ${data.scope.since ?? '7d'} · ${folders} folder${folders === 1 ? '' : 's'} read`);
  }
  const now = Date.parse(data.generatedAt);
  // Sessions that are live or wait on the user come first, as full cards grouped by worktree.
  const live = data.sessions.filter((session) => session.status !== 'ended');
  const ended = data.sessions.filter((session) => session.status === 'ended');
  const groups = new Map();
  for (const session of live) {
    const key = session.worktree && session.worktree !== 'unknown' ? session.worktree : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  for (const [worktree, sessions] of groups) {
    if (worktree) put(`🌿 ${basename(worktree)}`, (text) => paint('32', text));
    for (const session of sessions) {
      sessionCard(session, data, emitLine, now);
      put('');
    }
  }
  if (ended.length) {
    endedTable(ended, now, emitLine, frame);
    put('');
  }
  if (data.roadmap.plans.length || data.roadmap.litgoal.length) {
    put('-- roadmap --');
    for (const plan of data.roadmap.plans) {
      const head = `${plan.local ? '' : `${basename(plan.worktree)}: `}${plan.plan} ${plan.progress.gauge}`;
      put(planMark(plan) === '✓' ? `✓ ${head}` : plan.current ? `▶ ${head} now: ${plan.current}` : `○ ${head}`);
      const left = remainingLine(plan.progress.remaining.filter((name) => name !== 'unknown' && name !== plan.current), width);
      if (left) put(`  ○ later: ${left.replace(/^  left: /, '')}`);
    }
    if (data.roadmap.plansOmitted) put(`  …(+${data.roadmap.plansOmitted} more open plans)`);
    for (const goal of data.roadmap.litgoal) put(`○ goal ${goal.progress.gauge} ${goal.objective}`);
    for (const commit of data.commits.slice(0, 5)) put(`✓ ${commit.hash} ${commit.at.slice(0, 10)} ${commit.subject}`);
    put('');
  }
  // The recommended step sits in a box of its own; the closing line says what will not happen.
  const boxTitle = 'RECOMMENDED NEXT STEP';
  put(`┌ ${boxTitle} ${'─'.repeat(Math.max(frame - boxTitle.length - 4, 2))}┐`, (text) => paint('32;1', text));
  const target = data.next.target?.plan ?? data.next.target?.skill ?? '';
  const body = step
    ? [...wrap(step.text, frame - 4), ...(step.say ? [`say "${step.say}" to continue`] : [])]
    : wrap(`${nextKind}${target ? `: ${target}` : ''}${nextSay}. Say \`go\` to continue.`, frame - 4);
  for (const row of body) put(`│ ${pad(row, frame - 4)} │`);
  put(`└${'─'.repeat(frame - 2)}┘`, (text) => paint('32;1', text));
  put('Nothing runs on its own here: open that session, or say what to do.');
  const unread = Object.entries(data.sources).filter(([, status]) => status !== 'ok').map(([name]) => SOURCE_LABELS[name] ?? name);
  if (unread.length) put(`Not read: ${unread.join(', ')}.`);
  return `${out.join('\n')}\n`;
};

/** `litmuse rewind [--json] [--here] [--since 7d] [--max 12] [--session <id>] [--width N]`. */
export const runRewindCli = (args, cwd = process.cwd(), { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) => {
  const options = { cwd, env, here: false, since: DEFAULT_SINCE, max: DEFAULT_MAX, sessionId: null };
  let json = false;
  let width = Number(stdout.columns) || 100;
  const usage = 'Usage: litmuse rewind [--json] [--here] [--since 7d] [--max 12] [--session <id>] [--width N]';
  if (args.some((arg) => arg === '--help' || arg === '-h')) {
    stdout.write(`${usage}\n`);
    return 0;
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') json = true;
    else if (arg === '--here') options.here = true;
    else if (arg === '--since' && parseSince(args[index + 1])) options.since = args[++index];
    else if (arg === '--max' && /^\d{1,2}$/u.test(args[index + 1] ?? '')) options.max = Number(args[++index]);
    else if (arg === '--session' && /^[A-Za-z0-9._:-]{1,160}$/u.test(args[index + 1] ?? '')) options.sessionId = args[++index];
    else if (arg === '--width' && /^\d{2,3}$/u.test(args[index + 1] ?? '')) width = Number(args[++index]);
    else {
      stderr.write(`litmuse rewind: unknown argument ${JSON.stringify(basename(String(arg)))}. ${usage}\n`);
      return 64;
    }
  }
  const data = collectRewind(options);
  // The static rainbow marks the adhd turn on a real terminal only, never in pipes.
  stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : renderRewind(data, width, { color: stdout.isTTY === true }));
  return 0;
};
