import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { run, block, activeRoute, writeSession, workspaceOf } from './lib/common.mjs';
import { continuationHold } from './lib/continuation.mjs';
import { MOTION_ROUTE, evaluateMotionStop } from './lib/motion.mjs';
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

// The lit-plan gate holds a turn at most once, so a model that cannot write the plan still ends. The motion gate holds
// at most twice, then asks the reply to say the render is not done.
run((payload) => {
  markLiveness(payload, 'idle');
  const state = activeRoute(payload);
  if (!state) return;
  if (state.route === MOTION_ROUTE) {
    evaluateMotionStop(payload).then((r) => { if (r.action === 'block') block(r.reason); }).catch(() => {});
    return;
  }
  if (state.route !== 'lit-plan') {
    continuationHold(payload, state);
    return;
  }
  const turn = payload.turn_id ?? state.turnId ?? 'turn';
  const saved = planWrittenSince(workspaceOf(payload), state.activatedAt ?? 0);
  // A saved plan arms a one-word `go` for this session; the skill's closing line says so.
  if (saved) {
    putNextStep(payload, saved);
    return;
  }
  if (state.stopHeldFor === turn) return;
  writeSession(payload, { ...state, stopHeldFor: turn });
  block('LitMuse lit-plan gate: this planning turn has no plan file yet. Write the plan to plans/<slug>.md (task rows as "- [ ] N. <title>"), then end the turn and point the user to /start-work.');
});
