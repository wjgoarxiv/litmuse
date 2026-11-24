import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONO_ROWS, PIXEL_ROWS, SHARED_COLOURS, SPEC_DIGEST } from '../lib/synthwave-data.mjs';
import { CHROME, FALLBACK, colourDepth, litPill, markFor, markRows, markSize, pillLabel, pillWidth, sample, termColumns } from '../lib/mark.mjs';
import { renderCard } from '../lib/stage-card.mjs';
import { sandbox } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin', 'litmuse.mjs');
// The digest of the family synthwave spec rows, pinned here so the test needs nothing outside the repo.
const PINNED_DIGEST = 'f063a0cefb969db40c0fc436742240912d895d43c3013d35782320befc0a2b86';
const ESC = String.fromCharCode(27);
const SIZES = ['B-L', 'B-M', 'B-S'];
const visible = (row) => [...row.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'gu'), '')].length;

test('the generated rows hash to the pinned spec digest', () => {
  const rows = (map) => SIZES.map((s) => map[s].join('\n')).join('\n--\n');
  const digest = createHash('sha256').update(rows(PIXEL_ROWS)).update(JSON.stringify(SHARED_COLOURS)).update(rows(MONO_ROWS)).digest('hex');
  assert.equal(digest, PINNED_DIGEST);
  assert.equal(SPEC_DIGEST, PINNED_DIGEST);
  assert.deepEqual([...CHROME], ['#fff1e6', '#ffc29e', '#ff7a59', '#ffffff', '#ffd6e7', '#3b0a2a']);
  assert.equal(FALLBACK, 'LIT · muse code');
});

test('the size ladder follows the terminal width; unknown width counts as 80', () => {
  assert.equal(markSize(20), null);
  assert.equal(markSize(24), 'B-S');
  assert.equal(markSize(44), 'B-M');
  assert.equal(markSize(76), 'B-L');
  assert.equal(markSize(80), 'B-L');
  assert.equal(markSize(200), 'B-L');
  assert.equal(markSize(undefined), 'B-L');
  assert.deepEqual(markRows({ cols: 20, depth: 'truecolor' }), ['LIT · muse code']);
  assert.equal(termColumns({ env: {}, stream: {} }), 80);
  assert.equal(termColumns({ env: { COLUMNS: '44' }, stream: {} }), 44);
});

test('no row is wider than the terminal at any width from 20 to 200, in every depth', () => {
  for (const depth of ['truecolor', '256', 'none']) {
    for (let cols = 20; cols <= 200; cols += 1) {
      for (const row of markRows({ cols, depth })) assert.ok(visible(row) <= cols, `${depth} ${cols}: ${visible(row)}`);
    }
  }
});

test('colour off prints the mono rows exactly, then the plain centred tagline, with no ESC byte', () => {
  for (const [cols, size] of [[80, 'B-L'], [44, 'B-M'], [24, 'B-S']]) {
    const rows = markRows({ cols, depth: 'none' });
    assert.deepEqual(rows.slice(0, -1), MONO_ROWS[size]);
    assert.equal(rows.at(-1).trim(), 'LIT · muse code');
    assert.ok(!rows.join('\n').includes(ESC));
  }
  assert.ok(!markRows({ cols: 20, depth: 'none' }).join('').includes(ESC));
});

test('colour on draws two pixels per cell in the chosen depth', () => {
  const tc = markRows({ cols: 80, depth: 'truecolor' });
  assert.equal(tc.length, PIXEL_ROWS['B-L'].length / 2 + 1);
  assert.match(tc.join(''), /\[38;2;255;255;255/u, 'white edge');
  assert.match(tc.join(''), /▀/u);
  assert.doesNotMatch(tc.join(''), /;5;/u);
  const c256 = markRows({ cols: 80, depth: '256' }).join('');
  assert.match(c256, /\[(38|48);5;\d+/u);
  assert.doesNotMatch(c256, /;2;\d+;\d+;\d+/u);
  assert.equal(sample(CHROME, 0), CHROME[0]);
  assert.equal(sample(CHROME, 1), CHROME[5]);
});

test('colour depth: NO_COLOR, a pipe and a dumb terminal are off', () => {
  assert.equal(colourDepth({ env: { COLORTERM: 'truecolor', NO_COLOR: '1' }, isTTY: true }), 'none');
  assert.equal(colourDepth({ env: { COLORTERM: 'truecolor' }, isTTY: false }), 'none');
  assert.equal(colourDepth({ env: { TERM: 'dumb' }, isTTY: true }), 'none');
  assert.equal(colourDepth({ env: { COLORTERM: 'truecolor' }, isTTY: true }), 'truecolor');
  assert.equal(colourDepth({ env: { TERM: 'xterm-256color' }, isTTY: true }), '256');
  assert.equal(colourDepth({ env: { TERM: 'xterm' }, isTTY: true }), 'none');
});

test('the LIT pill exists only in truecolor and keeps the card headline inside its width', () => {
  assert.equal(litPill('1.2.3', '256'), null);
  assert.equal(litPill('1.2.3', 'none'), null);
  const pill = litPill('1.2.3', 'truecolor');
  assert.equal(pill.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'gu'), ''), pillLabel('1.2.3'));
  assert.match(pill, /\[1;38;2;11;14;20m/u, 'bold dark ink');
  assert.ok(pill.includes(`48;2;255;194;158m `), 'starts on chrome stop 1');
  assert.ok(pill.includes(`48;2;255;214;231m `), 'ends on chrome stop 4');
  const card = { active: true, route: 'lit-loop', activeMs: 1000, kind: 'ignite', plan: null, lanes: [], goal: null, now: 0 };
  const badge = { text: pill, width: pillWidth('1.2.3') };
  const on = renderCard(card, { badge, cols: 80 }).split('\n')[0];
  assert.ok(on.startsWith(pill));
  assert.ok(on.endsWith('lit-loop · active 1s'));
  assert.ok(visible(on) + 1 <= 80, 'the flame counts two cells');
  assert.equal(renderCard(card, { badge, cols: 20 }).split('\n')[0], 'LIT · lit-loop · active 1s', 'too narrow: plain headline');
  assert.equal(renderCard(card).split('\n')[0], 'LIT · lit-loop · active 1s', 'no badge: unchanged');
  assert.equal(renderCard({ ...card, noColor: true }, { badge, cols: 80 }).split('\n')[0], 'LIT · lit-loop · active 1s');
});

test('markFor: a terminal gets the art (colour, or the mono scene under NO_COLOR); a pipe gets the plain line', () => {
  const tty = { isTTY: true, columns: 80 };
  const mono = markFor({ env: { COLORTERM: 'truecolor', NO_COLOR: '1' }, stream: tty });
  assert.ok(mono.startsWith(`${MONO_ROWS['B-L'].join('\n')}\n`));
  assert.ok(!mono.includes(ESC));
  const colour = markFor({ env: { COLORTERM: 'truecolor' }, stream: tty });
  assert.match(colour, /▀/u);
  assert.ok(colour.includes(ESC));
  for (const stream of [{ isTTY: false, columns: 80 }, {}]) {
    for (const env of [{ COLORTERM: 'truecolor' }, { NO_COLOR: '1' }]) {
      assert.equal(markFor({ env, stream }), 'LIT · muse code\n');
    }
  }
});

test('the CLI: piped doctor and install print only the plain line; piped status --card and --json show none', () => {
  const { env, home } = sandbox();
  const plain = (out) => {
    assert.ok(out.startsWith('LIT · muse code\n'), out.slice(0, 200));
    assert.doesNotMatch(out, /[█▀▄░]/u);
    assert.ok(!out.includes(ESC));
  };
  const doctor = spawnSync(process.execPath, [BIN, 'doctor'], { env: { ...env, COLUMNS: '80', COLORTERM: 'truecolor' }, encoding: 'utf8' });
  plain(doctor.stdout);
  const json = spawnSync(process.execPath, [BIN, 'doctor', '--json'], { env, encoding: 'utf8' });
  assert.doesNotThrow(() => JSON.parse(json.stdout));
  const install = spawnSync(process.execPath, [BIN, 'install', '--dry-run'], { env: { ...env, COLUMNS: '44' }, encoding: 'utf8', input: '' });
  plain(install.stdout);
  assert.match(install.stdout, /LitMuse \S+ installer for Muse Code/u, 'the version line stays');
  const card = spawnSync(process.execPath, [BIN, 'status', '--card'], { env, cwd: home, encoding: 'utf8' });
  assert.equal(card.status, 0);
  assert.ok(card.stdout.startsWith('LIT · '), card.stdout);
  assert.ok(!card.stdout.includes('━') && !card.stdout.includes('🔥'));
});

test('nothing under plugin/ draws the mark: it stays out of hooks, context and commands', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  for (const file of walk(join(ROOT, 'plugin')).filter((f) => /\.(mjs|js|md|json)$/u.test(f))) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /lib\/mark\.mjs|synthwave-data/u, file);
  }
});
