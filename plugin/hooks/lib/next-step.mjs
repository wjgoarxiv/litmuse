// The `go` half of the lit-adhd brief and of a saved lit-plan: the collector (or the Stop hook,
// for a plan) writes this session's next-step record under `.litmuse/adhd/`, and a later
// whole-prompt `go` reads it back and deletes it. The session
// binding is the file name, so another session's record is never opened. A step older than 30
// minutes is stale: the brief it came from no longer describes the work.
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { workspaceOf } from './common.mjs';
import { resolveProjectStateRoot } from './workflow-stack.mjs';

// The whole prompt, nothing more: `go`, `lit go`, `ㄱㄱ`, `고` or `진행`, with trailing punctuation.
const GO_PROMPT = /^\s*(?:(?:lit\s+)?go|ㄱㄱ|고|진행)[\s.!?]*$/iu;
export const isGoPrompt = (prompt) => typeof prompt === 'string' && prompt.length <= 64 && GO_PROMPT.test(prompt);

export const NEXT_STEP_MAX_AGE_MS = 30 * 60_000;
const KINDS = new Set(['resume-frame', 'approve-boundary', 'continue-work', 'start-plan', 'none']);

const nextStepFile = (cwd, sessionId) => {
  const id = String(sessionId ?? 'session').replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 128) || 'session';
  return join(resolveProjectStateRoot(cwd), '.litmuse', 'adhd', `next-${id}.json`);
};

const PLAN_NAME = /^plans\/[A-Za-z0-9._-]+\.md$/u;

// `.litmuse` and `.litmuse/adhd` must be real folders (or not there yet): a linked one would carry
// the record out of the project.
const realDirs = (root, dir) => {
  for (const part of [join(root, '.litmuse'), dir]) {
    try {
      if (!lstatSync(part).isDirectory()) return false;
    } catch { /* absent: mkdir makes a real one */ }
  }
  mkdirSync(dir, { recursive: true });
  return !lstatSync(join(root, '.litmuse')).isSymbolicLink() && !lstatSync(dir).isSymbolicLink();
};

/**
 * The lit-plan half of `go`: once a planning turn has saved `plans/<slug>.md`, records it as this
 * session's `start-plan` step, so a whole-prompt `go` within 30 minutes starts start-work on it.
 * Plan names outside `plans/<slug>.md` and linked state folders write nothing. Never throws.
 */
export const putNextStep = (payload, plan, now = Date.now()) => {
  const sessionId = typeof payload?.session_id === 'string' && payload.session_id ? payload.session_id : null;
  if (!sessionId || typeof plan !== 'string' || !PLAN_NAME.test(plan) || /[\r\n]/u.test(plan)) return null;
  try {
    const cwd = workspaceOf(payload);
    const path = nextStepFile(cwd, sessionId);
    if (!realDirs(resolveProjectStateRoot(cwd), dirname(path))) return null;
    const staging = `${path}.${process.pid}.tmp`;
    try {
      unlinkSync(staging);
    } catch { /* no leftover */ }
    const fd = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      writeSync(fd, `${JSON.stringify({ kind: 'start-plan', target: { plan }, at: new Date(now).toISOString() })}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(staging, path);
    return path;
  } catch {
    return null;
  }
};

/**
 * Reads and deletes this session's next-step record. Returns `{kind, target}` when the record is
 * whole and at most 30 minutes old, otherwise null; a stale or unreadable record is deleted all
 * the same. Never throws.
 */
export const takeNextStep = (payload, now = Date.now()) => {
  const sessionId = typeof payload?.session_id === 'string' && payload.session_id ? payload.session_id : null;
  if (!sessionId) return null;
  let cwd = null;
  try {
    cwd = workspaceOf(payload);
  } catch {
    return null;
  }
  if (!cwd) return null;
  const path = nextStepFile(cwd, sessionId);
  let text;
  try {
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 16_384) return null;
      text = readFileSync(fd, 'utf8');
    } catch {
      return null;
    } finally {
      try {
        closeSync(fd);
      } catch { /* already closed */ }
    }
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(path);
    } catch { /* nothing to consume */ }
  }
  try {
    const record = JSON.parse(text);
    const age = now - Date.parse(record.at);
    if (!KINDS.has(record.kind) || !(age >= -60_000 && age <= NEXT_STEP_MAX_AGE_MS)) return null;
    return { kind: record.kind, target: record.target && typeof record.target === 'object' ? record.target : null };
  } catch {
    return null;
  }
};
