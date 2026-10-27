import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionPath } from '../plugin/hooks/lib/common.mjs';
import { stageFile, readStage } from '../plugin/hooks/lib/stage.mjs';
import { buildCard, renderCard, fmtDuration } from '../lib/stage-card.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');

function env() {
  const e = { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-stage-state-')) };
  delete e.HERDR_PANE_ID;
  return e;
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

test('card: one rainbow-tinted line marks the lit-adhd turn and nothing else', () => {
  const text = renderCard({ active: true, route: 'lit-adhd', activeMs: 1000, kind: 'ignite', plan: null, lanes: [], goal: null, now: 0 });
  const lines = text.split('\n');
  assert.equal(lines.filter((line) => line.includes('\u001b[')).length, 1, 'exactly one tinted line');
  assert.match(lines[0].replace(/\u001b\[[0-9;]*m/g, ''), /lit-adhd · brief on screen/);
  assert.match(lines[0], /\u001b\[38;5;196m/);
  assert.ok(lines[0].endsWith('\u001b[0m'));
  const plain = renderCard({ active: true, route: 'lit-loop', activeMs: 1000, kind: 'ignite', plan: null, lanes: [], goal: null, now: 0 });
  assert.ok(!plain.includes('\u001b['), 'other routes stay plain');
});

test('card: an idle workspace with fresh stacks offers lit adhd as the way back in', () => {
  const e = env(); const ws = workspace();
  assert.ok(!renderCard(buildCard({ cwd: ws, env: e })).includes('lit adhd'), 'no stacks, no suggestion');
  mkdirSync(join(ws, '.litmuse', 'workflow-stack'), { recursive: true });
  writeFileSync(join(ws, '.litmuse', 'workflow-stack', 's.json'), '{"version":1,"frames":[]}');
  assert.match(renderCard(buildCard({ cwd: ws, env: e })), /idle — say `lit adhd` for the cross-session brief/);
});

test('card: thread rows nest paused spines under running sides with one-source counts', () => {
  const e = env(); const ws = workspace();
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  writeFileSync(join(dir, 'own.json'), JSON.stringify({ version: 1, sessionId: 'own', frames: [
    { skill: 'lit-loop', family: 'loop', stage: 'RED', role: 'spine', status: 'paused', n: 2, total: 4, at },
    { skill: 'lit-brainstorm', family: 'main', stage: 'interview', role: 'side', status: 'active', at },
  ] }));
  const card = buildCard({ cwd: ws, session: 'own', env: e });
  const text = renderCard(card);
  assert.match(text, /threads:/);
  assert.match(text, /├─ lit-loop RED paused \[▉▉░░\] 2\/4/);
  assert.match(text, /└─ lit-brainstorm interview active \[…\] running/);
  assert.ok(!/[?]/.test(text), 'no placeholder glyph on the card');
  assert.equal(renderCard(buildCard({ cwd: ws, session: 'own', env: e })), text, 'repaint is stable');
});

test('card: thread counts fall back from recorded to plan to goal to pulse', () => {
  const e = env(); const ws = workspace();
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  mkdirSync(join(ws, 'plans'));
  writeFileSync(join(ws, 'plans', 'p.md'), '# P\n- [x] 1. a\n- [ ] 2. b\n');
  writeFileSync(join(dir, 's1.json'), JSON.stringify({ version: 1, sessionId: 's1', frames: [
    { skill: 'start-work', family: 'main', stage: 'work', role: 'spine', status: 'active', ref: { plan: 'plans/p.md' }, at },
  ] }));
  let text = renderCard(buildCard({ cwd: ws, session: 's1', env: e }));
  assert.match(text, /start-work work active \[▉░\] 1\/2/, 'plan rows resolve the count');
  mkdirSync(join(ws, '.litmuse', 'goals'), { recursive: true });
  writeFileSync(join(ws, '.litmuse', 'goals', 'g.json'), JSON.stringify({ slug: 'g', objective: 'o', status: 'active', criteria: [{ id: 'c1', status: 'pass' }, { id: 'c2', status: 'open' }] }));
  writeFileSync(join(dir, 's1.json'), JSON.stringify({ version: 1, sessionId: 's1', frames: [
    { skill: 'lit-loop', family: 'loop', stage: 'PIN', role: 'spine', status: 'active', at },
  ] }));
  text = renderCard(buildCard({ cwd: ws, session: 's1', env: e }));
  assert.match(text, /lit-loop PIN active \[▉░\] 1\/2/, 'goal criteria resolve the count');
});

test('card: sibling stacks show fresh paused tops, cap at six rows, drop stale frames', () => {
  const e = env(); const ws = workspace();
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  writeFileSync(join(dir, 'own.json'), JSON.stringify({ version: 1, sessionId: 'own', frames: [] }));
  for (let i = 0; i < 8; i += 1) {
    writeFileSync(join(dir, `sib${i}.json`), JSON.stringify({ version: 1, sessionId: `sib${i}`, frames: [{ skill: 'lit-loop', stage: 'RED', role: 'spine', status: 'paused', n: 1, total: 2, at }] }));
  }
  const stale = join(dir, 'old.json');
  writeFileSync(stale, JSON.stringify({ version: 1, sessionId: 'old', frames: [{ skill: 'lit-loop', stage: 'RED', role: 'spine', status: 'paused', at }] }));
  utimesSync(stale, new Date(Date.now() - 20 * 60_1000), new Date(Date.now() - 20 * 60_1000));
  const text = renderCard(buildCard({ cwd: ws, session: 'own', env: e, now: Date.now() }));
  assert.match(text, /\+2 more/, 'six rows shown, two omitted');
  assert.ok(!text.includes('(old)'), 'stale sibling dropped');
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

// Skill looks (BRIEF-mod-looks): static TTY colour plus a label, never animation.
test('look: a paused thread turns the headline amber with YOUR TURN', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop fix it', session_id: 'w1', turn_id: 't1', cwd: ws }, ws, e);
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'w1.json'), JSON.stringify({ version: 1, sessionId: 'w1', frames: [
    { skill: 'lit-loop', family: 'loop', stage: 'PIN', role: 'spine', status: 'paused', at: new Date().toISOString() },
  ] }));
  const text = renderCard(buildCard({ cwd: ws, session: 'w1', env: e }));
  assert.match(text, /LIT · lit-loop · YOUR TURN/);
  assert.ok(text.includes(String.fromCharCode(27) + '[33;1m'), 'the waiting headline is amber');
});

test('look: a failed lane means YOUR TURN', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop fix it', session_id: 'w2', turn_id: 't1', cwd: ws }, ws, e);
  runHook('subagent-start', { session_id: 'w2', cwd: ws, agent_id: 'a9', agent_type: 'litmuse/lit-executor' }, ws, e);
  runHook('subagent-stop', { session_id: 'w2', cwd: ws, agent_id: 'a9', status: 'failed' }, ws, e);
  const text = renderCard(buildCard({ cwd: ws, env: e }));
  assert.match(text, /YOUR TURN/);
});

test('look: review-work draws five lane segments from real verdicts only', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit review this branch', session_id: 'rv1', turn_id: 't1', cwd: ws }, ws, e);
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rv1.json'), JSON.stringify({ version: 1, sessionId: 'rv1', frames: [
    { skill: 'review-work', family: 'main', stage: 'review', role: 'spine', status: 'active',
      verdicts: { goal: 'pass', security: 'fail' }, at: new Date().toISOString() },
  ] }));
  const text = renderCard(buildCard({ cwd: ws, session: 'rv1', env: e }));
  assert.match(text, /review lanes:/);
  const order = ['scope', 'package', 'security', 'tests+evidence', 'surface'];
  let last = -1;
  for (const name of order) { const at = text.indexOf(name); assert.ok(at > last, name + ' keeps lane order'); last = at; }
  assert.ok(!text.includes('package ●'), 'an unreported lane never fills');
});

test('look: NO_COLOR strips every look to plain text', () => {
  const e = env(); e.NO_COLOR = '1'; const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit adhd', session_id: 'nc1', turn_id: 't1', cwd: ws }, ws, e);
  const text = renderCard(buildCard({ cwd: ws, env: e }));
  assert.ok(!text.includes(String.fromCharCode(27)), 'no escape byte under NO_COLOR');
  assert.match(text, /lit-adhd · brief on screen/);
});

test('look: a freshly completed plan bursts once, a stale one settles', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'b1', turn_id: 't1', cwd: ws }, ws, e);
  mkdirSync(join(ws, 'plans'));
  writeFileSync(join(ws, 'plans', 'done.md'), '# D\n- [x] 1. a\n- [x] 2. b\n');
  const fresh = renderCard(buildCard({ cwd: ws, env: e }));
  assert.match(fresh, /✨ done: plans\/done.md/);
  const old = Date.now() / 1000 - 3600;
  utimesSync(join(ws, 'plans', 'done.md'), old, old);
  const settled = renderCard(buildCard({ cwd: ws, env: e }));
  assert.ok(!settled.includes('✨'), 'a stale completion settles');
});

// BRIEF-idle-lanes sibling check: the port has no idle->blocked mapping. Thread rows
// carry paused/active only (frameRow maps every other status to active), lanes carry
// running/done/failed, and no stalled/blocked/quiet-for vocabulary exists in the render
// path. This test locks that in across every frame status the stack can record.
test('look: no thread or lane state ever renders as blocked', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'nb1', turn_id: 't1', cwd: ws }, ws, e);
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  const sides = ['active', 'done', 'finished', 'idle'].map((status, i) => ({
    skill: 'lit-loop', family: 'loop', stage: 'S' + i, role: 'side', status, at,
  }));
  writeFileSync(join(dir, 'nb1.json'), JSON.stringify({ version: 1, sessionId: 'nb1', frames: [
    { skill: 'lit-loop', family: 'loop', stage: 'PIN', role: 'spine', status: 'paused', at },
    ...sides,
  ] }));
  runHook('subagent-start', { session_id: 'nb1', cwd: ws, agent_id: 'a1', agent_type: 'litmuse/lit-executor' }, ws, e);
  runHook('subagent-stop', { session_id: 'nb1', cwd: ws, agent_id: 'a1', status: 'failed' }, ws, e);
  const text = renderCard(buildCard({ cwd: ws, session: 'nb1', env: e }));
  assert.doesNotMatch(text, /blocked|stalled|quiet for/i, 'no idle->blocked vocabulary reaches the card');
});

test('look: an all-pass goal bursts while fresh', () => {
  const e = env(); const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'b2', turn_id: 't1', cwd: ws }, ws, e);
  mkdirSync(join(ws, '.litmuse', 'goals'), { recursive: true });
  writeFileSync(join(ws, '.litmuse', 'goals', 'g.json'), JSON.stringify({
    slug: 'g', objective: 'ship it', status: 'active',
    criteria: [{ id: 'c1', text: 'a', status: 'pass' }],
  }));
  assert.match(renderCard(buildCard({ cwd: ws, env: e })), /✨ goal done/);
});

const liveness = (e, sid) => readStage(join(e.XDG_STATE_HOME, 'litmuse', 'stage', 'liveness', `${sid}.json`));

test('liveness: tool calls say alive, Stop says idle, SessionEnd says ended, with a checked pane id', () => {
  const e = { ...env(), HERDR_PANE_ID: 'w2B:p3' }; const ws = workspace();
  runHook('post-tool-use', { session_id: 'lv1', cwd: ws, tool_name: 'read_file', tool_input: {} }, ws, e);
  let rec = liveness(e, 'lv1');
  assert.equal(rec.state, 'alive');
  assert.equal(rec.pane, 'w2B:p3');
  assert.equal(rec.cwd, ws);
  runHook('stop', { session_id: 'lv1', cwd: ws, turn_id: 't1' }, ws, e);
  assert.equal(liveness(e, 'lv1').state, 'idle');
  runHook('post-tool-use-failure', { session_id: 'lv1', cwd: ws, tool_name: 'bash', tool_input: {} }, ws, e);
  assert.equal(liveness(e, 'lv1').state, 'alive');
  runHook('session-end', { session_id: 'lv1', cwd: ws }, ws, e);
  rec = liveness(e, 'lv1');
  assert.equal(rec.state, 'ended');
  runHook('post-tool-use', { session_id: 'lv2', cwd: ws, tool_name: 'read_file', tool_input: {} }, ws, { ...e, HERDR_PANE_ID: 'p1; rm -rf /' });
  assert.equal(liveness(e, 'lv2').pane, null, 'a pane id outside the allowed shape is dropped');
});

test('liveness: a repeat of the same state within 30 s writes nothing; a change always writes', async () => {
  const { markLiveness } = await import('../plugin/hooks/lib/stage.mjs');
  const e = env(); const ws = workspace();
  const payload = { session_id: 'lv3', cwd: ws };
  const t0 = Date.parse('2026-10-28T10:00:00Z');
  assert.equal(markLiveness(payload, 'alive', { env: e, now: t0 }), true);
  assert.equal(markLiveness(payload, 'alive', { env: e, now: t0 + 29_000 }), false, 'throttled');
  assert.equal(liveness(e, 'lv3').at, new Date(t0).toISOString());
  assert.equal(markLiveness(payload, 'alive', { env: e, now: t0 + 31_000 }), true, 'refreshed after 30 s');
  assert.equal(markLiveness(payload, 'idle', { env: e, now: t0 + 32_000 }), true, 'a new state is written at once');
  assert.equal(markLiveness(payload, 'sleeping', { env: e, now: t0 + 33_000 }), false, 'unknown states are refused');
});

test('liveness: a linked liveness folder or record is refused', async () => {
  const { markLiveness } = await import('../plugin/hooks/lib/stage.mjs');
  const e = env(); const ws = workspace(); const elsewhere = workspace();
  mkdirSync(join(e.XDG_STATE_HOME, 'litmuse', 'stage'), { recursive: true });
  symlinkSync(elsewhere, join(e.XDG_STATE_HOME, 'litmuse', 'stage', 'liveness'));
  assert.equal(markLiveness({ session_id: 'lv4', cwd: ws }, 'alive', { env: e }), false);
  assert.deepEqual(readdirSync(elsewhere), []);
  const e2 = env();
  const dir = join(e2.XDG_STATE_HOME, 'litmuse', 'stage', 'liveness');
  mkdirSync(dir, { recursive: true });
  symlinkSync(join(elsewhere, 'target.json'), join(dir, 'lv5.json'));
  assert.equal(markLiveness({ session_id: 'lv5', cwd: ws }, 'alive', { env: e2 }), false);
  assert.equal(existsSync(join(elsewhere, 'target.json')), false);
});

// Other sessions of this workspace: a stack file per session plus its liveness record.
const sibling = (ws, sid, frames, mtime = null) => {
  const dir = join(ws, '.litmuse', 'workflow-stack');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sid}.json`);
  writeFileSync(path, JSON.stringify({ version: 1, sessionId: sid, frames }));
  if (mtime) utimesSync(path, new Date(mtime), new Date(mtime));
};
const frameAt = (skill, stage, extra = {}) => ({ skill, family: 'main', stage, role: 'spine', status: 'active', at: new Date().toISOString(), ...extra });

test('card rows: other sessions list running before idle, whatever their names', async () => {
  const { markLiveness } = await import('../plugin/hooks/lib/stage.mjs');
  const e = env(); const ws = workspace();
  sibling(ws, 'aaa', [frameAt('lit-loop', 'RED')]);
  sibling(ws, 'bbb', [frameAt('litwork', 'GREEN')]);
  markLiveness({ session_id: 'aaa', cwd: ws }, 'idle', { env: e });
  markLiveness({ session_id: 'bbb', cwd: ws }, 'alive', { env: e });
  const text = renderCard(buildCard({ cwd: ws, session: 'own', env: e }));
  assert.ok(text.indexOf('litwork') < text.indexOf('lit-loop'), text);
  assert.match(text, /litwork GREEN running .*\(bbb\)/);
  assert.match(text, /lit-loop RED idle .*\(aaa\)/);
});

test('card rows: a finished start-work reads done for 60 s, then leaves', () => {
  const e = env(); const ws = workspace();
  mkdirSync(join(ws, 'plans'));
  const plan = join(ws, 'plans', 'p.md');
  writeFileSync(plan, '# P\n- [x] 1. a\n- [x] 2. b\n');
  sibling(ws, 'sw', [frameAt('start-work', 'work', { ref: { plan: 'plans/p.md' } })]);
  const finished = Date.now();
  utimesSync(plan, new Date(finished), new Date(finished));
  const at = (ms) => renderCard(buildCard({ cwd: ws, session: 'own', env: e, now: finished + ms }));
  assert.match(at(59_000), /start-work work done \[▉▉\] 2\/2 \(sw\)/);
  assert.doesNotMatch(at(61_000), /start-work/);
});

test('card rows: a lone other session shows, named by its herdr pane when it has one', async () => {
  const { markLiveness } = await import('../plugin/hooks/lib/stage.mjs');
  const e = env(); const ws = workspace();
  markLiveness({ session_id: 'lone', cwd: ws }, 'alive', { env: { ...e, HERDR_PANE_ID: 'w2B:p3' } });
  markLiveness({ session_id: 'elsewhere', cwd: workspace() }, 'alive', { env: e });
  markLiveness({ session_id: 'own', cwd: ws }, 'alive', { env: e });
  let text = renderCard(buildCard({ cwd: ws, session: 'own', env: e }));
  assert.match(text, /threads:\n└─ session · w2B:p3 running/, 'one row, even alone');
  assert.doesNotMatch(text, /elsewhere|\(own\)/, 'other workspaces and this session stay out');
  sibling(ws, 'lone', [frameAt('lit-loop', 'RED', { n: 1, total: 2 })]);
  text = renderCard(buildCard({ cwd: ws, session: 'own', env: e }));
  assert.match(text, /└─ lit-loop · w2B:p3 RED running \[▉░\] 1\/2/);
  assert.doesNotMatch(text, /\(lone\)/, 'the pane names the row instead of the session id');
});

test('card rows: a session reached through a symlinked path is the same project', async () => {
  const { markLiveness } = await import('../plugin/hooks/lib/stage.mjs');
  const e = env(); const ws = workspace();
  const alias = join(workspace(), 'alias');
  symlinkSync(ws, alias);
  markLiveness({ session_id: 'via-link', cwd: alias }, 'alive', { env: e });
  assert.match(renderCard(buildCard({ cwd: ws, session: 'own', env: e })), /└─ session running \(via-link\)/);
});

test('restart chip: shown when the installed bundle is newer than the code this session loaded', () => {
  const ws = workspace();
  const e = { ...env(), XDG_DATA_HOME: mkdtempSync(join(tmpdir(), 'litmuse-stage-data-')) };
  runHook('session-start', { session_id: 'rs1', cwd: ws, source: 'startup' }, ws, e);
  const loaded = readStage(stageFile(ws, 'rs1', e)).loadedVersion;
  assert.match(loaded, /^\d+\.\d+\.\d+$/);
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'rs1', turn_id: 't1', cwd: ws }, ws, e);
  assert.doesNotMatch(renderCard(buildCard({ cwd: ws, session: 'rs1', env: e })), /restart to/, 'no installed bundle: no chip');
  const manifest = join(e.XDG_DATA_HOME, 'litmuse', 'bundle', '.muse-plugin');
  mkdirSync(manifest, { recursive: true });
  writeFileSync(join(manifest, 'plugin.json'), JSON.stringify({ version: loaded }));
  assert.doesNotMatch(renderCard(buildCard({ cwd: ws, session: 'rs1', env: e })), /restart to/, 'same version: no chip');
  writeFileSync(join(manifest, 'plugin.json'), JSON.stringify({ version: '99.0.0' }));
  const text = renderCard(buildCard({ cwd: ws, session: 'rs1', env: e }));
  assert.match(text, /restart to 99\.0\.0/);
  assert.ok(!/[?]/.test(text), 'no question marks for old code');
});

// A main checkout (`.git` folder) holding a linked worktree (`.git` file) under `.worktrees/`.
const nestedWorktree = () => {
  const main = workspace();
  mkdirSync(join(main, '.git'));
  const wt = join(main, '.worktrees', 'wt');
  mkdirSync(join(wt, 'sub'), { recursive: true });
  writeFileSync(join(wt, '.git'), 'gitdir: ../../.git/worktrees/wt\n');
  return { main, wt };
};

test('state root: a linked worktree keeps its own .litmuse; a nested package still shares the outer one', async () => {
  const { resolveProjectStateRoot } = await import('../plugin/hooks/lib/workflow-stack.mjs');
  const team = await import('../plugin/skills/lit-team/scripts/state-root.mjs');
  const { main, wt } = nestedWorktree();
  assert.equal(resolveProjectStateRoot(join(wt, 'sub')), wt);
  assert.equal(team.resolveProjectStateRoot(join(wt, 'sub')), wt);
  const pkg = join(main, 'packages', 'inner');
  mkdirSync(join(pkg, '.git'), { recursive: true });
  assert.equal(resolveProjectStateRoot(pkg), main, 'a nested .git folder does not stop the climb');
  assert.equal(team.resolveProjectStateRoot(pkg), main);
});

test('state root: hooks in a linked worktree write where its card reads', () => {
  const e = env();
  const { main, wt } = nestedWorktree();
  runHook('user-prompt-submit', { prompt: 'lit loop x', session_id: 'wt1', turn_id: 't1', cwd: wt }, wt, e);
  assert.ok(existsSync(join(wt, '.litmuse', 'workflow-stack', 'wt1.json')), 'the stack lands in the worktree');
  assert.ok(!existsSync(join(main, '.litmuse')), 'the main checkout stays untouched');
  const at = new Date().toISOString();
  writeFileSync(join(wt, '.litmuse', 'workflow-stack', 'wt1.json'), JSON.stringify({ version: 1, sessionId: 'wt1', frames: [
    { skill: 'lit-loop', family: 'loop', stage: 'RED', role: 'spine', status: 'active', n: 1, total: 2, at },
  ] }));
  assert.match(renderCard(buildCard({ cwd: join(wt, 'sub'), session: 'wt1', env: e })), /lit-loop RED active \[▉░\] 1\/2/, 'a subfolder card reads the worktree root');
});
