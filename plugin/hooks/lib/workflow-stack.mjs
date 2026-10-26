// The session's workflow stack, `.litmuse/workflow-stack/<session>.json`: where each running
// discipline stands, so asking for something in the middle of a loop or a plan run pauses that
// work instead of erasing it. The bottom frame is the spine (the main line of work); a discipline
// started on top of it is a side frame. A successor in the main chain finishes the frame below it
// instead of pausing it. Asking for a skill already in the stack resumes its frame with its stage
// and count; `lit continue` on a side frame closes it and resumes the paused spine. Read-only
// disciplines never touch the stack. `applyStackEvent` is pure; the store below writes one small
// file per session, whole, and the status card reads it back through its own guarded read. Frames
// keep skills, stages and counts only; never a prompt, a command or a path other than a
// project-relative plan name.
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const MAX_FRAMES = 3;
export const MAX_HISTORY = 20;
export const MAX_STACK_BYTES = 64 * 1024;
export const STACK_DROP_MS = 24 * 60 * 60 * 1000;
export const READ_ONLY_DISCIPLINES = Object.freeze(['lit-recap', 'lit-comprehend', 'lit-handoff', 'lit-adhd', 'lit-rewind']);

// Order in the main chain; a newcomer of a higher rank succeeds the frame below it.
const CHAIN_RANK = Object.freeze({
  'deep-interview': 0,
  'lit-brainstorm': 0,
  'lit-crucible': 1,
  'lit-plan': 1,
  'start-work': 2,
  litwork: 2,
  litgoal: 2,
  autoresearch: 2,
  'lit-loop': 2,
  'review-work': 3,
});
const MAX_VERDICTS = 8;
const PLAN_REF = /^plans\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.md$/u;

// Where each LitMuse discipline enters the map. Skills without an entry start as side frames.
const DISCIPLINE_ENTRY = Object.freeze({
  'deep-interview': { family: 'main', stage: 'interview' },
  'lit-brainstorm': { family: 'main', stage: 'interview' },
  'lit-crucible': { family: 'main', stage: 'plan' },
  'lit-plan': { family: 'main', stage: 'plan' },
  'start-work': { family: 'main', stage: 'work' },
  litwork: { family: 'main', stage: 'work' },
  litgoal: { family: 'main', stage: 'work' },
  autoresearch: { family: 'main', stage: 'work' },
  'lit-loop': { family: 'loop', stage: 'PIN' },
  'review-work': { family: 'main', stage: 'review' },
  litresearch: { family: 'research', stage: 'decompose' },
});
const WORKFLOW_FAMILIES = Object.freeze({
  main: Object.freeze(['interview', 'plan', 'work', 'review', 'done']),
  research: Object.freeze(['decompose', 'wave', 'expand', 'verify', 'synthesis']),
  loop: Object.freeze(['PIN', 'RED', 'GREEN', 'VERIFY', 'REVIEW', 'RECORD']),
});
const STAGE_ALIASES = Object.freeze({ SURFACE: 'VERIFY', CLEAN: 'RECORD' });
export const REVIEW_LANES = Object.freeze([
  Object.freeze({ id: 'goal', words: Object.freeze(['goal', 'scope', 'diff']) }),
  Object.freeze({ id: 'quality', words: Object.freeze(['quality', 'package', 'payload']) }),
  Object.freeze({ id: 'security', words: Object.freeze(['security', 'provenance']) }),
  Object.freeze({ id: 'qa', words: Object.freeze(['qa', 'tests', 'evidence']) }),
  Object.freeze({ id: 'context', words: Object.freeze(['context', 'surface', 'docs', 'readiness']) }),
]);
const STAGE_UNITS = Object.freeze(['task', 'criterion', 'iteration', 'wave', 'round']);
const VERDICT_STATES = Object.freeze(['pass', 'fail', 'pending', 'running']);

export const normalizeStage = (family, stage) => {
  const stages = WORKFLOW_FAMILIES[family];
  if (!stages) return null;
  const raw = String(stage ?? '').trim();
  const named = family === 'loop' ? STAGE_ALIASES[raw.toUpperCase()] ?? raw.toUpperCase() : raw.toLowerCase();
  return stages.includes(named) ? named : null;
};

export const emptyStack = (sessionId) => ({ version: 1, sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null, frames: [], history: [] });

const countOf = (value) => (Number.isInteger(value) && value >= 0 && value <= 9999 ? value : undefined);
const planRef = (ref) => (ref && typeof ref.plan === 'string' && PLAN_REF.test(ref.plan) && !ref.plan.includes('..') ? { plan: ref.plan } : undefined);
const isSuccessor = (skill, frame) => CHAIN_RANK[skill] !== undefined && CHAIN_RANK[frame.skill] !== undefined && CHAIN_RANK[skill] > CHAIN_RANK[frame.skill];

const newFrame = (skill, ref, role, at) => {
  const entry = DISCIPLINE_ENTRY[skill];
  const frame = { skill, family: entry?.family ?? null, stage: entry?.stage ?? null, role, status: 'active', verdicts: {}, at };
  const plan = planRef(ref);
  if (plan) frame.ref = plan;
  return frame;
};

// A saved plan, or a review whose five lanes have all reported: what comes next replaces it.
const isFinished = (frame) => frame.done === true
  || (frame.family === 'main' && frame.stage === 'review' && REVIEW_LANES.every(({ id }) => ['pass', 'fail'].includes(frame.verdicts?.[id])));

const counts = (frame) => ({ stage: frame.stage, n: frame.n, total: frame.total });

/**
 * Applies one event to the stack and returns the next stack with the transitions it made
 * (`started`, `paused`, `resumed`, `side.done`, `finished`, `dropped`), which the caller may log.
 * Events: `start {skill, ref?, restart?}`, `continue`, `move {family, stage, n?, total?, unit?,
 * done?, verdicts?, ref?, scope?}` (the hooks' observations) and `record {...same fields}`.
 */
export const applyStackEvent = (stack, event, now = new Date()) => {
  const at = now.toISOString();
  const transitions = [];
  const note = (type, frame) => transitions.push({ type, skill: frame.skill, ...counts(frame) });
  let frames = (Array.isArray(stack?.frames) ? stack.frames : [])
    .filter((frame) => now.getTime() - Date.parse(frame.at) <= STACK_DROP_MS)
    .map((frame) => ({ ...frame }));
  const pause = (frame) => {
    if (frame.status === 'paused') return;
    frame.status = 'paused';
    frame.pausedAt = at;
    note('paused', frame);
  };
  const activate = (frame) => {
    const wasPaused = frame.status === 'paused';
    frame.status = 'active';
    frame.at = at;
    delete frame.pausedAt;
    if (wasPaused) note('resumed', frame);
  };
  const closeAbove = (index, type) => {
    for (const frame of frames.slice(index + 1).reverse()) note(type, frame);
    frames = frames.slice(0, index + 1);
  };
  const push = (frame) => {
    frames.push(frame);
    note('started', frame);
    while (frames.length > MAX_FRAMES) {
      const side = frames.findIndex((candidate, index) => index < frames.length - 1 && candidate.role === 'side');
      const [dropped] = frames.splice(side === -1 ? 0 : side, 1);
      note('dropped', dropped);
    }
  };

  const start = (skill, ref, restart) => {
    if (READ_ONLY_DISCIPLINES.includes(skill)) return;
    const hasFamily = Boolean(DISCIPLINE_ENTRY[skill]);
    if (restart) {
      closeAbove(-1, 'finished');
      push(newFrame(skill, ref, hasFamily ? 'spine' : 'side', at));
      return;
    }
    const existing = frames.findLastIndex((frame) => frame.skill === skill);
    if (existing !== -1) {
      const wanted = planRef(ref);
      const kept = frames[existing].ref?.plan;
      if (!isFinished(frames[existing]) && (!wanted || !kept || wanted.plan === kept)) {
        closeAbove(existing, 'side.done');
        activate(frames[existing]);
        if (wanted) frames[existing].ref = wanted;
        return;
      }
      const role = frames[existing].role;
      closeAbove(existing - 1, 'finished');
      if (frames.length) pause(frames.at(-1));
      push(newFrame(skill, ref, role, at));
      return;
    }
    let inherited = null;
    let handed = null;
    while (frames.length && isFinished(frames.at(-1))) {
      const done = frames.pop();
      note('finished', done);
      inherited = done.role;
      handed = handed ?? done.ref;
    }
    // Work that follows a plan in the main chain carries the plan's name on, so its count is the plan's.
    const carried = (from) => ref ?? (CHAIN_RANK[skill] >= CHAIN_RANK['start-work'] ? from : undefined);
    const top = frames.at(-1);
    if (!top) {
      push(newFrame(skill, carried(handed), hasFamily ? inherited ?? 'spine' : 'side', at));
    } else if (!frames.some((frame) => frame.role === 'spine')) {
      closeAbove(-1, 'finished');
      push(newFrame(skill, ref, hasFamily ? 'spine' : 'side', at));
    } else if (hasFamily && isSuccessor(skill, top)) {
      frames.pop();
      note(top.role === 'spine' ? 'finished' : 'side.done', top);
      push(newFrame(skill, carried(top.ref ?? handed), top.role, at));
    } else {
      pause(top);
      push(newFrame(skill, ref, 'side', at));
    }
  };

  const update = (frame, fields) => {
    const stage = normalizeStage(fields.family, fields.stage) ? String(fields.stage).trim() : null;
    if (!stage) return;
    const named = fields.family === 'loop' ? stage.toUpperCase() : stage.toLowerCase();
    const sameStage = frame.family === fields.family && frame.stage === named;
    frame.family = fields.family;
    frame.stage = named;
    for (const key of ['n', 'total']) {
      const value = countOf(fields[key]);
      if (value !== undefined) frame[key] = value;
    }
    if (STAGE_UNITS.includes(fields.unit)) frame.unit = fields.unit;
    if (typeof fields.done === 'boolean') frame.done = fields.done;
    const plan = planRef(fields.ref);
    if (plan) frame.ref = plan;
    const given = Object.entries(fields.verdicts ?? {}).filter(([name, state]) => /^[a-z][a-z0-9-]{0,23}$/u.test(name) && VERDICT_STATES.includes(state));
    frame.verdicts = Object.fromEntries([...Object.entries(sameStage ? frame.verdicts ?? {} : {}), ...given].slice(-MAX_VERDICTS));
    frame.at = at;
  };

  switch (event?.type) {
    case 'start':
      start(event.skill, event.ref, event.restart === true);
      break;
    case 'continue': {
      const top = frames.at(-1);
      const spine = frames.findLastIndex((frame) => frame.role === 'spine');
      if (top?.role === 'side' && spine !== -1) {
        closeAbove(spine, 'side.done');
        activate(frames[spine]);
      }
      break;
    }
    case 'move': {
      const target = event.scope === 'nearest'
        ? frames.findLast((frame) => frame.family === event.family && frame.stage === event.stage)
        : frames.at(-1);
      if (target && target.family === event.family && (event.scope === 'nearest' || target.status === 'active')) update(target, event);
      break;
    }
    case 'record':
      if (frames.length) update(frames.at(-1), event);
      else if (normalizeStage(event.family, event.stage)) {
        const frame = { skill: null, family: event.family, stage: null, role: 'spine', status: 'active', verdicts: {}, at };
        update(frame, event);
        push(frame);
      }
      break;
    default:
      break;
  }

  if (frames.length && frames.at(-1).status !== 'active') activate(frames.at(-1));
  const history = [...(Array.isArray(stack?.history) ? stack.history : []), ...transitions.map(({ type, skill }) => ({ event: type, skill, at }))].slice(-MAX_HISTORY);
  return { stack: { version: 1, sessionId: stack?.sessionId ?? null, frames, history }, transitions };
};

// State placement: the outermost git root owns `.litmuse`, so a nested package shares its
// parent's state; without git the workspace itself owns it.
export const resolveProjectStateRoot = (startDir = process.cwd()) => {
  const start = resolve(startDir);
  let root = null;
  let current = start;
  for (;;) {
    if (existsSync(join(current, '.git'))) root = current;
    const parent = dirname(current);
    if (parent === current) return root ?? start;
    current = parent;
  }
};

const fileName = (sessionId) => `${String(sessionId ?? 'session').replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 128) || 'session'}.json`;

export const stackPath = (cwd, sessionId) => join(resolveProjectStateRoot(cwd), '.litmuse', 'workflow-stack', fileName(sessionId));

const STATE_GITIGNORE = '# Created by LitMuse: local session state, not for commits.\n*\n';

// Every component from the project root down must be a real directory: lstat sees only the
// final component, so a `.litmuse` that is itself a link would otherwise smuggle writes elsewhere.
const stateDirOk = (root, dir) => {
  const rel = dirname(resolve(dir)).replace(resolve(root), '');
  const parts = [resolve(root), ...rel.split('/').filter(Boolean).map((_, i, all) => join(resolve(root), ...all.slice(0, i + 1)))];
  for (const part of parts) {
    try {
      // Missing components are fine: mkdir creates them as real directories below.
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

/** Reads the session's stack; a link, a non-file, an oversized or malformed file reads as empty. */
export const readStack = (cwd, sessionId) => {
  const empty = emptyStack(sessionId);
  let fd;
  try {
    const path = stackPath(cwd, sessionId);
    if (!lstatSync(path).isFile()) return empty;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    if (size > MAX_STACK_BYTES) return empty;
    const buffer = Buffer.alloc(size);
    readSync(fd, buffer, 0, size, 0);
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (!parsed || !Array.isArray(parsed.frames) || parsed.frames.length > MAX_FRAMES) return empty;
    return { ...empty, frames: parsed.frames, history: Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [] };
  } catch {
    return empty;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

/** Writes the whole stack through a temporary file; a link at the destination is replaced, never followed. */
export const writeStack = (cwd, sessionId, stack) => {
  const root = resolveProjectStateRoot(cwd);
  const path = stackPath(cwd, sessionId);
  if (!stateDirOk(root, dirname(path))) return stack;
  try {
    writeFileSync(join(dirname(dirname(path)), '.gitignore'), STATE_GITIGNORE, { flag: 'wx' });
  } catch { /* an existing ignore file stays as it is */ }
  const staging = `${path}.${process.pid}.tmp`;
  writeFileSync(staging, `${JSON.stringify(stack)}\n`, { flag: 'w' });
  renameSync(staging, path);
  return stack;
};
