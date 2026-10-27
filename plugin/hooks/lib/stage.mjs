import { readFileSync, writeFileSync, mkdirSync, lstatSync, renameSync, realpathSync, readdirSync } from 'node:fs';
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

// mutate(record) returns the next record (or nothing to keep it). Never throws. `pointer: false` leaves
// `latest.json` alone, for writes that say nothing about which session the user is driving.
export function updateStage(payload, mutate, env = process.env, { pointer = true } = {}) {
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
    if (!pointer) return true;
    const latest = readStage(latestFile(env)) ?? {};
    latest[next.workspace] = { session: payload.session_id, updated: now };
    atomicWrite(latestFile(env), latest);
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

// Liveness: each session's last hook event as one small record, `stage/liveness/<session>.json`, apart from the
// stage record so a tool call never rewrites `latest.json`. PostToolUse and its failure twin say `alive`, Stop says
// `idle`, SessionEnd says `ended`. The card reads these to sort other sessions into running, idle and gone. A
// repeat of the same state inside 30 s writes nothing, so a busy session costs one write per half minute.
export const LIVENESS_STATES = Object.freeze(['alive', 'idle', 'ended']);
const LIVENESS_REPEAT_MS = 30_000;
// A herdr pane id is short and plain (`w2B:p3`); anything else is dropped rather than stored.
const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,31}$/;

export function livenessDir(env = process.env) {
  return join(stageRoot(env), 'liveness');
}

export function readLiveness(env = process.env) {
  try {
    return readdirSync(livenessDir(env)).filter((n) => n.endsWith('.json')).map((n) => readStage(join(livenessDir(env), n))).filter(Boolean);
  } catch {
    return [];
  }
}

export function markLiveness(payload, state, { env = process.env, now = Date.now() } = {}) {
  try {
    const id = safeId(payload?.session_id);
    if (!id || !LIVENESS_STATES.includes(state)) return false;
    const root = stageRoot(env);
    const dir = livenessDir(env);
    if (isLink(root) || !safeDir(dir)) return false;
    const file = join(dir, `${id}.json`);
    const prev = isLink(file) ? null : readStage(file);
    if (prev && prev.state === state && now - Date.parse(prev.at) < LIVENESS_REPEAT_MS) return false;
    const cwd = workspaceOf(payload);
    const pane = typeof env.HERDR_PANE_ID === 'string' && PANE_ID.test(env.HERDR_PANE_ID) ? env.HERDR_PANE_ID : null;
    return atomicWrite(file, { version: 1, session: id, state, at: new Date(now).toISOString(), cwd, workspace: workspaceHash(cwd), pane });
  } catch {
    return false;
  }
}

// The plugin version this session's hooks and skills were loaded from, for the card's restart chip.
export function recordLoadedVersion(payload, version, env = process.env) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) return false;
  return updateStage(payload, (rec) => ({ ...rec, loadedVersion: version }), env, { pointer: false });
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
