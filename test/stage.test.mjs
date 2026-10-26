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
