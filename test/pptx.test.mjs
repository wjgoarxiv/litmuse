import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

// A solid-colour-ramp PNG, written here so the tests need no image files in the repository.
const png = (w, h, rgb) => {
  const raw = Buffer.concat(Array.from({ length: h }, (_, y) => {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(rgb[c] * (0.6 + (0.4 * (x + y)) / (w + h)));
    return row;
  }));
  const chunk = (type, data) => {
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

// The examples name three pictures the user supplies; the test draws flat ones of the same shape.
const exampleAssets = (dir) => {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'example-a.png'), png(480, 270, [90, 120, 150]));
  writeFileSync(join(dir, 'assets', 'example-b.png'), png(400, 300, [150, 120, 90]));
  writeFileSync(join(dir, 'assets', 'example-c.png'), png(300, 400, [110, 140, 110]));
};
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRoute } from '../plugin/hooks/lib/routes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PPTX = join(ROOT, 'plugin', 'skills', 'lit-pptx');
const COMPILE = join(PPTX, 'scripts', 'compile-deck.js');
const REGISTRY = join(PPTX, 'scripts', 'lib', 'template-registry.js');
const QA_DECK = join(PPTX, 'scripts', 'qa_deck.py');
const EXAMPLES = join(PPTX, 'references', 'examples');

const TONALITIES = ['atlas', 'bauhaus', 'chalk', 'computational-brutalism', 'gazette', 'ledger',
  'neo-brutalism', 'newsroom', 'night', 'paper', 'riso', 'signal', 'studio'];

const compile = (args, cwd) => spawnSync(process.execPath, [COMPILE, ...args], { cwd, encoding: 'utf8' });
const registryProbe = (snippet, env = {}) => spawnSync(process.execPath, ['-e', `
  const r = require(${JSON.stringify(REGISTRY)});
  ${snippet}`], { encoding: 'utf8', env: { ...process.env, ...env } });

test('lit-pptx: --list-tonalities names the thirteen tonalities and the four legacy templates', () => {
  const listed = compile(['--list-tonalities'], ROOT);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual([...listed.stdout.matchAll(/^([a-z-]+) — /gmu)].map((m) => m[1]), TONALITIES);
  for (const name of ['AZURE-PRO', 'AZURE-A2Z', 'BOILERPLATE-PRETENDARD', 'BOILERPLATE-A2Z']) {
    assert.match(listed.stdout, new RegExp(`^${name} \\(legacy template\\)$`, 'mu'));
  }
});

test('lit-pptx: every pack loads with families, variants, density 10 and the hero step on', () => {
  const out = registryProbe(`console.log(JSON.stringify(r.listTonalities().map((id) => {
    const p = r.loadTonality(id).pack;
    return { id: p.id, density: p.density, hero: p.hero, register: p.register || null,
      ramp: p.ramp, edge: p.edge, shadow: p.shadow || null, qa: p.qa || {},
      families: p["layout-families"], covers: p.covers, sections: p.sections,
      closings: p.closings, treatments: p.treatments };
  })))`);
  assert.equal(out.status, 0, out.stderr);
  for (const p of JSON.parse(out.stdout)) {
    assert.ok(p.families.length > 0, `${p.id} layout families`);
    assert.ok(p.covers.length >= 3, `${p.id} covers`);
    assert.ok(p.sections.length >= 2, `${p.id} sections`);
    assert.ok(p.closings.length >= 2, `${p.id} closings`);
    assert.equal(p.density, 10, `${p.id} density`);
    assert.equal(p.hero, true, `${p.id} hero on`);
    const layouts = compile(['--list-layouts', p.id], ROOT);
    assert.equal(layouts.status, 0, layouts.stderr);
    for (const family of p.families) assert.match(layouts.stdout, new RegExp(`^  ${family} \\[`, 'mu'), `${p.id} ${family}`);
  }
  const byId = Object.fromEntries(JSON.parse(out.stdout).map((p) => [p.id, p]));
  assert.equal(byId['neo-brutalism'].register, 'bold', 'neo-brutalism is the bold register');
  assert.equal(byId['neo-brutalism'].ramp, 'presented', 'neo-brutalism presented ramp');
  for (const id of TONALITIES.filter((t) => t !== 'neo-brutalism')) {
    assert.equal(byId[id].register, null, `${id} keeps the report register`);
    assert.equal(byId[id].ramp, 'reading', `${id} keeps the reading ramp`);
  }
  assert.deepEqual(byId['neo-brutalism'].shadow, { offset: 6, colour: 'ink' }, 'neo-brutalism hard shadow');
  assert.deepEqual(byId['neo-brutalism'].qa, { 'offset-shadow': true }, 'neo-brutalism qa allowance');
  for (const id of TONALITIES.filter((t) => t !== 'neo-brutalism')) {
    assert.deepEqual(byId[id].qa, {}, `${id} needs no qa allowance`);
  }
});

test('lit-pptx: an unknown tonality is refused by name', () => {
  const unknown = compile(['--list-layouts', 'wobble'], ROOT);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown tonality or template "wobble"\. Tonalities: atlas, bauhaus, chalk/u);
});

test('lit-pptx: no two tonalities share both their title treatments and their layout families', () => {
  const out = registryProbe(`console.log(JSON.stringify(r.listTonalities().map((id) => {
    const p = r.loadPack(id);
    return [...p.treatments].sort().join(",") + "|" + [...p["layout-families"]].sort().join(",");
  })))`);
  assert.equal(out.status, 0, out.stderr);
  const keys = JSON.parse(out.stdout);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert.notEqual(keys[i], keys[j], `${TONALITIES[i]} and ${TONALITIES[j]}`);
    }
  }
});

test('lit-pptx: a pack with a missing role, an out-of-range dial or a body colour below 4.5:1 is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-pptx-pack-'));
  try {
    const source = readFileSync(join(PPTX, 'templates', 'tonalities', 'ledger', 'pack.yaml'), 'utf8');
    const plant = (id, edit) => {
      mkdirSync(join(dir, id), { recursive: true });
      writeFileSync(join(dir, id, 'pack.yaml'), edit(source.replace('id: ledger', `id: ${id}`)));
    };
    plant('no-ink', (s) => s.replace(/^ {2}ink: .*\n/mu, ''));
    plant('dense-eleven', (s) => s.replace(/^density: \d+$/mu, 'density: 11'));
    plant('a2z-default', (s) => s.replace(/^faces:\n {2}display: Pretendard Bold$/mu, 'faces:\n  display: A2Z Bold'));
    plant('grey-ink', (s) => s.replace(/^ {2}ink: .*$/mu, '  ink: "#B0B0B0"'));
    const load = (id) => registryProbe(
      `try { r.loadPack(${JSON.stringify(id)}); console.log("loaded"); } catch (e) { console.log(e.message); }`,
      { LIT_PPTX_TONALITY_DIRS: dir }).stdout;
    assert.match(load('no-ink'), /palette\.ink is missing/u);
    assert.match(load('dense-eleven'), /density must be an integer 1-10/u);
    assert.match(load('a2z-default'), /faces\.display must name a bundled face \(Pretendard Regular or Bold, or JetBrains Mono Regular or Bold\)/u);
    assert.match(load('grey-ink'), /ink on ground is [\d.]+:1, below 4\.5:1/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lit-pptx: a hard edge, a shadow, a qa allowance or grid marks out of bounds, and a mono body, are refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-pptx-pack-'));
  try {
    const neo = readFileSync(join(PPTX, 'templates', 'tonalities', 'neo-brutalism', 'pack.yaml'), 'utf8');
    const mono = readFileSync(join(PPTX, 'templates', 'tonalities', 'computational-brutalism', 'pack.yaml'), 'utf8');
    const plant = (id, source, from, edit) => {
      mkdirSync(join(dir, id), { recursive: true });
      writeFileSync(join(dir, id, 'pack.yaml'), edit(source.replace(`id: ${from}`, `id: ${id}`)));
    };
    plant('heavy-edge', neo, 'neo-brutalism', (s) => s.replace(/^edge-weight: .*$/mu, 'edge-weight: 6'));
    plant('far-shadow', neo, 'neo-brutalism', (s) => s.replace(/^ {2}offset: 6$/mu, '  offset: 14'));
    plant('pink-shadow', neo, 'neo-brutalism', (s) => s.replace(/^ {2}colour: ink$/mu, '  colour: hotpink'));
    plant('flat-shadow', neo, 'neo-brutalism', (s) => s.replace(/^edge: .*$/mu, 'edge: fill'));
    plant('loose-qa', neo, 'neo-brutalism', (s) => s.replace(/^ {2}offset-shadow: true$/mu, '  offset-shadow: true\n  contrast: 2'));
    plant('wide-qa', neo, 'neo-brutalism', (s) => s.replace(/^ {2}offset-shadow: true$/mu, '  offset-shadow: true\n  accent-families: 9'));
    plant('narrow-qa', neo, 'neo-brutalism', (s) => s.replace(/^ {2}offset-shadow: true$/mu, '  offset-shadow: true\n  accent-families: 3'));
    plant('no-shadow', neo, 'neo-brutalism', (s) => s.replace(/^shadow:\n {2}offset: 6\n {2}colour: ink\n/mu, ''));
    plant('banded-marks', mono, 'computational-brutalism', (s) => s.replace(/^treatments: \[top-rule, /mu, 'treatments: [band, top-rule, '));
    plant('mono-body', mono, 'computational-brutalism', (s) => s.replace(/^ {2}body: Pretendard Regular$/mu, '  body: JetBrains Mono Regular'));
    plant('loud-report', neo, 'neo-brutalism', (s) => s.replace(/^register: bold\n/mu, ''));
    plant('odd-register', neo, 'neo-brutalism', (s) => s.replace(/^register: bold$/mu, 'register: shouty'));
    const load = (id) => registryProbe(
      `try { r.loadPack(${JSON.stringify(id)}); console.log("loaded"); } catch (e) { console.log(e.message); }`,
      { LIT_PPTX_TONALITY_DIRS: dir }).stdout;
    assert.match(load('heavy-edge'), /edge-weight must be 0\.5-4 pt/u);
    assert.match(load('far-shadow'), /shadow\.offset must be 3-10 pt/u);
    assert.match(load('pink-shadow'), /shadow\.colour must name a palette role/u);
    assert.match(load('flat-shadow'), /a shadow needs a bordered edge \(border or fill\+border\)/u);
    assert.match(load('loose-qa'), /unknown qa allowance "contrast" \(known: accent-families, display-accent-families, offset-shadow\)/u);
    assert.match(load('wide-qa'), /qa\.accent-families is out of range/u);
    assert.match(load('narrow-qa'), /qa\.accent-families is out of range/u);
    assert.match(load('no-shadow'), /qa\.offset-shadow needs a shadow/u);
    assert.match(load('banded-marks'), /grid-marks needs the top margin on the ground \(no band treatment, no rail-fill\)/u);
    assert.match(load('mono-body'), /faces\.body must be a face that sets Hangul/u);
    assert.match(load('loud-report'), /presented type needs register: bold; a report pack keeps ramp: reading/u);
    assert.match(load('odd-register'), /register must be report or bold/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lit-pptx: extra decoration kinds and the calm hero opt-out come from the deck front matter', () => {
  const run = registryProbe(`const base = r.loadTonality("paper").pack;
const more = r.loadTonality("paper", { decoration: "numeral, column-hairlines" }).pack;
const calm = r.loadTonality("paper", { hero: "false" }).pack;
const tryLoad = (id, decoration) => { try { r.loadTonality(id, { decoration }); return "loaded"; } catch (e) { return e.message; } };
console.log(JSON.stringify({ base: base.decoration, more: more.decoration, hero: [base.hero, calm.hero], unknown: tryLoad("paper", "sparkles"), marks: tryLoad("ledger", "grid-marks") }));`);
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.ok(!out.base.includes('numeral'), 'paper draws no numeral by itself');
  assert.deepEqual(out.more, [...new Set([...out.base, 'numeral', 'column-hairlines'])], 'front matter adds to the pack list');
  assert.deepEqual(out.hero, [true, false], 'hero: false is the calm opt-out');
  assert.match(out.unknown, /decoration "sparkles" is not a known kind/u);
  assert.match(out.marks, /grid-marks needs the top margin on the ground/u);
});

test('lit-pptx: a deck asked for by slide count routes to lit-pptx, a bare count does not', () => {
  for (const prompt of [
    'lit 신규 서비스 투자 피칭 덱 10장, 네오 브루탈리즘 스타일로',
    'lit 사내 플랫폼 아키텍처 리뷰 발표자료 9장, 컴퓨테이셔널 브루탈리즘 스타일로',
    'lit 디자인사 강의 슬라이드 12장 바우하우스 느낌으로',
    'lit a 10-slide launch deck in a neo-brutalist style',
    'lit notes.md 메모 파일로 월요일 팀 회의용 슬라이드 10장 만들어줘',
  ]) {
    assert.equal(detectRoute(prompt)?.route, 'lit-pptx', prompt);
  }
  // A count alone is not a deck: no slide noun, no route to lit-pptx.
  assert.notEqual(detectRoute('lit 사진 10장 보정 스타일로')?.route, 'lit-pptx');
});

test('lit-pptx: seventeen examples cover all thirteen tonalities and compile to an AST', () => {
  const table = readFileSync(join(PPTX, 'references', 'direction-step.md'), 'utf8');
  const rows = [...table.matchAll(/^\| `(\d\d-[a-z0-9-]+\.md)` \| ([^|]+) \| ([^|]+) \|/gmu)];
  assert.equal(rows.length, 17, 'direction-step lists seventeen examples');
  const byTonality = {};
  for (const [, file, deckType] of rows) {
    const path = join(EXAMPLES, file);
    assert.ok(existsSync(path), `${file} exists`);
    const source = readFileSync(path, 'utf8');
    const tonality = /^tonality: ([a-z-]+)$/mu.exec(source)?.[1];
    assert.ok(tonality, `${file} names its tonality`);
    assert.ok(TONALITIES.includes(tonality), `${file} tonality ${tonality} is one of thirteen`);
    assert.ok(deckType.trim().length > 3, `${file} names its deck type`);
    (byTonality[tonality] ??= []).push(file);
    assert.ok(existsSync(join(PPTX, 'references', 'tonalities', `${tonality}.md`)), `${tonality} sheet exists`);
    const dir = mkdtempSync(join(tmpdir(), 'litmuse-pptx-ast-'));
    try {
      const ast = compile([path, '--ast', join(dir, 'ast.json')], dir);
      assert.equal(ast.status, 0, `${file}: ${ast.stderr}`);
      assert.ok(JSON.parse(readFileSync(join(dir, 'ast.json'), 'utf8')).slides.length >= 3, `${file} has slides`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(Object.keys(byTonality).sort(), [...TONALITIES].sort(), 'every tonality has an example');
});

// The rest drives the real engine. It needs the pinned office runtime
// (`litmuse runtime install office` pre-warms it) with python-pptx inside.
const officeStatus = (() => {
  try {
    return JSON.parse(spawnSync(process.execPath,
      [join(ROOT, 'plugin', 'lib', 'office-runtime.mjs'), 'status', '--json'],
      { encoding: 'utf8' }).stdout);
  } catch { return { ready: false }; }
})();
const runtimePython = officeStatus?.ready
  ? join(officeStatus.python.dir, 'bin', 'python') : null;
const runtimeReady = !!runtimePython
  && spawnSync(runtimePython, ['-c', 'import pptx'], { encoding: 'utf8' }).status === 0;

test('lit-pptx: one sample per tonality compiles and passes the QA gate', { skip: runtimeReady ? false : 'office runtime not installed' }, () => {
  const samples = [
    ['01-pitch-signal-ko.md', 'signal'], ['02-pitch-studio-ko.md', 'studio'],
    ['03-business-review-ledger-ko.md', 'ledger'], ['04-business-review-night-en.md', 'night'],
    ['05-research-talk-paper-en.md', 'paper'], ['06-lecture-chalk-ko.md', 'chalk'],
    ['08-image-led-atlas-ko.md', 'atlas'], ['09-briefing-gazette-ko.md', 'gazette'],
    ['13-engineering-review-computational-brutalism-ko.md', 'computational-brutalism'],
    ['14-launch-pitch-neo-brutalism-ko.md', 'neo-brutalism'],
    ['15-design-lecture-bauhaus-ko.md', 'bauhaus'],
    ['16-community-programme-riso-ko.md', 'riso'],
    ['17-public-data-briefing-newsroom-ko.md', 'newsroom'],
  ];
  assert.equal(new Set(samples.map(([, t]) => t)).size, 13, 'thirteen tonalities, one sample each');
  for (const [file, tonality] of samples) {
    const dir = mkdtempSync(join(tmpdir(), 'litmuse-pptx-run-'));
    try {
      exampleAssets(dir);
      copyFileSync(join(EXAMPLES, file), join(dir, file));
      const built = compile([join(dir, file), '--tonality', tonality, '--pptx', join(dir, 'deck.pptx')], dir);
      assert.equal(built.status, 0, `${file}: ${built.stderr}${built.stdout}`);
      const gate = spawnSync(runtimePython, ['-B', QA_DECK, join(dir, 'deck.pptx')], { cwd: dir, encoding: 'utf8' });
      const report = JSON.parse(gate.stdout);
      assert.equal(gate.status, 0, `${file}: ${JSON.stringify(report.failure_reasons)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('lit-pptx: two tonalities of one source place titles and bodies alike (OF-116 via --sibling)', { skip: runtimeReady ? false : 'office runtime not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-pptx-sib-'));
  try {
    exampleAssets(dir);
    copyFileSync(join(EXAMPLES, '14-launch-pitch-neo-brutalism-ko.md'), join(dir, 'deck.md'));
    // Display covers carry each pack's own composition, so the sibling pair is content only.
    const chunks = readFileSync(join(dir, 'deck.md'), 'utf8').split('\n---\nlayout: ');
    const content = [chunks[0], ...chunks.slice(1).filter((chunk) => !/^(cover|section|closing)/u.test(chunk))].join('\n---\nlayout: ');
    writeFileSync(join(dir, 'content.md'), content);
    const outs = {};
    for (const tonality of ['neo-brutalism', 'signal']) {
      const out = join(dir, `${tonality}.pptx`);
      const built = compile([join(dir, 'content.md'), '--tonality', tonality, '--pptx', out], dir);
      assert.equal(built.status, 0, `${tonality}: ${built.stderr}`);
      outs[tonality] = out;
    }
    const pair = spawnSync(runtimePython, ['-B', QA_DECK, outs['neo-brutalism'], '--sibling', outs.signal], { cwd: dir, encoding: 'utf8' });
    const pairReport = JSON.parse(pair.stdout);
    assert.deepEqual(pairReport.craft_floor.findings.filter((f) => f.check === 'OF-116'), [], 'sibling placements agree');
    assert.equal(pair.status, 0, JSON.stringify(pairReport.failure_reasons));
    // One tonality that moves a content title down is reported against the other.
    const moved = join(dir, 'moved.pptx');
    copyFileSync(outs['neo-brutalism'], moved);
    const plant = spawnSync(runtimePython, ['-B', '-c', `
import sys
from pptx import Presentation
from pptx.util import Pt
prs = Presentation(sys.argv[1])
t = next(x for x in prs.slides[1].shapes if x.name.startswith("title@"))
t.top = t.top + Pt(30)
prs.save(sys.argv[1])
`, moved ], { encoding: 'utf8' });
    assert.equal(plant.status, 0, plant.stderr);
    const movedGate = spawnSync(runtimePython, ['-B', QA_DECK, moved, '--sibling', outs.signal], { cwd: dir, encoding: 'utf8' });
    const movedReport = JSON.parse(movedGate.stdout);
    const hit = movedReport.craft_floor.findings.filter((f) => f.check === 'OF-116');
    assert.equal(hit.length, 1, JSON.stringify(hit));
    assert.equal(hit[0].severity, 'HIGH');
    assert.match(hit[0].detail, /slide 2 title at/u);
    assert.notEqual(movedGate.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
