import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FRAME_MS, READ_MS, cardText, watchCard, watchView } from '../lib/card-view.mjs';
import { MIN_COLS, SUN_W, motionOff, paint, paintRows, place, roundCaps, roundGauge, rowCells, sceneOn, stagePill, wrapRow } from '../lib/sunset.mjs';
import { cardLight, cardWorking, renderCard } from '../lib/stage-card.mjs';
import { displayWidth } from '../plugin/lib/rewind/gauge.mjs';

const SGR = /\u001b\[[0-9;]*m/gu;
const bare = (text) => text.replace(SGR, '');
const NOW = Date.UTC(2026, 10, 25);
const TC = { COLORTERM: 'truecolor', TERM: 'xterm-256color' };
const V = '1.2.3';
const tty = (columns, rows = 60) => ({ isTTY: true, columns, rows });
const DOME = /[▁▂▃▄▅▆▇█]{10,18}/u;

const thread = (over = {}) => ({ session: 's', skill: 'start-work', stage: 'work', status: 'active', gauge: '[▉░░] 1/3', ...over });
const card = (over = {}) => ({
  active: true, route: 'start-work', kind: 'ignite', session: 's', activeMs: 90_000, updated: NOW, now: NOW, noColor: false,
  plan: { file: 'plans/todo.md', total: 3, done: 1, next: { row: 2, text: 'Add the flag' }, mtimeMs: NOW },
  lanes: [], goal: null, threads: { rows: [thread()], omitted: 0 }, ...over,
});
const idle = () => card({ active: false, route: null, threads: { rows: [], omitted: 0 } });

test('the scene is painted after the words: every word stays, and nothing lands in the gap before it', () => {
  for (const over of [{}, { plan: null }, { lanes: [{ id: 'a', type: 'litmuse/lit-executor', status: 'running', elapsedMs: 5000 }] }]) {
    for (let cols = 20; cols <= 200; cols += 1) {
      const c = card(over);
      const plain = renderCard({ ...c, noColor: true }).split('\n');
      const rows = bare(cardText(c, { env: TC, stream: tty(cols), version: V })).split('\n').slice(-plain.length);
      rows.forEach((row, r) => {
        const words = r === 0 ? `start-work · active 1m 30s` : plain[r];
        const at = row.indexOf(words);
        assert.ok(at >= 0, `${cols}: ${row}`);
        assert.match(row.slice(at + words.length), /^( {2}.*)?$/u, `${cols}: two clear cells after the words`);
        if (cols >= MIN_COLS) assert.ok(displayWidth(row) < cols, `${cols}: the last column stays empty`);
      });
    }
  }
});

test('row count and words are the same as without the scene, at every width', () => {
  for (const c of [card(), idle(), card({ route: 'lit-adhd' }), card({ threads: { rows: [thread({ status: 'paused' })], omitted: 0 } })]) {
    for (const cols of [40, 80, 89, 90, 100, 120, 200]) {
      const lit = cardText(c, { env: TC, stream: tty(cols), version: V }).split('\n');
      const plain = cardText(c, { env: { ...TC, COLORFGBG: '0;15' }, stream: tty(cols), version: V }).split('\n');
      assert.equal(lit.length, plain.length);
      lit.forEach((row, r) => assert.ok(bare(row).startsWith(bare(plain[r])), `${cols}: ${bare(row)}`));
      assert.equal(/▆{18}/u.test(bare(lit.join('\n'))), cols >= MIN_COLS, `${c.route} at ${cols}`);
    }
  }
});

test('no scene: a pipe, NO_COLOR, 256 and 16 colours, a dumb or light terminal, or under 90 columns', () => {
  assert.equal(sceneOn({ depth: 'truecolor', env: {}, cols: 90 }), true);
  assert.equal(sceneOn({ depth: 'truecolor', env: {}, cols: 89 }), false);
  assert.equal(sceneOn({ depth: '256', env: {}, cols: 120 }), false);
  for (const bg of ['0;15', '0;default;15', '0;7']) assert.equal(sceneOn({ depth: 'truecolor', env: { COLORFGBG: bg }, cols: 120 }), false, bg);
  assert.equal(sceneOn({ depth: 'truecolor', env: { COLORFGBG: '15;0' }, cols: 120 }), true);
  const c = card();
  assert.equal(cardText(c, { env: TC, stream: {}, version: V }), renderCard(c), 'a pipe gets the card alone');
  for (const env of [{ ...TC, NO_COLOR: '1' }, { TERM: 'xterm-256color' }, { TERM: 'xterm' }, { ...TC, TERM: 'dumb' }, { ...TC, COLORFGBG: '0;15' }]) {
    const rows = cardText(c, { env, stream: tty(120), version: V }).split('\n').slice(-4).map(bare);
    assert.ok(!rows.some((row) => DOME.test(row) || /~|\s[-.+*]$/u.test(row)), JSON.stringify(env));
    assert.equal(rows[3], 'plan 1/3 · plans/todo.md · next 2. Add the flag');
  }
});

test('one long row moves the sun up; long rows everywhere put it out; a short card borrows the rows above it', () => {
  const long = 'x'.repeat(100);
  assert.equal(place(['a', 'b', 'c', 'd'], 119).top, 1);
  assert.equal(place(['a', 'b', 'c', long], 119).top, 0);
  assert.equal(place(['a', long, 'c', 'd'], 119).top, null);
  assert.equal(place(['a', 'b'], 119).top, null);
  const text = bare(cardText({ ...idle(), plan: null }, { env: TC, stream: tty(120), version: V })).split('\n');
  assert.match(text.at(-1), /no active route in this workspace {2,}.*▆{18}/u, 'a one-row card');
  assert.deepEqual(paintRows([long, long, long], 119, {}), [long, long, long]);
});

test('text whose width terminals disagree on is left alone, and wide text counts two cells', () => {
  for (const text of ['tab\there', 'joined \u{1f468}‍\u{1f4bb}', 'warn ⚠️', 'escape \u001b]0;x\u0007']) assert.equal(rowCells(text), Infinity);
  assert.equal(rowCells('한글'), 4);
  assert.equal(rowCells('✅ ok'), 5);
  assert.equal(rowCells('\u001b[1mok\u001b[0m'), 2);
  const rows = ['a', '한글 계획 ✅', 'c'];
  const painted = paintRows(rows, 119, { t: 1 });
  painted.forEach((row, r) => assert.ok(row.startsWith(rows[r])));
  assert.equal(rowCells(painted[1].slice(0, painted[1].indexOf('▅'))), rowCells(painted[2].slice(0, painted[2].indexOf('▆'))) + 1, 'the dome lines up past wide text');
});

test('a finished plan keeps its burst to itself', () => {
  const done = card({ plan: { file: 'plans/todo.md', total: 3, done: 3, next: null, mtimeMs: NOW } });
  assert.equal(cardLight(done), null);
  assert.doesNotMatch(bare(cardText(done, { env: TC, stream: tty(120), version: V })), /▆{18}/u);
});

test('looks: amber while it waits on you, rainbow for lit-adhd, dimmed with no route', () => {
  assert.deepEqual(cardLight(card()), { look: 'sunset', dim: false });
  assert.deepEqual(cardLight(card({ threads: { rows: [thread({ status: 'paused' })], omitted: 0 } })), { look: 'turn', dim: false });
  assert.deepEqual(cardLight(card({ route: 'lit-adhd' })), { look: 'rainbow', dim: false });
  assert.deepEqual(cardLight(idle()), { look: 'sunset', dim: true });
  const spot = place(['', '', ''], 116);
  const at = (o) => JSON.stringify([...paint(spot, o).get(2)].slice(spot.at, spot.at + SUN_W));
  assert.equal(new Set([{}, { look: 'turn' }, { look: 'rainbow' }, { dim: true }].map(at)).size, 4);
});

test('motion changes colours and ASCII only, keeps every width, and the resting pose is one picture', () => {
  const spot = place(['', '', ''], 116);
  const shapes = new Set();
  const frames = new Set();
  const light = new Set();
  for (let i = 0; i < 200; i += 1) {
    const rows = paint(spot, { t: i * 0.125 });
    for (const cells of rows.values()) assert.equal(cells.length, 116);
    frames.add(JSON.stringify([...rows]));
    light.add(rows.get(1).slice(spot.at, spot.at + SUN_W).map((cell) => cell?.fg).join());
    for (let r = 0; r < 3; r += 1) {
      const row = rows.get(r);
      row.forEach((cell, x) => {
        if (cell && (x < spot.at || x >= spot.at + SUN_W)) assert.match(cell.ch, /^[~.+*-]$/u);
      });
    }
    shapes.add([0, 1, 2].map((r) => rows.get(r).slice(spot.at, spot.at + SUN_W).map((c) => (c?.bg || /[▁-█]/u.test(c?.ch ?? '') ? c.ch : ' ')).join('')).join('\n'));
  }
  assert.ok(frames.size > 150, 'it moves');
  assert.ok(light.size > 20, 'light runs across the sun');
  assert.equal([...shapes].length, 1, 'the dome never changes shape');
  assert.deepEqual([...paint(spot)], [...paint(spot)]);
});

test('thread rows keep their words and cells: neon branches, one pill on the current stage, caps only where drawn', () => {
  const c = card({ threads: { rows: [thread({ skill: 'lit-plan', stage: 'plan', status: 'paused' }), thread(), thread({ session: 'o', sibling: true, status: 'running' })], omitted: 0 } });
  const plain = renderCard({ ...c, noColor: true });
  assert.equal(bare(renderCard(c, { dress: { caps: false } })).replace(/\u001b\[0;?[0-9;]*m/gu, ''), plain);
  const round = bare(renderCard(c, { dress: { caps: true } }));
  assert.equal(round.length, plain.length);
  assert.match(round, /start-workworkactive  {3} 1\/3/u);
  assert.equal(round.match(/work/gu).length, 1, 'other sessions and paused stages get no pill');
  assert.equal(roundGauge('[▉░] 1/2'), '\u001b[0;38;2;255;143;60m\ue0b6\u001b[0;48;2;255;143;60m \u001b[0;48;2;42;35;64m \u001b[0;38;2;42;35;64m\ue0b4\u001b[0m 1/2', 'caps and cells share a colour, one as ink and one as fill');
  assert.equal(roundGauge('[…] running'), '[…] running');
  assert.equal(bare(stagePill(' RED ', false)), ' RED ');
  assert.equal(roundCaps({}), false);
  assert.equal(roundCaps({ TERM_PROGRAM: 'iTerm.app' }), false);
  assert.equal(roundCaps({ TERM_PROGRAM: 'vscode' }) && roundCaps({ WT_SESSION: 'x' }), true);
  assert.equal(renderCard(c), renderCard(c, { dress: null }));
});

test('working: an active route whose session has not stopped, with something moving in the last 15 minutes', () => {
  const env = { XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-sunset-')) };
  const dir = join(env.XDG_STATE_HOME, 'litmuse', 'stage', 'liveness');
  mkdirSync(dir, { recursive: true });
  const live = (state, at) => writeFileSync(join(dir, 's.json'), JSON.stringify({ session: 's', state, at: new Date(at).toISOString() }));
  assert.equal(cardWorking(card(), { env }), true, 'just routed');
  assert.equal(cardWorking(idle(), { env }), false);
  live('alive', NOW);
  assert.equal(cardWorking(card({ updated: NOW - 3_600_000 }), { env }), true);
  live('idle', NOW);
  assert.equal(cardWorking(card({ updated: NOW - 1 }), { env }), false, 'stopped after the last record');
  assert.equal(cardWorking(card({ updated: NOW + 1, now: NOW + 2 }), { env }), true, 'a new prompt after the stop');
  live('alive', NOW - 16 * 60_000);
  assert.equal(cardWorking(card({ updated: NOW - 16 * 60_000 }), { env }), false, 'quiet for too long');
});

const noState = { XDG_STATE_HOME: join(tmpdir(), 'litmuse-sunset-none') };

test('watch view: an exact frame that moves while working and holds still when idle, reduced or off', () => {
  const view = (c, { cols = 120, rows = 60, env = {} } = {}) => watchView(c, { env: { ...TC, ...noState, ...env }, stream: tty(cols, rows), version: V, now: NOW });
  for (const cols of [90, 97, 120, 160]) {
    const width = Math.min(120, cols - 1);
    const frame = view(card(), { cols, rows: 12 }).frame(2).map((row) => bare(row).replace(/\u001b\[K/gu, ''));
    for (const row of [frame[0], frame.at(-1)]) assert.equal(rowCells(row), width, row);
    for (const row of frame.slice(1, -1)) assert.match(row, new RegExp(`^│ .*\\u001b\\[${width}G│$`, 'u'));
    assert.ok(frame.slice(1, -1).some((row) => /▆{18}/u.test(row)), `${cols}: the sun`);
  }
  const moving = view(card());
  assert.equal(moving.moving, true);
  assert.notDeepEqual(moving.frame(1), moving.frame(1.25));
  for (const still of [view(idle()), view(card(), { env: { LITMUSE_MOTION: 'off' } }), view(card(), { env: { LITMUSE_MOTION: 'reduced' } }), view(card(), { env: { NO_COLOR: '1' } }), view(card(), { cols: 80 })]) assert.equal(still.moving, false);
  assert.ok(motionOff({ LITMUSE_MOTION: '0' }) && !motionOff({}) && !motionOff({ LITMUSE_MOTION: 'full' }));
  const plain = view(card(), { cols: 80, rows: 10, env: { NO_COLOR: '1' } }).frame(null);
  assert.equal(plain.join('\n'), renderCard({ ...card(), noColor: false }, { cols: 80 }), 'plain watch shows the plain card');
});

test('watch view: long rows wrap inside the frame without losing a character, and it never outgrows the screen', () => {
  const text = '가나다 '.repeat(30).trim();
  const c = card({ plan: { file: 'plans/todo.md', total: 3, done: 1, next: { row: 2, text }, mtimeMs: NOW } });
  const rows = watchView(c, { env: { ...TC, ...noState }, stream: tty(100, 14), version: V, now: NOW }).frame(1).map(bare);
  assert.ok(rows.length <= 14);
  const body = rows.slice(1, -1).map((row) => row.replace(/\u001b\[K/u, '').replace(/\u001b\[\d+G│$/u, '').slice(2)).join('');
  assert.ok(body.replace(/[~.+*\-▁-█\s]/gu, '').includes(text.replace(/\s/gu, '')));
  assert.deepEqual(wrapRow('한글한글', 5), ['한글', '한글']);
  assert.deepEqual(wrapRow('a\u0007b\tc', 9), ['abc']);
  assert.deepEqual(wrapRow('\u001b[1mabcd\u001b[0m', 2), ['\u001b[1mab\u001b[0m', '\u001b[1mcd\u001b[0m']);
});

// A terminal, a keyboard and a process that only record; time is mocked, so nothing waits.
function rig(t, { make = () => card(), env = {} } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW });
  const out = Object.assign(new EventEmitter(), tty(120, 60), { bytes: [], write(s) { this.bytes.push(s); return true; } });
  const input = Object.assign(new EventEmitter(), { isTTY: true, raw: [], setRawMode(on) { this.raw.push(on); }, resume() {}, pause() {} });
  const proc = new EventEmitter();
  const state = { reads: 0 };
  const done = watchCard({ env: { ...TC, ...noState, ...env }, out, input, proc, version: V, read: () => { state.reads += 1; return make(); } });
  return { out, input, proc, state, done };
}

test('watch: many frames per read while working, one read a second and no bytes at all while idle', (t) => {
  const working = rig(t);
  const first = working.out.bytes.length;
  for (let i = 0; i < 24; i += 1) t.mock.timers.tick(FRAME_MS);
  assert.ok(working.state.reads <= 1 + (24 * FRAME_MS) / READ_MS, `${working.state.reads} reads in three seconds`);
  assert.ok(working.out.bytes.length - first >= 20, 'it moved');
  working.proc.emit('SIGTERM');
  t.mock.timers.reset();
  const resting = rig(t, { make: idle });
  const drawn = resting.out.bytes.length;
  for (let i = 0; i < 5; i += 1) t.mock.timers.tick(READ_MS);
  assert.equal(resting.out.bytes.length, drawn, 'an idle card writes nothing');
  assert.ok(resting.state.reads <= 6);
  resting.proc.emit('SIGTERM');
});

test('watch: stops moving when work ends and redraws on a resize', (t) => {
  let now = card();
  const r = rig(t, { make: () => now });
  t.mock.timers.tick(FRAME_MS);
  now = idle();
  for (let i = 0; i < 12; i += 1) t.mock.timers.tick(FRAME_MS);
  const settled = r.out.bytes.length;
  for (let i = 0; i < 3; i += 1) t.mock.timers.tick(READ_MS);
  assert.equal(r.out.bytes.length, settled);
  r.out.columns = 80;
  r.out.emit('resize');
  assert.equal(r.out.bytes[settled], '\u001b[2J');
  assert.doesNotMatch(bare(r.out.bytes.at(-1)), /╭|▆{18}/u, 'too narrow now: the plain card');
  r.proc.emit('SIGTERM');
});

test('watch: Ctrl+C, q and signals all give the terminal back once, with no timer or listener left', async (t) => {
  const ways = [
    [(r) => r.input.emit('data', Buffer.from('\u0003')), 0],
    [(r) => r.input.emit('data', Buffer.from('q')), 0],
    [(r) => r.proc.emit('SIGINT'), 0],
    [(r) => r.proc.emit('SIGTERM'), 143],
    [(r) => r.proc.emit('SIGHUP'), 129],
  ];
  for (const [leave, code] of ways) {
    const r = rig(t);
    assert.equal(r.out.bytes[0], '\u001b[?1049h\u001b[?25l\u001b[?7l\u001b[2J');
    r.input.emit('data', Buffer.from('x'));
    leave(r);
    assert.equal(await r.done, code);
    assert.equal(r.out.bytes.at(-1), '\u001b[0m\u001b[?7h\u001b[?25h\u001b[?1049l');
    assert.deepEqual(r.input.raw, [true, false]);
    const count = r.out.bytes.length;
    t.mock.timers.tick(5000);
    r.proc.emit('exit');
    assert.equal(r.out.bytes.length, count);
    assert.deepEqual([r.proc.eventNames(), r.out.eventNames(), r.input.eventNames()], [[], [], []]);
    t.mock.timers.reset();
  }
});

test('watch: an unexpected exit still restores the screen', (t) => {
  const r = rig(t);
  r.proc.emit('exit');
  assert.ok(r.out.bytes.at(-1).endsWith('\u001b[?1049l'));
  r.proc.emit('SIGTERM');
});
