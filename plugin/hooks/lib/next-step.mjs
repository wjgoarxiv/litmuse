// The `go` half of the lit-adhd brief: the collector writes this session's next-step record
// under `.litmuse/adhd/`, and a later whole-prompt `go` reads it back and deletes it. The session
// binding is the file name, so another session's record is never opened. A step older than 30
// minutes is stale: the brief it came from no longer describes the work.
import { closeSync, constants, fstatSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

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
