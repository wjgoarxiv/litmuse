import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FRAME_MS, READ_MS, cardText, watchCard, watchView } from '../lib/card-view.mjs';
import { SUN_W, motionOff, paint, place, sceneOn, wrapRow } from '../lib/sunset.mjs';
import { cardWorking, renderCard } from '../lib/stage-card.mjs';

const SGR = /\u001b\[[0-9;]*m/gu;
const bare = (text) => text.replace(SGR, '');
const NOW = Date.UTC(2026, 10, 25);
const TC = { COLORTERM: 'truecolor', TERM: 'xterm-256color' };
const V = '1.2.3';
const tty = (columns, rows = 60) => ({ isTTY: true, columns, rows });

const thread = (over = {}) => ({ session: 's', skill: 'start-work', stage: 'work', status: 'active', gauge: '[▉░░] 1/3', ...over });
const card = (over = {}) => ({
  active: true, route: 'start-work', kind: 'ignite', session: 's', activeMs: 90_000, updated: NOW, now: NOW, noColor: false,
  plan: { file: 'plans/todo.md', total: 3, done: 1, next: { row: 2, text: 'Add the flag' }, mtimeMs: NOW },
  lanes: [], goal: null, threads: { rows: [thread()], omitted: 0 }, ...over,
});
const idle = () => card({ active: false, route: null, threads: { rows: [], omitted: 0 } });

test('no scene and no frame: a pipe, NO_COLOR, 256 and 16 colours, a dumb or light terminal, or under 64 columns', () => {
  assert.equal(sceneOn({ depth: 'truecolor', env: {}, cols: 64 }), true);
  assert.equal(sceneOn({ depth: 'truecolor', env: {}, cols: 63 }), false);
  assert.equal(sceneOn({ depth: '256', env: {}, cols: 120 }), false);
  for (const bg of ['0;15', '0;default;15', '0;7']) assert.equal(sceneOn({ depth: 'truecolor', env: { COLORFGBG: bg }, cols: 120 }), false, bg);
  assert.equal(sceneOn({ depth: 'truecolor', env: { COLORFGBG: '15;0' }, cols: 120 }), true);
  const c = card();
  assert.equal(cardText(c, { env: TC, stream: {}, version: V }), renderCard(c), 'a pipe gets the card alone');
  for (const [env, cols] of [[{ ...TC, NO_COLOR: '1' }, 120], [{ TERM: 'xterm-256color' }, 120], [{ TERM: 'xterm' }, 120], [{ ...TC, TERM: 'dumb' }, 120], [{ ...TC, COLORFGBG: '0;15' }, 120], [TC, 63]]) {
    const rows = cardText(c, { env: { ...env, LITMUSE_GLYPHS: 'round' }, stream: tty(cols), version: V }).split('\n').slice(-4).map(bare);
    const plain = renderCard({ ...c, noColor: true }).split('\n');
    assert.deepEqual(rows.slice(1), plain.slice(1), JSON.stringify(env));
    assert.ok(rows[0].endsWith('start-work · active 1m 30s'), rows[0]);
  }
});

// A grid of rows whose first `n` cells hold text.
const grid = (...ends) => ends.map((n) => Array.from({ length: 116 }, (_, x) => (x < n ? { ch: 'x' } : null)));

test('one long row moves the sun up, and long rows everywhere put it out; text on the right counts too', () => {
  assert.equal(place(grid(1, 1, 1, 1), 116).top, 1);
  assert.equal(place(grid(1, 1, 1, 100), 116).top, 0);
  assert.equal(place(grid(1, 100, 1, 1), 116).top, null);
  assert.equal(place(grid(1, 1), 116).top, null);
  const right = grid(1, 1, 1);
  right[0].fill({ ch: 'x' }, 80);
  const spot = place(right, 116);
  assert.ok(spot.at + SUN_W + 2 <= 80, 'it steps aside');
  for (const [r, row] of paint(spot, { t: 1 })) row.forEach((cell, x) => assert.ok(!cell || !right[r][x], 'no cell of text is painted'));
});

test('looks: four different lights', () => {
  const spot = place(grid(0, 0, 0), 116);
  const at = (o) => JSON.stringify([...paint(spot, o).get(2)].slice(spot.at, spot.at + SUN_W));
  assert.equal(new Set([{}, { look: 'turn' }, { look: 'rainbow' }, { dim: true }].map(at)).size, 4);
});

test('motion changes colours and ASCII only, keeps every width, and the resting pose is one picture', () => {
  const spot = place(grid(0, 0, 0), 116);
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

test('watch view: a frame that moves while working and holds still when idle, reduced or off', () => {
  const view = (c, { cols = 120, rows = 60, env = {} } = {}) => watchView(c, { env: { ...TC, ...noState, ...env }, stream: tty(cols, rows), version: V, now: NOW });
  for (const cols of [64, 80, 97, 120, 160]) {
    const frame = view(card(), { cols }).frame(2).map(bare);
    for (const [i, row] of frame.entries()) assert.match(row, i === 0 ? /^╭.*╮$/u : i === frame.length - 1 ? /^╰.*╯$/u : /^│.*│$/u);
    assert.ok(frame.some((row) => /▆{18}/u.test(row)), `${cols}: the sun`);
  }
  const moving = view(card());
  assert.equal(moving.moving, true);
  assert.notDeepEqual(moving.frame(1), moving.frame(1.25));
  for (const still of [view(idle()), view(card(), { env: { LITMUSE_MOTION: 'off' } }), view(card(), { env: { LITMUSE_MOTION: 'reduced' } }), view(card(), { env: { NO_COLOR: '1' } }), view(card(), { cols: 63 })]) assert.equal(still.moving, false);
  assert.ok(motionOff({ LITMUSE_MOTION: '0' }) && !motionOff({}) && !motionOff({ LITMUSE_MOTION: 'full' }));
  const plain = view(card(), { cols: 80, rows: 10, env: { NO_COLOR: '1' } }).frame(null);
  assert.equal(plain.join('\n'), renderCard({ ...card(), noColor: false }, { cols: 80 }), 'plain watch shows the plain card');
});

test('a pane too short for the card drops body rows, never the frame', () => {
  for (let rows = 2; rows <= 8; rows += 1) {
    const frame = watchView(card(), { env: { ...TC, ...noState }, stream: tty(100, rows), version: V, now: NOW }).frame(1).map(bare);
    assert.ok(frame.length <= rows);
    assert.match(frame[0], /^╭/u);
    assert.match(frame.at(-1), /^╰/u);
  }
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
  r.out.columns = 60;
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
