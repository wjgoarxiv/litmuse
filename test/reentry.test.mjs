import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionPath } from '../plugin/hooks/lib/common.mjs';
import { detectRoute } from '../plugin/hooks/lib/routes.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-reentry-state-'));
const HOOK_ENV = { ...process.env, XDG_STATE_HOME: STATE_HOME };
const CONTINUE_CAP = 600;

function runHook(name, payload, cwd) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], {
    input: JSON.stringify(payload), cwd, encoding: 'utf8', env: HOOK_ENV,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const workspace = () => mkdtempSync(join(tmpdir(), 'litmuse-reentry-'));
const stateFile = (ws, sid) => sessionPath(ws, sid, HOOK_ENV);
const readState = (ws, sid) => JSON.parse(readFileSync(stateFile(ws, sid), 'utf8'));

let turn = 0;
function lit(ws, sid, prompt) {
  turn += 1;
  const r = runHook('user-prompt-submit', { prompt, session_id: sid, turn_id: `t${turn}`, cwd: ws }, ws);
  const ctx = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
  return { ...r, ctx, bytes: Buffer.byteLength(ctx) };
}

const isFull = (ctx, route) => /read_skill id `plugin:litmuse:/.test(ctx) && ctx.includes(`plugin:litmuse:${route}`) && ctx.includes(`LIT IGNITED · ${route}`);
const noReread = (ctx) => !/read_skill|plugin:litmuse:|SKILL/.test(ctx);

function writePlan(ws, name = 'cache.md', body = '# Plan\n- [x] 1. Done\n- [ ] 2. Wire the cache\n- [ ] 3. Docs\n') {
  mkdirSync(join(ws, 'plans'), { recursive: true });
  writeFileSync(join(ws, 'plans', name), body);
}

test('re-entry (a): five lit prompts with one discipline send the full activation once', () => {
  const ws = workspace();
  const first = lit(ws, 'a1', 'lit fix the bug');
  assert.ok(isFull(first.ctx, 'lit-loop'));
  const activatedAt = readState(ws, 'a1').activatedAt;
  for (const prompt of ['lit add a test', 'lit: tidy the readme', 'LIT write the docs', 'lit 이 함수도 고쳐 줘']) {
    const next = lit(ws, 'a1', prompt);
    assert.ok(next.bytes <= CONTINUE_CAP, `${prompt}: ${next.bytes} B`);
    assert.ok(noReread(next.ctx), `${prompt}: no skill re-read line`);
    assert.match(next.ctx, /already active/);
    assert.match(next.ctx, /lit-loop/);
  }
  assert.equal(readState(ws, 'a1').activatedAt, activatedAt, 'continue does not restart the route');
  assert.equal(readState(ws, 'a1').route, 'lit-loop');
});

test('re-entry (b): lit plan after lit-loop switches with the full lit-plan activation', () => {
  const ws = workspace();
  lit(ws, 'b1', 'lit fix the bug');
  const sw = lit(ws, 'b1', 'lit plan a cache layer');
  assert.ok(isFull(sw.ctx, 'lit-plan'));
  assert.match(sw.ctx, /planning turn/);
  assert.equal(readState(ws, 'b1').route, 'lit-plan');
  assert.equal(runHook('stop', { session_id: 'b1', turn_id: 't9', cwd: ws }, ws).code, 2, 'the plan gate is on after a switch');
});

test('re-entry (c): an approved plan with start-work state and a bare lit resumes, and writes no plan', () => {
  const ws = workspace();
  writePlan(ws);
  const started = lit(ws, 'c1', 'lit start plans/cache.md');
  assert.ok(isFull(started.ctx, 'start-work'));
  lit(ws, 'c1', 'ok, go on');
  assert.equal(readState(ws, 'c1').route, null);
  const before = readdirSync(join(ws, 'plans'));
  const resumed = lit(ws, 'c1', 'lit');
  assert.ok(resumed.bytes <= CONTINUE_CAP, `${resumed.bytes} B`);
  assert.match(resumed.ctx, /resum/i);
  assert.match(resumed.ctx, /plans\/cache\.md/);
  assert.match(resumed.ctx, /start-work/);
  assert.doesNotMatch(resumed.ctx, /lit-plan|lit-loop|no task text/);
  assert.equal(readState(ws, 'c1').route, 'start-work');
  assert.deepEqual(readdirSync(join(ws, 'plans')), before);
  assert.equal(runHook('stop', { session_id: 'c1', turn_id: 't9', cwd: ws }, ws).code, 0, 'no plan gate on a resume');

  const again = lit(ws, 'c1', 'lit continue');
  assert.ok(again.bytes <= CONTINUE_CAP);
  assert.ok(noReread(again.ctx), 'start-work is already active in this session');
  assert.match(again.ctx, /resum|continu/i);
});

test('re-entry (c): a new session finds the started plan and loads start-work once', () => {
  const ws = workspace();
  writePlan(ws);
  lit(ws, 'c2', 'lit start plans/cache.md');
  const resumed = lit(ws, 'c3', 'lit continue');
  assert.ok(resumed.bytes <= CONTINUE_CAP, `${resumed.bytes} B`);
  assert.match(resumed.ctx, /resum/i);
  assert.match(resumed.ctx, /plugin:litmuse:start-work/);
  assert.match(resumed.ctx, /plans\/cache\.md/);
  assert.equal(readState(ws, 'c3').route, 'start-work');
});

test('re-entry (c): a plan that never reached start-work is not resumed', () => {
  const ws = workspace();
  writePlan(ws);
  lit(ws, 'c4', 'lit plan the cache');
  lit(ws, 'c4', 'looks fine');
  const idle = lit(ws, 'c4', 'lit');
  assert.doesNotMatch(idle.ctx, /resuming/i);
  assert.match(idle.ctx, /no task text/);
});

test('re-entry (c): a finished plan is not resumed', () => {
  const ws = workspace();
  writePlan(ws, 'done.md', '# Plan\n- [x] 1. Done\n');
  lit(ws, 'c5', 'lit start plans/done.md');
  lit(ws, 'c5', 'thanks');
  assert.doesNotMatch(lit(ws, 'c5', 'lit').ctx, /resuming/i);
});

test('re-entry (d): lit new and lit restart start fresh with the full activation', () => {
  const ws = workspace();
  lit(ws, 'd1', 'lit fix the bug');
  const before = readState(ws, 'd1');
  const fresh = lit(ws, 'd1', 'lit new add a flag');
  assert.ok(isFull(fresh.ctx, 'lit-loop'));
  assert.ok(readState(ws, 'd1').activatedAt >= before.activatedAt);
  assert.notEqual(readState(ws, 'd1').activatedAt, before.activatedAt);
  const plan = lit(ws, 'd1', 'lit restart plan the cache');
  assert.ok(isFull(plan.ctx, 'lit-plan'));
  assert.equal(readState(ws, 'd1').stopHeldFor, null);
  const newPlan = lit(ws, 'd1', 'lit new plan again');
  assert.ok(isFull(newPlan.ctx, 'lit-plan'));
});

test('re-entry (e): a bare idle lit asks what to run, a lit with a task does not', () => {
  const ws = workspace();
  const bare = lit(ws, 'e1', 'lit');
  assert.match(bare.ctx, /no task text/);
  assert.match(bare.ctx, /ask the user/i);
  const withTask = lit(workspace(), 'e2', 'lit fix X');
  assert.doesNotMatch(withTask.ctx, /no task text|ask the user/i);
  const named = lit(workspace(), 'e3', 'lit loop');
  assert.doesNotMatch(named.ctx, /no task text/, 'naming a discipline is not a bare lit');
});

test('re-entry (e): a bare lit while a route is active continues it without a question', () => {
  const ws = workspace();
  lit(ws, 'e4', 'lit plan a cache');
  const next = lit(ws, 'e4', 'lit');
  assert.ok(next.bytes <= CONTINUE_CAP);
  assert.match(next.ctx, /lit-plan/);
  assert.doesNotMatch(next.ctx, /no task text/);
  assert.equal(readState(ws, 'e4').route, 'lit-plan');
});

test('re-entry (f): a different session id starts fresh', () => {
  const ws = workspace();
  lit(ws, 'f1', 'lit fix the bug');
  assert.ok(isFull(lit(ws, 'f2', 'lit fix the bug').ctx, 'lit-loop'));
  assert.equal(readState(ws, 'f1').route, 'lit-loop');
});

test('re-entry (g): corrupt, missing or foreign-shaped state falls back to the full activation', () => {
  const ws = workspace();
  lit(ws, 'g1', 'lit fix the bug');
  writeFileSync(stateFile(ws, 'g1'), 'not json');
  const fromCorrupt = lit(ws, 'g1', 'lit fix again');
  assert.ok(isFull(fromCorrupt.ctx, 'lit-loop'));
  assert.equal(readState(ws, 'g1').route, 'lit-loop', 'the state is rewritten as the real route');

  writeFileSync(stateFile(ws, 'g1'), '["route"]');
  assert.ok(isFull(lit(ws, 'g1', 'lit again').ctx, 'lit-loop'));

  writeFileSync(stateFile(ws, 'g1'), JSON.stringify({ route: 'lit-loop', activatedAt: 'yesterday' }));
  assert.ok(isFull(lit(ws, 'g1', 'lit again').ctx, 'lit-loop'));

  const journalOnly = workspace();
  lit(journalOnly, 'g2', 'lit fix the bug');
  writeFileSync(stateFile(journalOnly, 'g2'), '');
  const fromEmpty = lit(journalOnly, 'g2', 'lit fix again');
  assert.ok(isFull(fromEmpty.ctx, 'lit-loop'));
});

test('re-entry (g): a missing session id never blocks and always sends the full activation', () => {
  const ws = workspace();
  const one = runHook('user-prompt-submit', { prompt: 'lit fix the bug', cwd: ws }, ws);
  const two = runHook('user-prompt-submit', { prompt: 'lit fix the bug', cwd: ws }, ws);
  for (const r of [one, two]) {
    assert.equal(r.code, 0);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /read_skill/);
  }
});

// Defect: user-prompt-submit.mjs overwrote activatedAt and stopHeldFor on every lit, so the lit-plan gate restarted.
test('lit-plan continue keeps activatedAt and stopHeldFor, so a plan already written still ends the turn', () => {
  const ws = workspace();
  lit(ws, 'p1', 'lit plan a tiny todo app');
  const first = readState(ws, 'p1');
  assert.equal(runHook('stop', { session_id: 'p1', turn_id: 't1', cwd: ws }, ws).code, 2);
  assert.equal(readState(ws, 'p1').stopHeldFor, 't1');
  writePlan(ws, 'todo.md', '# Plan\n- [ ] 1. Do it\n');
  const future = new Date(Date.now() + 1000);
  utimesSync(join(ws, 'plans', 'todo.md'), future, future);
  const next = lit(ws, 'p1', 'lit plan add a delete row');
  assert.ok(next.bytes <= CONTINUE_CAP);
  const kept = readState(ws, 'p1');
  assert.equal(kept.activatedAt, first.activatedAt);
  assert.equal(kept.stopHeldFor, 't1');
  assert.equal(kept.route, 'lit-plan');
  assert.equal(runHook('stop', { session_id: 'p1', turn_id: 't2', cwd: ws }, ws).code, 0, 'the earlier plan satisfies the gate');
});

test('lit-plan continue keeps the write limit on', () => {
  const ws = workspace();
  lit(ws, 'p2', 'lit plan auth');
  lit(ws, 'p2', 'lit plan auth, second pass');
  const pre = (tool, input) => runHook('pre-tool-use', { tool_name: tool, tool_input: input, session_id: 'p2', cwd: ws }, ws).code;
  assert.equal(pre('write_file', { path: 'src/app.js', content: 'x' }), 2);
  assert.equal(pre('write_file', { path: 'plans/auth.md', content: '# Plan\n' }), 0);
});

test('lit-plan continue still states the planning limit in its short note', () => {
  const ws = workspace();
  lit(ws, 'p3', 'lit plan auth');
  const next = lit(ws, 'p3', 'lit plan more');
  assert.match(next.ctx, /plans\//);
  assert.ok(next.bytes <= CONTINUE_CAP);
});

test('an ordinary prompt still clears the route and the next lit is a full activation', () => {
  const ws = workspace();
  lit(ws, 'p4', 'lit plan auth');
  assert.equal(lit(ws, 'p4', 'thanks').stdout, '');
  assert.equal(readState(ws, 'p4').route, null);
  assert.ok(isFull(lit(ws, 'p4', 'lit plan auth').ctx, 'lit-plan'));
});

// routes.mjs: the intent flags the hook reads.
test('detectRoute reports bare, continue and restart intent', () => {
  assert.deepEqual(
    ['lit', 'LIT', '/lit', 'lit continue', 'lit resume', 'lit:'].map((p) => detectRoute(p)?.bare),
    [true, true, true, true, true, true],
  );
  for (const p of ['lit fix X', 'lit loop', 'lit plan', 'litwork', 'lit new', 'lit new fix X']) assert.notEqual(detectRoute(p)?.bare, true, p);
  const fresh = detectRoute('lit new fix X');
  assert.equal(fresh.restart, true);
  assert.equal(fresh.route, 'lit-loop');
  assert.equal(detectRoute('lit restart plan the cache').route, 'lit-plan');
  assert.equal(detectRoute('lit restart plan the cache').restart, true);
  assert.equal(detectRoute('lit fix the newest bug').restart, false);
  assert.equal(detectRoute('lit newsletter copy').restart, false);
  assert.equal(detectRoute('lit plan x').restart, false);
});

test('re-entry (c): a plan whose only open rows are F1-F4 is still resumable', () => {
  const ws = workspace();
  writePlan(ws, 'fonly.md', '# Plan\n- [x] 1. Done\n- [ ] F1. Plan compliance\n');
  lit(ws, 'c6', 'lit start plans/fonly.md');
  lit(ws, 'c6', 'thanks');
  const resumed = lit(ws, 'c6', 'lit');
  assert.match(resumed.ctx, /resum/i);
  assert.match(resumed.ctx, /plans\/fonly\.md/);
  assert.match(resumed.ctx, /row F1/);
});

const APPROVED = '# Plan\nStatus: approved\n- [x] 1. Done\n- [ ] 2. Wire the cache\n';
const DRAFT = '# Plan\nStatus: awaiting approval\n- [ ] 1. Sketch\n';

test('re-entry (c): a newer unapproved draft is not resumed in place of the started plan', () => {
  const ws = workspace();
  writePlan(ws, 'cache.md', APPROVED);
  lit(ws, 'c7', 'lit start plans/cache.md');
  lit(ws, 'c7', 'thanks');
  writePlan(ws, 'later.md', DRAFT);
  const future = new Date(Date.now() + 5000);
  utimesSync(join(ws, 'plans', 'later.md'), future, future);
  const resumed = lit(ws, 'c8', 'lit');
  assert.match(resumed.ctx, /plans\/cache\.md/);
  assert.doesNotMatch(resumed.ctx, /later\.md/);
});

test('re-entry (c): only an unapproved draft means nothing is active', () => {
  const ws = workspace();
  writePlan(ws, 'cache.md', '# Plan\nStatus: assumptions unconfirmed\n- [ ] 1. Wire the cache\n');
  lit(ws, 'c9', 'lit start plans/cache.md');
  lit(ws, 'c9', 'thanks');
  const idle = lit(ws, 'c9', 'lit');
  assert.doesNotMatch(idle.ctx, /resuming/i);
  assert.match(idle.ctx, /no task text/);
});

test('re-entry (c): start-work honours the plan it names, every time, in full', () => {
  const ws = workspace();
  writePlan(ws, 'a.md', APPROVED);
  writePlan(ws, 'b.md', APPROVED);
  const future = new Date(Date.now() + 5000);
  utimesSync(join(ws, 'plans', 'b.md'), future, future);
  assert.ok(isFull(lit(ws, 'c10', 'lit start plans/a.md').ctx, 'start-work'));
  const again = lit(ws, 'c10', 'lit start plans/a.md');
  assert.ok(isFull(again.ctx, 'start-work'), 'a repeated start-work carries the write grant again');
  assert.doesNotMatch(again.ctx, /b\.md/);
  const other = lit(ws, 'c10', 'lit start plans/b.md');
  assert.ok(isFull(other.ctx, 'start-work'));
  assert.doesNotMatch(other.ctx, /plans\/a\.md/);
  assert.equal(readState(ws, 'c10').route, 'start-work');
});

test('re-entry (c): a bare lit while start-work is active still resumes without a re-read', () => {
  const ws = workspace();
  writePlan(ws, 'a.md', APPROVED);
  lit(ws, 'c11', 'lit start plans/a.md');
  const next = lit(ws, 'c11', 'lit');
  assert.ok(next.bytes <= CONTINUE_CAP);
  assert.ok(noReread(next.ctx));
  assert.match(next.ctx, /plans\/a\.md/);
});
