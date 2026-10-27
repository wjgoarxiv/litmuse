// The lit-adhd record collector: gauges count cells by code and never guess a total, redaction
// masks credential shapes and environment values, Muse transcripts are found by the cwd they
// record and read head-and-tail under one budget, and the next step follows its fixed priority.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
const stripAnsi = (text) => text.replace(/\[[0-9;]*m/g, '');

import { collectRewind, parseSince, renderRewind, runRewindCli } from '../plugin/lib/rewind/collect.mjs';
import { aggregateProgress, clipToWidth, displayWidth, gauge, progressOf } from '../plugin/lib/rewind/gauge.mjs';
import { chooseNextStep, nextStepPath, writeNextStep } from '../plugin/lib/rewind/next-step.mjs';
import { takeNextStep } from '../plugin/hooks/lib/next-step.mjs';
import { makeRedactor } from '../plugin/lib/rewind/redact.mjs';
import { findTranscripts, makeBudget, readTranscriptLines, sessionRecord } from '../plugin/lib/rewind/transcripts.mjs';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();
const cleanups = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop(), { recursive: true, force: true });
});
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-rewind-'));
  cleanups.push(dir);
  return dir;
};

const line = (payloadType, payload, minutesAgo) => ({
  stream: 's', sequence: 1, recorded_at: iso(minutesAgo), payload_type: payloadType, payload,
});
const intentLine = (text, minutesAgo) => line('runtime.user_intent.accepted', { kind: 'session', record: { kind: 'accepted', refill_blocks: [{ kind: 'text', text }] } }, minutesAgo);
const toolLine = (name, minutesAgo) => line('tool_batch.effect.started', { kind: 'tool_batch_effect', record: { kind: 'started', tool_name: name } }, minutesAgo);
const nameLine = (title, minutesAgo) => line('session.name.changed', { session_id: 'x', previous_name: '', new_name: title, source: 'ai' }, minutesAgo);
const routeLine = (cwd, minutesAgo) => line('runtime.session.route_facts', { kind: 'route_facts', record: { cwd } }, minutesAgo);
const endLine = (minutesAgo) => line('session.end', { kind: 'session_end' }, minutesAgo);
const writeLog = (storeDir, sessionId, lines) => {
  const dir = join(storeDir, '2026', '10', '26', sessionId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'session.jsonl');
  writeFileSync(path, `${lines.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join('\n')}\n`);
  return path;
};
const noGit = () => {
  throw new Error('no git');
};
const fixture = () => {
  const home = scratch();
  const repo = join(home, 'repo');
  mkdirSync(repo, { recursive: true });
  const storeDir = join(home, 'muse-store', 'sessions');
  const env = { HOME: home, LITMUSE_SESSION_STORE: storeDir };
  return { home, repo, env, storeDir };
};

test('gauges: one cell per item up to ten, scaled above, unknown totals never guessed', () => {
  assert.equal(gauge(3, 5), '[▉▉▉░░] 3/5');
  assert.equal(gauge(0, 3), '[░░░] 0/3');
  assert.equal(gauge(5, 5), '[▉▉▉▉▉] 5/5');
  assert.equal(gauge(1, 40), '[▉░░░░░░░░░] 1/40');
  assert.equal(gauge(39, 40), '[▉▉▉▉▉▉▉▉▉░] 39/40');
  assert.equal(gauge(40, 40), '[▉▉▉▉▉▉▉▉▉▉] 40/40');
  assert.equal(gauge(2, null), '[…] 2 steps');
  assert.equal(gauge(1, null), '[…] 1 step');
  assert.equal(gauge(null, null), '[…] running');
  assert.deepEqual(progressOf(2, null).remaining, ['unknown']);
  assert.deepEqual(progressOf(3, 3).remaining, []);
  assert.equal(aggregateProgress([progressOf(1, 2), progressOf(2, 3)]).gauge, '[▉▉▉░░] 3/5');
  assert.equal(aggregateProgress([progressOf(1, 2), progressOf(2, null)]).gauge, '[…] 3 steps');
  assert.equal(aggregateProgress([]).gauge, '[…] running');
  assert.ok(!/[?]/.test(`${gauge(2, null)} ${gauge(null, null)} ${aggregateProgress([]).gauge}`), 'no placeholder glyph reaches the user');
});

test('display width counts Hangul as two columns and clips at 60, 80 and 100', () => {
  assert.equal(displayWidth('가나다'), 6);
  assert.equal(displayWidth('가'), 2);
  assert.equal(displayWidth('abc'), 3);
  const long = '남은 작업: 세션 브리핑을 렌더링하고 게이지를 그린 다음 검증합니다 '.repeat(6);
  for (const width of [60, 80, 100]) {
    const clipped = clipToWidth(long, width);
    assert.ok(displayWidth(clipped) <= width, `width ${width}`);
    assert.ok(clipped.endsWith('…'));
  }
  assert.equal(clipToWidth('short', 60), 'short');
});

test('redaction masks credential shapes, secret assignments, env values and URI userinfo', () => {
  const injected = 's3cr3t-value-from-env-9921';
  const redact = makeRedactor({ env: { HOME: '/Users/someone', MY_SERVICE_VALUE: injected, LANG: 'ko_KR.UTF-8', PWD: '/Users/someone/repo' }, home: '/Users/someone' });
  const text = redact(`basic OPENAI_API_KEY=abc123def456 and ${injected} at https://user:pw@host.example/x in /Users/someone/repo`);
  assert.doesNotMatch(text, /abc123def456/u);
  assert.doesNotMatch(text, new RegExp(injected, 'u'));
  assert.doesNotMatch(text, /user:pw/u);
  assert.match(text, /\/\/\[redacted\]@host\.example/u);
  assert.match(text, /in ~\/repo/u);
  assert.equal(redact('ko_KR.UTF-8 stays'), 'ko_KR.UTF-8 stays');
});



test('JSON-colon secrets are masked but plain JSON values stay', () => {
  const redact = makeRedactor({ env: {}, home: '/nonexistent-home' });
  const masked = redact('config \'api_token\': \'s3cr3t-value-99\' with \'name\': \'bob\'');
  assert.ok(!masked.includes('s3cr3t-value-99'), 'the JSON secret value is masked');
  assert.ok(masked.includes('bob'), 'the plain JSON value stays');
});

test('env secrets in URL form and paths carrying a query string are masked', () => {
  const hook = 'https://hooks.example.com/services/T123/B456/abcdefsecretvalue';
  const tabbed = '/data/files?tab=secrettoken123';
  const redact = makeRedactor({ env: { SLACK_WEBHOOK_URL: hook, SHORT_HOOK: 'https://x.co/a', DATA_DIR: '/data/files', QUERY_DIR: tabbed }, home: '/nonexistent-home' });
  const masked = redact(`post to ${hook} now and read ${tabbed}`);
  assert.ok(!masked.includes('hooks.example.com'), 'the webhook URL is masked');
  assert.ok(!masked.includes('secrettoken123'), 'the path query string is masked');
  assert.ok(masked.includes('[redacted]'));
  assert.equal(redact('read /data/files today'), 'read /data/files today', 'a plain path stays readable');
  assert.equal(redact('see https://x.co/a'), 'see https://x.co/a', 'a short URL stays readable');
});

test('transcripts belong to the worktree whose cwd their log records, links refused', () => {
  const { repo, storeDir } = fixture();
  const byCwd = writeLog(storeDir, 'aaaa1111', [routeLine(repo, 10), intentLine('hello', 10)]);
  assert.deepEqual(findTranscripts(storeDir, [repo]).files.map((file) => file.path), [byCwd]);
  const other = join(repo, '..', 'other');
  writeLog(storeDir, 'bbbb2222', [routeLine(other, 5), intentLine('hi', 5)]);
  assert.deepEqual(findTranscripts(storeDir, [other]).files.map((file) => file.path).length, 1);
  assert.equal(findTranscripts(join(storeDir, 'missing'), [repo]).status, 'unknown');
  const link = join(storeDir, '2026', '10', '26', 'linked', 'session.jsonl');
  mkdirSync(join(storeDir, '2026', '10', '26', 'linked'), { recursive: true });
  symlinkSync(byCwd, link);
  assert.equal(readTranscriptLines(link, makeBudget()), null);
});

test('a session record skips malformed lines, prefers the logged title, and spots a question', () => {
  const record = sessionRecord('cccc3333', [
    routeLine('/repo', 30),
    intentLine('build the brief', 30),
    '{not json',
    nameLine('Named by the user', 25),
    toolLine('write_file', 20),
    toolLine('write_file', 19),
    intentLine('Done. Should I commit this now?', 5),
  ], { now: NOW });
  assert.equal(record.title, 'Named by the user');
  assert.equal(record.status, 'waiting-on-user');
  assert.equal(record.waitingReason, 'asked the user');
  assert.deepEqual(record.asked, ['build the brief', 'Done. Should I commit this now?']);
  assert.equal(record.done.tools.write_file, 2);
  assert.deepEqual(record.done.files, []);
  assert.deepEqual(record.done.commits, []);
  assert.equal(record.result, 'unknown');

  const ended = sessionRecord('dddd', [routeLine('/repo', 400), intentLine('first', 400), endLine(390)], { now: NOW });
  assert.equal(ended.status, 'ended');
  assert.equal(ended.title, 'first');
  assert.equal(sessionRecord('eeee', [], { now: NOW }).status, 'unknown');
});

test('redaction runs before clipping, so a secret straddling the clip boundary never leaks', () => {
  const secret = `ghp_${'A'.repeat(36)}`;
  const redact = makeRedactor({ env: {}, home: '/nonexistent-home-xyz' });
  const asked = sessionRecord('ffff1111', [
    routeLine('/repo', 30),
    intentLine(`${'a'.repeat(130)} paid with ${secret} yesterday`, 30),
  ], { now: NOW, redact }).asked[0];
  assert.ok(!asked.includes('ghp_'), `asked leaks a secret prefix: ${asked}`);
  assert.ok(asked.includes('[redacted]'), `asked loses the secret marker: ${asked}`);

  const { repo, env } = fixture();
  const longSecret = `ghp_${'B'.repeat(36)}`;
  mkdirSync(join(repo, 'plans'), { recursive: true });
  writeFileSync(join(repo, 'plans', 'secret.md'), `- [ ] 1. rotate ${'x'.repeat(60)} now ${longSecret} then verify\n- [x] 0. scaffold done\n`);
  const shown = collectRewind({ cwd: repo, env, now: NOW, exec: noGit }).roadmap.plans
    .flatMap((plan) => [...plan.rows.map((row) => row.title), plan.current]);
  assert.ok(shown.length > 0, 'the secret plan reaches the brief');
  for (const title of shown) {
    assert.ok(!title.includes('ghp_'), `plan row leaks a secret prefix: ${title}`);
  }
  assert.ok(shown.some((title) => title.includes('[redacted]')), 'the plan row keeps the secret marker');
});

test('a linked transcript is refused and the shared budget caps 50 MB of logs at 8 MiB', () => {
  const { repo, storeDir, env } = fixture();
  writeLog(storeDir, 'ffff0000', [routeLine(repo, 1), intentLine('x', 1)]);
  const filler = `${JSON.stringify(toolLine('bash', 2))}\n`;
  for (let index = 0; index < 50; index += 1) {
    const id = `big${String(index).padStart(5, '0')}`;
    const head = `${JSON.stringify(intentLine('big one', 2))}\n`;
    writeLog(storeDir, id, [routeLine(repo, 2), head.trim(), ...Array(Math.ceil((1024 * 1024) / filler.length)).fill(filler.trim())]);
  }
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, max: 50 });
  assert.ok(data.budget.bytesRead <= 8 * 1024 * 1024);
  assert.equal(data.budget.limit, 8 * 1024 * 1024);
  assert.ok(data.sessions.length >= 1);
});

test('missing sources read unknown and an empty HOME still returns a brief', () => {
  const home = scratch();
  const data = collectRewind({ cwd: home, env: { HOME: home, LITMUSE_SESSION_STORE: join(home, 'no-store') }, now: NOW, exec: noGit });
  assert.equal(data.sessions.length, 0);
  for (const name of ['transcripts', 'litgoal', 'plans', 'handoffs', 'git', 'workflowStack', 'startWork', 'herdr']) {
    assert.equal(data.sources[name], 'unknown', name);
  }
  assert.equal(data.roadmap.progress.gauge, '[…] running');
  assert.equal(data.next.kind, 'none');
  assert.match(renderRewind(data), /Not read: sessions, goals, plans, handoffs, commits, workflows, start-work, agents\./u);
});

test('a running start-work reads its gauge from the plan\u2019s checkboxes', () => {
  const { repo, env } = fixture();
  mkdirSync(join(repo, 'plans'));
  writeFileSync(join(repo, 'plans', 'p.md'), '# P\n- [x] 1. a\n- [x] 2. b\n- [ ] 3. c\n');
  const stateHome = join(env.HOME, 'xdg');
  mkdirSync(join(stateHome, 'litmuse', 'stage'), { recursive: true });
  writeFileSync(join(stateHome, 'litmuse', 'stage', 'owner-1.json'), JSON.stringify({ version: 1, session: 'owner-1', route: 'start-work', plan: 'plans/p.md' }));
  const withState = { ...env, XDG_STATE_HOME: stateHome };
  const [entry] = collectRewind({ cwd: repo, env: withState, now: NOW, exec: noGit, here: true, sessionId: 'owner-1' }).startWork;
  assert.equal(entry.progress.gauge, '[▉▉░] 2/3');
  assert.deepEqual(entry.progress.remaining, ['3. c']);
  writeFileSync(join(stateHome, 'litmuse', 'stage', 'owner-1.json'), JSON.stringify({ version: 1, session: 'owner-1', route: 'start-work', plan: 'plans/../x.md' }));
  assert.equal(collectRewind({ cwd: repo, env: withState, now: NOW, exec: noGit, here: true, sessionId: 'owner-1' }).startWork[0].progress.gauge, '[…] running', 'an odd plan name reads as a pulse, never a placeholder');
});

test('plans, litgoal, handoffs, stacks and git all feed the brief with redacted text', () => {
  const { repo, storeDir, env, home } = fixture();
  mkdirSync(join(repo, 'plans'));
  writeFileSync(join(repo, 'plans', 'one.md'), '# One\n- [x] first\n- [ ] second with OPENAI_API_KEY=abc123def456\n- [ ] third\n');
  writeFileSync(join(repo, 'plans', 'done.md'), '- [x] all\n');
  mkdirSync(join(repo, '.litmuse', 'goals'), { recursive: true });
  writeFileSync(join(repo, '.litmuse', 'goals', 'ship.json'), JSON.stringify({ objective: 'ship it', status: 'active', criteria: [{ id: 'c1', status: 'pass' }, { id: 'c2', text: 'two', status: 'pending' }] }));
  writeFileSync(join(repo, 'HANDOFF.md'), '# Handoff\n## Now\nbody\n');
  mkdirSync(join(repo, '.litmuse', 'workflow-stack'), { recursive: true });
  writeFileSync(join(repo, '.litmuse', 'workflow-stack', 's-self.json'), JSON.stringify({ version: 1, sessionId: 's-self', frames: [{ skill: 'lit-loop', stage: 'verify', role: 'spine', status: 'paused', n: 2, total: 4, at: iso(3) }, { skill: 'lit-recap', role: 'side', status: 'active', at: iso(1) }] }));
  writeLog(storeDir, 's-self', [routeLine(repo, 4), intentLine('go on', 4), toolLine('bash', 2)]);
  const exec = (file, args) => {
    assert.equal(file, 'git');
    if (args[0] === 'worktree') return `worktree ${repo}\nHEAD abc\nbranch refs/heads/lane/x\n`;
    if (args[0] === 'rev-parse') return 'lane/x\n';
    return `abcdef1234\t${iso(3)}\tfeat: thing\n`;
  };
  const data = collectRewind({ cwd: repo, env, now: NOW, exec, sessionId: 's-self' });
  assert.deepEqual(Object.entries(data.sources).filter(([, status]) => status !== 'ok').map(([name]) => name), ['startWork', 'herdr']);
  assert.equal(data.roadmap.plans.length, 2, 'the finished plan stays as done work');
  const plan = data.roadmap.plans.find((item) => item.plan === 'plans/one.md');
  assert.equal(plan.progress.gauge, '[▉░░] 1/3');
  assert.match(plan.current, /^second with .*\[redacted\]$/u);
  assert.equal(data.roadmap.plans.find((item) => item.plan === 'plans/done.md').current, null);
  assert.equal(data.roadmap.litgoal[0].progress.gauge, '[▉░] 1/2');
  assert.equal(data.roadmap.progress.gauge, '[▉▉▉░░░] 3/6');
  assert.deepEqual(data.handoffs[0].headings, ['# Handoff', '## Now']);
  assert.equal(data.workflows[0].progress.gauge, '[▉▉░░] 2/4');
  const [session] = data.sessions;
  assert.equal(session.self, true);
  assert.equal(session.status, 'waiting-on-user');
  assert.equal(session.done.tools.bash, 1);
  assert.deepEqual(session.done.commits, [{ hash: 'abcdef1', subject: 'feat: thing' }]);
  assert.equal(data.next.kind, 'resume-frame');
  assert.equal(data.next.say, 'lit continue');
  assert.ok(data.nextRecorded);
  const recorded = JSON.parse(readFileSync(nextStepPath(repo, 's-self'), 'utf8'));
  assert.equal(recorded.kind, 'resume-frame');
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /abc123def456/u);
  assert.ok(!text.includes(home));
  assert.equal(data.workflows[0].sessionId, undefined);
});

test('the printed brief strips terminal escape sequences from plan rows and commit subjects', () => {
  const { repo, env } = fixture();
  mkdirSync(join(repo, 'plans'), { recursive: true });
  writeFileSync(join(repo, 'plans', 'evil.md'), '- [ ] 1. polish \u001b]8;;http://evil.example\u0007link\u001b]8;;\u001b\\ now\n- [x] 0. done\n');
  const exec = (file, args) => {
    assert.equal(file, 'git');
    if (args[0] === 'worktree') return `worktree ${repo}\nHEAD abc\nbranch refs/heads/lane/x\n`;
    if (args[0] === 'rev-parse') return 'lane/x\n';
    return `abcdef1234\t${iso(3)}\tfeat: ship \u001b[31mred\u001b[0m\n`;
  };
  const data = collectRewind({ cwd: repo, env, now: NOW, exec, max: 50 });
  const text = renderRewind(data);
  assert.ok(!text.includes('\u001b'), 'no escape byte reaches the printed brief');
  assert.ok(!text.includes('\u0007'), 'no BEL byte reaches the printed brief');
  assert.ok(!text.includes('evil.example'), 'the smuggled hyperlink target is gone');
  assert.ok(!text.includes('[31m'), 'no color-sequence residue stays in the subject');
  assert.ok(text.includes('polish link now'), 'the row text survives without its hyperlink wrapper');
});

test('next step priority: frame, boundary, own work, single plan, none', () => {
  const base = { workflows: [], startWork: [], roadmap: { plans: [] } };
  const frame = { sessionId: 's1', role: 'spine', status: 'paused', skill: 'lit-loop', stage: 'verify', progress: progressOf(1, 2) };
  const boundary = { status: 'paused', workId: 'w', plan: 'plans/a.md', pendingBoundary: { action: 'read', root: '/x' }, sessionId: 's2' };
  const ownWork = { status: 'active', workId: 'w2', plan: 'plans/b.md', sessionId: 's1' };
  const plan = { plan: 'plans/c.md', local: true, progress: progressOf(0, 2) };
  assert.equal(chooseNextStep({ ...base, workflows: [frame], startWork: [boundary] }, 's1').kind, 'resume-frame');
  const approve = chooseNextStep({ ...base, startWork: [boundary] }, 's1');
  assert.equal(approve.kind, 'approve-boundary');
  assert.equal(approve.automatic, false);
  assert.equal(chooseNextStep({ ...base, startWork: [ownWork] }, 's1').kind, 'continue-work');
  const start = chooseNextStep({ ...base, roadmap: { plans: [plan] } }, 's1');
  assert.equal(start.kind, 'start-plan');
  assert.equal(start.command, 'go plans/c.md');
  assert.equal(chooseNextStep({ ...base, roadmap: { plans: [plan, { ...plan, plan: 'plans/d.md' }] } }, 's1').kind, 'none');
  assert.equal(chooseNextStep({ ...base, workflows: [frame] }, null).kind, 'none');
});

test('writeNextStep refuses a linked state dir and a linked staging file', () => {
  const { repo } = fixture();
  const target = join(repo, 'target');
  mkdirSync(target, { recursive: true });
  symlinkSync(target, join(repo, '.litmuse'));
  assert.throws(() => writeNextStep(repo, 's1', { kind: 'start-plan', target: { plan: 'plans/a.md' } }, new Date(NOW)));
  assert.equal(existsSync(join(target, 'adhd')), false, 'nothing is written through the link');

  const { repo: repo2 } = fixture();
  const path = nextStepPath(repo2, 's1');
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(join(repo2, 'elsewhere'), `${path}.${process.pid}.tmp`);
  assert.throws(() => writeNextStep(repo2, 's1', { kind: 'start-plan', target: { plan: 'plans/a.md' } }, new Date(NOW)));
  assert.equal(existsSync(join(repo2, 'elsewhere')), false, 'the staging link target is never created');
});

test('writeNextStep round-trips through the hook reader; a stale record is deleted unread', () => {
  const { repo } = fixture();
  const payload = { session_id: 's1', cwd: repo };
  const path = writeNextStep(repo, 's1', { kind: 'start-plan', target: { plan: 'plans/a.md' } }, new Date(NOW));
  assert.ok(existsSync(path));
  assert.deepEqual(takeNextStep(payload, NOW), { kind: 'start-plan', target: { plan: 'plans/a.md' } });
  assert.equal(existsSync(path), false, 'a consumed record is deleted');
  writeNextStep(repo, 's1', { kind: 'start-plan', target: { plan: 'plans/a.md' } }, new Date(NOW - 31 * 60_000));
  assert.equal(takeNextStep(payload, NOW), null, 'a stale record reads as nothing');
  assert.equal(existsSync(path), false, 'a stale record is deleted all the same');
  writeNextStep(repo, 's1', { kind: 'start-plan', target: { plan: 'plans/a.md' } }, new Date(NOW));
  assert.equal(takeNextStep({ session_id: 'other', cwd: repo }, NOW), null, 'another session never opens this record');
  assert.equal(existsSync(path), true, 'a foreign read leaves the record alone');
});

test('in a linked worktree the brief records its next step where `go` reads it, not in the main checkout', () => {
  const { repo, env } = fixture();
  mkdirSync(join(repo, '.git'));
  const wt = join(repo, '.worktrees', 'wt');
  mkdirSync(join(wt, 'plans'), { recursive: true });
  writeFileSync(join(wt, '.git'), 'gitdir: ../../.git/worktrees/wt\n');
  writeFileSync(join(wt, 'plans', 'a.md'), '# A\n- [ ] 1. first\n- [ ] 2. second\n');
  const data = collectRewind({ cwd: wt, here: true, sessionId: 's1', env, now: NOW, exec: noGit });
  assert.equal(data.next.kind, 'start-plan');
  assert.equal(data.nextRecorded, true);
  assert.equal(existsSync(nextStepPath(wt, 's1')), true, 'the record lands in the worktree');
  assert.equal(existsSync(join(repo, '.litmuse')), false, 'the main checkout stays untouched');
  assert.deepEqual(takeNextStep({ session_id: 's1', cwd: wt }, NOW), { kind: 'start-plan', target: { plan: 'plans/a.md' } });
});

test('--here keeps to this folder, herdr is asked only under HERDR_ENV=1, and the CLI rejects unknown flags', () => {
  const { repo, storeDir, env } = fixture();
  const other = join(repo, '..', 'sibling');
  mkdirSync(other);
  writeLog(storeDir, 'here0001', [routeLine(repo, 4), intentLine('mine', 4)]);
  writeLog(storeDir, 'else0001', [routeLine(other, 4), intentLine('theirs', 4)]);
  const calls = [];
  const exec = (file, args) => {
    calls.push([file, ...args].join(' '));
    if (file === 'herdr') return 'pane-1 claude working\n';
    if (args[0] === 'worktree') return `worktree ${repo}\n\nworktree ${other}\n`;
    throw new Error('no log');
  };
  const all = collectRewind({ cwd: repo, env, now: NOW, exec });
  assert.deepEqual(all.sessions.map((session) => session.id8).sort(), ['else0001', 'here0001']);
  assert.equal(all.sources.herdr, 'unknown');
  assert.ok(!calls.some((call) => call.startsWith('herdr')));

  const here = collectRewind({ cwd: repo, env: { ...env, HERDR_ENV: '1' }, now: NOW, exec, here: true });
  assert.deepEqual(here.sessions.map((session) => session.id8), ['here0001']);
  assert.equal(here.sources.herdr, 'ok');
  assert.deepEqual(here.herdr.agents, ['pane-1 claude working']);
  assert.equal(calls.filter((call) => call.startsWith('git worktree')).length, 1);

  assert.equal(parseSince('7d'), 7 * 86_400_000);
  assert.equal(parseSince('soon'), null);
  const out = [];
  const err = [];
  const sink = (list) => ({ write: (chunk) => list.push(chunk), columns: 80 });
  assert.equal(runRewindCli(['--bogus'], repo, { env, stdout: sink(out), stderr: sink(err) }), 64);
  assert.match(err.join(''), /unknown argument/u);
  assert.equal(runRewindCli(['--json', '--here'], repo, { env, stdout: sink(out), stderr: sink(err) }), 0);
  assert.equal(JSON.parse(out.join('')).scope.here, true);
});

test('open plans list this worktree first under a cap, and the roadmap gauge counts this worktree only', () => {
  const { repo, env } = fixture();
  const other = join(repo, '..', 'far');
  mkdirSync(join(other, 'plans'), { recursive: true });
  mkdirSync(join(repo, 'plans'));
  writeFileSync(join(repo, 'plans', 'zz-local.md'), '- [x] a\n- [ ] b\n');
  // Staggered mtimes: the newest plan of the other worktree lists first.
  for (let index = 0; index < 10; index += 1) {
    const path = join(other, 'plans', `p${index}.md`);
    writeFileSync(path, '- [ ] x\n- [ ] y\n- [ ] z\n');
    utimesSync(path, new Date(NOW - (9 - index) * 1000), new Date(NOW - (9 - index) * 1000));
  }
  const exec = (file, args) => {
    if (args[0] === 'worktree') return `worktree ${repo}\n\nworktree ${other}\n`;
    throw new Error('no log');
  };
  const data = collectRewind({ cwd: repo, env, now: NOW, exec });
  assert.equal(data.roadmap.plans.length, 8);
  assert.equal(data.roadmap.plansOmitted, 3);
  assert.equal(data.roadmap.plans[0].plan, 'plans/zz-local.md');
  assert.equal(data.roadmap.progress.gauge, '[▉░] 1/2');
  assert.equal(data.next.kind, 'start-plan');
  assert.match(renderRewind(data, 80), /…\(\+3 more open plans\)/u);
  assert.match(renderRewind(data, 80), /far: plans\/p9\.md/u);
});

test('the brief reads opener then headline: one card per session, a marked timeline, one next step', () => {
  const { repo, storeDir, env } = fixture();
  mkdirSync(join(repo, 'plans'));
  writeFileSync(join(repo, 'plans', 'one.md'), '# One\n- [x] first\n- [ ] second\n- [ ] third\n');
  writeLog(storeDir, 'aaaabbbb', [routeLine(repo, 8), intentLine('fix the deck', 8), toolLine('edit_file', 5)]);
  writeLog(storeDir, 'ccccdddd', [routeLine(repo, 90), intentLine('render the figure', 90), endLine(80)]);
  const exec = (file, args) => {
    if (args[0] === 'worktree') return `worktree ${repo}\nHEAD x\n`;
    throw new Error('no log');
  };
  const text = renderRewind(collectRewind({ cwd: repo, env, now: NOW, exec }), 100);
  assert.match(text, /^Done so far: .*\nDoing now: .*\nNext: .*\nlit-adhd: 2 session\(s\) · \d+ waiting on you · next: /u, 'opener, then headline');
  assert.match(text, /● ACTIVE · aaaabbbb · 5m ago/u, 'active card with badge');
  assert.match(text, /^fix the deck$/mu, 'goal in plain words');
  assert.match(text, /last ask: "fix the deck"/u, 'known-facts line');
  assert.match(text, /^▶ Now: edit_file$/mu, 'no commit on record, so the card names the last tool');
  assert.match(text, /^┌ Ended · 1 /mu, 'ended table after the live cards');
  assert.match(text, /^│ ccccdddd │ repo\s+│ render the figure\s+│ 1h\s+│/mu, 'one bordered row per ended session');
  assert.match(text, /^-- roadmap --$/mu, 'timeline section');
  assert.match(text, /^▶ plans\/one\.md \[▉░░\] 1\/3 now: second$/mu, 'now marker');
  assert.match(text, /^  ○ later: third$/mu, 'later marker');
  assert.match(text, /^┌ RECOMMENDED NEXT STEP /mu, 'next step in a box');
  assert.match(text, /Say `go` to continue\./u);
  assert.ok(!/[?]/.test(text), 'no placeholder glyph anywhere in the brief');
});

test('the last tool call is recorded by name only, and a card with no edit names it', () => {
  const { repo, storeDir, env } = fixture();
  const exec = () => {
    throw new Error('no git');
  };
  mkdirSync(join(repo, 'plans'));
  writeLog(storeDir, 'aaaabbbb', [routeLine(repo, 8), intentLine('fix the deck', 8), toolLine('bash', 5), toolLine('search', 4)]);
  const data = collectRewind({ cwd: repo, env, now: NOW, exec });
  assert.deepEqual(data.sessions[0].lastAction, { tool: 'search' });
  const text = renderRewind(data, 100);
  assert.match(text, /^▶ Now: search$/mu, 'now line names the last tool');
  assert.match(text, /✅ Done: bash · search/u, 'tools are named, never counted');
  assert.doesNotMatch(text, /×/u);
});

test('ended sessions collapse into short one-line rows, eight at most', () => {
  const { repo, storeDir, env } = fixture();
  const exec = (file, args) => {
    if (args[0] === 'worktree') return `worktree ${repo}\nHEAD x\n`;
    throw new Error('no log');
  };
  mkdirSync(join(repo, 'plans'));
  for (let index = 0; index < 9; index += 1) {
    const id = `e${String(index).padStart(7, '0')}`;
    writeLog(storeDir, id, [routeLine(repo, 200 + index), intentLine(`task number ${index} with a long goal line`, 200 + index), endLine(190 + index)]);
  }
  const text = renderRewind(collectRewind({ cwd: repo, env, now: NOW, exec }), 120);
  assert.match(text, /^┌ Ended · 9 /mu);
  const rows = text.split('\n').filter((row) => /^│ e\d{7} │/u.test(row));
  assert.equal(rows.length, 8);
  for (const row of rows) assert.ok(displayWidth(row) <= 120, `row fits: ${row}`);
  assert.match(text, /…\(\+1 more ended\)/u);
  assert.ok(!text.includes('== '), 'no full cards for ended sessions');
});

test('with no runnable step the brief still recommends a real one, never recorded', () => {
  const base = {
    summary: { sessions: 1, waitingOnUser: 0, active: 0 },
    sessions: [],
    roadmap: { plans: [], plansOmitted: 0, litgoal: [] },
    workflows: [],
    commits: [],
    sources: {},
    next: { kind: 'none', target: null },
    generatedAt: new Date(NOW).toISOString(),
    scope: { since: '7d', worktrees: ['~/repo'] },
  };
  const waiting = { id8: 'aaaabbbb', title: 'wait lane', asked: ['is this right?'], worktree: '~/repo', last: new Date(NOW - 36e5).toISOString(), status: 'waiting-on-user', self: false, progress: { gauge: '[…] running', remaining: [] }, done: { tools: {}, files: [], commits: [] } };
  assert.match(renderRewind({ ...base, sessions: [waiting] }, 100), /│ Answer aaaabbbb in repo\s+│/u);
  const paused = { id8: 'bbbbcccc', skill: 'lit-loop', stage: 'verify', status: 'paused' };
  assert.match(renderRewind({ ...base, workflows: [paused] }, 100), /│ Resume lit-loop at verify in bbbbcccc \(unknown\)\s+│/u);
  const plan = { worktree: '~/repo', plan: 'plans/p.md', local: true, current: '2. Second item', progress: { gauge: '[░░] 0/2', remaining: [] } };
  assert.match(renderRewind({ ...base, roadmap: { ...base.roadmap, plans: [plan] } }, 100), /│ Next in plans\/p\.md: 2\. Second item\s+│/u);
  const active = { ...waiting, id8: 'ccccdddd', status: 'active' };
  assert.match(renderRewind({ ...base, sessions: [active] }, 100), /│ Check on ccccdddd in repo \(wait lane\)\s+│/u);
  const ended = { ...waiting, id8: 'dddd1111', status: 'ended' };
  assert.match(renderRewind({ ...base, sessions: [ended] }, 100), /│ Pick up dddd1111 in repo: wait lane\s+│/u);
  assert.match(renderRewind(base, 100), /│ No session or plan in this window: say what to start\s+│/u);
});

test('the recommended-step box borders line up: top, rows and bottom share one width', () => {
  const base = {
    summary: { sessions: 1, waitingOnUser: 0, active: 0 },
    sessions: [],
    roadmap: { plans: [], plansOmitted: 0, litgoal: [] },
    workflows: [],
    commits: [],
    sources: {},
    next: { kind: 'none', target: null },
    generatedAt: new Date(NOW).toISOString(),
    scope: { since: '7d', worktrees: ['~/repo'] },
  };
  for (const color of [false, true]) {
    const lines = stripAnsi(renderRewind(base, 100, { color })).split('\n');
    const top = lines.findIndex((row) => row.startsWith('┌ RECOMMENDED NEXT STEP'));
    assert.ok(top >= 0, 'the box opens');
    const bottom = lines.findIndex((row, i) => i > top && row.startsWith('└'));
    const box = lines.slice(top, bottom + 1);
    assert.ok(box.length >= 3, 'top, body and bottom rows');
    for (const row of box) assert.equal(displayWidth(row), 100, `box row is frame-wide: ${row}`);
  }
});

test('a card with no recorded progress shows no pulse line; a known count still shows', () => {
  const base = {
    summary: { sessions: 1, waitingOnUser: 0, active: 0 },
    sessions: [],
    roadmap: { plans: [], plansOmitted: 0, litgoal: [] },
    workflows: [],
    commits: [],
    sources: {},
    next: { kind: 'none', target: null },
    generatedAt: new Date(NOW).toISOString(),
    scope: { since: '7d', worktrees: ['~/repo'] },
  };
  const live = (id8, gauge) => ({
    id8, title: 'lane work', asked: [], worktree: '~/repo',
    last: new Date(NOW - 36e5).toISOString(), status: 'active', self: false,
    progress: { gauge, remaining: [] }, done: { tools: {}, files: [], commits: [] },
  });
  const unknown = stripAnsi(renderRewind({ ...base, sessions: [live('aaaabbbb', '[…] running')] }, 100));
  assert.doesNotMatch(unknown, /\[…\] running/u, 'no placeholder pulse when nothing is known');
  assert.match(unknown, /● ACTIVE · aaaabbbb · 1h ago/u, 'the card still says the known facts');
  const counted = stripAnsi(renderRewind({ ...base, sessions: [live('ccccdddd', '[…] 3 steps')] }, 100));
  assert.match(counted, /\[…\] 3 steps/u, 'a known finished count still shows');
});

test('template plans and stale plans of other worktrees stay out of the roadmap', () => {
  const { repo, env } = fixture();
  const other = join(repo, '..', 'far');
  mkdirSync(join(other, 'plans'), { recursive: true });
  mkdirSync(join(repo, 'plans'));
  writeFileSync(join(repo, 'plans', 'scaffold.md'), '- [ ] <first step>\n- [ ] <second step>\n');
  writeFileSync(join(repo, 'plans', 'same.md'), '- [ ] todo\n- [ ] todo\n');
  const stale = join(other, 'plans', 'old.md');
  writeFileSync(stale, '- [x] done\n- [ ] rest\n');
  utimesSync(stale, new Date(NOW - 30 * 864e5), new Date(NOW - 30 * 864e5));
  const exec = (file, args) => {
    if (args[0] === 'worktree') return `worktree ${repo}\n\nworktree ${other}\n`;
    throw new Error('no log');
  };
  const data = collectRewind({ cwd: repo, env, now: NOW, exec });
  assert.deepEqual(data.roadmap.plans, []);
  assert.equal(data.roadmap.plansOmitted, 0);
});

test('asks read from payload-level refill blocks as the host writes them', () => {
  const direct = {
    stream: 's', sequence: 1, recorded_at: NOW - 8 * 60_000, payload_type: 'runtime.user_intent.accepted',
    payload: { kind: 'session', refill_blocks: [{ kind: 'text', text: 'fix the deck' }] },
  };
  const rec = sessionRecord('aaaabbbb', [direct], { now: NOW });
  assert.deepEqual(rec.asked, ['fix the deck']);
});

test('host log stamps read in microseconds, ISO strings and milliseconds pass through', () => {
  const micro = (payloadType, payload, minutesAgo) => ({
    stream: 's', sequence: 1, recorded_at: (NOW - minutesAgo * 60_000) * 1000, payload_type: payloadType, payload,
  });
  const rec = sessionRecord('aaaabbbb', [micro('runtime.user_intent.accepted', { kind: 'session', record: { kind: 'accepted', refill_blocks: [{ kind: 'text', text: 'fix the deck' }] } }, 8)], { now: NOW });
  assert.equal(rec.status, 'active');
  assert.equal(rec.lastMs, NOW - 8 * 60_000);
});

// Round-3 shape: one session finished its start-work, one stopped and sits idle, this one is briefing;
// one plan is fully ticked, one is open, one went stale outside the window; HANDOFF.md has a Next item.
const roundThree = () => {
  const { repo, storeDir, env, home } = fixture();
  const stateHome = join(home, 'xdg');
  const stage = join(stateHome, 'litmuse', 'stage');
  mkdirSync(join(stage, 'liveness'), { recursive: true });
  mkdirSync(join(repo, 'plans'));
  writeFileSync(join(repo, 'plans', 'a.md'), '# A\n- [x] 1. parse\n- [x] 2. render\n');
  writeFileSync(join(repo, 'plans', 'b.md'), '# B\n- [x] 1. card\n- [ ] 2. chip\n');
  const old = join(repo, 'plans', 'old.md');
  writeFileSync(old, '# Old\n- [ ] 1. forgotten\n');
  utimesSync(old, new Date(NOW - 10 * 864e5), new Date(NOW - 10 * 864e5));
  utimesSync(join(repo, 'plans', 'a.md'), new Date(NOW - 2 * 60_000), new Date(NOW - 2 * 60_000));
  writeFileSync(join(repo, 'HANDOFF.md'), '# Handoff\n## Next\n- Ship the brief to the family\n- later thing\n');
  writeLog(storeDir, 'run00001', [routeLine(repo, 30), intentLine('run plan a', 30), toolLine('edit_file', 3)]);
  writeLog(storeDir, 'idle0001', [routeLine(repo, 20), intentLine('check the card', 20), toolLine('bash', 5)]);
  writeLog(storeDir, 'self0001', [routeLine(repo, 1), intentLine('lit adhd', 1)]);
  writeFileSync(join(stage, 'run00001.json'), JSON.stringify({ version: 1, session: 'run00001', route: null, kind: 'clear', plan: 'plans/a.md', cwd: repo }));
  writeFileSync(join(stage, 'liveness', 'idle0001.json'), JSON.stringify({ version: 1, session: 'idle0001', state: 'idle', at: iso(4), cwd: repo }));
  const exec = (file, args) => {
    if (args[0] === 'worktree') return `worktree ${repo}\nHEAD x\n`;
    if (args[0] === 'rev-parse') return 'main\n';
    return `abcdef1234\t${iso(2)}\tfeat: render the brief\n`;
  };
  return { repo, exec, env: { ...env, XDG_STATE_HOME: stateHome } };
};

test('lit-adhd brief: finished plans count as done, every plan is held to the window', () => {
  const { repo, exec, env } = roundThree();
  const data = collectRewind({ cwd: repo, env, now: NOW, exec, sessionId: 'self0001', record: false });
  assert.deepEqual(data.roadmap.plans.map((plan) => plan.plan).sort(), ['plans/a.md', 'plans/b.md'], 'the stale local plan is out');
  assert.equal(data.roadmap.progress.gauge, '[▉▉▉░] 3/4');
  assert.match(renderRewind(data, 100), /^✓ plans\/a\.md \[▉▉\] 2\/2$/mu);
});

test('lit-adhd brief: a finished start-work reads done, a stopped session idle, and neither offers its last tool', () => {
  const { repo, exec, env } = roundThree();
  const data = collectRewind({ cwd: repo, env, now: NOW, exec, sessionId: 'self0001', record: false });
  const status = Object.fromEntries(data.sessions.map((session) => [session.id8, session.status]));
  assert.deepEqual(status, { self0001: 'active', run00001: 'done', idle0001: 'idle' });
  assert.deepEqual(data.sessions.map((session) => session.id8), ['self0001', 'idle0001', 'run00001'], 'active, then idle, then done');
  assert.ok(data.startWork.some((work) => work.status === 'complete' && work.plan === 'plans/a.md'));
  const text = stripAnsi(renderRewind(data, 100));
  assert.match(text, /✓ done · run00001/u);
  assert.match(text, /◌ idle · idle0001/u);
  assert.match(text, /➤ Next: start-work finished plans\/a\.md/u);
  assert.doesNotMatch(text, /▶ Now: (edit_file|bash)/u, 'a done or idle session never offers its last tool call');
});

test('lit-adhd brief: a completed run recorded through a symlinked path still counts', () => {
  const { repo, exec, env } = roundThree();
  const alias = join(scratch(), 'alias');
  symlinkSync(repo, alias);
  const stage = join(env.XDG_STATE_HOME, 'litmuse', 'stage');
  writeFileSync(join(stage, 'run00001.json'), JSON.stringify({ version: 1, session: 'run00001', route: null, kind: 'clear', plan: 'plans/a.md', cwd: alias }));
  const data = collectRewind({ cwd: repo, env, now: NOW, exec, sessionId: 'self0001', record: false });
  assert.ok(data.startWork.some((work) => work.status === 'complete' && work.plan === 'plans/a.md'));
});

test('lit-adhd brief: three opening lines, from records only', () => {
  const { repo, exec, env } = roundThree();
  const data = collectRewind({ cwd: repo, env, now: NOW, exec, sessionId: 'self0001', record: false });
  assert.match(data.opener.done, /feat: render the brief/u);
  assert.match(data.opener.done, /plans\/a\.md \(start-work complete\)/u);
  assert.equal(data.next.kind, 'start-plan');
  assert.equal(data.opener.next, 'start plan: plans/b.md (say "go")');
  const lines = stripAnsi(renderRewind(data, 100)).split('\n');
  assert.match(lines[0], /^Done so far: feat: render the brief; plans\/a\.md \(start-work complete\)$/u);
  assert.match(lines[1], /^Doing now: /u);
  assert.match(lines[2], /^Next: start plan: plans\/b\.md \(say "go"\)$/u);
  assert.match(lines[3], /^lit-adhd: /u, 'the headline follows the opener');
});

test('lit-adhd brief: with no step for go, this worktree’s HANDOFF Next item leads, without a word to type', () => {
  const { repo, env } = fixture();
  writeFileSync(join(repo, 'HANDOFF.md'), '# Handoff\n## Next Steps\n1. Ship the brief to the family\n2. later\n');
  const data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, record: false });
  assert.equal(data.next.kind, 'none');
  assert.equal(data.handoffs[0].next, 'Ship the brief to the family');
  assert.equal(data.opener.next, 'Ship the brief to the family');
  assert.equal(data.opener.done, 'nothing finished in this window');
  assert.equal(data.opener.doing, 'nothing running');
  const text = renderRewind(data, 100);
  assert.match(text, /│ Ship the brief to the family\s+│/u);
  assert.doesNotMatch(text, /say "go"/u);
});

test('lit-adhd brief: plans are read before transcripts, and plans past the budget are counted', () => {
  const { repo, storeDir, env } = fixture();
  mkdirSync(join(repo, 'plans'));
  // Seven plans of about 1 MB each and eleven big transcripts together need more than the 8 MiB budget.
  const bigPlan = (name) => writeFileSync(join(repo, 'plans', name), Array.from({ length: 20_000 }, (_, i) => `- [ ] ${i + 1}. row ${i + 1} of ${name} with enough words to weigh`).join('\n'));
  for (let index = 0; index < 7; index += 1) bigPlan(`p${index}.md`);
  const filler = `${JSON.stringify(toolLine('bash', 2))}\n`;
  for (let index = 0; index < 11; index += 1) {
    writeLog(storeDir, `big${String(index).padStart(5, '0')}`, [routeLine(repo, 2), intentLine('big one', 2), ...Array(Math.ceil((1024 * 1024) / filler.length)).fill(filler.trim())]);
  }
  let data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, max: 50, record: false });
  assert.ok(data.budget.exhausted, 'plans and transcripts together used the budget up');
  assert.equal(data.roadmap.plans.length, 7, 'every plan was read before the transcripts');
  assert.equal(data.roadmap.plansSkipped, 0);
  bigPlan('p7.md');
  bigPlan('p8.md');
  data = collectRewind({ cwd: repo, env, now: NOW, exec: noGit, max: 50, record: false });
  assert.equal(data.roadmap.plansSkipped, 1, 'the ninth plan no longer fits');
  assert.match(renderRewind(data, 100), /1 plan was not read \(read budget used up\)\./u);
});

test('the headline takes the static rainbow on a terminal only', () => {
  const { repo, storeDir, env } = fixture();
  const exec = () => {
    throw new Error('no git');
  };
  mkdirSync(join(repo, 'plans'));
  const data = collectRewind({ cwd: repo, env, now: NOW, exec });
  assert.match(renderRewind(data, 100), /^lit-adhd: /mu);
  assert.match(renderRewind(data, 100, { color: true }), /\[/u);
  assert.match(stripAnsi(renderRewind(data, 100, { color: true })), /^lit-adhd: 0 session\(s\) · 0 waiting on you · next: No session/mu);
  assert.doesNotMatch(renderRewind(data, 100), /\[/u);
});
