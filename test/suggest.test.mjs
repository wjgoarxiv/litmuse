import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_SKILLS, SUGGEST_RULES, catalogLine, firedRules, requestText } from '../plugin/hooks/lib/suggest.mjs';
import { NEAR_MISS_MAX, RECALL_MIN, readHeldout, sha256 } from '../scripts/routing-eval.mjs';

// Feature B: a prompt without `lit` gets a suggestion (fitting skills plus "none") or one compact catalog line, and
// a rule ships only when it clears the gate on the sealed held-out half of the routing fixture.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'test', 'fixtures', 'routing-eval');
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-suggest-state-'));
let n = 0;

function submit(text) {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-suggest-')));
  n += 1;
  const r = spawnSync(process.execPath, [join(ROOT, 'plugin', 'hooks', 'user-prompt-submit.mjs')], {
    input: JSON.stringify({ prompt: text, session_id: `s${n}`, turn_id: 't', cwd: ws }), cwd: ws, encoding: 'utf8',
    env: { ...process.env, XDG_STATE_HOME: STATE_HOME }, timeout: 30_000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
}

test('S-B-07 the held-out half is sealed: its bytes match heldout.sha256', () => {
  const pinned = readFileSync(join(FIX, 'heldout.sha256'), 'utf8').split(/\s+/)[0];
  assert.equal(sha256(readFileSync(join(FIX, 'heldout.json'))), pinned);
});

test('R10-6 S-B-07 the held-out half is scored once, outside npm test: the recorded score matches the sealed digest and every shipped rule passed', () => {
  const rec = JSON.parse(readFileSync(join(FIX, 'heldout-score.json'), 'utf8'));
  const pinned = readFileSync(join(FIX, 'heldout.sha256'), 'utf8').split(/\s+/)[0];
  assert.equal(rec.sha256, pinned, 'the record scores the sealed half');
  assert.equal(rec.shared_prompts, 0, 'dev and held-out share no prompt');
  assert.deepEqual(rec.rules.map((r) => r.id), SUGGEST_RULES.map((r) => r.id), 'exactly the shipped rules were scored');
  for (const r of rec.rules) {
    assert.ok(r.positives >= 5 && r.nearMisses >= 3, `${r.id} has too few cases to judge`);
    assert.ok(r.recall >= RECALL_MIN && r.nearMissFp <= NEAR_MISS_MAX && r.pass, `${r.id} recall ${r.recall} FP ${r.nearMissFp}`);
  }
});

test('R10-6 the dev loop never scores the held-out half', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts['eval:routing'], 'node scripts/routing-eval.mjs dev');
  const src = readFileSync(new URL('./suggest.test.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /score\(/, 'no test scores a fixture half');
});

test('S-B-07 the eval refuses a tampered held-out file', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-eval-')));
  mkdirSync(join(dir, 'fx'));
  copyFileSync(join(FIX, 'dev.json'), join(dir, 'fx', 'dev.json'));
  copyFileSync(join(FIX, 'heldout.sha256'), join(dir, 'fx', 'heldout.sha256'));
  writeFileSync(join(dir, 'fx', 'heldout.json'), `${readFileSync(join(FIX, 'heldout.json'), 'utf8')} `);
  assert.match(readHeldout(join(dir, 'fx')).error, /does not match heldout\.sha256/);
  assert.equal(readHeldout().error, undefined, 'the shipped half reads clean');
});

test('S-B-01 "plot this csv" gets a suggestion that names the skill, offers none, and loads nothing itself', () => {
  const ctx = submit('plot this csv');
  assert.match(ctx, /LitMuse suggestion, not an instruction: this prompt may fit\n- lit-scientific-visualization: /);
  assert.match(ctx, /\n- none of these\n/);
  assert.match(ctx, /Decide yes or no for each from the request itself/);
});

test('S-B-02 a Korean request fires the same rule', () => {
  assert.match(submit('이 csv 파일 플롯 그려줘'), /- lit-scientific-visualization: /);
});

test('S-B-03 a prompt with no fitting rule gets only the compact catalog line', () => {
  const ctx = submit('thanks');
  assert.equal(ctx, catalogLine());
  assert.ok(Buffer.byteLength(ctx) <= 300);
  for (const id of CATALOG_SKILLS) assert.ok(existsSkill(id), `${id} is a LitMuse skill`);
});

test('S-B-04 lit prompts and slash commands never get a suggestion', () => {
  assert.doesNotMatch(submit('lit plot this csv'), /LitMuse suggestion/);
  assert.doesNotMatch(submit('/help plot this csv'), /LitMuse suggestion|LitMuse skills/);
});

test('S-B-05 text inside fences, inline code and host notifications is not the request', () => {
  assert.deepEqual(firedRules('```\nplot results.csv\n```\nok'), []);
  assert.deepEqual(firedRules('<task-notification>review the diff</task-notification> thanks'), []);
  assert.equal(requestText('a `b` c').includes('b'), false);
});

test('S-B-06 knowledge questions and near misses do not fire', () => {
  assert.deepEqual(firedRules('what is a flowchart'), []);
  assert.deepEqual(firedRules('PR 리뷰가 뭐야'), []);
  assert.deepEqual(firedRules('chart a course through the backlog'), []);
});

test('S-B-08 every suggestion line stays inside its byte budget', () => {
  const ctx = submit('plot this csv and draw an architecture diagram');
  assert.ok(Buffer.byteLength(ctx) <= 900, `${Buffer.byteLength(ctx)} B`);
  for (const line of ctx.split('\n').filter((l) => l.startsWith('- '))) assert.ok(Buffer.byteLength(line) <= 160, line);
});

function existsSkill(id) {
  try { readFileSync(join(ROOT, 'plugin', 'skills', id, 'SKILL.md')); return true; } catch { return false; }
}

test('R4-L an absolute path is not a slash command; a real slash command still is', async () => {
  const { hasSlash } = await import('../plugin/hooks/lib/suggest.mjs');
  for (const p of ['plot /Users/me/data.csv as a chart', 'read /tmp/x.log', 'diff /a/b /c/d']) assert.equal(hasSlash(p), false, p);
  for (const p of ['/review-work now', 'please run /lit-plan', '/start-work']) assert.equal(hasSlash(p), true, p);
});
