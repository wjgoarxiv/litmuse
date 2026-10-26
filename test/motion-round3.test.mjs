// Wave 6 (motion end state): the ported round-2/3 surface — house styles, board, scaffold,
// assets, Blender rung, layered score, the restored treatment rules, preview done and CLI argv.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { ENGINE, motionCli, stageFilm } from './motion-helpers.mjs';

const scratch = (name) => mkdtempSync(join(tmpdir(), `litmuse-${name}-`));
const writeTreatment = (out, t) => {
  mkdirSync(join(out, 'stage'), { recursive: true });
  writeFileSync(join(out, 'treatment.json'), `${JSON.stringify(t, null, 2)}\n`);
  return out;
};

const { validateTreatment } = await import(join(ENGINE, 'node', 'treatment.mjs'));
const styles = await import(join(ENGINE, 'node', 'styles.mjs'));
const house = await import(join(ENGINE, 'node', 'house.mjs'));
const board = await import(join(ENGINE, 'node', 'board.mjs'));
const gallery = await import(join(ENGINE, 'node', 'gallery.mjs'));
const scaffold = await import(join(ENGINE, 'node', 'scaffold.mjs'));
const assets = await import(join(ENGINE, 'node', 'assets.mjs'));
const blender = await import(join(ENGINE, 'node', 'blender.mjs'));
const score = await import(join(ENGINE, 'node', 'score.mjs'));
const sound = await import(join(ENGINE, 'node', 'sound.mjs'));
const done = await import(join(ENGINE, 'node', 'done.mjs'));

test('motion styles: four shipped styles validate, and the picker follows request, house, keyword, genre', () => {
  for (const id of styles.STYLE_IDS) {
    const s = styles.readStyle(id);
    assert.equal(s.id, id);
    assert.ok(s.transitions.length >= 2);
  }
  assert.throws(() => styles.readStyle('neon'), /unknown style/);
  assert.equal(styles.pickStyle({ request: 'a terminal film', path: 'stage' }).id, 'terminalcore');
  assert.equal(styles.pickStyle({ request: 'plain clip', path: 'stage', house: { style: 'tidal' } }).source, 'house');
  assert.equal(styles.pickStyle({ request: 'an explainer', genre: 'explainer', path: 'stage' }).id, 'paper');
  assert.equal(styles.pickStyle({ request: 'plain clip', path: 'stage' }).id, 'swiss-signal');
  assert.equal(styles.pickStyle({ request: 'plain clip', path: 'type' }).id, 'swiss-signal');
  const zones = styles.zonesPx('16:9');
  assert.deepEqual(Object.keys(zones).sort(), [...styles.LAYOUT_IDS].sort());
  assert.equal(styles.scaleStep(styles.readStyle('swiss-signal'), '16:9', 128), 'display');
  assert.equal(styles.scaleStep(styles.readStyle('swiss-signal'), '16:9', 7), null);
  assert.match(styles.styleCss(styles.readStyle('tidal'), '16:9'), /\.lit-display/);
  assert.match(styles.styleScript(styles.readStyle('tidal'), '16:9', { fps: 60, durationSec: 12, beats: [] }), /window\.LitStyle/);
});

test('motion house: record then read pins the folder, and a foreign file is ignored', () => {
  const out = join(scratch('house'), 'film-a');
  const rec = house.recordHouse(out, { style: 'tidal', path: 'stage', format: '16:9', durationSec: 12 });
  assert.equal(rec.style, 'tidal');
  assert.equal(house.readHouse(out).style, 'tidal');
  assert.equal(house.readHouse(join(scratch('house-empty'), 'nope')), null);
  writeFileSync(house.houseFileFor(out), 'not json');
  assert.equal(house.readHouse(out), null);
});

test('motion board: the grid fits the frame, the page names the storyboard, the index gains the board', () => {
  const g = board.boardGrid(4, 1920, 1080);
  assert.ok(g.tw > 0 && g.th > 0 && g.cols * g.rows >= 4);
  const t = stageFilm();
  const html = board.boardHtml({ treatment: t, stills: ['s01.png', 's02.png', 's03.png'] });
  assert.match(html, /Storyboard/);
  assert.match(html, /class="zone"/);
  const out = scratch('board');
  mkdirSync(join(out, 'stills'), { recursive: true });
  writeFileSync(join(out, 'stills', 'index.json'), JSON.stringify({ files: [] }));
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  writeFileSync(join(out, 'stills', 'board.png'), png);
  const sha = board.addToStills(out, { file: 'stills/board.png', kind: 'board', frames: 3 }, { sha256: (b) => 'x'.repeat(64) });
  assert.equal(typeof sha, 'string');
  const index = JSON.parse(readFileSync(join(out, 'stills', 'index.json'), 'utf8'));
  assert.deepEqual(index.files.map((f) => f.kind), ['board']);
  assert.throws(() => board.addToStills(out, { file: 'stills/missing.png', kind: 'board' }, { sha256: () => 'y' }), /was not written/);
});

test('motion gallery: the demo treatment validates in every style', () => {
  for (const id of styles.STYLE_IDS) {
    const t = gallery.demoTreatment(id);
    const v = validateTreatment(t);
    assert.equal(v.style, id, id);
    assert.equal(v.register, 'minimal', id);
  }
  const page = gallery.demoPage(gallery.demoTreatment('tidal'));
  assert.match(page, /LitStage/);
});

test('motion scaffold: slots per shot, written once, never overwritten', () => {
  const t = stageFilm();
  const html = scaffold.scaffoldHtml(t);
  assert.equal(html.match(/\(s, svg, t\) => \{\},/g).length, t.beats.length);
  assert.match(html, /COPY/);
  const out = writeTreatment(scratch('scaffold'), t);
  const r = scaffold.scaffoldCommand({ out });
  assert.equal(r.code, 0);
  assert.ok(existsSync(join(out, 'stage', 'index.html')));
  assert.throws(() => scaffold.scaffoldCommand({ out }), /never overwrites/);
  const per = scaffold.linesPerShot(t);
  assert.deepEqual(per, [[0], [], []]);
});

test('motion assets: sniffing, svg hygiene, readme and page facts', () => {
  assert.equal(assets.sniffImage(Buffer.from('89504e470d0a1a0a', 'hex')), 'png');
  assert.equal(assets.sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(assets.sniffImage(Buffer.from('GIF89a', 'latin1')), 'gif');
  assert.equal(assets.sniffImage(Buffer.from('<svg viewBox="0 0 1 1"></svg>')), 'svg');
  assert.equal(assets.sniffImage(Buffer.from('hello')), null);
  assert.equal(assets.cleanSvg('<svg><circle r="1"/></svg>'), true);
  assert.equal(assets.cleanSvg('<svg><script>alert(1)</script></svg>'), false);
  assert.equal(assets.cleanSvg('<svg><image href="https://evil.example/x.png"/></svg>'), false);
  const imgs = assets.readmeImages('![a](https://raw.example.com/i/img.png)\n![b](https://img.shields.io/badge/x)', 'https://github.com/o/r/blob/HEAD/');
  assert.deepEqual(imgs, ['https://raw.example.com/i/img.png']);
  const facts = assets.pageFacts('<html><head><title>T · site</title><meta property="og:image" content="/og.png"></head></html>', 'https://example.com/p');
  assert.equal(facts.title, 'T · site');
  assert.deepEqual(facts.images.map((i) => i.url), ['https://example.com/og.png']);
});

test('motion blender: lookup order, argv shape, and the no-Blender fallback', () => {
  const no = { env: {}, exists: () => false, platform: 'darwin' };
  assert.equal(blender.findBlender(no), null);
  assert.deepEqual(blender.findBlender({ env: { LITMUSE_BLENDER: '/x' }, exists: () => true, platform: 'darwin' }), { path: '/x', source: 'LITMUSE_BLENDER' });
  const t = {
    ...stageFilm(), render3d: 'blender', depth: '3d', seed: 7,
    visualDevices: [{ kind: 'depth3d', role: 'subject', beats: [0, 1, 2] }, { kind: 'icon', role: 'support', beats: [2] }],
  };
  const prev = blender.blenderArgs({ treatment: t, scene: 's.py', out: 'o', quality: 'preview' });
  assert.ok(prev.includes('--stills') && prev.some((a) => String(a).endsWith('runner.py')));
  const fin = blender.blenderArgs({ treatment: t, scene: 's.py', out: 'o', quality: 'final' });
  assert.ok(fin.includes('--frames') && fin.includes('1-120'));
  assert.throws(() => blender.blenderArgs({ treatment: t, scene: 's.py', out: 'o', quality: 'x' }), /preview or final/);
  assert.equal(blender.readPlate(scratch('noplate')), null);
  if (blender.findBlender({})) return;
  const out = writeTreatment(scratch('blend'), t);
  writeFileSync(join(out, 'stage', 'scene.py'), '# scene\n');
  return blender.blenderCommand({ out, env: { PATH: '/nonexistent' }, log: () => {} }).then((r) => {
    assert.equal(r.code, 0);
    assert.match(r.message, /^FALLBACK: no Blender found/);
  });
});

test('motion score: seeded plans differ per film and drop on the turn', () => {
  const a = score.planScore({ treatment: stageFilm(), durationSec: 4 });
  const b = score.planScore({ treatment: stageFilm(), durationSec: 4 });
  assert.deepEqual(a, b, 'one film always plans the same');
  const other = score.planScore({ treatment: { ...stageFilm(), idea: 'A lantern that folds itself into a paper crane and flies off.' }, durationSec: 4 });
  assert.ok(other.key !== a.key || other.bpm !== a.bpm || other.progression.join() !== a.progression.join(), 'two films differ');
  const drop = a.sections.find((s) => s.kind === 'drop');
  assert.ok(drop && drop.t0 === a.sections[1].t0, 'the drop lands on the turn shot');
  assert.ok(score.SCORE_GENRES.includes(a.genre));
  assert.ok(score.SCORE_STEMS.includes('events'));
  const built = score.buildScore({ treatment: { ...stageFilm(), sound: { mode: 'score', plan: 'x', events: [{ t: 0.5, on: 'The tile moves.', kind: 'tap' }, { t: 3.1, on: 'The line lands.', kind: 'chime' }] } }, frameCount: 30, fps: 30 });
  assert.equal(built.sampleCount, 48000);
  assert.ok(built.cues.some((c) => c.kind === 'event'));
  assert.ok(Number.isFinite(score.sidechainDepth(built)));
  assert.match(sound.planCues({ beats: stageFilm().beats, durationSec: 4, events: [{ t: 1, on: 'x', kind: 'tap' }] }).find((c) => c.kind === 'event').on, /x/);
});

test('motion treatment: the round-3 rules name their field', () => {
  const field = (over) => {
    try {
      validateTreatment({ ...stageFilm(), ...over });
    } catch (e) {
      return e.field;
    }
    return null;
  };
  assert.equal(field({ style: 'neon' }), 'style');
  assert.equal(field({ style: 'tidal' }), 'style', 'the house default holds without a keyword');
  assert.equal(field({ register: 'minimal' }), 'register');

  const fieldFull = (t) => {
    try {
      validateTreatment(t);
    } catch (e) {
      return e.field;
    }
    return null;
  };
  const noStory = { ...stageFilm() };
  delete noStory.story;
  assert.equal(fieldFull(noStory), 'story');
  const noProt = { ...stageFilm() };
  delete noProt.protagonist;
  assert.equal(fieldFull(noProt), 'protagonist');
  assert.equal(field({ request: 'render a 4 s tour of https://example.com/product at 30 fps' }), 'product');
  assert.equal(field({ depth: '3d' }), 'depth');
  const noWorld = { ...stageFilm() };
  delete noWorld.world;
  assert.equal(fieldFull(noWorld), 'world');
  assert.equal(field({ sound: { mode: 'score', plan: 'A groove.' } }), 'sound.events');
  assert.equal(field({ preview: true }), 'preview');
  assert.equal(field({ fps: 30, request: 'render a 4 s short check clip for the hallway panel' }), 'fps');
  assert.equal(field({ genre: 'explainer', durationSec: 12, request: 'launch the spring line at 30 fps' }), 'genre');
  const onCut = { ...stageFilm(), sound: { mode: 'score', plan: 'A groove.', events: [{ t: 1.333, on: 'The tile changes.', kind: 'hit' }, { t: 2.667, on: 'The disc turns.', kind: 'tap' }] } };
  assert.equal(field(onCut), 'sound.events', 'events on the cuts fail the half-away rule');
});

test('motion done: a preview is done at its board', () => {
  const out = writeTreatment(scratch('preview'), { ...stageFilm(), preview: true, request: 'preview the 4 s hallway clip at 30 fps' });
  const r = done.evaluateDone({ out });
  assert.equal(r.status, 'NOT_DONE');
  assert.ok(r.reasons.join(' ').includes('board'));
});

test('motion cli: argv switches for the new subcommands', () => {
  assert.equal(motionCli(['scaffold']).status, 2);
  assert.equal(motionCli(['assets', '--out', scratch('cli')]).status, 2);
  assert.equal(motionCli(['styles', '--out', scratch('cli'), '--format', '4:3']).status, 2);
  assert.equal(motionCli(['blender']).status, 2);
  const plain = writeTreatment(scratch('cli-scaffold'), stageFilm());
  const ok = motionCli(['scaffold', '--out', plain]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const notBlender = motionCli(['blender', '--out', plain]);
  assert.equal(notBlender.status, 2);
  assert.match(notBlender.stdout + notBlender.stderr, /render3d "blender"/);
  const noTreatment = motionCli(['scaffold', '--out', scratch('cli-empty')]);
  assert.equal(noTreatment.status, 16);
});
