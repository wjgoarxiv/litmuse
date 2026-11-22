#!/usr/bin/env node
// `node <skill-dir>/scripts/goal-propose.mjs plans/<slug>.md`: lit-plan runs this once, after the plan is written, and
// puts what it prints into the approval question. It compiles the plan's `## Done when` block into one Muse goal
// objective, lints it, runs the check once to prove the objective is false now, and records the question in
// `.litmuse/goal/consent.json` under the project's state root. It prints the question that starts the work and sets the
// goal, or, when no goal is possible, the start-only question and the one `No goal set: <reason>` line; a blank line and
// the answer guide follow any question, for the model to render under it. An unreadable plan prints that reason alone. It never starts work or sets a goal; only the user's exact `yes` does both. The lit-plan write guard allows
// this one command during a planning turn.
// `node <skill-dir>/scripts/goal-propose.mjs --loop --check "<check>" <objective...>` is the lit-loop form: a run with no
// plan asks one goal question once its failing check exists (the check must fail now; a check that already passes, cannot
// run or is not allowlisted records nothing and prints only `No goal set: <reason>`). Its `yes` arms the goal and starts no
// start-work.
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GOAL_STATUS, answerGuide, buildLoopConsent, compileCondition, conditionHash, consentKey, falsify, lintCondition, parseDoneWhen, writeGoalRecord } from '../../../hooks/lib/goal.mjs';
import { resolveProjectStateRoot } from '../../../hooks/lib/workflow-stack.mjs';

export function proposeGoal({ cwd, planArg, now = Date.now(), timeoutMs, run, sessionId = null } = {}) {
  const planPath = resolve(cwd, String(planArg ?? ''));
  const plan = relative(cwd, planPath);
  if (!planArg || isAbsolute(plan) || plan.startsWith('..') || !/^plans\/[\w.-]+\.md$/u.test(plan)) return { line: GOAL_STATUS.skipped('give the plan as plans/<slug>.md inside this project') };
  let planText;
  try {
    planText = readFileSync(planPath, 'utf8');
  } catch {
    return { line: GOAL_STATUS.skipped(`${plan} cannot be read`) };
  }
  const askedAt = new Date(now).toISOString();
  // No goal is possible: the question still approves the plan and starts the work, and names why there is no goal.
  const startOnly = (reason) => {
    const consent = { version: 1, goal: false, plan, reason, sessionId, askedAt };
    consent.hash = conditionHash(consentKey(consent));
    writeGoalRecord(resolveProjectStateRoot(cwd), 'consent', consent);
    return { line: `${GOAL_STATUS.askedStart}\n${GOAL_STATUS.skipped(reason)}`, guide: answerGuide('start'), consent };
  };
  if (/^goal:\s*never\s*$/mu.test(planText)) return startOnly('this plan is marked goal: never');
  const done = parseDoneWhen(planText);
  if (!done.ok) return startOnly(done.reason);
  const built = compileCondition({ plan, check: done.check });
  if (!built.ok) return startOnly(built.reason);
  const lint = lintCondition(built.condition, done.check);
  if (!lint.ok) return startOnly(lint.reasons.join('; '));
  const dry = falsify({ cwd, plan, planText, check: done.check, ...(timeoutMs ? { timeoutMs } : {}), ...(run ? { run } : {}) });
  if (!dry.ok) return startOnly(dry.reason);
  const consent = { version: 1, goal: true, condition: built.condition, hash: conditionHash(built.condition), id: built.id, plan, check: done.check, sessionId, askedAt };
  writeGoalRecord(resolveProjectStateRoot(cwd), 'consent', consent);
  return { line: GOAL_STATUS.asked(built.condition), guide: answerGuide('plan', built.condition), consent };
}

export function proposeLoopGoal({ cwd, check, objective, now = Date.now(), timeoutMs, run, sessionId = null } = {}) {
  const proposed = buildLoopConsent({ cwd, check, objective, now, timeoutMs, run, sessionId });
  if (proposed.consent) writeGoalRecord(resolveProjectStateRoot(cwd), 'consent', proposed.consent);
  return proposed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [first, ...rest] = process.argv.slice(2);
  const { line, guide } = first === '--loop' && rest[0] === '--check'
    ? proposeLoopGoal({ cwd: process.cwd(), check: rest[1], objective: rest.slice(2).join(' ') })
    : proposeGoal({ cwd: process.cwd(), planArg: first });
  process.stdout.write(guide ? `${line}\n\n${guide}\n` : `${line}\n`);
}
