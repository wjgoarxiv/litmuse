// R1: the plan-approval `yes` approves the plan, starts start-work on it and arms its goal in one step; with no goal
// possible it still starts the work; a refused start arms nothing.
import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conditionHash, consentIsLive, readGoalRecord, writeGoalRecord, GOAL_STATUS } from '../plugin/hooks/lib/goal.mjs';
import { proposeGoal } from '../plugin/skills/lit-plan/scripts/goal-propose.mjs';
import { stageRoot, workspaceHash } from '../plugin/hooks/lib/stage.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const PLAN = '# Flag\n\ngoal: native\n\n## Done when\n\n- check: `npm test`\n\n## Tasks\n\n- [ ] 1. Add the flag\n- [ ] 2. Test it\n';
const BARE = '# Flag\n\n## Tasks\n\n- [ ] 1. Add the flag\n';
const env = { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-approve-state-')) };

function project(planText = PLAN) {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-approve-'));
  mkdirSync(join(ws, 'plans'));
  writeFileSync(join(ws, 'plans', 'flag.md'), planText);
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }));
  return ws;
}
function prompt(ws, text, session, turn = 't') {
  const r = spawnSync(process.execPath, [join(HOOKS, 'user-prompt-submit.mjs')], { input: JSON.stringify({ cwd: ws, hook_event_name: 'UserPromptSubmit', prompt: text, session_id: session, turn_id: turn }), cwd: ws, encoding: 'utf8', env });
  try { return JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? ''; } catch { return ''; }
}

test('the question offers start and goal together, or start alone with the one reason no goal is possible', () => {
  const ws = project();
  const { line, consent } = proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a1' });
  assert.match(line, /^Approve plan, start work and set goal: \/goal Every row in plans\/flag\.md is ticked and `npm test` exits 0, or the latest reply starts with WAITING-ON-USER:, or after 30 turns \[lit:[0-9a-f]{8}\]\? \(yes \/ edit \/ no\)$/);
  assert.equal(consent.goal, true);
  const bare = project(BARE);
  const plain = proposeGoal({ cwd: bare, planArg: 'plans/flag.md' });
  assert.equal(plain.line, 'Approve plan and start work? (yes / no)\nNo goal set: the plan has no `## Done when` block');
  assert.equal(plain.consent.goal, false);
  assert.ok(consentIsLive(readGoalRecord(bare, 'consent')), 'the start-only question is live too');
  assert.equal(proposeGoal({ cwd: bare, planArg: 'plans/missing.md' }).line, 'No goal set: plans/missing.md cannot be read', 'an unreadable plan asks nothing');
});

test('yes starts start-work on the plan and arms its exact goal in one step', () => {
  const ws = project();
  const { consent } = proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a1' });
  const ctx = prompt(ws, 'yes', 'a1');
  assert.match(ctx, /LIT IGNITED · start-work/);
  assert.match(ctx, /Plan: plans\/flag\.md\. The user's yes approves the plan, starts the work and sets its goal/);
  assert.ok(ctx.includes(`call create_goal with objective exactly \`${consent.condition}\``));
  assert.equal(readGoalRecord(ws, 'intent').condition, consent.condition);
});

test('yes on a start-only question starts the work and arms no goal', () => {
  const ws = project(BARE);
  proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a2' });
  const ctx = prompt(ws, 'yes', 'a2');
  assert.match(ctx, /LIT IGNITED · start-work/);
  assert.match(ctx, /No goal set: the plan has no `## Done when` block/);
  assert.doesNotMatch(ctx, /create_goal with objective/);
  assert.equal(readGoalRecord(ws, 'intent'), null);
});

test('edit re-asks, no and silence start nothing and arm nothing', () => {
  const ws = project();
  proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a3' });
  assert.doesNotMatch(prompt(ws, 'tell me more about row 2', 'a3'), /LIT IGNITED · start-work/, 'silence (another prompt) starts nothing');
  assert.ok(consentIsLive(readGoalRecord(ws, 'consent')), 'the question stays open');
  assert.match(prompt(ws, 'edit', 'a3'), /ask the approval question again/);
  const no = prompt(ws, 'no', 'a3');
  assert.match(no, /Nothing started and no goal set: you said no/);
  assert.doesNotMatch(no, /LIT IGNITED · start-work/);
  assert.equal(readGoalRecord(ws, 'intent'), null);
});

test('a stale or tampered question is not answered by yes', () => {
  const ws = project();
  const { consent } = proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a4' });
  writeGoalRecord(ws, 'consent', { ...consent, hash: conditionHash('something else') });
  assert.doesNotMatch(prompt(ws, 'yes', 'a4'), /LIT IGNITED · start-work/);
  writeGoalRecord(ws, 'consent', { ...consent, askedAt: new Date(Date.now() - 31 * 60_000).toISOString() });
  assert.doesNotMatch(prompt(ws, 'yes', 'a4'), /LIT IGNITED · start-work/);
  assert.equal(readGoalRecord(ws, 'intent'), null);
});

test('a refused start arms no goal and says why in one fixed line', () => {
  const ws = project();
  proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a5' });
  // Another live session already runs start-work on this plan.
  mkdirSync(join(stageRoot(env), 'liveness'), { recursive: true });
  writeFileSync(join(stageRoot(env), 'other-run.json'), JSON.stringify({ version: 1, session: 'other-run', route: 'start-work', plan: 'plans/flag.md', cwd: ws, workspace: workspaceHash(ws), updated: Date.now(), lanes: [] }));
  writeFileSync(join(stageRoot(env), 'liveness', 'other-run.json'), JSON.stringify({ version: 1, session: 'other-run', state: 'alive', at: new Date().toISOString(), cwd: ws, workspace: workspaceHash(ws) }));
  const ctx = prompt(ws, 'yes', 'a5');
  assert.match(ctx, /Work not started and no goal set: another session is already running start-work on plans\/flag\.md/);
  assert.doesNotMatch(ctx, /LIT IGNITED · start-work/);
  assert.equal(readGoalRecord(ws, 'intent'), null);
  const gone = project();
  proposeGoal({ cwd: gone, planArg: 'plans/flag.md', sessionId: 'a6' });
  writeFileSync(join(gone, 'plans', 'flag.md'), PLAN.replaceAll('- [ ]', '- [x]'));
  assert.match(prompt(gone, 'yes', 'a6'), /Work not started and no goal set: plans\/flag\.md has no open row/);
  assert.equal(readGoalRecord(gone, 'intent'), null);
  assert.equal(GOAL_STATUS.notStarted('x'), 'Work not started and no goal set: x');
});

test('a yes typed while a read-only skill holds the session starts nothing', () => {
  const ws = project();
  proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'a7' });
  prompt(ws, 'lit adhd', 'a7', 't1');
  assert.doesNotMatch(prompt(ws, 'yes', 'a7', 't2'), /LIT IGNITED · start-work/);
  assert.equal(readGoalRecord(ws, 'intent'), null);
  assert.ok(consentIsLive(readGoalRecord(ws, 'consent')), 'the question waits for the planning session');
});

test('only the session that was asked can answer: another session\'s yes does nothing, the same session\'s yes starts and arms', () => {
  const ws = project();
  const { consent } = proposeGoal({ cwd: ws, planArg: 'plans/flag.md', sessionId: 'asker' });
  const foreign = prompt(ws, 'yes', 'stranger');
  assert.doesNotMatch(foreign, /LIT IGNITED · start-work/, 'another session\'s yes starts nothing');
  assert.ok(foreign.includes('Approval not recorded for this session. Run: lit start plans/flag.md'), 'and it says why instead of staying silent');
  assert.equal(readGoalRecord(ws, 'intent'), null);
  assert.ok(consentIsLive(readGoalRecord(ws, 'consent')), 'the question stays open for the session that was asked');
  const ctx = prompt(ws, 'yes', 'asker');
  assert.match(ctx, /LIT IGNITED · start-work/);
  assert.equal(readGoalRecord(ws, 'intent').condition, consent.condition);
  const unowned = project();
  proposeGoal({ cwd: unowned, planArg: 'plans/flag.md' });
  const unstamped = prompt(unowned, 'yes', 'anyone');
  assert.doesNotMatch(unstamped, /LIT IGNITED · start-work/, 'a question with no asking session is answered by nobody');
  assert.ok(unstamped.includes('Approval not recorded for this session. Run: lit start plans/flag.md'));
  assert.equal(readGoalRecord(unowned, 'intent'), null);
});

test('PostToolUse stamps the asking session on the question goal-propose just wrote', () => {
  const ws = project();
  proposeGoal({ cwd: ws, planArg: 'plans/flag.md' });
  const r = spawnSync(process.execPath, [join(HOOKS, 'post-tool-use.mjs')], { input: JSON.stringify({ cwd: ws, hook_event_name: 'PostToolUse', session_id: 'planner', tool_name: 'bash', tool_input: { command: `node ${join(HOOKS, '..', 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs')} plans/flag.md` } }), cwd: ws, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readGoalRecord(ws, 'consent').sessionId, 'planner');
  assert.doesNotMatch(prompt(ws, 'yes', 'someone-else'), /LIT IGNITED · start-work/);
  assert.match(prompt(ws, 'yes', 'planner'), /LIT IGNITED · start-work/);
});
