import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_DIR } from '../lib/bundle.mjs';
import { estimate, readLaunchAnswer } from '../plugin/skills/ultra-brainstorm/scripts/estimate.mjs';
import { spawnSync } from 'node:child_process';
import { detectRoute } from '../plugin/hooks/lib/routes.mjs';

const SKILL = readFileSync(join(PLUGIN_DIR, 'skills', 'ultra-brainstorm', 'SKILL.md'), 'utf8');

test('the estimator gives a measured range per count and refuses counts outside 10-900', () => {
  // Calibrated on Muse 1.4.23: every child's first model call carries ~33k tokens of host system and tool prompt, and a
  // Workflow child makes at least two calls (its answer, then submit_result).
  const e = estimate(100);
  assert.equal(e.line, '100 idea agents (effort minimal) + 4 reducers (effort low) + 1 judge (session effort) ≈ 3.8M–9.2M tokens');
  assert.deepEqual([e.low, e.high], [3_800_000, 9_230_000]);
  assert.ok(estimate(300).low > 3 * 3_500_000, 'scales with the agent count');
  assert.match(estimate(10).line, /≈ 0\.5M–1\.2M tokens$/u);
  assert.equal(estimate(9), null);
  assert.equal(estimate(901), null);
});

test('lit ultra and ultra-brainstorm route to the skill', () => {
  assert.equal(detectRoute('lit ultra names for a note tool').route, 'ultra-brainstorm');
  assert.equal(detectRoute('ultra-brainstorm names for a note tool').route, 'ultra-brainstorm');
});

test('a plain no to the launch question ends the skill at once; silence launches nothing', () => {
  assert.match(SKILL, /A plain `no` \(also `stop`, `cancel`, `아니`, `아니요`\) ends the skill at once with the reply "Nothing launched\." and no second question\./u);
  assert.match(SKILL, /Silence, "sure", "ok" or anything else that is not a number is no answer: ask once more/u);
});

test('the launch answer is read the same whether typed or returned as the picked option label', () => {
  // request_user_input hands back the option label verbatim; a host may also add its own "(Recommended)" tag.
  for (const [answer, agents] of [['100', 100], ['100 (recommended minimum)', 100], ['(Recommended) 100 (recommended minimum)', 100], ['300명 (Recommended)', 300], ['300', 300], ['  250 agents ', 250], ['1,000', null]]) {
    const got = readLaunchAnswer(answer);
    if (agents === null) assert.equal(got.kind, 'too-many', answer);
    else assert.deepEqual(got, { kind: 'go', agents }, answer);
  }
  for (const answer of ['100 or 300?', '100-300', 'sure', 'ok', '', '9']) assert.equal(readLaunchAnswer(answer).kind, 'ask-again', answer);
  for (const answer of ['no', 'No.', 'stop', 'cancel', '아니', '아니요']) assert.equal(readLaunchAnswer(answer).kind, 'stop', answer);
  const script = join(PLUGIN_DIR, 'skills', 'ultra-brainstorm', 'scripts', 'estimate.mjs');
  const cli = spawnSync(process.execPath, [script, '--answer'], { input: '(Recommended) 100 (recommended minimum)\n', encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), { kind: 'go', agents: 100 });
  assert.match(SKILL, /estimate\.mjs --answer/u, 'the skill reads the answer through the script');
});

test('the reply reaches the parser only as heredoc data: shell syntax in it never runs, and the argument form is refused', () => {
  const script = join(PLUGIN_DIR, 'skills', 'ultra-brainstorm', 'scripts', 'estimate.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-reply-'));
  const reply = '$(touch made-by-subst) `touch made-by-backtick` 100';
  const shell = spawnSync('/bin/sh', ['-c', `node "${script}" --answer <<'LIT_REPLY_END_9Q7'\n${reply}\nLIT_REPLY_END_9Q7\n`], { cwd: dir, encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  assert.deepEqual(JSON.parse(shell.stdout), { kind: 'go', agents: 100 });
  assert.deepEqual(readdirSync(dir), [], 'nothing in the reply ran');
  for (const extra of [['--answer', '100'], ['--answer', '$(touch x)'], ['--reply']]) {
    const r = spawnSync(process.execPath, [script, ...extra], { input: '100\n', encoding: 'utf8' });
    assert.notEqual(r.status, 0, extra.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.ok(SKILL.includes("<<'LIT_REPLY_END_9Q7'"), 'the skill names the fixed delimiter');
  assert.match(SKILL, /If any line of the reply equals `LIT_REPLY_END_9Q7`, do not run the command: treat the reply as `ask-again`\./u);
});
