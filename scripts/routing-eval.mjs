#!/usr/bin/env node
// Scores the suggestion rules in plugin/hooks/lib/suggest.mjs against test/fixtures/routing-eval.
//   node scripts/routing-eval.mjs dev             tune here
//   node scripts/routing-eval.mjs heldout         the gate; the file must match heldout.sha256
//   node scripts/routing-eval.mjs heldout --seal  writes heldout.sha256 (only when the half is first written)
//   node scripts/routing-eval.mjs heldout --record  scores the sealed half once and writes heldout-score.json; npm
//                                                  test reads only that record and the digest, never the half itself
// A rule passes at recall >= 0.85 and near-miss false positives <= 0.10. Add --json for machine output.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUGGEST_RULES, firedRules } from '../plugin/hooks/lib/suggest.mjs';

export const RECALL_MIN = 0.85;
export const NEAR_MISS_MAX = 0.10;
export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'routing-eval');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function score(cases) {
  const rules = SUGGEST_RULES.map(({ id }) => {
    const pos = cases.filter((c) => c.expect.includes(id));
    const near = cases.filter((c) => (c.near_miss_of ?? []).includes(id) && !c.expect.includes(id));
    const hit = pos.filter((c) => firedRules(c.prompt).includes(id));
    const fp = near.filter((c) => firedRules(c.prompt).includes(id));
    const recall = pos.length ? hit.length / pos.length : 0;
    const nearMissFp = near.length ? fp.length / near.length : 0;
    return {
      id, positives: pos.length, nearMisses: near.length, recall, nearMissFp,
      pass: pos.length > 0 && recall >= RECALL_MIN && nearMissFp <= NEAR_MISS_MAX,
      missed: pos.filter((c) => !hit.includes(c)).map((c) => c.prompt),
      falsePositives: fp.map((c) => c.prompt),
    };
  });
  const plain = cases.filter((c) => !c.expect.length && !(c.near_miss_of ?? []).length);
  const plainFired = plain.filter((c) => firedRules(c.prompt).length).map((c) => c.prompt);
  return { cases: cases.length, rules, plainFired };
}

/** The held-out half, or a refusal when its bytes no longer match the sealed digest. */
export function readHeldout(dir = FIXTURE_DIR) {
  const raw = readFileSync(join(dir, 'heldout.json'));
  const pinned = readFileSync(join(dir, 'heldout.sha256'), 'utf8').split(/\s+/)[0];
  if (pinned !== sha256(raw)) return { error: `heldout.json does not match heldout.sha256 (${pinned}); the sealed half was edited, so it is not scored.` };
  return { cases: JSON.parse(raw) };
}

function main(argv) {
  const half = argv[0] === 'heldout' ? 'heldout' : 'dev';
  if (half === 'heldout' && argv.includes('--seal')) {
    const raw = readFileSync(join(FIXTURE_DIR, 'heldout.json'));
    writeFileSync(join(FIXTURE_DIR, 'heldout.sha256'), `${sha256(raw)}  heldout.json\n`);
    console.log(`sealed ${sha256(raw)}`);
    return 0;
  }
  let cases;
  if (half === 'heldout') {
    const read = readHeldout();
    if (read.error) { console.error(read.error); return 1; }
    cases = read.cases;
  } else {
    cases = JSON.parse(readFileSync(join(FIXTURE_DIR, 'dev.json'), 'utf8'));
  }
  const result = score(cases);
  if (half === 'heldout' && argv.includes('--record')) {
    const dev = new Set(JSON.parse(readFileSync(join(FIXTURE_DIR, 'dev.json'), 'utf8')).map((c) => c.prompt));
    const record = {
      sha256: sha256(readFileSync(join(FIXTURE_DIR, 'heldout.json'))),
      scored_at: new Date().toISOString().slice(0, 10),
      shared_prompts: cases.filter((c) => dev.has(c.prompt)).length,
      rules: result.rules.map(({ id, positives, nearMisses, recall, nearMissFp, pass }) => ({ id, positives, nearMisses, recall, nearMissFp, pass })),
    };
    writeFileSync(join(FIXTURE_DIR, 'heldout-score.json'), `${JSON.stringify(record, null, 2)}\n`);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ half, ...result }, null, 2));
  } else {
    for (const r of result.rules) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: recall ${r.recall.toFixed(2)} (${r.positives}), near-miss FP ${r.nearMissFp.toFixed(2)} (${r.nearMisses})`);
      for (const m of r.missed) console.log(`  missed: ${m}`);
      for (const f of r.falsePositives) console.log(`  false positive: ${f}`);
    }
    for (const p of result.plainFired) console.log(`  plain prompt fired: ${p}`);
  }
  return result.rules.every((r) => r.pass) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
