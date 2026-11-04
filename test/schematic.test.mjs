import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectRoute, SKILL_ROUTES } from '../plugin/hooks/lib/routes.mjs';
import { readManifest, PLUGIN_DIR } from '../lib/bundle.mjs';
import { expectedSkillIds } from '../lib/doctor.mjs';
import { createSheet } from '../plugin/skills/lit-schematic/scripts/lib/sheet.mjs';
import { runQA } from '../plugin/skills/lit-schematic/scripts/lib/qa-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(PLUGIN_DIR, 'skills', 'lit-schematic');
const EXAMPLES = ['pid-dosing-skid', 'journal-adsorption-rig', 'iso-heat-exchanger'];

function node(args, opts = {}) {
  return spawnSync('node', args, { encoding: 'utf8', ...opts });
}

test('lit-schematic is reachable by keyword and by its own id', () => {
  assert.equal(detectRoute('lit-schematic draw a P&ID of the overhead section')?.route, 'lit-schematic');
  assert.equal(detectRoute('lit schematic of the dosing skid')?.route, 'lit-schematic');
  assert.equal(detectRoute('lit draw a P&ID of the column overhead')?.route, 'lit-schematic');
  assert.equal(detectRoute('lit draw an isometric cutaway of the autoclave')?.route, 'lit-schematic');
});

test('software-architecture wording stays away from lit-schematic', () => {
  assert.equal(detectRoute('lit schematic of the codebase')?.route, 'lit-loop');
  assert.equal(detectRoute('lit draw boxes and arrows for the auth flow')?.route, 'lit-loop');
});

test('lit-schematic is enrolled on all four surfaces', () => {
  const manifestIds = readManifest().capabilities.skills.map((s) => s.id);
  assert.ok(manifestIds.includes('lit-schematic'), 'manifest');
  assert.ok(SKILL_ROUTES.some((r) => r.id === 'lit-schematic'), 'route table');
  assert.ok([...expectedSkillIds()].includes('plugin:litmuse:lit-schematic'), 'doctor listing');
});

test('the three example builds pass the QA gate', () => {
  for (const ex of EXAMPLES) {
    const dir = mkdtempSync(join(tmpdir(), `sch-${ex}-`));
    const build = node([join(SKILL, 'examples', ex, 'build.mjs'), dir]);
    assert.equal(build.status, 0, `${ex} build: ${build.stderr}`);
    const qa = node([join(SKILL, 'scripts', 'qa.mjs'), join(dir, 'drawing.svg')]);
    assert.equal(qa.status, 0, `${ex} qa: ${qa.stdout}`);
    assert.match(qa.stdout, /QA PASS/, ex);
  }
});

test('RED: a mistagged instrument fails TAG.ORDER', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sch-red-tag-'));
  const build = node([join(SKILL, 'examples', 'pid-dosing-skid', 'build.mjs'), dir]);
  assert.equal(build.status, 0, build.stderr);
  const svg = readFileSync(join(dir, 'drawing.svg'), 'utf8').replace('<!-- tag FIC-101 -->', '<!-- tag X9-101 -->');
  writeFileSync(join(dir, 'drawing.svg'), svg);
  const qa = node([join(SKILL, 'scripts', 'qa.mjs'), join(dir, 'drawing.svg')]);
  assert.notEqual(qa.status, 0);
  assert.match(qa.stdout, /TAG\.ORDER/);
});

test('LABEL.CLEARANCE geometry: a label dragged onto a line fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sch-red-clear-'));
  const build = node([join(SKILL, 'examples', 'pid-dosing-skid', 'build.mjs'), dir]);
  assert.equal(build.status, 0, build.stderr);
  const svg = readFileSync(join(dir, 'drawing.svg'), 'utf8');
  const moved = svg.replace(
    '<text x="128" y="176" font-size="6" font-family="Arial, sans-serif" fill="#111" text-anchor="start" data-clear="true">FC</text>',
    '<text x="128" y="184" font-size="6" font-family="Arial, sans-serif" fill="#111" text-anchor="start" data-clear="true">FC</text>',
  );
  assert.notEqual(moved, svg, 'the FC label exists to move');
  writeFileSync(join(dir, 'drawing.svg'), moved);
  const qa = node([join(SKILL, 'scripts', 'qa.mjs'), join(dir, 'drawing.svg')]);
  assert.notEqual(qa.status, 0);
  assert.match(qa.stdout, /LABEL\.CLEARANCE/);
  assert.match(qa.stdout, /FC.*sits on a line/);
});

test('LABEL.CLEARANCE geometry: two labels sharing a seat fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sch-red-collide-'));
  const build = node([join(SKILL, 'examples', 'pid-dosing-skid', 'build.mjs'), dir]);
  assert.equal(build.status, 0, build.stderr);
  const svg = readFileSync(join(dir, 'drawing.svg'), 'utf8');
  const moved = svg.replace(
    '<text x="128" y="176" font-size="6" font-family="Arial, sans-serif" fill="#111" text-anchor="start" data-clear="true">FC</text>',
    '<text x="66" y="193" font-size="6" font-family="Arial, sans-serif" fill="#111" text-anchor="start" data-clear="true">FC</text>',
  );
  assert.notEqual(moved, svg, 'the FC label exists to move');
  writeFileSync(join(dir, 'drawing.svg'), moved);
  const qa = node([join(SKILL, 'scripts', 'qa.mjs'), join(dir, 'drawing.svg')]);
  assert.notEqual(qa.status, 0);
  assert.match(qa.stdout, /LABEL\.CLEARANCE/);
  assert.match(qa.stdout, /labels collide/);
});

test('globe reads apart from gate: only the globe carries a filled seat dot', () => {
  const sheet = createSheet({});
  sheet.valve('gate', 'hand', 'FV-1', 10, 10, 'FC');
  sheet.valve('globe', 'pneumatic', 'FV-2', 40, 10, 'FO');
  const svg = sheet.toSVG();
  assert.match(svg, /<circle cx="40" cy="10" r="2\.6" fill="#111"/);
  assert.doesNotMatch(svg, /<circle cx="10" cy="10"/);
});

test('offpage connector widens to fit a long destination name', () => {
  const sheet = createSheet({});
  sheet.offpage('TO INJECTION POINT', 10, 50, 'out', 22);
  const svg = sheet.toSVG();
  const box = svg.match(/M 10 44 L ([\d.]+) 44 L ([\d.]+) 50/);
  assert.ok(box, 'the offpage hexagon is drawn');
  const right = Number(box[2]);
  assert.ok(right >= 10 + 60, `box reaches ${right}: a 19-character name cannot fit a 22-unit box`);
  const label = svg.match(/<text x="([\d.]+)" y="52"[^>]*>TO INJECTION POINT<\/text>/);
  assert.ok(label, 'the destination text is drawn');
  const cx = Number(label[1]);
  assert.ok(cx - 28 > 10 && cx + 28 < right, 'the text sits inside the box with room');
});

test('stacked symbols take side tags that clear their own lines', () => {
  const sheet = createSheet({});
  sheet.pump('P-1', 50, 50, 'left');
  const svg = sheet.toSVG();
  assert.match(svg, /<text x="36" y="60"[^>]*text-anchor="end"[^>]*>P-1<\/text>/);
});

test('an instrument bubble carries its tag once, inside the bubble', () => {
  const sheet = createSheet({});
  sheet.instrument('LT-1', 80, 50, { tag: 'below' });
  sheet.instrument('FIC-101', 140, 50, { dcs: true });
  sheet.instrument('PI-101', 200, 50);
  const svg = sheet.toSVG();
  for (const [letters, number] of [['LT', '1'], ['FIC', '101'], ['PI', '101']]) {
    assert.match(svg, new RegExp(`>${letters}</text>`), `${letters} letters inside`);
    assert.match(svg, new RegExp(`>${number}</text>`), `${number} number inside`);
    assert.doesNotMatch(svg, new RegExp(`<text[^>]*>${letters}-${number}</text>`), `no second ${letters}-${number} tag`);
  }
  assert.match(svg, /<!-- tag FIC-101 -->/, 'the tag stays checkable by TAG.ORDER');
});

test('flow arrows point the way they are told; right stays the default', () => {
  const sheet = createSheet({});
  sheet.arrow(50, 50, true);
  sheet.arrow(60, 50, true, 'left');
  sheet.arrow(70, 50, true, 'up');
  sheet.arrow(80, 50, true, 'down');
  const svg = sheet.toSVG();
  assert.match(svg, /d="M 46 48 L 50 50 L 46 52"/, 'right');
  assert.match(svg, /d="M 64 48 L 60 50 L 64 52"/, 'left');
  assert.match(svg, /d="M 68 54 L 70 50 L 72 54"/, 'up');
  assert.match(svg, /d="M 78 46 L 80 50 L 82 46"/, 'down');
  assert.match(svg, /<!-- arrow at=70,50 clear=true dir=up -->/);
  assert.throws(() => sheet.arrow(90, 50, true, 'sideways'), /direction/);
});

test('inline parts on a vertical pipe take their tag beside the pipe', () => {
  const sheet = createSheet({ plant: 'T', unit: 'U', sheetNo: '01-001', rev: 'A' });
  sheet.pipe([[100, 60], [100, 200]], { cls: 'process' });
  sheet.valve('gate', 'hand', 'HV-101', 100, 80, 'FC', 'v');
  sheet.valve('check', 'auto', 'XV-101', 100, 110, 'FC', 'v', 'right');
  sheet.strainer('STR-101', 100, 140, 'v');
  sheet.valve('globe', 'pneumatic', 'FV-102', 100, 175, 'FO', 'v', 'right');
  sheet.legend();
  const qa = runQA(sheet.toSVG());
  assert.deepEqual(qa.fails, []);
});

test('a vertical line number keeps the same air from its line as a horizontal one', () => {
  const sheet = createSheet({});
  sheet.pipe([[60, 60], [60, 140]], { cls: 'process', number: '2-W-001' });
  const m = sheet.toSVG().match(/rotate\(-90 ([\d.]+) ([\d.]+)\)/);
  assert.ok(m, 'the rotated number is drawn');
  const capTop = Number(m[1]) - 0.72 * 6;
  assert.ok(capTop - 60 >= 3, `glyph tops sit ${(capTop - 60).toFixed(2)} mm from the centerline`);
});

test('the PSV keeps its spring off the inlet and takes a chosen outlet', () => {
  const pathsOf = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const pointsOf = (d) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const right = createSheet({});
  right.psv('PSV-101', 100, 100, 'SET 8 barg');
  const svgR = right.toSVG();
  // Inlet from below ends at (100, 110); the outlet leaves right to (110, 100).
  assert.match(svgR, /<line x1="100" y1="107" x2="100" y2="110"/);
  assert.match(svgR, /<line x1="107" y1="100" x2="110" y2="100"/);
  const spring = pathsOf(svgR).find((d) => /^M 100 97 /.test(d));
  assert.ok(spring, 'a spring rises from the body');
  for (const [, y] of pointsOf(spring)) assert.ok(y < 100, `spring point at y=${y} must stay above the body, off the inlet`);

  const up = createSheet({});
  up.psv('PSV-102', 100, 100, 'SET 8 barg', { outlet: 'up' });
  const svgU = up.toSVG();
  assert.match(svgU, /<line x1="100" y1="93" x2="100" y2="90"/, 'outlet leaves upward');
  assert.match(svgU, /<line x1="93" y1="100" x2="90" y2="100"/, 'inlet comes in from the left');
  assert.throws(() => createSheet({}).psv('PSV-103', 0, 0, '', { inlet: 'down', outlet: 'up' }), /right angles/);
});

test('LABEL.CLEARANCE: a label on an instrument bubble, pump circle or arc fails', () => {
  const base = () => {
    const sheet = createSheet({ plant: 'T', unit: 'U', sheetNo: '01-001', rev: 'A' });
    sheet.instrument('PI-101', 100, 100);
    sheet.pump('P-101', 160, 100);
    sheet.vent(220, 100);
    sheet.legend();
    return sheet.toSVG();
  };
  assert.deepEqual(runQA(base()).fails, [], 'the clean sheet passes');
  const label = (x, y, s) => `<text x="${x}" y="${y}" font-size="6" font-family="Arial, sans-serif" fill="#111" text-anchor="start" data-clear="true">${s}</text>`;
  for (const [x, y, what] of [[106, 94, 'bubble'], [165, 94, 'pump'], [221, 91, 'arc']]) {
    const svg = base().replace('</svg>', `${label(x, y, 'NOTE')}\n</svg>`);
    const qa = runQA(svg);
    assert.ok(qa.fails.some((f) => f.code === 'LABEL.CLEARANCE' && /NOTE/.test(f.msg)), `${what}: ${JSON.stringify(qa.fails)}`);
  }
});

test('RED: a legend missing a drawn symbol fails LEGEND.COVERAGE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sch-red-legend-'));
  const build = node([join(SKILL, 'examples', 'pid-dosing-skid', 'build.mjs'), dir]);
  assert.equal(build.status, 0, build.stderr);
  const svg = readFileSync(join(dir, 'drawing.svg'), 'utf8')
    .replace(/<!-- legend kind=[^>]*-->/g, '<!-- legend kind=tank -->');
  writeFileSync(join(dir, 'drawing.svg'), svg);
  const qa = node([join(SKILL, 'scripts', 'qa.mjs'), join(dir, 'drawing.svg')]);
  assert.notEqual(qa.status, 0);
  assert.match(qa.stdout, /LEGEND\.COVERAGE/);
});
