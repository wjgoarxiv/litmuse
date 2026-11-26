import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { FONT_FILES, assertFontPath, fontFolder } from '../lib/guard.mjs';
import { ICON_FONT, addIconFont, iconFontPlan, removeIconFont, unzip } from '../lib/icon-font.mjs';
import { readConfig } from '../lib/config.mjs';
import { install } from '../lib/install.mjs';
import { uninstall } from '../lib/uninstall.mjs';
import { doctor } from '../lib/doctor.mjs';
import { paths } from '../lib/paths.mjs';
import { collect, sandbox, walk } from './helpers.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const FONT = Buffer.from('font bytes '.repeat(50));
const LICENSE = Buffer.from('licence text');

// A zip of `[name, bytes, deflated]` entries, with a small header block before each.
function zipOf(entries) {
  const local = [];
  const central = [];
  let at = 0;
  for (const [name, bytes, deflated] of entries) {
    const data = deflated ? deflateRawSync(bytes) : bytes;
    const head = Buffer.alloc(30 + name.length);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(name.length, 26);
    head.write(name, 30);
    const row = Buffer.alloc(46 + name.length);
    row.writeUInt32LE(0x02014b50, 0);
    row.writeUInt16LE(deflated ? 8 : 0, 10);
    row.writeUInt32LE(data.length, 20);
    row.writeUInt16LE(name.length, 28);
    row.writeUInt32LE(at, 42);
    row.write(name, 46);
    local.push(head, data);
    central.push(row);
    at += head.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(at, 16);
  return Buffer.concat([...local, ...central, end]);
}

const ZIP = zipOf([['readme.md', Buffer.from('x'), false], ['SymbolsNerdFontMono-Regular.ttf', FONT, true], ['LICENSE', LICENSE, false]]);
const PINS = { ...ICON_FONT, sha256: sha(ZIP), files: ICON_FONT.files.map((f) => ({ ...f, sha256: sha(f.name === FONT_FILES.font ? FONT : LICENSE) })) };
const never = () => assert.fail('downloaded');
const answer = (bytes, ok = true) => async () => ({ ok, status: ok ? 200 : 404, body: (async function* chunks() { yield bytes; }()) });

// A throwaway home with the archive beside it, and the options every run of it takes.
function box(platform = 'darwin', over = {}) {
  const { env, home } = sandbox();
  const archive = join(home, 'archive.zip');
  writeFileSync(archive, ZIP);
  const full = { ...env, LITMUSE_ICON_FONT_SOURCE: archive };
  const dir = fontFolder({ env: full, platform });
  const spawned = [];
  const hasFont = () => existsSync(join(dir ?? home, FONT_FILES.font)) && lstatSync(join(dir ?? home, FONT_FILES.font)).isFile();
  const font = { platform, pins: PINS, fetchImpl: never, hasFont, spawn: (...a) => { spawned.push(a); return {}; }, ...over };
  return { env: full, home, dir, font, spawned, add: (more = {}) => addIconFont({ env: full, ...font, ...more }), at: (key) => join(dir, FONT_FILES[key]) };
}

test('the pins are the release the family uses', () => {
  assert.equal(ICON_FONT.url, 'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.5.1/NerdFontsSymbolsOnly.zip');
  assert.equal(ICON_FONT.sha256, 'fdca3682534f6f65e1ccb2345b0362ccf67d9b8eca7c8025330946e93e2473bc');
  assert.deepEqual(ICON_FONT.files.map((f) => f.sha256), ['fe471e538392f51910faab985fa8e192a39dd3426125edd15b71b3680df0e749', '84a7a98c82140fb12c37fe42b93805baa16024cb3e5acc599b7ffe612c55d847']);
  assert.equal(ICON_FONT.maxBytes, 8 * 1024 * 1024);
});

test('the guard names exactly two font paths per platform and none on Windows', () => {
  const env = { HOME: '/h', XDG_DATA_HOME: '/d' };
  assert.equal(fontFolder({ env, platform: 'darwin' }), '/h/Library/Fonts');
  assert.equal(fontFolder({ env, platform: 'linux' }), '/d/fonts');
  assert.equal(fontFolder({ env: { HOME: '/h' }, platform: 'linux' }), '/h/.local/share/fonts');
  for (const XDG_DATA_HOME of ['data', './data', '']) assert.equal(fontFolder({ env: { HOME: '/h', XDG_DATA_HOME }, platform: 'linux' }), '/h/.local/share/fonts');
  assert.equal(fontFolder({ env, platform: 'win32' }), null);
  for (const name of Object.values(FONT_FILES)) {
    assert.equal(assertFontPath(join('/h/Library/Fonts', name), { env, platform: 'darwin' }), join('/h/Library/Fonts', name));
    for (const bad of [`/Library/Fonts/${name}`, `/h/Library/Fonts/a/${name}`, `/h/Library/Fonts/../${name}`, '/h/Library/Fonts/Other.ttf', '/h/Library/Fonts']) assert.throws(() => assertFontPath(bad, { env, platform: 'darwin' }), /refused/, bad);
    assert.throws(() => assertFontPath(join('/d/fonts', name), { env, platform: 'win32' }), /refused/);
    assert.throws(() => assertFontPath(`/x/.claude/fonts/${name}`, { env: { HOME: '/h', XDG_DATA_HOME: '/x/.claude' }, platform: 'linux' }), /refused/);
  }
});

test('it adds both files once, lists them, and refreshes the font cache on Linux', async () => {
  for (const platform of ['darwin', 'linux']) {
    const b = box(platform);
    const first = await b.add();
    assert.equal(first.status, 'added');
    assert.deepEqual(readFileSync(b.at('font')), FONT);
    assert.deepEqual(readFileSync(b.at('license')), LICENSE);
    assert.deepEqual(JSON.parse(readFileSync(paths(b.env).iconFont, 'utf8')).files.map((f) => f.path), [b.at('font'), b.at('license')]);
    assert.deepEqual(readdirSync(paths(b.env).data), ['icon-font.json'], 'no temporary file is left');
    assert.deepEqual(b.spawned.map((a) => a.slice(0, 2)), platform === 'linux' ? [['fc-cache', ['-f', b.dir]]] : []);
    assert.equal((await b.add()).status, 'here');
  }
});

test('an icon font that is already here means nothing is added or fetched', async () => {
  const b = box('darwin', { hasFont: () => true });
  const before = walk(b.home);
  assert.deepEqual(await b.add(), { status: 'here', written: [] });
  assert.deepEqual(walk(b.home), before);
});

test('Windows gets no font', async () => {
  const b = box('win32', { hasFont: () => false });
  assert.equal((await b.add()).status, 'unsupported');
  assert.match(iconFontPlan({ env: b.env, ...b.font }), /Windows/);
});

test('what is already at the place is never replaced and never followed', async () => {
  const link = box();
  mkdirSync(link.dir, { recursive: true });
  symlinkSync(join(link.home, 'victim.ttf'), link.at('font'));
  const refused = await link.add({ env: { ...link.env, LITMUSE_ICON_FONT_SOURCE: '' } });
  assert.equal(refused.status, 'failed');
  assert.match(refused.why, /something else is already at/);
  assert.equal(existsSync(join(link.home, 'victim.ttf')), false);

  const folder = box();
  mkdirSync(join(folder.home, 'Library'), { recursive: true });
  mkdirSync(join(folder.home, 'elsewhere'));
  symlinkSync(join(folder.home, 'elsewhere'), folder.dir);
  assert.match((await folder.add()).why, /is a link/);
  assert.deepEqual(readdirSync(join(folder.home, 'elsewhere')), []);

  // A linked parent folder is refused on the way in, and left alone on the way out.
  for (const [platform, linked] of [['darwin', 'Library'], ['linux', '.local']]) {
    const parent = box(platform);
    const env = { ...parent.env, XDG_DATA_HOME: join(parent.home, 'data') };
    const bare = platform === 'linux' ? { ...env, XDG_DATA_HOME: undefined } : env;
    mkdirSync(join(parent.home, 'elsewhere'));
    symlinkSync(join(parent.home, 'elsewhere'), join(parent.home, linked));
    const r = await parent.add({ env: bare, hasFont: () => false });
    assert.deepEqual([r.status, r.why.endsWith(`${linked} is a link`)], ['failed', true], r.why);
    assert.deepEqual(readdirSync(join(parent.home, 'elsewhere')), []);
  }
  const named = box('linux');
  const data = join(named.home, 'linked-data');
  mkdirSync(join(named.home, 'elsewhere'));
  symlinkSync(join(named.home, 'elsewhere'), data);
  for (const value of [data, `${data}/`, `${data}/.`]) {
    assert.match((await named.add({ env: { ...named.env, XDG_DATA_HOME: value }, hasFont: () => false })).why, /linked-data is a link/, value);
  }
  for (const XDG_DATA_HOME of ['data', './data']) assert.equal(paths({ HOME: named.home, XDG_DATA_HOME }).iconFont, join(named.home, '.local', 'share', 'litmuse', 'icon-font.json'));
  const later = box();
  await later.add();
  renameSync(join(later.home, 'Library'), join(later.home, 'moved'));
  symlinkSync(join(later.home, 'moved'), join(later.home, 'Library'));
  assert.deepEqual(removeIconFont({ env: later.env, platform: 'darwin' }).remove, []);
  assert.equal(readdirSync(join(later.home, 'moved', 'Fonts')).length, 2);

  // An identical licence that someone else put there is left alone and is not owned.
  const same = box();
  mkdirSync(same.dir, { recursive: true });
  writeFileSync(same.at('license'), LICENSE);
  assert.equal((await same.add()).status, 'added');
  assert.deepEqual(JSON.parse(readFileSync(paths(same.env).iconFont, 'utf8')).files.map((f) => f.path), [same.at('font')]);
  await uninstall({ env: same.env, flags: { yes: true }, print: () => {}, font: { platform: 'darwin' } });
  assert.deepEqual(readdirSync(same.dir), [FONT_FILES.license]);
});

test('a bad archive, a failed or oversized download and a full failure leave nothing behind', async () => {
  const cases = {
    'pinned SHA-256': (b) => { writeFileSync(b.env.LITMUSE_ICON_FONT_SOURCE, Buffer.concat([ZIP, Buffer.from('x')])); return {}; },
    'HTTP 404': (b) => ({ env: { ...b.env, LITMUSE_ICON_FONT_SOURCE: undefined }, fetchImpl: answer(ZIP, false) }),
    'larger than 8 MiB': (b) => ({ env: { ...b.env, LITMUSE_ICON_FONT_SOURCE: undefined }, fetchImpl: answer(Buffer.alloc(PINS.maxBytes + 1)) }),
    'longer than 60 seconds': (b) => ({ env: { ...b.env, LITMUSE_ICON_FONT_SOURCE: undefined }, fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); } }),
    'not a regular file': (b) => ({ env: { ...b.env, LITMUSE_ICON_FONT_SOURCE: b.home } }),
    'in the archive does not match': () => ({ pins: { ...PINS, files: PINS.files.map((f) => ({ ...f, sha256: sha('other') })) } }),
  };
  for (const [why, arrange] of Object.entries(cases)) {
    const b = box();
    const r = await b.add(arrange(b));
    assert.deepEqual([r.status, r.written], ['failed', []], why);
    assert.ok(r.why.includes(why), `${why}: ${r.why}`);
    assert.equal(existsSync(b.dir), false, why);
    assert.equal(existsSync(paths(b.env).iconFont), false, why);
  }
  // The list cannot be written, so the files just added go again.
  const b = box();
  mkdirSync(paths(b.env).iconFont, { recursive: true });
  assert.equal((await b.add()).status, 'failed');
  assert.deepEqual(readdirSync(b.dir), []);
  const good = box();
  assert.equal((await good.add({ env: { ...good.env, LITMUSE_ICON_FONT_SOURCE: undefined }, fetchImpl: answer(ZIP) })).status, 'added');
  assert.throws(() => unzip(Buffer.from('no'), []), /not a zip/);
});

test('a disk that fills up while the font is written leaves no file', async () => {
  const b = box();
  const write = (path) => {
    writeFileSync(path, 'part');
    throw Object.assign(new Error('full'), { code: 'ENOSPC' });
  };
  const r = await b.add({ write });
  assert.deepEqual([r.status, r.why], ['failed', 'ENOSPC']);
  assert.deepEqual(readdirSync(b.dir), []);
  assert.deepEqual(readdirSync(paths(b.env).data), []);
});

test('the download stops after 60 seconds, while the body is still coming too', async (t) => {
  const limit = new AbortController();
  const asked = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    asked.push(ms);
    return limit.signal;
  });
  const b = box();
  const fetchImpl = async (_url, { signal }) => ({ ok: true, body: (async function* slow() {
    yield ZIP.subarray(0, 10);
    limit.abort(new DOMException('timed out', 'TimeoutError'));
    signal.throwIfAborted();
    yield ZIP.subarray(10);
  }()) });
  const r = await b.add({ env: { ...b.env, LITMUSE_ICON_FONT_SOURCE: undefined }, fetchImpl });
  assert.deepEqual([asked, r.status, r.why], [[60_000], 'failed', 'the download took longer than 60 seconds']);
  assert.equal(existsSync(b.dir), false);
});

const go = async (b, flags, over = {}) => {
  const out = collect();
  const code = await install({ env: b.env, flags, interactive: false, print: out.print, tty: false, font: b.font, ...over });
  return { code, text: out.text(), last: out.lines.at(-1) };
};

test('install --yes --round adds the font and says check; a plain rerun keeps the saved choice', async () => {
  const b = box();
  const plain = await go(b, { yes: true });
  assert.match(plain.last, /^ROUND_ENDS: square \(no icon font; run npx .* --round\)$/);
  assert.equal(existsSync(b.dir), false, 'no font without --round');
  const first = await go(b, { yes: true, round: true });
  assert.equal(first.code, 0);
  assert.match(first.text, /^ICON_FONT: added .*SymbolsNerdFontMono-Regular\.ttf$/m);
  assert.match(first.last, /^ROUND_ENDS: check \(an icon font is here, .*; show your user the pill .*\)$/);
  const receipt = JSON.parse(readFileSync(paths(b.env).receipt, 'utf8'));
  assert.ok(receipt.written.includes(b.at('font')));
  const saved = await go(b, { yes: true, glyphs: 'round' });
  assert.equal(saved.last, 'ROUND_ENDS: shown');
  assert.match(saved.text, /^GLYPHS: saved round$/m);
  assert.equal((await go(b, { yes: true })).last, 'ROUND_ENDS: shown', 'a second run keeps the choice');
  assert.match((await go(b, { yes: true, round: true })).text, /ICON_FONT: an icon font is already here; nothing added/);
  assert.equal(readConfig(b.env).glyphs, 'round');
  assert.match((await go(b, { yes: true, glyphs: 'square' })).last, /square \(choice is square; run .*--glyphs auto\)/);
  assert.match((await go(b, { yes: true, glyphs: 'auto' })).last, /check/);
});

test('a font that cannot be added never fails the install', async () => {
  const b = box();
  writeFileSync(b.env.LITMUSE_ICON_FONT_SOURCE, 'nothing');
  const r = await go(b, { yes: true, round: true });
  assert.equal(r.code, 0);
  assert.match(r.text, /^ICON_FONT: not installed \(the archive does not match its pinned SHA-256\)$/m);
  assert.match(r.last, /^ROUND_ENDS: square \(font not installed \(.*SHA-256\); run .* --round again\)$/);
});

test('a dry run and a preview name the file and the folder and change nothing', async () => {
  const b = box();
  const before = walk(b.home);
  for (const flags of [{ dryRun: true, round: true, glyphs: 'round' }, { round: true, glyphs: 'round' }]) {
    const r = await go(b, flags);
    assert.match(r.text, /icon font +add SymbolsNerdFontMono-Regular\.ttf .* to .*Library\/Fonts, from .*archive\.zip/);
    assert.match(r.text, /round ends +save round in /);
  }
  assert.deepEqual(walk(b.home).filter((f) => f !== 'muse-calls.jsonl'), before);
  assert.match(iconFontPlan({ env: b.env, ...b.font, hasFont: () => true }), /nothing is added/);
  assert.ok(iconFontPlan({ env: { HOME: b.home }, ...b.font }).endsWith(`downloaded from ${ICON_FONT.url}`));
});

test('uninstall removes only what LitMuse added and left unchanged, and says what that means', async () => {
  const gone = box();
  await go(gone, { yes: true, round: true });
  const dry = collect();
  await uninstall({ env: gone.env, flags: { dryRun: true }, print: dry.print, font: { platform: 'darwin' } });
  assert.match(dry.text(), /icon font +remove .*SymbolsNerdFontMono-Regular\.ttf/);
  assert.ok(existsSync(gone.at('font')));
  const out = collect();
  await uninstall({ env: gone.env, flags: { yes: true }, print: out.print, font: { platform: 'darwin' } });
  assert.deepEqual(readdirSync(gone.dir), []);
  assert.match(out.text(), /Icon font: removed .*other products may draw square ends/);
  assert.equal(existsSync(paths(gone.env).iconFont), false);

  const edited = box();
  await go(edited, { yes: true, round: true });
  writeFileSync(edited.at('font'), 'mine now');
  const list = paths(edited.env).iconFont;
  const manifest = JSON.parse(readFileSync(list, 'utf8'));
  const outside = join(edited.home, 'outside.ttf');
  writeFileSync(outside, 'x');
  writeFileSync(list, JSON.stringify({ files: [...manifest.files, { path: outside, sha256: sha('x') }] }));
  const kept = collect();
  await uninstall({ env: edited.env, flags: { yes: true }, print: kept.print, font: { platform: 'darwin' } });
  assert.deepEqual(readdirSync(edited.dir), [FONT_FILES.font]);
  assert.ok(existsSync(outside), 'a path LitMuse does not write is never removed');
  assert.match(kept.text(), /Icon font: kept .*SymbolsNerdFontMono-Regular\.ttf/);
});

test('doctor ends with the same line', async () => {
  const { env } = sandbox();
  const out = collect();
  await doctor({ env, flags: {}, print: out.print });
  assert.match(out.lines.at(-1), /^ROUND_ENDS: square \(no surface enabled; run npx .* install --yes --round\)$/);
  await install({ env, flags: { yes: true, glyphs: 'round' }, print: () => {}, tty: false });
  const after = collect();
  await doctor({ env, flags: {}, print: after.print });
  assert.equal(after.lines.at(-1), 'ROUND_ENDS: shown');
});
