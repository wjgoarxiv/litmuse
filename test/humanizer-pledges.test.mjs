import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

// The lit-humanizer pledge fixture ships in the plugin; these tests run it against the shipped rules.
const SKILL = join(ROOT, 'plugin', 'skills', 'lit-humanizer');
const { parseRules, scanText } = await import(join(SKILL, 'scripts', 'core.mjs'));
const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
const cases = JSON.parse(readFileSync(join(SKILL, 'fixtures', 'pledge-cases.json'), 'utf8'));
const pledgeIds = new Set(cases.new_rule_ids);
const RANK = { none: 0, warn: 1, block: 2 };
const tags = (hits) => hits.map((h) => `${h.rule}/${h.severity}`).join(', ') || 'no hits';

test('each pledge case gets its expected rule at its expected top severity', () => {
  for (const p of cases.pledges) {
    const hits = scanText(p.text, rules, 'pledge.md');
    const top = Math.max(0, ...hits.map((h) => RANK[h.severity]));
    if (p.severity === 'none') assert.equal(hits.length, 0, `pledge ${p.n}: ${tags(hits)}`);
    else {
      assert.equal(top, RANK[p.severity], `pledge ${p.n}: ${tags(hits)}`);
      assert.ok(hits.some((h) => h.rule === p.rule && h.severity === p.severity), `pledge ${p.n}: ${tags(hits)}`);
    }
  }
});

test('every observed pledge, mutation pins included, is blocked by its pledge rule', () => {
  for (const p of cases.pledges_observed) {
    const hits = scanText(p.text, rules, 'observed.md');
    assert.ok(hits.some((h) => h.rule === p.rule && pledgeIds.has(h.rule) && h.severity === 'block'), `${p.text}: ${tags(hits)}`);
  }
});

// The 2026-10-18 mutation pins: each one kills a rule branch that no other case reaches.
test('the pledge fixture carries the seven mutation pins', () => {
  const texts = new Set(cases.pledges_observed.map((p) => p.text));
  for (const text of [
    '두 공정의 수치는 서로 비교할 수 없음.',
    'This table is not meant to be a ranking.',
    'This chart is not a leaderboard.',
    'This summary is not an endorsement.',
    'This report is not intended as a vendor comparison.',
    'These numbers should not be read as a benchmark.',
    'This deck makes no claims about market share.',
  ]) assert.ok(texts.has(text), text);
});

test('near misses stay clear of the pledge rules', () => {
  for (const n of [...cases.near_misses, ...cases.near_misses_review]) {
    const hits = scanText(n.text, rules, 'near-miss.md').filter((h) => pledgeIds.has(h.rule));
    assert.equal(hits.length, 0, `${n.text}: ${tags(hits)}`);
  }
});

test('document cases block on their repeat rule only when expected', () => {
  for (const d of cases.document_cases) {
    const blocked = scanText(d.text, rules, 'document.md').some((h) => h.rule === d.rule && h.severity === 'block');
    assert.equal(blocked, d.expect === 'block', JSON.stringify(d.text));
  }
});
