import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionPath } from '../plugin/hooks/lib/common.mjs';
import { nextStepPath } from '../plugin/lib/rewind/next-step.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-stop-state-'));
const ENV = { ...process.env, XDG_STATE_HOME: STATE_HOME };
delete ENV.LITMUSE_GOAL_HOLD;

function hook(name, payload, cwd, env = ENV) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], { input: JSON.stringify(payload), cwd, encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const workspace = () => mkdtempSync(join(tmpdir(), 'litmuse-stop-'));
let n = 0;
const stop = (ws, sid, extra = {}) => { n += 1; return hook('stop', { session_id: sid, turn_id: `t${n}`, cwd: ws, ...extra }, ws); };
const prompt = (ws, sid, text) => { n += 1; return hook('user-prompt-submit', { prompt: text, session_id: sid, turn_id: `p${n}`, cwd: ws }, ws); };

const PLAN = (status, rows) => `# Plan\n\nStatus: ${status}\n\n${rows}\n`;
const OPEN = '- [x] 1. Scaffold\n- [ ] 2. Wire the cache\n- [ ] 3. Docs\n- [ ] F1. Plan compliance\n';
function plan(ws, body, name = 'cache.md') {
  mkdirSync(join(ws, 'plans'), { recursive: true });
  writeFileSync(join(ws, 'plans', name), body);
}
function startWork(ws, sid) {
  plan(ws, PLAN('approved', OPEN));
  prompt(ws, sid, 'lit start plans/cache.md');
}

test('start-work: open rows hold the Stop and name the next row', () => {
  const ws = workspace();
  startWork(ws, 'w1');
  const r = stop(ws, 'w1');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /start-work/);
  assert.match(r.stderr, /plans\/cache\.md/);
  assert.match(r.stderr, /3 open rows/);
  assert.match(r.stderr, /row 2/);
});

test('start-work: only F rows open still holds, naming F1', () => {
  const ws = workspace();
  plan(ws, PLAN('approved', '- [x] 1. Done\n- [ ] F1. Plan compliance\n- [ ] F2. Quality\n'));
  prompt(ws, 'w2', 'lit start plans/cache.md');
  const r = stop(ws, 'w2');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /row F1/);
});

test('start-work: releases after 3 holds without a ticked row, and says so in the ledger', () => {
  const ws = workspace();
  startWork(ws, 'w3');
  for (let i = 0; i < 3; i += 1) assert.equal(stop(ws, 'w3').code, 2, `hold ${i + 1}`);
  assert.equal(stop(ws, 'w3').code, 0, 'fourth stop ends the turn');
  const ledger = readFileSync(join(ws, '.litmuse', 'ledger', 'w3.jsonl'), 'utf8');
  assert.match(ledger, /hold released/);
  assert.equal(stop(ws, 'w3').code, 0, 'stays released');
});

test('start-work: a ticked row resets the hold counter', () => {
  const ws = workspace();
  startWork(ws, 'w4');
  stop(ws, 'w4'); stop(ws, 'w4'); stop(ws, 'w4');
  plan(ws, PLAN('approved', '- [x] 1. Scaffold\n- [x] 2. Wire the cache\n- [ ] 3. Docs\n- [ ] F1. Plan compliance\n'));
  const r = stop(ws, 'w4');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /2 open rows/);
});

test('start-work: no hold on an unapproved plan', () => {
  for (const status of ['awaiting approval', 'assumptions unconfirmed']) {
    const ws = workspace();
    plan(ws, PLAN(status, OPEN));
    prompt(ws, 'w5', 'lit start plans/cache.md');
    assert.equal(stop(ws, 'w5').code, 0, status);
  }
});

test('start-work: no hold when every row is ticked', () => {
  const ws = workspace();
  plan(ws, PLAN('approved', '- [x] 1. Done\n- [x] F1. Plan compliance\n'));
  prompt(ws, 'w6', 'lit start plans/cache.md');
  assert.equal(stop(ws, 'w6').code, 0);
});

test('start-work: a BLOCKED/PAUSED/CANCELLED ledger note releases the Stop', () => {
  const ws = workspace();
  startWork(ws, 'w7');
  mkdirSync(join(ws, '.litmuse', 'ledger'), { recursive: true });
  writeFileSync(join(ws, '.litmuse', 'ledger', 'w7.jsonl'), `${JSON.stringify({ kind: 'note', text: 'PAUSED at row 2: needs approval to install pytest' })}\n`);
  assert.equal(stop(ws, 'w7').code, 0);
});

test('start-work: a pause word in the last prompt releases the Stop', () => {
  const ws = workspace();
  startWork(ws, 'w8');
  assert.equal(stop(ws, 'w8', { prompt: '잠깐 멈춰, stop' }).code, 0);
});

test('non-work routes are never held on open plan rows', () => {
  const ws = workspace();
  plan(ws, PLAN('approved', OPEN));
  prompt(ws, 'n1', 'lit review');
  assert.equal(stop(ws, 'n1').code, 0);
  prompt(ws, 'n2', 'thanks');
  assert.equal(stop(ws, 'n2').code, 0);
});

test('fail-open on an unreadable plan', () => {
  const ws = workspace();
  startWork(ws, 'x1');
  mkdirSync(join(ws, 'plans', 'dir.md'));
  writeFileSync(join(ws, 'plans', 'cache.md'), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  assert.equal(stop(ws, 'x1').code, 0);
});

function goal(ws, slug, body) {
  mkdirSync(join(ws, '.litmuse', 'goals'), { recursive: true });
  writeFileSync(join(ws, '.litmuse', 'goals', `${slug}.json`), typeof body === 'string' ? body : JSON.stringify(body));
}
const GOAL = (sid, extra = {}) => ({
  objective: 'ship it', status: 'active', session_id: sid, updated: '2026-10-20T09:00:00Z',
  criteria: [{ id: 'c1', text: 'tests pass', status: 'pass' }, { id: 'c2', text: 'cli prints help', status: 'open' }],
  ...extra,
});

test('litgoal: an open criterion holds a lit-loop turn once per turn', () => {
  const ws = workspace();
  prompt(ws, 'g1', 'lit fix the bug');
  goal(ws, 'ship', GOAL('g1'));
  const first = hook('stop', { session_id: 'g1', turn_id: 'tg', cwd: ws }, ws);
  assert.equal(first.code, 2);
  assert.match(first.stderr, /\.litmuse\/goals\/ship\.json/);
  assert.match(first.stderr, /1\/2/);
  assert.match(first.stderr, /c2/);
  assert.match(first.stderr, /cli prints help/);
  assert.equal(hook('stop', { session_id: 'g1', turn_id: 'tg', cwd: ws }, ws).code, 0, 'once per turn');
  assert.equal(hook('stop', { session_id: 'g1', turn_id: 'tg2', cwd: ws }, ws).code, 2, 'next turn holds again');
});

test('litgoal: bounded by 3 holds while updated is unchanged', () => {
  const ws = workspace();
  prompt(ws, 'g2', 'lit fix the bug');
  goal(ws, 'ship', GOAL('g2'));
  for (let i = 0; i < 3; i += 1) assert.equal(stop(ws, 'g2').code, 2);
  assert.equal(stop(ws, 'g2').code, 0);
});

test('litgoal: no hold for done goals, other sessions, hold:false, the kill switch or all-pass criteria', () => {
  const ws = workspace();
  prompt(ws, 'g3', 'lit fix the bug');
  for (const body of [GOAL('g3', { status: 'done' }), GOAL('other'), GOAL('g3', { hold: false }),
    GOAL('g3', { criteria: [{ id: 'c1', text: 'a', status: 'pass' }] })]) {
    goal(ws, 'ship', body);
    assert.equal(stop(ws, 'g3').code, 0);
  }
  goal(ws, 'ship', GOAL('g3'));
  assert.equal(hook('stop', { session_id: 'g3', turn_id: 'k', cwd: ws }, ws, { ...ENV, LITMUSE_GOAL_HOLD: '0' }).code, 0);
});

test('litgoal: a corrupt record fails open; a non-work route is not held', () => {
  const ws = workspace();
  prompt(ws, 'g4', 'lit fix the bug');
  goal(ws, 'ship', '{not json');
  assert.equal(stop(ws, 'g4').code, 0);
  const ws2 = workspace();
  prompt(ws2, 'g5', 'lit review');
  goal(ws2, 'ship', GOAL('g5'));
  assert.equal(stop(ws2, 'g5').code, 0);
});

test('lit-plan gate is unchanged: held once, even with open plan rows and a goal', () => {
  const ws = workspace();
  prompt(ws, 'l1', 'lit plan a cache');
  goal(ws, 'ship', GOAL('l1'));
  const a = hook('stop', { session_id: 'l1', turn_id: 'tl', cwd: ws }, ws);
  assert.equal(a.code, 2);
  assert.match(a.stderr, /lit-plan gate/);
  assert.equal(hook('stop', { session_id: 'l1', turn_id: 'tl', cwd: ws }, ws).code, 0);
  assert.ok(sessionPath(ws, 'l1', ENV));
});

test('lit-plan: a saved plan arms `go` for this session for 30 minutes', () => {
  const ws = workspace();
  prompt(ws, 'go1', 'lit plan a cache');
  plan(ws, PLAN('approved', OPEN));
  assert.equal(stop(ws, 'go1').code, 0, 'a written plan ends the planning turn');
  const record = nextStepPath(ws, 'go1');
  assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')).target, { plan: 'plans/cache.md' });
  assert.match(prompt(ws, 'other', 'go').stdout, /Nothing on record/, 'another session gets nothing');
  const started = prompt(ws, 'go1', 'go');
  assert.match(started.stdout, /LIT IGNITED · start-work/);
  assert.match(started.stdout, /Plan: plans\/cache\.md/);
  assert.equal(existsSync(record), false, 'the record is spent');
});

test('lit-plan: a stale record or an odd plan name starts nothing', () => {
  const ws = workspace();
  prompt(ws, 'go2', 'lit plan a cache');
  plan(ws, PLAN('approved', OPEN));
  stop(ws, 'go2');
  const record = nextStepPath(ws, 'go2');
  const old = JSON.parse(readFileSync(record, 'utf8'));
  writeFileSync(record, JSON.stringify({ ...old, at: new Date(Date.now() - 31 * 60_000).toISOString() }));
  assert.match(prompt(ws, 'go2', 'go').stdout, /Nothing on record/, '31 minutes is too late');
  const ws2 = workspace();
  prompt(ws2, 'go3', 'lit plan a cache');
  plan(ws2, PLAN('approved', OPEN), 'my plan.md');
  stop(ws2, 'go3');
  assert.equal(existsSync(nextStepPath(ws2, 'go3')), false, 'a name outside plans/<slug>.md is never recorded');
});

test('lit-plan: the go record is never written through a linked .litmuse', () => {
  const ws = workspace();
  const elsewhere = workspace();
  symlinkSync(elsewhere, join(ws, '.litmuse'));
  prompt(ws, 'go4', 'lit plan a cache');
  plan(ws, PLAN('approved', OPEN));
  assert.equal(stop(ws, 'go4').code, 0);
  assert.equal(existsSync(join(elsewhere, 'adhd')), false);
});

// The Stop payload may not carry the prompt, so the prompt hook records a pause flag in the route state.
test('start-work: a lit prompt with a pause word releases the next Stop through the route state', () => {
  const ws = workspace();
  startWork(ws, 'w9');
  prompt(ws, 'w9', 'lit start plans/cache.md pause here please');
  assert.equal(stop(ws, 'w9').code, 0);
  prompt(ws, 'w9', 'lit start plans/cache.md go on');
  assert.equal(stop(ws, 'w9').code, 2);
});
