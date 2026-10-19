import { readFileSync, writeFileSync, mkdirSync, lstatSync, renameSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { safeId, workspaceOf } from './common.mjs';

// Per-session stage record: the live "LIT card" data. Muse's /hud cannot show plugin text, so the hooks keep this
// record and `/lit-status` / `litmuse status --card` render it. Every write is best effort: a failure here must
// never change a hook's output or exit code.
const MAX_LANES = 20;
const MAX_BYTES = 16 * 1024;
const MAX_TEXT = 200;

export function stageRoot(env = process.env) {
  const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state');
  return join(stateHome, 'litmuse', 'stage');
}

export function workspaceHash(cwd) {
  let real;
  try { real = realpathSync(cwd); } catch { real = resolve(cwd); }
  return createHash('sha256').update(real).digest('hex').slice(0, 16);
}

export function stageFile(cwd, sessionId, env = process.env) {
  const id = safeId(sessionId);
  return id ? join(stageRoot(env), `${id}.json`) : null;
}

export function latestFile(env = process.env) {
  return join(stageRoot(env), 'latest.json');
}

function isLink(p) {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

// The stage directory (and the litmuse directory above it) must be real directories, and so must the target file.
function safeDir(dir) {
  const parent = join(dir, '..');
  if (isLink(dir) || isLink(parent)) return false;
  try { mkdirSync(dir, { recursive: true }); } catch { return false; }
  return !isLink(dir) && lstatSync(dir).isDirectory();
}

function atomicWrite(file, data) {
  if (isLink(file)) return false;
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_BYTES) return false;
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return true;
}

function clip(v) {
  return typeof v === 'string' ? v.slice(0, MAX_TEXT) : v;
}

export function readStage(file) {
  try {
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    return rec && typeof rec === 'object' && !Array.isArray(rec) ? rec : null;
  } catch {
    return null;
  }
}

// mutate(record) returns the next record (or nothing to keep it). Never throws.
export function updateStage(payload, mutate, env = process.env) {
  try {
    const cwd = workspaceOf(payload);
    const file = stageFile(cwd, payload.session_id, env);
    if (!file) return false;
    const dir = stageRoot(env);
    if (!safeDir(dir)) return false;
    const now = Date.now();
    const prev = readStage(file) ?? { version: 1, session: payload.session_id, lanes: [] };
    const next = mutate({ ...prev, lanes: Array.isArray(prev.lanes) ? [...prev.lanes] : [] }, now) ?? prev;
    next.cwd = cwd;
    next.workspace = workspaceHash(cwd);
    next.updated = now;
    next.lanes = next.lanes.slice(-MAX_LANES);
    for (const k of ['route', 'keyword', 'plan', 'kind']) if (k in next) next[k] = clip(next[k]);
    if (!atomicWrite(file, next)) return false;
    const pointer = readStage(latestFile(env)) ?? {};
    pointer[next.workspace] = { session: payload.session_id, updated: now };
    atomicWrite(latestFile(env), pointer);
    return true;
  } catch {
    return false;
  }
}

export function recordRoute(payload, { route, keyword = null, kind, plan = null, activatedAt = null }, env = process.env) {
  return updateStage(payload, (rec, now) => {
    rec.route = route ?? null;
    rec.keyword = keyword;
    rec.kind = kind;
    if (activatedAt !== null) rec.activatedAt = activatedAt ?? now;
    if (plan !== null) rec.plan = plan;
    if (kind === 'ignite' && plan === null) delete rec.plan;
    return rec;
  }, env);
}

function laneId(payload) {
  for (const k of ['agent_id', 'subagent_id', 'child_session_id', 'tool_use_id']) {
    const id = safeId(payload[k]);
    if (id) return id;
  }
  return null;
}

function laneType(payload) {
  for (const k of ['agent_type', 'subagent_type', 'agent_name', 'role']) {
    if (typeof payload[k] === 'string' && payload[k]) return clip(payload[k]);
  }
  return 'subagent';
}

export function recordLaneStart(payload, env = process.env) {
  return updateStage(payload, (rec, now) => {
    const id = laneId(payload) ?? `lane-${now}-${rec.lanes.length + 1}`;
    rec.lanes.push({ id, type: laneType(payload), startedAt: now, status: 'running' });
    return rec;
  }, env);
}

export function recordLaneStop(payload, env = process.env) {
  return updateStage(payload, (rec, now) => {
    const id = laneId(payload);
    const running = rec.lanes.filter((l) => l.status === 'running');
    // Payloads without an id close the longest-running lane.
    const lane = (id && running.find((l) => l.id === id)) || running[0];
    if (!lane) return rec;
    const failed = /fail|error/i.test(String(payload.status ?? '')) || Boolean(payload.error);
    lane.endedAt = now;
    lane.status = failed ? 'failed' : 'done';
    return rec;
  }, env);
}

export function recordSessionEnd(payload, env = process.env) {
  return updateStage(payload, (rec, now) => {
    rec.route = null;
    rec.kind = 'end';
    rec.endedAt = now;
    for (const l of rec.lanes) {
      if (l.status === 'running') { l.status = 'done'; l.endedAt = now; }
    }
    return rec;
  }, env);
}
