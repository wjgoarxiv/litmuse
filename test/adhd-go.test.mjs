// `go` after a lit-adhd brief: offered only where it runs, never while other lanes work, and the
// recommended step is current. S1 lanes hold `go`; S2 another session's run never says `go`; S3 the
// `go` line sits only on a step `go` executes; S4 the HANDOFF Next item is the first open one of the
// newest handoff and yields to live signals; S5 the hook re-checks the recorded step before acting.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

import { collectRewind, renderRewind } from '../plugin/lib/rewind/collect.mjs';
import { progressOf } from '../plugin/lib/rewind/gauge.mjs';
import { writeNextStep } from '../plugin/lib/rewind/next-step.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HOOK = join(ROOT, 'plugin', 'hooks', 'user-prompt-submit.mjs');
const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();
const strip = (text) => text.replace(/\u001b\[[0-9;]*m/gu, '');
const cleanups = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop(), { recursive: true, force: true });
});
const scratch = (prefix = 'litmuse-adhd-go-') => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
};

const line = (payloadType, payload, minutesAgo) => ({ stream: 's', sequence: 1, recorded_at: iso(minutesAgo), payload_type: payloadType, payload });
const intentLine = (text, minutesAgo) => line('runtime.user_intent.accepted', { kind: 'session', record: { kind: 'accepted', refill_blocks: [{ kind: 'text', text }] } }, minutesAgo);
const toolLine = (name, minutesAgo) => line('tool_batch.effect.started', { kind: 'tool_batch_effect', record: { kind: 'started', tool_name: name } }, minutesAgo);
const routeLine = (cwd, minutesAgo) => line('runtime.session.route_facts', { kind: 'route_facts', record: { cwd } }, minutesAgo);
const writeLog = (storeDir, sessionId, lines) => {
  const dir = join(storeDir, '2026', '10', '26', sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'session.jsonl'), `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
};
const noGit = (file) => {
  throw new Error(`no ${file}`);
};
const fixture = () => {
  const home = scratch();
  const repo = join(home, 'repo');
  mkdirSync(join(repo, 'plans'), { recursive: true });
  const storeDir = join(home, 'muse-store', 'sessions');
  return { home, repo, storeDir, env: { HOME: home, LITMUSE_SESSION_STORE: storeDir, XDG_STATE_HOME: join(home, 'xdg') } };
};
const onePlan = (repo) => writeFileSync(join(repo, 'plans', 'p.md'), '# P\n- [x] 1. a\n- [ ] 2. b\n');
const lastLine = (text) => text.trimEnd().split('\n').at(-1);
const herdrList = (agents) => JSON.stringify({ result: { agents } });
const agent = (over) => ({
  agent: 'muse', agent_status: 'working', pane_id: 'w1:p2', workspace_id: 'w9', cwd: '/elsewhere', foreground_cwd: '/elsewhere',
  agent_session: { value: `agent-${over.pane_id ?? 'w1:p2'}` }, terminal_title_stripped: 'lane', ...over,
});

// ---- S1: no `go` while other lanes work ------------------------------------------------------

test('S1: another live session of this repo holds `go`: the box says wait and the last line forbids `go`', () => {
  const { repo, storeDir, env } = fixture();
  onePlan(repo);
  writeLog(storeDir, 'self0001', [routeLine(repo, 1), intentLine('lit adhd', 1)]);
  writeLog(storeDir, 'lane0001', [routeLine(repo, 6), intentLine('port the card', 6), toolLine('edit_file', 2)]);
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, sessionId: 'self0001' });
  assert.equal(data.lanes.count, 1);
  assert.equal(data.next.kind, 'none', 'a single open plan is not offered while a lane works');
  assert.equal(JSON.parse(readFileSync(join(repo, '.litmuse', 'adhd', 'next-self0001.json'), 'utf8')).kind, 'none', 'go reads nothing to run');
  const text = strip(renderRewind(data, 100));
  assert.match(text, /│ Wait for 1 lane to finish/u);
  assert.doesNotMatch(text, /say "go"|Say `go`/u);
  assert.equal(lastLine(text), 'Do not type `go` until they finish.');
  assert.doesNotMatch(data.opener.next, /go/u);
});

test('S1: a lane waiting on the user is named in the box', () => {
  const { repo, storeDir, env } = fixture();
  onePlan(repo);
  writeLog(storeDir, 'ask00001', [routeLine(repo, 6), intentLine('port the card', 6), intentLine('Done. Should I commit this now?', 2)]);
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, sessionId: 'self0001', record: false });
  assert.equal(data.lanes.count, 1);
  assert.equal(data.lanes.waiting, 1);
  const text = strip(renderRewind(data, 100));
  assert.match(text, /│ Answer ask00001 in repo/u);
  assert.equal(lastLine(text), 'Do not type `go` until they finish.');
});

test('S1: herdr agents count as lanes by workspace or cwd, own pane and idle agents skipped, one lane counted once', () => {
  const { repo, storeDir, env } = fixture();
  onePlan(repo);
  writeLog(storeDir, 'lane0001', [routeLine(repo, 6), intentLine('port the card', 6), toolLine('edit_file', 2)]);
  const agents = [
    agent({ pane_id: 'w1:p1', workspace_id: 'w1' }), // own pane
    agent({ pane_id: 'w1:p2', workspace_id: 'w1' }), // same workspace, working
    agent({ pane_id: 'w9:p3', cwd: join(repo, 'src'), foreground_cwd: join(repo, 'src'), agent_status: 'blocked' }), // inside the repo, waits
    agent({ pane_id: 'w9:p4', foreground_cwd: repo, agent_session: { value: 'lane0001' } }), // the session lane again
    agent({ pane_id: 'w1:p5', workspace_id: 'w1', agent_status: 'idle' }),
    agent({ pane_id: 'w9:p6', agent_status: 'done', cwd: repo }),
    agent({ pane_id: 'w9:p7' }), // elsewhere, other workspace
  ];
  const calls = [];
  const exec = (file, args) => {
    calls.push(file);
    if (file === 'herdr') return `${herdrList(agents)}\n`;
    throw new Error('no git');
  };
  const herdrEnv = { ...env, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1' };
  const data = collectRewind({ cwd: repo, env: herdrEnv, now: NOW, exec, here: true, sessionId: 'self0001', record: false });
  assert.equal(data.sources.herdr, 'ok');
  assert.equal(data.lanes.count, 3, 'session lane0001 (also pane p4), pane p2, pane p3');
  assert.equal(data.lanes.waiting, 1, 'the blocked agent waits on the user');
  assert.equal(data.next.kind, 'none');
  assert.equal(lastLine(strip(renderRewind(data, 100))), 'Do not type `go` until they finish.');

  const off = collectRewind({ cwd: repo, env: { ...env, HERDR_WORKSPACE_ID: 'w1' }, now: NOW, exec, here: true, record: false });
  assert.equal(off.sources.herdr, 'unknown', 'herdr is read only under HERDR_ENV=1');
  assert.equal(calls.filter((file) => file === 'herdr').length, 1);
});

test('S1: unreadable herdr output fails to unknown and adds no lane', () => {
  const { repo, env } = fixture();
  onePlan(repo);
  const exec = (file) => {
    if (file === 'herdr') return 'not json at all\n';
    throw new Error('no git');
  };
  const data = collectRewind({ cwd: repo, env: { ...env, HERDR_ENV: '1' }, now: NOW, exec, here: true, record: false });
  assert.equal(data.sources.herdr, 'unknown');
  assert.equal(data.lanes.count, 0);
  assert.equal(data.next.kind, 'start-plan', 'with no lane the single plan is still offered');
  assert.match(strip(renderRewind(data, 100)), /Say `go` to continue\./u);
});

// ---- S2: `go` only for a run this session owns -------------------------------------------------

const briefBase = () => ({
  summary: { sessions: 1, waitingOnUser: 1, active: 0 },
  sessions: [],
  roadmap: { plans: [], plansOmitted: 0, litgoal: [] },
  workflows: [],
  startWork: [],
  commits: [],
  sources: {},
  lanes: { count: 0, waiting: 0 },
  next: { kind: 'none', target: null },
  generatedAt: new Date(NOW).toISOString(),
  scope: { since: '7d', worktrees: ['~/repo'] },
});

test('S2: another session’s paused workflow never borrows this session’s `go`', () => {
  const other = {
    id8: 'othr0001', title: 'other lane', asked: [], worktree: '~/repo', last: iso(2), status: 'waiting-on-user', waitingReason: 'paused workflow', self: false,
    progress: { gauge: '[…] running', remaining: [] }, done: { tools: {}, files: [], commits: [] },
  };
  const data = {
    ...briefBase(),
    sessions: [other],
    workflows: [{ id8: 'othr0001', skill: 'lit-loop', stage: 'verify', status: 'paused', role: 'spine', self: false, progress: progressOf(1, 2) }],
    next: { kind: 'continue-work', target: { workId: 'stage-self', plan: 'plans/mine.md' }, say: 'go' },
  };
  const text = strip(renderRewind(data, 100));
  assert.doesNotMatch(text, /➤ Next: say "go"/u);
  assert.match(text, /➤ Next: answer its question/u);
});

test('S2: another session’s active start-work is never the step `go` runs', () => {
  const { repo, env } = fixture();
  onePlan(repo);
  const stage = join(env.XDG_STATE_HOME, 'litmuse', 'stage');
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, 'othr0001.json'), JSON.stringify({ version: 1, session: 'othr0001', route: 'start-work', plan: 'plans/p.md', cwd: repo }));
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, sessionId: 'self0001', record: false });
  assert.notEqual(data.next.kind, 'continue-work');
  assert.equal(data.next.say, undefined);
});

// ---- S3: the `go` line only where `go` executes -------------------------------------------------

test('S3: an approval step carries its own word and no `go`', () => {
  const data = { ...briefBase(), next: { kind: 'approve-boundary', target: { workId: 'w', plan: 'plans/a.md' }, say: 'lit approve', automatic: false } };
  const text = strip(renderRewind(data, 100));
  assert.match(text, /approve boundary: plans\/a\.md \(say "lit approve"\)/u);
  assert.doesNotMatch(text, /`go`|say "go"/u);
});

test('S3: a suggested plan item that `go` would not run carries no `go`', () => {
  const plan = { worktree: '~/repo', plan: 'plans/p.md', local: true, current: '2. Second item', progress: { gauge: '[░░] 0/2', remaining: [] } };
  const text = strip(renderRewind({ ...briefBase(), roadmap: { ...briefBase().roadmap, plans: [plan] } }, 100));
  assert.match(text, /│ Next in plans\/p\.md: 2\. Second item\s+│/u);
  assert.doesNotMatch(text, /say "go"|`go`/u);
});

test('S3: steps `go` executes keep the `go` line', () => {
  for (const next of [
    { kind: 'start-plan', target: { plan: 'plans/p.md' }, say: 'go' },
    { kind: 'continue-work', target: { workId: 'w', plan: 'plans/p.md' }, say: 'go' },
  ]) {
    assert.match(strip(renderRewind({ ...briefBase(), next }, 100)), /Say `go` to continue\./u, next.kind);
  }
});

// ---- S4: the HANDOFF Next item is current --------------------------------------------------------

test('S4: finished HANDOFF Next items are skipped for the first open one', () => {
  const { repo, env } = fixture();
  writeFileSync(join(repo, 'HANDOFF.md'), [
    '# Handoff', '## Next',
    '- ✅ ported the card', '- ✓ wired the hook', '- [x] ran the gates', '- ~~old idea~~', '- DONE: release notes', '- SHIPPED 0.1.4',
    '- [ ] check whether done means done', '- later',
  ].join('\n'));
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, record: false });
  assert.equal(data.opener.next, 'check whether done means done', 'the lowercase word is not a done marker');
});

test('S4: the newest handoff wins over an old root HANDOFF', () => {
  const { repo, env } = fixture();
  const root = join(repo, 'HANDOFF.md');
  writeFileSync(root, '# Handoff\n## Next\n- old root step\n');
  utimesSync(root, new Date(NOW - 5 * 864e5), new Date(NOW - 5 * 864e5));
  mkdirSync(join(repo, '.litmuse', 'handoff'), { recursive: true });
  writeFileSync(join(repo, '.litmuse', 'handoff', 'latest.md'), '# Handoff\n## Next\n- fresh step\n');
  assert.equal(collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, record: false }).opener.next, 'fresh step');

  const newer = join(repo, 'HANDOFF_round2.md');
  writeFileSync(newer, '# Handoff\n## Next\n- newest root step\n');
  utimesSync(join(repo, '.litmuse', 'handoff', 'latest.md'), new Date(NOW - 864e5), new Date(NOW - 864e5));
  assert.equal(collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, record: false }).opener.next, 'newest root step');
});

test('S4: a live lane outranks the HANDOFF Next item', () => {
  const { repo, storeDir, env } = fixture();
  writeFileSync(join(repo, 'HANDOFF.md'), '# Handoff\n## Next\n- ship it\n');
  writeLog(storeDir, 'lane0001', [routeLine(repo, 6), intentLine('port the card', 6), toolLine('edit_file', 2)]);
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, here: true, sessionId: 'self0001', record: false });
  assert.match(data.opener.next, /^Wait for 1 lane to finish/u);
  assert.doesNotMatch(strip(renderRewind(data, 100)), /│ ship it/u);
});

// ---- S5: `go` re-checks the recorded step ---------------------------------------------------------

const project = () => {
  const ws = scratch('litmuse-adhd-go-ws-');
  mkdirSync(join(ws, '.git'));
  mkdirSync(join(ws, 'plans'));
  writeFileSync(join(ws, 'plans', 'p.md'), '# P\n- [x] 1. a\n- [ ] 2. b\n');
  const stateHome = scratch('litmuse-adhd-go-state-');
  return { ws, stateHome, env: { ...process.env, XDG_STATE_HOME: stateHome } };
};
const prompt = (where, sid, text) => {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: text, cwd: where.ws, session_id: sid, turn_id: 't1' }),
    cwd: where.ws, encoding: 'utf8', env: where.env,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
};
const stageOf = (where, sid) => JSON.parse(readFileSync(join(where.stateHome, 'litmuse', 'stage', `${sid}.json`), 'utf8'));

test('S5: `go` resumes this session’s start-work only while the run is still active and its own', () => {
  const where = project();
  prompt(where, 'own1', 'lit start plans/p.md');
  assert.equal(stageOf(where, 'own1').route, 'start-work');
  writeNextStep(where.ws, 'own1', { kind: 'continue-work', target: { workId: 'stage-own1', plan: 'plans/p.md' } });
  assert.match(prompt(where, 'own1', 'go'), /resuming `start-work`/u, 'the live run resumes');

  // The run ended (the route was cleared) after the brief: `go` says so and starts nothing.
  prompt(where, 'own1', 'thanks, that is all');
  assert.equal(stageOf(where, 'own1').route, null);
  writeNextStep(where.ws, 'own1', { kind: 'continue-work', target: { workId: 'stage-own1', plan: 'plans/p.md' } });
  const stale = prompt(where, 'own1', 'go');
  assert.match(stale, /no longer holds/u);
  assert.doesNotMatch(stale, /resuming `start-work`/u);
  assert.equal(stageOf(where, 'own1').route, null, 'nothing was started');

  // A record in a session that never ran start-work is not this session's run.
  writeNextStep(where.ws, 'never1', { kind: 'continue-work', target: { workId: 'stage-own1', plan: 'plans/p.md' } });
  const foreign = prompt(where, 'never1', 'go');
  assert.match(foreign, /no longer holds/u);
  assert.ok(!existsSync(join(where.stateHome, 'litmuse', 'stage', 'never1.json')) || stageOf(where, 'never1').route !== 'start-work');
});

test('S5: `go` resumes a paused frame only while this session still holds it', () => {
  const where = project();
  writeNextStep(where.ws, 'frm1', { kind: 'resume-frame', target: { skill: 'lit-loop', stage: 'verify' } });
  const out = prompt(where, 'frm1', 'go');
  assert.match(out, /no longer holds/u);
  assert.doesNotMatch(out, /resuming the paused/u);
});
