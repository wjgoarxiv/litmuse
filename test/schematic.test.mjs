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
  sheet.instrument('LT-1', 80, 50, { tag: 'below' });
  const svg = sheet.toSVG();
  assert.match(svg, /<text x="36" y="60"[^>]*text-anchor="end"[^>]*>P-1<\/text>/);
  assert.match(svg, /<text x="80" y="68\.8"[^>]*text-anchor="middle"[^>]*>LT-1<\/text>/);
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
