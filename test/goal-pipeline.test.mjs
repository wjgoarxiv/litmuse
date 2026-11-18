import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCondition, conditionHash, consentAnswer, consentIsLive, falsify, lintCondition, parseDoneWhen, readGoalRecord, sweepGoalState, writeGoalRecord, GOAL_STATUS } from '../plugin/hooks/lib/goal.mjs';
import { proposeGoal } from '../plugin/skills/lit-plan/scripts/goal-propose.mjs';
import { parseFrontmatter, PLUGIN_DIR } from '../lib/bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOKS = join(HERE, '..', 'plugin', 'hooks');
const PROPOSE = join(HERE, '..', 'plugin', 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs');
const PLAN = '# Flag\n\n## Done when\n\n- check: `npm test`\n\n## Tasks\n\n- [ ] 1. Add the flag\n- [ ] 2. Test it\n';

function project(planText = PLAN) {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-goal-'));
  mkdirSync(join(ws, 'plans'));
  writeFileSync(join(ws, 'plans', 'flag.md'), planText);
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }));
  return ws;
}
const env = { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-goal-state-')) };
function hook(name, payload, ws) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], { input: JSON.stringify({ cwd: ws, ...payload }), cwd: ws, encoding: 'utf8', env });
  let context = '';
  try { context = JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? ''; } catch { /* no JSON */ }
  return { code: r.status, stderr: r.stderr, context };
}

test('the Done when block compiles to one objective; lint refuses judgment words, outward-only success and unlisted commands', () => {
  assert.deepEqual(parseDoneWhen(PLAN), { ok: true, check: 'npm test' });
  assert.equal(parseDoneWhen('# x\n').ok, false);
  const built = compileCondition({ plan: 'plans/flag.md', check: 'npm test' });
  assert.match(built.condition, /^Every row in plans\/flag\.md is ticked and `npm test` exits 0 \[lit:[0-9a-f]{8}\]$/);
  assert.ok(lintCondition(built.condition, 'npm test').ok);
  assert.match(lintCondition('x', 'npm test && it works').reasons.join(';'), /judgment words/);
  assert.match(lintCondition('x', '잘 동작하면 끝').reasons.join(';'), /judgment words/);
  assert.match(lintCondition('x', 'git push origin main').reasons.join(';'), /push, publish or release/);
  assert.match(lintCondition('x'.repeat(501), 'npm test').reasons.join(';'), /over 500/);
  assert.equal(compileCondition({ plan: `plans/${'a'.repeat(480)}.md`, check: 'npm test' }).ok, false);
});

test('the dry run must see the objective false now; already-true, hanging and unrunnable checks set no goal', () => {
  const run = (status, extra = {}) => () => ({ status, ...extra });
  assert.equal(falsify({ cwd: '.', plan: 'p', planText: PLAN, check: 'npm test', run: run(1) }).ok, true);
  assert.match(falsify({ cwd: '.', plan: 'p', planText: '- [x] 1. done\n', check: 'npm test', run: run(0) }).reason, /already true/);
  assert.match(falsify({ cwd: '.', plan: 'p', planText: PLAN, check: 'npm test', run: run(null, { error: { code: 'ETIMEDOUT' } }) }).reason, /did not finish/);
  assert.match(falsify({ cwd: '.', plan: 'p', planText: PLAN, check: 'npm test', run: run(127) }).reason, /cannot run/);
});

test('goal-propose prints the consent question and records it; a plan without Done when gets a named reason', () => {
  const ws = project();
  const { line, consent } = proposeGoal({ cwd: ws, planArg: 'plans/flag.md' });
  assert.equal(line, GOAL_STATUS.asked(consent.condition));
  assert.match(line, /^Approve plan, start work and set goal: \/goal Every row in plans\/flag\.md is ticked and `npm test` exits 0 \[lit:[0-9a-f]{8}\]\? \(yes \/ edit \/ no\)$/);
  assert.equal(readGoalRecord(ws, 'consent').hash, conditionHash(consent.condition));
  const bare = project('# x\n- [ ] 1. a\n');
  assert.equal(proposeGoal({ cwd: bare, planArg: 'plans/flag.md' }).line, 'Approve plan and start work? (yes / no)\nNo goal set: the plan has no `## Done when` block');
  assert.equal(proposeGoal({ cwd: bare, planArg: '../etc/passwd' }).line, 'No goal set: give the plan as plans/<slug>.md inside this project');
});

test('consent: only an exact yes, edit or no answers, and only while the question is fresh', () => {
  assert.equal(consentAnswer(' YES '), 'yes');
  assert.equal(consentAnswer('yes please'), null);
  assert.equal(consentAnswer('sure'), null);
  const condition = 'c [lit:0123abcd]';
  const consent = { condition, hash: conditionHash(condition), askedAt: new Date().toISOString() };
  assert.ok(consentIsLive(consent));
  assert.equal(consentIsLive({ ...consent, hash: 'tampered' }), false);
  assert.equal(consentIsLive({ ...consent, askedAt: new Date(Date.now() - 31 * 60_000).toISOString() }), false);
});

test('the planning turn may run goal-propose and nothing like it; a lit-tagged create_goal needs the armed yes', () => {
  const ws = project();
  hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'lit plan a flag', session_id: 'g1', turn_id: 't1' }, ws);
  assert.equal(hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g1', tool_name: 'bash', tool_input: { command: `node ${PROPOSE} plans/flag.md` } }, ws).code, 0);
  assert.equal(hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g1', tool_name: 'bash', tool_input: { command: `node ${PROPOSE} plans/flag.md; rm -rf x` } }, ws).code, 2);
  assert.equal(hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g1', tool_name: 'bash', tool_input: { command: 'node other.mjs plans/flag.md' } }, ws).code, 2);
  const forged = hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g9', tool_name: 'create_goal', tool_input: { objective: 'Every row in plans/flag.md is ticked and `npm test` exits 0 [lit:0123abcd]' } }, ws);
  assert.equal(forged.code, 2);
  assert.match(forged.stderr, /only after the user typed yes/);
  assert.equal(hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g9', tool_name: 'create_goal', tool_input: { objective: 'my own goal' } }, ws).code, 0, 'a hand goal passes');
});

test('yes arms the exact objective and starts the plan; create_goal then makes LitMuse the owner; a ticked plan asks for the check', () => {
  const ws = project();
  const { consent } = proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'g2' });
  const answered = hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'yes', session_id: 'g2', turn_id: 't2' }, ws);
  assert.match(answered.context, /LIT IGNITED · start-work/);
  assert.ok(answered.context.includes(`call create_goal with objective exactly \`${consent.condition}\``));
  assert.equal(readGoalRecord(ws, 'intent').condition, consent.condition);
  assert.equal(hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'yes', session_id: 'g2', turn_id: 't3' }, ws).context.includes('create_goal'), false, 'a second yes is ordinary text');
  assert.equal(hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g2', tool_name: 'create_goal', tool_input: { objective: consent.condition } }, ws).code, 0);
  assert.equal(hook('pre-tool-use', { hook_event_name: 'PreToolUse', session_id: 'g2', tool_name: 'create_goal', tool_input: { objective: `${consent.condition.slice(0, -12)}[lit:ffffffff]` } }, ws).code, 2, 'a changed objective is refused');
  const set = hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'g2', tool_name: 'create_goal', tool_input: { objective: consent.condition } }, ws);
  assert.match(set.context, /LitMuse goal set \[lit:[0-9a-f]{8}\]/);
  assert.equal(readGoalRecord(ws, 'owner').sessionId, 'g2');
  assert.ok(readGoalRecord(ws, 'intent').consumedAt);
  assert.equal(hook('stop', { hook_event_name: 'Stop', session_id: 'g2', turn_id: 't2' }, ws).stderr.includes('goal check'), false, 'open rows: no goal hold');
  writeFileSync(join(ws, 'plans', 'flag.md'), PLAN.replaceAll('- [ ]', '- [x]'));
  const ready = hook('stop', { hook_event_name: 'Stop', session_id: 'g2', turn_id: 't4' }, ws);
  assert.equal(ready.code, 2);
  assert.match(ready.stderr, /Run `npm test` once\. When it exits 0, call update_goal with status complete/);
  hook('post-tool-use', { hook_event_name: 'PostToolUse', session_id: 'g2', tool_name: 'update_goal', tool_input: { status: 'complete' } }, ws);
  assert.equal(readGoalRecord(ws, 'owner').closed.status, 'complete');
});

test('lit cancel closes only the goal LitMuse owns; edit re-asks; no sets nothing', () => {
  const ws = project();
  writeGoalRecord(ws, 'owner', { condition: 'c [lit:0123abcd]', id: '0123abcd', plan: 'plans/flag.md', check: 'npm test', sessionId: 'g3', closed: null });
  const cancel = hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'lit cancel', session_id: 'g3', turn_id: 't' }, ws);
  assert.match(cancel.context, /when its objective is exactly `c \[lit:0123abcd\]`, call update_goal with status blocked/);
  assert.match(cancel.context, /When it is any other goal, leave it untouched/);
  assert.doesNotMatch(hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'lit cancel', session_id: 'other', turn_id: 't' }, ws).context, /update_goal/, 'another session owns nothing here');
  const ws2 = project();
  proposeGoal({ cwd: ws2, planArg: 'plans/flag.md', sessionId: 'g4' });
  assert.match(hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'edit', session_id: 'g4', turn_id: 't' }, ws2).context, /run goal-propose on it again/);
  assert.ok(consentIsLive(readGoalRecord(ws2, 'consent')), 'edit keeps the question open');
  assert.match(hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'no', session_id: 'g4', turn_id: 't' }, ws2).context, /Nothing started and no goal set: you said no/);
  assert.equal(readGoalRecord(ws2, 'intent'), null);
});

test('a saved plan with Done when holds the planning turn once until its goal question exists', () => {
  const ws = project();
  hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt: 'lit plan a flag', session_id: 'g5', turn_id: 't5' }, ws);
  writeFileSync(join(ws, 'plans', 'flag.md'), PLAN);
  const held = hook('stop', { hook_event_name: 'Stop', session_id: 'g5', turn_id: 't5' }, ws);
  assert.equal(held.code, 2);
  assert.match(held.stderr, /goal-propose\.mjs plans\/flag\.md` once/);
  assert.equal(hook('stop', { hook_event_name: 'Stop', session_id: 'g5', turn_id: 't5' }, ws).code, 0, 'held at most once');
});

test('SessionStart sweeps a stale question; read-only skills carry goal: never and never call create_goal', () => {
  const ws = project();
  writeGoalRecord(ws, 'consent', { condition: 'c', hash: conditionHash('c'), askedAt: new Date(Date.now() - 3_600_000).toISOString() });
  sweepGoalState(ws);
  assert.equal(existsSync(join(ws, '.litmuse', 'goal', 'consent.json')), false);
  for (const id of ['lit-adhd', 'review-work', 'litresearch', 'lit-brainstorm', 'ultra-brainstorm', 'lit-crucible', 'lit-comprehend', 'lit-handoff']) {
    const text = readFileSync(join(PLUGIN_DIR, 'skills', id, 'SKILL.md'), 'utf8');
    assert.equal(parseFrontmatter(text).goal, 'never', `${id}: goal: never`);
    assert.doesNotMatch(text, /\bcall `?create_goal/i, `${id} never sets a goal`);
  }
});

test('no skill keeps an "if available" hedge around the native goal tools', () => {
  for (const id of readdirSync(join(PLUGIN_DIR, 'skills'))) {
    const file = join(PLUGIN_DIR, 'skills', id, 'SKILL.md');
    if (!existsSync(file)) continue;
    assert.doesNotMatch(readFileSync(file, 'utf8'), /(?:get_goal|create_goal|update_goal)[^.\n]{0,80}\b(?:if|when) (?:it is |they are )?(?:available|exposed)\b|capability-gated actions/i, id);
  }
});
