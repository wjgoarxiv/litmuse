// The one next step a lit-adhd brief offers, chosen by a fixed priority over the collected records,
// and the small record `go` reads back:
// Other lanes at work are counted first: while any is, nothing that resumes or starts work here is offered
// (the session that started them must not be told to continue), and only an approval stays, since that is
// the user's call either way.
//   1. this session's paused spine frame, no lane at work -> resume-frame   (`lit continue`)
//   2. a start-work paused at a boundary           -> approve-boundary (shown only, never automatic)
//   3. an active start-work of this session, no lane at work -> continue-work
//   4. a single open plan, no work running and no lane at work -> start-plan (`go` runs it)
//   5. otherwise                                  -> none
import { closeSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const chooseNextStep = (data, sessionId) => {
  const lanes = data.lanes?.count > 0;
  const ownStack = data.workflows.find((frame) => frame.sessionId === sessionId && frame.role === 'spine' && frame.status === 'paused');
  if (sessionId && ownStack && !lanes) {
    return { kind: 'resume-frame', target: { skill: ownStack.skill, stage: ownStack.stage, progress: ownStack.progress.gauge }, say: 'lit continue' };
  }
  const paused = data.startWork.find((work) => work.status === 'paused' && work.pendingBoundary);
  if (paused) {
    return { kind: 'approve-boundary', target: { workId: paused.workId, plan: paused.plan, ...paused.pendingBoundary }, say: 'lit approve', automatic: false };
  }
  if (lanes) return { kind: 'none', target: null };
  const own = data.startWork.find((work) => work.status === 'active' && sessionId && work.sessionId === sessionId);
  if (own) return { kind: 'continue-work', target: { workId: own.workId, plan: own.plan }, say: 'go' };
  const running = data.startWork.some((work) => ['active', 'paused'].includes(work.status));
  const open = data.roadmap.plans.filter((plan) => plan.local && plan.progress.total !== null && plan.progress.done < plan.progress.total);
  if (!running && open.length === 1) {
    return { kind: 'start-plan', target: { plan: open[0].plan }, say: 'go', command: `go ${open[0].plan}` };
  }
  return { kind: 'none', target: null };
};

const fileName = (sessionId) => `next-${String(sessionId ?? 'session').replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 128) || 'session'}.json`;

export const nextStepPath = (stateRoot, sessionId) => join(stateRoot, '.litmuse', 'adhd', fileName(sessionId));

/**
 * Every component from the state root down must be a real directory: a `.litmuse`
 * that is itself a link would otherwise smuggle the record outside the workspace.
 */
const dirOk = (root, dir) => {
  const base = resolve(root);
  const parts = [base, ...dirname(resolve(dir)).replace(base, '').split('/').filter(Boolean).map((_, i, all) => join(base, ...all.slice(0, i + 1)))];
  for (const part of parts) {
    try {
      if (lstatSync(part).isSymbolicLink()) return false;
    } catch { /* not there yet */ }
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return false;
  }
  try {
    return !lstatSync(dir).isSymbolicLink() && lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
};

/** Exclusive staging write: a linked staging file is refused, a stale one is replaced. */
const writeStaging = (staging, text) => {
  const once = () => {
    const fd = openSync(staging, 'wx');
    try {
      writeSync(fd, text);
    } finally {
      closeSync(fd);
    }
  };
  try {
    once();
    return;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  if (lstatSync(staging).isSymbolicLink()) throw new Error(`refusing to write through a linked staging file: ${staging}`);
  unlinkSync(staging);
  once();
};

/**
 * Writes `{kind, target, at}` for this session, whole, through a temporary file.
 * Refuses linked state dirs and staging files, so the record never lands outside
 * the workspace; callers treat a throw as not recorded.
 */
export const writeNextStep = (stateRoot, sessionId, step, now = new Date()) => {
  const path = nextStepPath(stateRoot, sessionId);
  if (!dirOk(stateRoot, dirname(path))) throw new Error(`refusing to write through a linked state dir: ${dirname(path)}`);
  const staging = `${path}.${process.pid}.tmp`;
  writeStaging(staging, `${JSON.stringify({ kind: step.kind, target: step.target, at: now.toISOString() })}\n`);
  renameSync(staging, path);
  return path;
};
