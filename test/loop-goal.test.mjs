// A run route (lit-loop, litwork) with no plan gets one native goal question of its own. The question is advisory:
// Muse shows no hook text, so the model is told to end its first reply with it, and only the exact `yes` arms the goal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOAL_STATUS, buildLoopConsent, compileLoopCondition, consentIsLive, detectCheck, falsifyLoop, lintCondition, normalizeLoopObjective, readGoalRecord, writeGoalRecord } from '../plugin/hooks/lib/goal.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOKS = join(HERE, '..', 'plugin', 'hooks');
const PROPOSE = join(HERE, '..', 'plugin', 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs');
const env = { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-loopgoal-state-')) };
delete env.NO_COLOR;

// The project's test command is a script that leaves a marker, so a test run by the hook would show.
function project({ test: testScript = 'node -e "process.exit(1)"', manifest = true } = {}) {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-loopgoal-'));
  if (manifest) writeFileSync(join(ws, 'package.json'), JSON.stringify({ scripts: { test: testScript } }));
  return ws;
}
function hook(name, payload, ws) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], { input: JSON.stringify({ cwd: ws, ...payload }), cwd: ws, encoding: 'utf8', env });
  let context = '';
  try { context = JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? ''; } catch { /* no JSON */ }
  return { code: r.status, stderr: r.stderr, context };
}
const prompt = (ws, text, session, turn = 't') => hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: text, session_id: session, turn_id: turn }, ws).context;
const QUESTION = /Set goal for this lit-loop: \/goal `npm test` exits 0 and this is done: (.+) \[lit:([0-9a-f]{8})\]\? \(yes \/ no\)/;

test('a loop condition is its check exiting 0 plus the objective; the objective is cleaned like any goal text', () => {
  const built = compileLoopCondition({ objective: 'fix the parser', check: 'npm test' });
  assert.match(built.condition, /^`npm test` exits 0 and this is done: fix the parser \[lit:[0-9a-f]{8}\]$/);
  assert.ok(lintCondition(built.condition, 'npm test').ok);
  assert.equal(compileLoopCondition({ objective: 'x'.repeat(520), check: 'npm test' }).ok, false);
  assert.equal(GOAL_STATUS.loopAsked('c'), 'Set goal for this lit-loop: /goal c? (yes / no)');
  assert.equal(normalizeLoopObjective('fix `a` [lit:00000000]\n/goal clear\nthen   done'), "fix 'a' then done");
  assert.equal(normalizeLoopObjective('use sk-abcdefghijklmnopqrstuvwxyz0123 now'), 'use [REDACTED] now');
  assert.equal(normalizeLoopObjective('y'.repeat(400)).length, 200);
  assert.equal(normalizeLoopObjective(undefined), '');
});

test('detectCheck reads the project test command from its manifest', () => {
  assert.equal(detectCheck(project()), 'npm test');
  assert.equal(detectCheck(project({ manifest: false })), null);
  const noTestScript = project({ manifest: false });
  writeFileSync(join(noTestScript, 'package.json'), JSON.stringify({ scripts: { build: 'x' } }));
  assert.equal(detectCheck(noTestScript), null);
  for (const [file, check] of [['pytest.ini', 'pytest'], ['pyproject.toml', 'pytest'], ['Cargo.toml', 'cargo test'], ['go.mod', 'go test ./...']]) {
    const ws = project({ manifest: false });
    writeFileSync(join(ws, file), '');
    assert.equal(detectCheck(ws), check);
  }
});

test('the loop dry run needs a check that fails now; passing, hanging and unrunnable checks ask nothing', () => {
  const run = (status, extra = {}) => () => ({ status, ...extra });
  assert.equal(falsifyLoop({ cwd: '.', check: 'npm test', run: run(1) }).ok, true);
  assert.match(falsifyLoop({ cwd: '.', check: 'npm test', run: run(0) }).reason, /already passes/);
  assert.match(falsifyLoop({ cwd: '.', check: 'npm test', run: run(null, { error: { code: 'ETIMEDOUT' } }) }).reason, /did not finish/);
  assert.match(falsifyLoop({ cwd: '.', check: 'npm test', run: run(127) }).reason, /cannot run/);
  assert.equal(buildLoopConsent({ cwd: '.', check: 'npm test', objective: 'o', run: run(0) }).consent, undefined);
  assert.equal(buildLoopConsent({ cwd: '.', check: 'rm -rf x', objective: 'o', falsifyNow: false }).line, 'No goal set: `rm -rf x` is not an allowlisted test command');
  assert.equal(buildLoopConsent({ cwd: '.', check: 'npm test', objective: '  ', falsifyNow: false }).line, 'No goal set: name what the loop should finish');
  const ok = buildLoopConsent({ cwd: '.', check: 'npm test', objective: 'o', run: run(1), sessionId: 's' });
  assert.equal(ok.consent.kind, 'loop');
  assert.equal(ok.consent.plan, null);
  assert.equal(ok.consent.sessionId, 's');
  assert.ok(consentIsLive(ok.consent));
});

test('goal-propose --loop dry-runs the check: a failing one records the question, a passing or unlisted one records nothing', () => {
  const ws = project();
  mkdirSync(join(ws, 'scripts'));
  writeFileSync(join(ws, 'scripts', 'red.mjs'), 'process.exit(1);\n');
  writeFileSync(join(ws, 'scripts', 'green.mjs'), 'process.exit(0);\n');
  const cli = (...args) => spawnSync(process.execPath, [PROPOSE, ...args], { cwd: ws, encoding: 'utf8', env });
  const red = cli('--loop', '--check', 'node scripts/red.mjs', 'make', 'the', 'export', 'work');
  assert.match(red.stdout, /^Set goal for this lit-loop: \/goal `node scripts\/red\.mjs` exits 0 and this is done: make the export work \[lit:[0-9a-f]{8}\]\? \(yes \/ no\)\n\n> \*\*▶ Answer: set goal for this lit-loop\*\*\n/);
  assert.equal(readGoalRecord(ws, 'consent').kind, 'loop');
  const ws2 = project();
  mkdirSync(join(ws2, 'scripts'));
  writeFileSync(join(ws2, 'scripts', 'green.mjs'), 'process.exit(0);\n');
  const cli2 = (...args) => spawnSync(process.execPath, [PROPOSE, ...args], { cwd: ws2, encoding: 'utf8', env });
  assert.match(cli2('--loop', '--check', 'node scripts/green.mjs', 'obj').stdout, /^No goal set: `node scripts\/green\.mjs` already passes/);
  assert.match(cli2('--loop', '--check', 'rm -rf x', 'obj').stdout, /^No goal set: `rm -rf x` is not an allowlisted test command\n$/);
  assert.equal(existsSync(join(ws2, '.litmuse', 'goal', 'consent.json')), false, 'a refusal records nothing');
});

test('the first lit-loop or litwork activation with an objective and a test command records one question and tells the model to end its reply with it', () => {
  const marker = join(tmpdir(), `litmuse-loopgoal-ran-${process.pid}`);
  const ws = project({ test: `node -e "require('fs').writeFileSync('${marker}','x');process.exit(1)"` });
  const ctx = prompt(ws, 'lit loop fix the parser', 'L1');
  const match = QUESTION.exec(ctx);
  assert.ok(match, ctx);
  assert.equal(match[1], 'fix the parser');
  assert.match(ctx, /LIT IGNITED · lit-loop/);
  assert.match(ctx, /End your first reply with exactly this line, asked once, and under it this answer guide as Markdown[^\n]*:\nSet goal for this lit-loop/);
  assert.match(ctx, /Never type or send \/goal yourself\. Do not call create_goal for this run before the user's exact `yes`/);
  const consent = readGoalRecord(ws, 'consent');
  assert.equal(consent.kind, 'loop');
  assert.equal(consent.plan, null);
  assert.equal(consent.sessionId, 'L1');
  assert.equal(consent.check, 'npm test');
  assert.equal(consent.condition, `\`npm test\` exits 0 and this is done: fix the parser [lit:${match[2]}]`);
  assert.equal(existsSync(marker), false, 'the hook ran no test');
  const work = project();
  assert.match(prompt(work, 'lit work add a --json flag', 'L2'), QUESTION);
  assert.match(prompt(project(), 'lit tidy the readme and fix the bug', 'L3'), /LIT IGNITED · lit-loop[\s\S]*Set goal for this lit-loop/, 'a plain `lit <task>` runs lit-loop');
});

test('no question for a repeat, litgoal, a plan, a bare lit, or a goal already open or pending', () => {
  const ws = project();
  assert.match(prompt(ws, 'lit loop first', 'R1'), QUESTION);
  assert.doesNotMatch(prompt(ws, 'lit loop again', 'R1'), /Set goal for this lit-loop|Native goal/, 'a repeat is a continuation');
  for (const text of ['lit goal ship it', 'lit plan the flag', 'lit', 'lit continue', 'LIT', 'lit resume']) {
    const other = project();
    const ctx = prompt(other, text, 'R2');
    assert.doesNotMatch(ctx, /Native goal|Set goal for this lit-loop/, text);
    assert.equal(readGoalRecord(other, 'consent'), null, text);
  }
  const owned = project();
  writeGoalRecord(owned, 'owner', { condition: 'c [lit:0123abcd]', id: '0123abcd', plan: null, check: 'npm test', sessionId: 'R3', closed: null });
  assert.doesNotMatch(prompt(owned, 'lit loop fix it', 'R3'), /Native goal/, 'this session already owns a goal');
  assert.match(prompt(owned, 'lit loop fix it', 'R4'), QUESTION, 'a goal another session owns is not this session\'s');
  const closed = project();
  writeGoalRecord(closed, 'owner', { condition: 'c [lit:0123abcd]', id: '0123abcd', plan: null, check: 'npm test', sessionId: 'R5', closed: { status: 'complete', at: 'x' } });
  assert.match(prompt(closed, 'lit loop and more', 'R5'), QUESTION, 'a closed goal frees the session');
  const pending = project();
  const planned = buildLoopConsent({ cwd: pending, check: 'npm test', objective: 'earlier', falsifyNow: false, sessionId: 'someone' });
  writeGoalRecord(pending, 'consent', planned.consent);
  assert.doesNotMatch(prompt(pending, 'lit loop fix it', 'R6'), /Native goal/, 'a pending question is never replaced');
  assert.equal(readGoalRecord(pending, 'consent').objective, 'earlier');
});

// The direct skill words at the start carry their task to the goal question, like `lit loop <task>` does.
test('a leading lit-loop or litwork asks the goal question with the words after it', () => {
  for (const [text, objective, route] of [
    ['lit-loop fix the parser', 'fix the parser', 'lit-loop'],
    ['lit-loop: 로그인 버튼 고쳐줘', '로그인 버튼 고쳐줘', 'lit-loop'],
    ['LIT-LOOP fix the parser', 'fix the parser', 'lit-loop'],
    ['litwork add a --json flag', 'add a --json flag', 'litwork'],
  ]) {
    const ws = project();
    const ctx = prompt(ws, text, 'D1');
    assert.match(ctx, new RegExp(`LIT IGNITED · ${route}`), text);
    const match = QUESTION.exec(ctx);
    assert.ok(match, `${text}\n${ctx}`);
    assert.equal(match[1], objective, text);
  }
  for (const text of ['lit-loop', 'litwork']) assert.doesNotMatch(prompt(project(), text, 'D2'), /Native goal/, text);
});

// A request that ends with the activation word asks the goal question with the words before it, as a leading one does.
test('a request that ends with lit, lit-loop or litwork asks the goal question with the words before it', () => {
  for (const [text, objective, route] of [
    ['fix the login button lit', 'fix the login button', 'lit-loop'],
    ['로그인 버튼 고쳐줘 lit', '로그인 버튼 고쳐줘', 'lit-loop'],
    ['로그인 버튼 고쳐줘. 부탁해 lit', '로그인 버튼 고쳐줘. 부탁해', 'lit-loop'],
    ['로그인 버튼 고쳐줘 lit-loop', '로그인 버튼 고쳐줘', 'lit-loop'],
    ['add a --json flag litwork', 'add a --json flag', 'litwork'],
  ]) {
    const ws = project();
    const ctx = prompt(ws, text, 'T1');
    assert.match(ctx, new RegExp(`LIT IGNITED · ${route}`), text);
    const match = QUESTION.exec(ctx);
    assert.ok(match, `${text}\n${ctx}`);
    assert.equal(match[1], objective, text);
    assert.equal(readGoalRecord(ws, 'consent').objective, objective, text);
  }
});

test('without a test command the model is pointed at goal-propose --loop after its RED check, and nothing is recorded', () => {
  const ws = project({ manifest: false });
  const ctx = prompt(ws, 'lit loop fix the parser', 'F1');
  assert.ok(ctx.includes(`node ${PROPOSE} --loop --check "<check>" <objective>`), ctx);
  assert.match(ctx, /after the RED test/);
  assert.match(ctx, /No goal set: <reason>/);
  assert.match(ctx, /Never type or send \/goal yourself/);
  assert.doesNotMatch(ctx, /Set goal for this lit-loop/);
  assert.equal(readGoalRecord(ws, 'consent'), null);
});

test('an exact yes arms the goal and starts no start-work; create_goal then makes LitMuse the owner and update_goal closes it', () => {
  const ws = project();
  const [, , id] = QUESTION.exec(prompt(ws, 'lit loop fix the parser', 'Y1'));
  const condition = `\`npm test\` exits 0 and this is done: fix the parser [lit:${id}]`;
  const answered = prompt(ws, ' YES ', 'Y1', 't2');
  assert.doesNotMatch(answered, /LIT IGNITED/);
  assert.match(answered, /LIT CONTINUES · lit-loop/);
  assert.ok(answered.includes(`call create_goal with objective exactly \`${condition}\``), answered);
  assert.ok(answered.includes('When `npm test` exits 0 and the objective is done, call update_goal with status complete'));
  const intent = readGoalRecord(ws, 'intent');
  assert.equal(intent.condition, condition);
  assert.equal(intent.plan, null);
  assert.equal(readGoalRecord(ws, 'consent'), null, 'the question is spent');
  assert.equal(prompt(ws, 'yes', 'Y1', 't3').includes('create_goal'), false, 'a second yes is ordinary text');
  const create = (objective) => hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'Y1', tool_name: 'create_goal', tool_input: { objective } }, ws).code;
  assert.equal(create(condition), 0);
  assert.equal(create(`\`npm test\` exits 0 and this is done: other thing [lit:${id}]`), 2, 'a changed objective is refused');
  const set = hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'Y1', tool_name: 'create_goal', tool_input: { objective: condition } }, ws);
  assert.match(set.context, /LitMuse goal set \[lit:[0-9a-f]{8}\]/);
  const owner = readGoalRecord(ws, 'owner');
  assert.equal(owner.sessionId, 'Y1');
  assert.equal(owner.plan, null);
  assert.equal(owner.check, 'npm test');
  assert.equal(hook('stop', { hook_event_name: 'Stop', session_id: 'Y1', turn_id: 't4' }, ws).stderr.includes('goal check'), false, 'a loop goal has no rows for the Stop hook to read');
  hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'Y1', tool_name: 'update_goal', tool_input: { status: 'complete' } }, ws);
  assert.equal(readGoalRecord(ws, 'owner').closed.status, 'complete');
});

test('no, edit and any other prompt arm nothing; the question is for the asking session and lives for one prompt', () => {
  const ask = (session) => {
    const ws = project();
    prompt(ws, 'lit loop fix the parser', session);
    return ws;
  };
  const no = ask('N1');
  assert.ok(prompt(no, 'no', 'N1', 't2').includes('No goal set: you said no'));
  assert.equal(readGoalRecord(no, 'intent'), null);
  assert.equal(readGoalRecord(no, 'consent'), null);
  const edit = ask('N2');
  assert.doesNotMatch(prompt(edit, 'edit', 'N2', 't2'), /goal/i, 'edit is not an answer');
  assert.equal(readGoalRecord(edit, 'consent'), null, 'it dropped the question');
  assert.equal(prompt(edit, 'yes', 'N2', 't3').includes('create_goal'), false);
  const other = ask('N3');
  prompt(other, 'what does the parser do?', 'N3', 't2');
  assert.equal(readGoalRecord(other, 'consent'), null);
  assert.equal(prompt(other, 'yes', 'N3', 't3').includes('create_goal'), false, 'a later yes answers nothing');
  assert.equal(readGoalRecord(other, 'intent'), null);
  const elsewhere = ask('N4');
  assert.equal(prompt(elsewhere, 'yes', 'someone-else', 't2').includes('create_goal'), false);
  assert.ok(consentIsLive(readGoalRecord(elsewhere, 'consent')), 'another session leaves the question as it was');
  assert.equal(readGoalRecord(elsewhere, 'intent'), null);
  assert.ok(prompt(elsewhere, 'yes', 'N4', 't3').includes('create_goal'), 'the asking session still can');
  const stale = ask('N5');
  writeGoalRecord(stale, 'consent', { ...readGoalRecord(stale, 'consent'), askedAt: new Date(Date.now() - 31 * 60_000).toISOString() });
  assert.equal(prompt(stale, 'yes', 'N5', 't2').includes('create_goal'), false, 'a question past 30 minutes is dead');
  assert.equal(readGoalRecord(stale, 'intent'), null);
});

test('the model-run fallback: PostToolUse stamps the asking session on the question, and that session\'s yes arms it', () => {
  const ws = project({ manifest: false });
  mkdirSync(join(ws, 'scripts'));
  writeFileSync(join(ws, 'scripts', 'red.mjs'), 'process.exit(1);\n');
  prompt(ws, 'lit loop fix the parser', 'P1');
  const command = `node ${PROPOSE} --loop --check "node scripts/red.mjs" fix the parser`;
  const printed = spawnSync('sh', ['-c', command], { cwd: ws, encoding: 'utf8', env }).stdout;
  assert.match(printed, /^Set goal for this lit-loop: \/goal `node scripts\/red\.mjs` exits 0 and this is done: fix the parser \[lit:[0-9a-f]{8}\]\? \(yes \/ no\)\n\n> \*\*▶ Answer: set goal for this lit-loop\*\*\n/);
  assert.equal(readGoalRecord(ws, 'consent').sessionId, null);
  assert.equal(hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'P1', tool_name: 'bash', tool_input: { command } }, ws).code, 0);
  assert.equal(readGoalRecord(ws, 'consent').sessionId, 'P1');
  assert.equal(prompt(ws, 'yes', 'someone-else', 't2').includes('create_goal'), false);
  const answered = prompt(ws, 'yes', 'P1', 't3');
  assert.match(answered, /call create_goal with objective exactly ``node scripts\/red\.mjs` exits 0 and this is done: fix the parser/);
  assert.equal(readGoalRecord(ws, 'intent').check, 'node scripts/red.mjs');
});

test('the plan-approval question is unchanged: a plan consent still starts start-work on yes', () => {
  const ws = project();
  mkdirSync(join(ws, 'plans'));
  writeFileSync(join(ws, 'plans', 'flag.md'), '# Flag\n\n## Done when\n\n- check: `npm test`\n\n## Tasks\n\n- [ ] 1. Add the flag\n');
  const asked = spawnSync(process.execPath, [PROPOSE, 'plans/flag.md'], { cwd: ws, encoding: 'utf8', env });
  assert.match(asked.stdout, /^Approve plan, start work and set goal: /);
  writeGoalRecord(ws, 'consent', { ...readGoalRecord(ws, 'consent'), sessionId: 'Q1' });
  assert.match(prompt(ws, 'yes', 'Q1'), /LIT IGNITED · start-work/);
  assert.equal(readGoalRecord(ws, 'intent').plan, 'plans/flag.md');
});

test('a goal that was met and closed in the same session does not block the next loop\'s question', () => {
  const ws = project();
  const [, , id] = QUESTION.exec(prompt(ws, 'lit loop fix the parser', 'M1'));
  const condition = `\`npm test\` exits 0 and this is done: fix the parser [lit:${id}]`;
  prompt(ws, 'yes', 'M1', 't2');
  hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'M1', tool_name: 'create_goal', tool_input: { objective: condition } }, ws);
  assert.equal(readGoalRecord(ws, 'owner').closed, null);
  assert.doesNotMatch(prompt(ws, 'lit new loop while it is open', 'M1', 't3'), /Native goal/, 'an open goal of this session still blocks');
  hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'M1', tool_name: 'update_goal', tool_input: { status: 'complete' } }, ws);
  assert.equal(readGoalRecord(ws, 'owner').closed.status, 'complete');
  const next = QUESTION.exec(prompt(ws, 'lit new loop fix the printer', 'M1', 't4'));
  assert.ok(next, 'the met goal frees the same session for a new run');
  assert.equal(next[1], 'fix the printer');
  assert.equal(readGoalRecord(ws, 'consent').sessionId, 'M1');
  assert.ok(prompt(ws, 'yes', 'M1', 't5').includes('call create_goal'), 'and its yes arms the second goal');
});
