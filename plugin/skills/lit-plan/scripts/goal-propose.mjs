#!/usr/bin/env node
// `node <skill-dir>/scripts/goal-propose.mjs plans/<slug>.md`: lit-plan runs this once, after the plan is written, and
// puts what it prints into the approval question. It compiles the plan's `## Done when` block into one Muse goal
// objective, lints it, runs the check once to prove the objective is false now, and records the question in
// `.litmuse/goal/consent.json` under the project's state root. It prints the question that starts the work and sets the
// goal, or, when no goal is possible, the start-only question and the one `No goal set: <reason>` line. An unreadable
// plan prints that reason alone. It never starts work or sets a goal; only the user's exact `yes` does both. The lit-plan write guard allows
// this one command during a planning turn.
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GOAL_STATUS, compileCondition, conditionHash, consentKey, falsify, lintCondition, parseDoneWhen, writeGoalRecord } from '../../../hooks/lib/goal.mjs';
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
    return { line: `${GOAL_STATUS.askedStart}\n${GOAL_STATUS.skipped(reason)}`, consent };
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
  return { line: GOAL_STATUS.asked(built.condition), consent };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { line } = proposeGoal({ cwd: process.cwd(), planArg: process.argv[2] });
  process.stdout.write(`${line}\n`);
}
