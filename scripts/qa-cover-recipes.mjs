#!/usr/bin/env node
// Cover recipe regression QA for lit-typographic-motion. It needs Chrome, img2webp/dwebp and a pre-warmed motion
// runtime, so it is not part of `npm test`. Each shipped recipe is re-rendered through the real cover command (every
// gate on the decoded file) and fails when it leaves the row in its expected.json: median d or moving share outside
// ±15 %, seamLocal outside the cover TARGET, more than 2 MiB, or a non-zero exit.
//
// `--negatives` also renders the four slide-like negatives and every regression a recipe declares (`regressions` in
// its expected.json). Each of those declares `mustFail` ("G2.floor", "G1.target"): it passes only when the render
// completed and gated the decoded file, every declared gate failed, and no undeclared FLOOR gate among G1-G4 failed.
// A crash, a missing declaration or a failure on the wrong gate is a QA failure, never a caught defect.
// `--feather N` runs only the painted recipe's declared `feather-N` regression.
//
// The painted recipe relights a painting LitMuse does not ship: pass it with --base <png> (1536x1024 for the shipped
// ART block); without it the painted row is skipped and named as skipped, and `--feather` fails for want of it.
//
//   node scripts/qa-cover-recipes.mjs [--out <dir>] [--only painted-light,weight-tide] [--negatives] [--feather N] [--base <png>]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skill = join(root, 'plugin', 'skills', 'lit-typographic-motion');
const motion = join(skill, 'scripts', 'motion.mjs');
const { COVER, EXIT } = await import(join(skill, 'engine', 'core', 'constants.mjs'));
const FLOOR_GATES = ['G1', 'G2', 'G3', 'G4'];

/**
 * Verdict of one negative or regression case: { ok, why }. It is proven only when the render completed and gated the
 * decoded file (exit 0 or 13 with a manifest), every declared gate failed at its tier, and no undeclared FLOOR gate
 * among G1-G4 failed.
 */
export function judgeCase(mustFail, { status, manifest }) {
  if (!Array.isArray(mustFail) || !mustFail.length) return { ok: false, why: 'it declares no gate it must fail (mustFail)' };
  const gates = manifest?.gate?.gates;
  if (!gates || ![EXIT.OK, EXIT.GATE_FAIL_QA].includes(status)) return { ok: false, why: `the render did not complete and gate the decoded file (exit ${status})` };
  for (const id of mustFail) {
    const [gate, tier] = id.split('.');
    if (!gates[gate]) return { ok: false, why: `${gate} was not measured` };
    if ((tier === 'target' ? gates[gate].target : gates[gate].pass) !== false) return { ok: false, why: `${id} did not fail` };
  }
  const extra = FLOOR_GATES.filter((g) => gates[g]?.pass === false && !mustFail.includes(`${g}.floor`));
  if (extra.length) return { ok: false, why: `it also fails ${extra.map((g) => `${g}.floor`).join(', ')}, which it does not declare` };
  return { ok: true, why: `fails ${mustFail.join(', ')} as declared` };
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

function render(outRoot, base, name, dir, treatment, { assets = null, patch = null } = {}) {
  const out = join(outRoot, name);
  mkdirSync(join(out, 'cover'), { recursive: true });
  const page = readFileSync(join(dir, 'index.html'), 'utf8');
  writeFileSync(join(out, 'cover', 'index.html'), patch ? patch(page) : page);
  if (assets) {
    mkdirSync(join(out, 'cover', 'assets'), { recursive: true });
    cpSync(base, join(out, 'cover', 'assets', 'base.png'));
    writeFileSync(join(out, 'assets.json'), JSON.stringify({ assets: assets.map((a) => ({ ...a, sha256: sha256(readFileSync(join(out, a.path))) })) }, null, 2));
  }
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment, null, 2));
  const r = spawnSync(process.execPath, [motion, 'cover', '--out', out, '--round', '1', '--foreground'], { encoding: 'utf8', env: process.env, timeout: 1200000 });
  return { out, status: r.status, stdout: r.stdout, stderr: r.stderr, manifest: readJson(join(out, 'manifest.json')) };
}

const within = (value, want, share) => Math.abs(value - want) <= share * want;
const fmt = (x) => (typeof x === 'number' ? +x.toPrecision(4) : x);
const lastLine = (r) => (r.stderr || r.stdout || '').trim().split('\n').pop();

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => {
    const i = argv.indexOf(`--${k}`);
    if (i < 0) return null;
    return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
  };
  const outRoot = resolve(opt('out') ?? mkdtempSync(join(tmpdir(), 'litmuse-cover-qa-')));
  const feather = opt('feather');
  const only = feather ? [] : opt('only') ? String(opt('only')).split(',') : ['painted-light', 'weight-tide', 'orbit-loop'];
  const base = opt('base') ? resolve(String(opt('base'))) : null;
  const rows = [];
  let failed = 0;

  for (const name of only) {
    const dir = join(skill, 'recipes', name);
    const expected = readJson(join(dir, 'expected.json'));
    if (!expected?.row) {
      failed += 1;
      rows.push(['FAIL', name, `no expected row in recipes/${name}/expected.json`]);
      continue;
    }
    if (expected.assets && !base) {
      rows.push(['SKIPPED', name, 'needs its painting: pass --base <png>']);
      continue;
    }
    const r = render(outRoot, base, name, dir, expected.treatment, { assets: expected.assets ?? null });
    if (!r.manifest) {
      failed += 1;
      rows.push(['NO RENDER', name, `exit ${r.status}: ${lastLine(r)}`]);
      continue;
    }
    const g = r.manifest.gate;
    const e = expected.row;
    const checks = [
      ['medianD', within(g.medianD, e.medianD, 0.15)],
      ['moving', within(g.movingFrac, e.movingFrac, 0.15)],
      ['seamLocal', g.seamLocal >= COVER.target.seamLo && g.seamLocal <= COVER.target.seamLocal],
      ['bytes', r.manifest.bytes <= COVER.targetBytes],
      ['gate', r.status === 0],
    ];
    const bad = checks.filter(([, ok]) => !ok).map(([k]) => k);
    if (bad.length) failed += 1;
    rows.push([bad.length ? `FAIL ${bad.join(',')}` : 'PASS', name, `median d ${fmt(g.medianD)} (row ${e.medianD}) | moving ${fmt(g.movingFrac)} | still ${fmt(g.longestStillSec)} s | spike ${fmt(g.spike)} | seamLocal ${fmt(g.seamLocal)} | ${r.manifest.bytes} B | exit ${r.status}`]);
  }

  const cases = [];
  if (argv.includes('--negatives')) {
    for (const name of ['title-slam', 'card-scenes', 'still-glow', 'reset-sweep']) cases.push({ kind: 'negative', name });
    for (const recipe of ['painted-light', 'weight-tide', 'orbit-loop']) {
      for (const id of Object.keys(readJson(join(skill, 'recipes', recipe, 'expected.json'))?.regressions ?? {})) cases.push({ kind: 'regression', recipe, id });
    }
  }
  if (feather) cases.push({ kind: 'regression', recipe: 'painted-light', id: `feather-${feather}`, explicit: true });

  for (const c of cases) {
    const label = c.kind === 'negative' ? `negative ${c.name}` : `regression ${c.recipe} ${c.id}`;
    let mustFail;
    let r;
    if (c.kind === 'negative') {
      const dir = join(skill, 'recipes', 'negatives', c.name);
      const expected = readJson(join(dir, 'expected.json'));
      if (!expected) {
        failed += 1;
        rows.push(['FAIL', label, `not proven: recipes/negatives/${c.name}/expected.json is missing`]);
        continue;
      }
      mustFail = expected.mustFail;
      const treatment = {
        mode: 'cover', request: 'A shipped negative rendered by the recipe QA.', idea: 'A slide-like page the decoded-file gate has to keep failing.',
        recipe: 'own', recipeReason: 'A regression negative, never a recipe.', brandWord: 'LITMUSE', aspect: '2:1',
        layers: { slow: 'None by design.', mid: 'None by design.', beat: 'Card or text changes.' },
        system: { rule: 'Text states on a timeline.', copies: 'One per card.', offset: 'None.' },
        title: { box: [0.05, 0.3, 0.9, 0.3], kind: 'live' }, ambition: 'It must keep failing its named gates.',
        ...expected.treatment,
      };
      r = render(outRoot, base, `negative-${c.name}`, dir, treatment);
    } else {
      const dir = join(skill, 'recipes', c.recipe);
      const expected = readJson(join(dir, 'expected.json'));
      const reg = expected?.regressions?.[c.id];
      if (!reg) {
        failed += 1;
        rows.push(['FAIL', label, `not proven: ${c.recipe}/expected.json declares no regression ${c.id}`]);
        continue;
      }
      if (!readFileSync(join(dir, 'index.html'), 'utf8').includes(reg.patch.find)) {
        failed += 1;
        rows.push(['FAIL', label, `not proven: the page no longer contains "${reg.patch.find}"`]);
        continue;
      }
      if (expected.assets && !base) {
        if (c.explicit) failed += 1;
        rows.push([c.explicit ? 'FAIL' : 'SKIPPED', label, `${c.explicit ? 'not proven: ' : ''}it needs its painting: pass --base <png>`]);
        continue;
      }
      mustFail = reg.mustFail;
      r = render(outRoot, base, `${c.recipe}-${c.id}`, dir, expected.treatment, { assets: expected.assets ?? null, patch: (s) => s.replace(reg.patch.find, reg.patch.replace) });
    }
    const v = judgeCase(mustFail, r);
    if (!v.ok) failed += 1;
    const gates = r.manifest?.gate?.gates ?? {};
    const failing = Object.entries(gates).flatMap(([k, x]) => (x.pass === false ? [`${k}.floor`] : x.target === false ? [`${k}.target`] : []));
    const detail = r.manifest ? `; failing ${failing.join(',') || 'none'}; ${r.manifest.bytes} B; exit ${r.status}` : `: ${lastLine(r)}`;
    rows.push([v.ok ? 'PASS (fails as declared)' : 'FAIL', label, `${v.ok ? '' : 'not proven: '}${v.why} (declared ${(mustFail ?? []).join(',') || 'none'})${detail}`]);
  }

  for (const [verdict, name, detail] of rows) process.stdout.write(`${verdict.padEnd(24)} ${name.padEnd(36)} ${detail}\n`);
  process.stdout.write(`cover recipe QA: ${failed ? `${failed} FAIL` : 'all PASS'}; renders in ${outRoot}\n`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
