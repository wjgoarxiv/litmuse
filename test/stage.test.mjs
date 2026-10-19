import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionPath } from '../plugin/hooks/lib/common.mjs';
import { stageFile, readStage } from '../plugin/hooks/lib/stage.mjs';
import { buildCard, renderCard, fmtDuration } from '../lib/stage-card.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');

function env() {
  return { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-stage-state-')) };
}
const workspace = () => mkdtempSync(join(tmpdir(), 'litmuse-stage-ws-'));

function runHook(name, payload, cwd, e) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], { input: JSON.stringify(payload), cwd, encoding: 'utf8', env: e });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('stage: record is written on route ignite and a latest pointer names the session', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit plan a thing', session_id: 'st1', turn_id: 't1', cwd: ws }, ws, e);
  const rec = readStage(stageFile(ws, 'st1', e));
  assert.equal(rec.route, 'lit-plan');
  assert.equal(rec.kind, 'ignite');
  assert.ok(Number.isFinite(rec.activatedAt));
  const card = buildCard({ cwd: ws, env: e });
  assert.equal(card.route, 'lit-plan');
  assert.equal(card.session, 'st1');
});

test('stage: continue and resume are recorded', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop fix it', session_id: 'st2', turn_id: 't1', cwd: ws }, ws, e);
  runHook('user-prompt-submit', { prompt: 'lit', session_id: 'st2', turn_id: 't2', cwd: ws }, ws, e);
  assert.equal(readStage(stageFile(ws, 'st2', e)).kind, 'continue');
  runHook('user-prompt-submit', { prompt: 'just a question', session_id: 'st2', turn_id: 't3', cwd: ws }, ws, e);
  const rec = readStage(stageFile(ws, 'st2', e));
  assert.equal(rec.route, null);
  assert.equal(rec.kind, 'clear');
});

test('stage: lane start and stop are timed; session end closes the record', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'st3', turn_id: 't1', cwd: ws }, ws, e);
  runHook('subagent-start', { session_id: 'st3', cwd: ws, agent_id: 'a1', agent_type: 'litmuse/lit-planner' }, ws, e);
  runHook('subagent-start', { session_id: 'st3', cwd: ws, agent_id: 'a2', agent_type: 'litmuse/qa-runner' }, ws, e);
  let rec = readStage(stageFile(ws, 'st3', e));
  assert.deepEqual(rec.lanes.map((l) => [l.id, l.status]), [['a1', 'running'], ['a2', 'running']]);
  runHook('subagent-stop', { session_id: 'st3', cwd: ws, agent_id: 'a2' }, ws, e);
  rec = readStage(stageFile(ws, 'st3', e));
  assert.equal(rec.lanes[1].status, 'done');
  assert.ok(rec.lanes[1].endedAt >= rec.lanes[1].startedAt);
  assert.equal(rec.lanes[0].status, 'running');
  runHook('session-end', { session_id: 'st3', cwd: ws }, ws, e);
  rec = readStage(stageFile(ws, 'st3', e));
  assert.equal(rec.route, null);
  assert.ok(rec.lanes.every((l) => l.status !== 'running'));
});

test('stage: lanes are capped at the last 20', () => {
  const e = env(); const ws = workspace();
  for (let i = 0; i < 25; i += 1) runHook('subagent-start', { session_id: 'st4', cwd: ws, agent_id: `a${i}` }, ws, e);
  const rec = readStage(stageFile(ws, 'st4', e));
  assert.equal(rec.lanes.length, 20);
  assert.equal(rec.lanes[0].id, 'a5');
});

test('card: renders plan n/m and next open row read live from the plan file, lanes and goal', () => {
  const e = env(); const ws = workspace();
  mkdirSync(join(ws, 'plans')); mkdirSync(join(ws, '.litmuse', 'goals'), { recursive: true });
  writeFileSync(join(ws, 'plans', 'p.md'), '# P\n- [x] 1. one\n- [x] 2. two\n- [ ] 3. third thing\n- [ ] 4. fourth\n');
  writeFileSync(join(ws, '.litmuse', 'goals', 'g.json'), JSON.stringify({
    slug: 'g', objective: 'ship it', status: 'active',
    criteria: [{ id: 'c1', text: 'a', status: 'pass' }, { id: 'c2', text: 'b works', status: 'open' }],
  }));
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'st5', turn_id: 't1', cwd: ws }, ws, e);
  runHook('subagent-start', { session_id: 'st5', cwd: ws, agent_id: 'a1', agent_type: 'litmuse/lit-executor' }, ws, e);
  const card = buildCard({ cwd: ws, env: e, now: Date.now() + 65000 });
  assert.equal(card.plan.done, 2);
  assert.equal(card.plan.total, 4);
  assert.equal(card.plan.next.row, 3);
  const text = renderCard(card);
  assert.match(text, /LIT · lit-loop · active 1m/);
  assert.match(text, /plan 2\/4 .*next 3\. third thing/);
  assert.match(text, /lanes running: litmuse\/lit-executor 1m/);
  assert.match(text, /goal: ship it \(1\/2 criteria met\)/);
  assert.match(text, /open c2: b works/);
  assert.equal(fmtDuration(3_725_000), '1h 02m');
});

test('card: no record yields an inactive card', () => {
  const card = buildCard({ cwd: workspace(), env: env() });
  assert.equal(card.active, false);
  assert.match(renderCard(card), /no active route/);
});

test('stage: a record failure leaves hook output unchanged', () => {
  const e = env(); const ws = workspace();
  const payload = { prompt: 'lit plan a thing', session_id: 'st6', turn_id: 't1', cwd: ws };
  const good = runHook('user-prompt-submit', payload, ws, e);
  // a regular file where the stage directory should be makes every record write fail
  const e2 = env();
  mkdirSync(join(e2.XDG_STATE_HOME, 'litmuse'), { recursive: true });
  writeFileSync(join(e2.XDG_STATE_HOME, 'litmuse', 'stage'), 'not a directory');
  const bad = runHook('user-prompt-submit', { ...payload, session_id: 'st6' }, ws, e2);
  assert.equal(bad.code, 0);
  assert.equal(bad.stdout, good.stdout);
  const sub = runHook('subagent-start', { session_id: 'st6', cwd: ws }, ws, e2);
  assert.equal(sub.code, 0);
  assert.match(sub.stdout, /SubagentStart/);
});

test('stage: a symlinked stage directory is refused', () => {
  const e = env(); const ws = workspace();
  const elsewhere = mkdtempSync(join(tmpdir(), 'litmuse-stage-elsewhere-'));
  mkdirSync(join(e.XDG_STATE_HOME, 'litmuse'), { recursive: true });
  symlinkSync(elsewhere, join(e.XDG_STATE_HOME, 'litmuse', 'stage'));
  const r = runHook('user-prompt-submit', { prompt: 'lit plan a thing', session_id: 'st7', turn_id: 't1', cwd: ws }, ws, e);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /LIT IGNITED/);
  assert.deepEqual(readdirSync(elsewhere), []);
  assert.equal(existsSync(join(elsewhere, 'st7.json')), false);
});

test('route state: pauseRequested is a boolean derived from the prompt, never the prompt text', () => {
  const e = env(); const ws = workspace();
  const state = () => JSON.parse(readFileSync(sessionPath(ws, 'pz1', e), 'utf8'));
  runHook('user-prompt-submit', { prompt: 'lit loop fix it', session_id: 'pz1', turn_id: 't1', cwd: ws }, ws, e);
  assert.equal(state().pauseRequested, false);
  runHook('user-prompt-submit', { prompt: 'lit please stop now', session_id: 'pz1', turn_id: 't2', cwd: ws }, ws, e);
  assert.equal(state().pauseRequested, true);
  runHook('user-prompt-submit', { prompt: 'lit 잠깐 멈춰', session_id: 'pz1', turn_id: 't3', cwd: ws }, ws, e);
  assert.equal(state().pauseRequested, true);
  runHook('user-prompt-submit', { prompt: 'lit go on', session_id: 'pz1', turn_id: 't4', cwd: ws }, ws, e);
  assert.equal(state().pauseRequested, false);
  assert.ok(!JSON.stringify(state()).includes('go on'));
});
