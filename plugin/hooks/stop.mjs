import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { run, block, activeRoute, writeSession, workspaceOf, PLUGIN_ROOT } from './lib/common.mjs';
import { GOAL_STATUS, readGoalRecord, writeGoalRecord } from './lib/goal.mjs';
import { resolveProjectStateRoot } from './lib/workflow-stack.mjs';
import { continuationHold } from './lib/continuation.mjs';
import { putNextStep } from './lib/next-step.mjs';
import { markLiveness } from './lib/stage.mjs';

// The newest plan written since the route started, as `plans/<name>.md`, or null.
function planWrittenSince(cwd, since) {
  const dir = join(cwd, 'plans');
  if (!existsSync(dir)) return null;
  let best = null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    let mtime;
    try {
      mtime = statSync(join(dir, f)).mtimeMs;
    } catch {
      continue; // removed since the listing
    }
    if (mtime >= since && (!best || mtime > best.mtime)) best = { name: `plans/${f}`, mtime };
  }
  return best?.name ?? null;
}

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

// A saved plan with a `## Done when` check needs its goal question before the turn ends: the consent record must name
// this plan and be newer than it. Returns the hold message, or null.
function goalQuestionMissing(cwd, saved) {
  const text = readText(join(cwd, saved));
  if (text === null || !/^##\s+Done when\s*$/imu.test(text) || /^goal:\s*never\s*$/mu.test(text)) return null;
  const consent = readGoalRecord(resolveProjectStateRoot(cwd), 'consent');
  if (consent && consent.plan === saved && Date.parse(consent.askedAt) >= statSync(join(cwd, saved)).mtimeMs - 1000) return null;
  return `LitMuse lit-plan gate: ${saved} has a \`## Done when\` block but no goal question yet. Run \`node ${join(PLUGIN_ROOT, 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs')} ${saved}\` once and put the one line it prints into the approval question, then end the turn.`;
}

// At turn end the goal LitMuse owns is checked the only way a 5 s hook can: when every row of its plan is ticked, the
// session is asked once to run the check and close the goal. Advisory; the model runs the check.
// Independent of the live route: the goal outlives the prompt that started it. Asked once per turn (owner.askedFor).
function ownedGoalReady(payload) {
  const cwd = workspaceOf(payload);
  const root = resolveProjectStateRoot(cwd);
  const owner = readGoalRecord(root, 'owner');
  const turn = payload.turn_id ?? 'turn';
  if (!owner || owner.closed || owner.sessionId !== (payload.session_id ?? null) || owner.askedFor === turn) return null;
  const text = readText(join(cwd, String(owner.plan ?? '')));
  if (text === null || /^- \[ \] (?:\d+|F\d+)\. /mu.test(text) || !/^- \[x\] /imu.test(text)) return null;
  writeGoalRecord(root, 'owner', { ...owner, askedFor: turn });
  return `LitMuse goal check [lit:${owner.id}]: every row of ${owner.plan} is ticked. Run \`${owner.check}\` once. When it exits 0, call update_goal with status complete and show: ${GOAL_STATUS.met(owner.id)}. When it fails, say which test failed and keep the goal open.`;
}

const safely = (read) => {
  try {
    return read();
  } catch {
    return null;
  }
};

// The lit-plan gate holds a turn at most once, so a model that cannot write the plan still ends.
run((payload) => {
  markLiveness(payload, 'idle');
  const goalHold = safely(() => ownedGoalReady(payload));
  if (goalHold) block(goalHold);
  const state = activeRoute(payload);
  if (!state) return;
  const turn = payload.turn_id ?? state.turnId ?? 'turn';
  if (state.route !== 'lit-plan') {
    continuationHold(payload, state);
    return;
  }
  const saved = planWrittenSince(workspaceOf(payload), state.activatedAt ?? 0);
  // A saved plan arms a one-word `go` for this session; the skill's closing line says so.
  if (saved) {
    const ask = state.stopHeldFor === `goal:${turn}` ? null : safely(() => goalQuestionMissing(workspaceOf(payload), saved));
    if (ask) {
      writeSession(payload, { ...state, stopHeldFor: `goal:${turn}` });
      block(ask);
    }
    putNextStep(payload, saved);
    return;
  }
  if (state.stopHeldFor === turn) return;
  writeSession(payload, { ...state, stopHeldFor: turn });
  block('LitMuse lit-plan gate: this planning turn has no plan file yet. Write the plan to plans/<slug>.md (task rows as "- [ ] N. <title>"), then end the turn and point the user to /start-work.');
});
