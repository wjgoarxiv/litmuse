import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ENGINE, MOTION_CLI, STAGE_FIXTURES, WARM, motionCli, needsRender, stageFilm, temp } from './motion-helpers.mjs';

// Declared keyed overlay clips on the stage path (references/stage.md, Clips): frames inside a folder that
// stage/clips/clips.json names are held to the clip caps instead of the raster flipbook rule; every other
// raster keeps its limits. The scan, the router, the page API and the real render are each pinned below.
const serve = await import(join(ENGINE, 'node', 'stage-serve.mjs'));
const { encodePng } = await import(join(ENGINE, 'node', 'png.mjs'));
const { EXIT } = await import(join(ENGINE, 'core', 'constants.mjs'));
const { scanStage, scanClips, CLIP_LIMITS } = serve;

const frameName = (i) => `frame_${String(i).padStart(4, '0')}.png`;
/** An RGBA frame with its first pixel transparent (a keyed frame); `opaque` makes every pixel solid. */
function keyed(w, h, { opaque = false, shade = 90 } = {}) {
  const px = Buffer.alloc(w * h * 4, shade);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  if (!opaque) px[3] = 0;
  return encodePng(px, w, h, 4);
}

/** A stage folder: index.html, clips/<dir>/frame_NNNN.png per clip, and clips/clips.json. */
function stageWith(clips, { declare = clips, extra = () => {} } = {}) {
  const stage = join(temp('litmuse-clips-'), 'stage');
  mkdirSync(join(stage, 'clips'), { recursive: true });
  writeFileSync(join(stage, 'index.html'), '<!doctype html><title>clips</title>');
  for (const c of clips) {
    mkdirSync(join(stage, 'clips', c.dir), { recursive: true });
    const png = c.png ?? keyed(c.w ?? 8, c.h ?? 6);
    for (let i = 1; i <= (c.files ?? c.count); i++) writeFileSync(join(stage, 'clips', c.dir, frameName(i)), png);
  }
  writeFileSync(join(stage, 'clips', 'clips.json'), JSON.stringify({ clips: declare.map(({ id, dir, count, fps }) => ({ id, dir, count, fps })) }));
  extra(stage);
  return stage;
}
function refusal(fn) {
  try { fn(); } catch (error) { return error; }
  return null;
}
const A = { id: 'boom', dir: '01-boom', count: 12, fps: 30 };
const B = { id: 'cat', dir: '10-cat', count: 30, fps: 30 };

test('clips scan: declared clips are not page rasters, and the scan lists each with its size and bytes', () => {
  const scan = scanStage(stageWith([A, B]));
  assert.equal(scan.rasters.length, 0);
  assert.deepEqual(scan.clips.map((c) => [c.id, c.count, c.fps, c.width, c.height]), [['boom', 12, 30, 8, 6], ['cat', 30, 30, 8, 6]]);
  assert.ok(scan.clips.every((c) => c.bytes > 0));
  assert.deepEqual(scanStage(stageWith([])).clips, []);
});

test('clips scan: an undeclared frame sequence stays a flipbook, beside a declared clip or alone', () => {
  const beside = stageWith([A], { extra: (dir) => {
    mkdirSync(join(dir, 'flip'));
    for (let i = 1; i <= 12; i++) writeFileSync(join(dir, 'flip', frameName(i)), keyed(8, 6));
  } });
  assert.throws(() => scanStage(beside), /flipbook/);
  assert.throws(() => scanStage(stageWith([A], { declare: [] })), /flipbook/);
  const bare = stageWith([A]);
  rmSync(join(bare, 'clips', 'clips.json'));
  assert.throws(() => scanStage(bare), /flipbook/);
});

test('clips scan: cover mode takes no clips, so a declared folder meets the raster limits there', () => {
  assert.throws(() => scanStage(stageWith([A]), { clips: false }), /flipbook/);
});

const REFUSED = [
  ['more frames than a clip may hold', { ...A, count: 361 }, /clip "boom".*361 frames/],
  ['a frame missing from the run', { ...A, files: 11 }, /frame_0012\.png/],
  ['a frame past the declared count', { ...A, files: 13 }, /frame_0013\.png/],
  ['opaque RGB frames', { ...A, png: encodePng(Buffer.alloc(8 * 6 * 3, 90), 8, 6, 3) }, /RGBA/],
  ['RGBA frames with no transparent pixel', { ...A, png: keyed(8, 6, { opaque: true }) }, /transparen/],
  ['a frame past the overlay size', { ...A, w: 721, h: 20 }, /clip "boom".*721/],
  ['a frame rate above 30', { ...A, fps: 60 }, /fps/],
  ['an id that is not a plain token', { ...A, id: 'a b' }, /id/],
];
for (const [name, clip, message] of REFUSED) {
  test(`clips scan: ${name} is exit 17`, () => {
    const error = refusal(() => scanStage(stageWith([clip])));
    assert.ok(error, 'the scan must refuse it');
    assert.equal(error.code, EXIT.STAGE_CONTRACT_ERROR, error.message);
    assert.match(error.message, message);
  });
}

test('clips scan: mixed frame sizes, a folder name that climbs out, a duplicate id, bad JSON and a thirteenth clip are exit 17', () => {
  const mixed = stageWith([A], { extra: (dir) => writeFileSync(join(dir, 'clips', A.dir, frameName(5)), keyed(9, 6)) });
  assert.match(refusal(() => scanStage(mixed)).message, /size/);
  const climb = stageWith([{ ...A, dir: 'x' }]);
  writeFileSync(join(climb, 'clips', 'clips.json'), JSON.stringify({ clips: [{ id: 'boom', dir: '..', count: 12, fps: 30 }] }));
  assert.match(refusal(() => scanStage(climb)).message, /dir/);
  assert.match(refusal(() => scanStage(stageWith([A, { ...B, dir: 'other', id: 'boom' }]))).message, /duplicate.*boom/);
  const bad = stageWith([A]);
  writeFileSync(join(bad, 'clips', 'clips.json'), '{ not json');
  assert.match(refusal(() => scanStage(bad)).message, /clips\.json/);
  const many = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, dir: `d${i}`, count: 2, fps: 30 }));
  const error = refusal(() => scanStage(stageWith(many)));
  assert.equal(error.code, EXIT.STAGE_CONTRACT_ERROR);
  assert.match(error.message, /at most 12 clips/);
});

test('clips scan: the caps are exported and the per-clip and total bytes and frames are held', () => {
  assert.deepEqual(Object.keys(CLIP_LIMITS).sort(), ['bytesPerClip', 'bytesTotal', 'clips', 'fps', 'framesPerClip', 'framesTotal', 'side']);
  assert.deepEqual({ ...CLIP_LIMITS }, { clips: 12, framesPerClip: 360, framesTotal: 1500, bytesPerClip: 40 * 1024 * 1024, bytesTotal: 128 * 1024 * 1024, side: 720, fps: 30 });
  const stage = stageWith([A, B]);
  const run = (limits) => refusal(() => scanClips(stage, { limits: { ...CLIP_LIMITS, ...limits } }))?.code ?? 0;
  assert.equal(run({}), 0);
  assert.equal(run({ bytesPerClip: 100 }), EXIT.STAGE_CONTRACT_ERROR);
  assert.equal(run({ bytesTotal: 100 }), EXIT.STAGE_CONTRACT_ERROR);
  assert.equal(run({ framesTotal: 41 }), EXIT.STAGE_CONTRACT_ERROR);
});

test('clips router: /lit/clips.js carries the declaration, frames are served as files, and a stage without clips has no such route', () => {
  const router = serve.stageRouter({ stageDir: stageWith([A]), faces: [] });
  const answer = router.route(`${serve.STAGE_ORIGIN}/lit/clips.js`);
  assert.equal(answer.kind, 'body');
  const sandbox = { window: {} };
  vm.runInNewContext(answer.body, sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.LitClips)), { boom: { src: 'clips/01-boom', count: 12, fps: 30, width: 8, height: 6 } });
  assert.equal(router.route(`${serve.STAGE_ORIGIN}/clips/01-boom/frame_0001.png`).kind, 'file');
  const bare = serve.stageRouter({ stageDir: temp('litmuse-noclips-'), faces: [] });
  assert.equal(bare.route(`${serve.STAGE_ORIGIN}/lit/clips.js`).kind, 'missing');
});

// ---- LitStage.clip over a bare window with a tiny DOM ----
function kit(clips) {
  const el = (tag) => ({
    tag, style: {}, children: [], attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    append(c) { this.children.push(c); c.parent = this; },
    replaceWith(n) { this.parent.children[this.parent.children.indexOf(this)] = n; n.parent = this.parent; },
  });
  const window = { LitClips: clips };
  vm.runInNewContext(readFileSync(join(ENGINE, 'stage', 'stage-kit.js'), 'utf8'), { window, document: { createElement: el }, Intl, Math, Number, String, Array, Object, Error, JSON, parseFloat, parseInt });
  return { LitStage: window.LitStage, parent: el('div') };
}
const DECLARED = { boom: { src: 'clips/01-boom', count: 12, fps: 30, width: 520, height: 511 } };
const BOX = { x: 10, y: 20, w: 300, h: 300 };
const framesShown = (parent) => parent.children[0].children[0]?.src;

test('LitStage.clip: the frame is floor((t - start) * fps) + 1', () => {
  const { LitStage, parent } = kit(DECLARED);
  const play = LitStage.clip({ parent, id: 'boom', box: BOX });
  assert.equal(play(1.0, { start: 1.0 }), parent.children[0]);
  assert.match(framesShown(parent), /clips\/01-boom\/frame_0001\.png$/);
  play(1.0 + 4 / 30, { start: 1.0 });
  assert.match(framesShown(parent), /frame_0005\.png$/);
  play(1.0 + 11 / 30, { start: 1.0 });
  assert.match(framesShown(parent), /frame_0012\.png$/);
});

test('LitStage.clip: hidden before the cue and past the last frame unless it holds or loops', () => {
  const { LitStage, parent } = kit(DECLARED);
  const play = LitStage.clip({ parent, id: 'boom', box: BOX });
  assert.equal(play(0.5, { start: 1.0 }), null);
  assert.equal(parent.children[0].style.display, 'none');
  assert.equal(play(1.0 + 12 / 30, { start: 1.0 }), null);
  play(1.0 + 13 / 30, { start: 1.0, hold: true });
  assert.match(framesShown(parent), /frame_0012\.png$/);
  play(1.0 + 13 / 30, { start: 1.0, loop: true });
  assert.match(framesShown(parent), /frame_0002\.png$/);
});

test('LitStage.clip: a frame range plays by from..to, and the same t gives the same frame in any order', () => {
  const { LitStage, parent } = kit(DECLARED);
  const play = LitStage.clip({ parent, id: 'boom', box: BOX });
  const range = { start: 0, from: 4, to: 6 };
  play(2 / 30, range);
  assert.match(framesShown(parent), /frame_0006\.png$/);
  assert.equal(play(3 / 30, range), null);
  play(0, range);
  assert.match(framesShown(parent), /frame_0004\.png$/);
  play(2 / 30, range);
  assert.match(framesShown(parent), /frame_0006\.png$/);
  assert.throws(() => play(0, { from: 5, to: 13 }), /1\.\.12/);
});

test('LitStage.clip: one wrapper sits at the box, and an unknown clip or a missing clips.js script is refused by name', () => {
  const { LitStage, parent } = kit(DECLARED);
  const play = LitStage.clip({ parent, id: 'boom', box: BOX });
  play(0, { start: 0 });
  play(0.1, { start: 0 });
  assert.equal(parent.children.length, 1);
  const wrap = parent.children[0];
  assert.deepEqual([wrap.style.left, wrap.style.top, wrap.style.width, wrap.style.height], ['10px', '20px', '300px', '300px']);
  assert.throws(() => LitStage.clip({ parent, id: 'nope', box: BOX }), /nope/);
  assert.throws(() => kit(undefined).LitStage.clip({ parent, id: 'boom', box: BOX }), /clips\.js/);
});

// ---- the real render: needs Chrome, libwebp and a warm motion runtime, else each skips with the reason ----
function clipRun(fixture, clipFrames) {
  const out = join(temp(`litmuse-${fixture}-`), 'out');
  mkdirSync(out, { recursive: true });
  cpSync(join(STAGE_FIXTURES, fixture), join(out, 'stage'), { recursive: true });
  const declared = [];
  for (const [dir, frames] of Object.entries(clipFrames)) {
    mkdirSync(join(out, 'stage', 'clips', dir), { recursive: true });
    frames.forEach((png, i) => writeFileSync(join(out, 'stage', 'clips', dir, frameName(i + 1)), png));
    declared.push({ id: dir, dir, count: frames.length, fps: 30 });
  }
  writeFileSync(join(out, 'stage', 'clips', 'clips.json'), JSON.stringify({ clips: declared }));
  writeFileSync(join(out, 'treatment.json'), `${JSON.stringify(stageFilm({ fps: 30 }), null, 2)}\n`);
  return out;
}
/** Clip "swatch": frame k is a solid (20k, 0, 0) with one transparent corner pixel. */
const swatch = () => Array.from({ length: 8 }, (_, i) => {
  const px = Buffer.alloc(8 * 6 * 4);
  for (let p = 0; p < px.length; p += 4) px.set([20 * (i + 1), 0, 0, 255], p);
  px[3] = 0;
  return encodePng(px, 8, 6, 4);
});

test('clips render: the stage shows the frame film time picks, hidden before the cue, held after, and identical in a fresh browser', async (t) => {
  if (needsRender(t)) return;
  const { captureStageFrames } = await import(join(ENGINE, 'node', 'stage.mjs'));
  const env = { ...process.env, LITMUSE_MOTION_RUNTIME: WARM };
  const frames = [27, 30, 35, 42, 50];
  const first = await captureStageFrames({ out: clipRun('clip-overlay', { swatch: swatch() }), frames, env });
  const second = await captureStageFrames({ out: clipRun('clip-overlay', { swatch: swatch() }), frames, env });
  const centre = (rgba) => [...rgba.subarray((450 * 1920 + 800) * 4, (450 * 1920 + 800) * 4 + 3)];
  const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= 3);
  assert.ok(near(centre(first.get(27)), [0, 0, 0]), `frame 27 (0.9 s) is before the cue: ${centre(first.get(27))}`);
  assert.ok(near(centre(first.get(30)), [20, 0, 0]), `frame 30 (1.0 s) is clip frame 1: ${centre(first.get(30))}`);
  assert.ok(near(centre(first.get(35)), [120, 0, 0]), `frame 35 is clip frame 6: ${centre(first.get(35))}`);
  assert.ok(near(centre(first.get(42)), [160, 0, 0]), `frame 42 holds clip frame 8: ${centre(first.get(42))}`);
  assert.ok(near(centre(first.get(50)), [0, 0, 0]), `frame 50 (1.67 s) is past the hold: ${centre(first.get(50))}`);
  for (const f of frames) assert.ok(Buffer.from(first.get(f)).equals(Buffer.from(second.get(f))), `frame ${f} matches a second capture`);
});

test('clips render: a full-frame white/black clip fails the flash audit (MO-C-03) and withholds the film', (t) => {
  if (needsRender(t)) return;
  const frame = (white) => {
    const px = Buffer.alloc(8 * 6 * 4, white ? 255 : 0);
    px[3] = 0;
    for (let p = 7; p < px.length; p += 4) px[p] = 255;
    return encodePng(px, 8, 6, 4);
  };
  const out = clipRun('clip-strobe', { strobe: [1, 0, 1, 0, 1, 0].map((w) => frame(Boolean(w))) });
  const r = motionCli(['stage', '--out', out, '--round', '2']);
  assert.equal(r.status, EXIT.GATE_FAIL_QA, r.stdout + r.stderr);
  assert.match(readFileSync(join(out, 'gate-report.txt'), 'utf8'), /MO-C-03:\s+FAIL/);
  assert.equal(existsSync(join(out, 'film.mp4')), false);
});

test('clips render: the manifest and the report list each clip', (t) => {
  if (needsRender(t)) return;
  const out = clipRun('clip-overlay', { swatch: swatch() });
  const r = motionCli(['stage', '--out', out, '--round', '2']);
  assert.ok([0, 13].includes(r.status), r.stdout + r.stderr);
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.clips.map((c) => [c.id, c.frames, c.fps, c.width, c.height]), [['swatch', 8, 30, 8, 6]]);
  assert.match(readFileSync(join(out, 'gate-report.txt'), 'utf8'), /^clips: swatch 8 frames at 30 fps/m);
});

test('clips docs: SKILL.md and stage.md name the declaration, the API, the limits and the 17 refusal', () => {
  const skill = join(MOTION_CLI, '..', '..');
  const stage = readFileSync(join(skill, 'references', 'stage.md'), 'utf8');
  for (const word of ['clips/clips.json', 'LitStage.clip', '/lit/clips.js', '360 frames', '1500', '720 px', 'start = ', 'flipbook']) assert.ok(stage.includes(word), `stage.md names ${word}`);
  assert.match(readFileSync(join(skill, 'SKILL.md'), 'utf8'), /\| 17 \| STAGE_CONTRACT_ERROR \|[^\n]*clip/);
});
