import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, lstatSync, realpathSync, renameSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { digestMismatch } from './digest.mjs';

export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STDIN_LIMIT = 256 * 1024;

export function readPayload() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.length > STDIN_LIMIT) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

// Every hook exits 0 on its own errors: a broken hook must never block the user's session. The one exception is
// a digest mismatch: the code on disk differs from what the user approved, so the hook refuses (exit 2).
export function run(main) {
  const mismatch = digestMismatch();
  if (mismatch) block(`LitMuse hook integrity check failed (digest ${mismatch}). Reinstall with npx @litfamily/litmuse install and approve the hooks again.`);
  try {
    main(readPayload());
  } catch {
    process.exitCode = 0;
  }
}

export function emitContext(event, text) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } })}\n`);
}

export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

export function workspaceOf(payload) {
  return typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
}

export function safeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

// State lives in real directories only: a `.litmuse` (or subdirectory) that is a link, for example one shipped in a
// cloned repository, would send the hook's writes somewhere else, so the write is skipped.
function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function realStateDir(payload, sub) {
  const top = join(workspaceOf(payload), '.litmuse');
  for (const dir of [top, join(top, sub)]) {
    try {
      if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) return null;
    } catch {
      // absent is fine; mkdir creates a real directory
    }
  }
  return join(top, sub);
}

// Route state lives outside the workspace, under $XDG_STATE_HOME/litmuse/sessions/<workspace hash>/, where no
// planning-turn tool may write. Next to the state file sits an append-only journal of route changes.
export function sessionPath(cwd, sessionId, env = process.env) {
  const id = safeId(sessionId);
  if (!id) return null;
  const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state');
  let real;
  try { real = realpathSync(cwd); } catch { real = resolve(cwd); }
  const ws = createHash('sha256').update(real).digest('hex').slice(0, 16);
  return join(stateHome, 'litmuse', 'sessions', ws, `${id}.json`);
}

export function sessionFile(payload) {
  return sessionPath(workspaceOf(payload), payload.session_id);
}

function lastJournalRoute(file) {
  try {
    const lines = readFileSync(file.replace(/\.json$/, '.journal'), 'utf8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]).route ?? null;
  } catch {
    return null;
  }
}

// Fails closed: a corrupt state file counts as an active lit-plan route, and a missing one falls back to the
// journal, so removing or breaking the state never lifts a planning limit.
export function readSession(payload) {
  const file = sessionFile(payload);
  if (!file) return null;
  if (!existsSync(file)) {
    const route = lastJournalRoute(file);
    return route ? { route, fromJournal: true } : null;
  }
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (!state || typeof state !== 'object') throw new Error('bad state');
    return state;
  } catch {
    return { route: 'lit-plan', corrupt: true };
  }
}

export function writeSession(payload, state) {
  const file = sessionFile(payload);
  if (!file || isLink(file) || isLink(dirname(file))) return;
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file);
  appendFileSync(file.replace(/\.json$/, '.journal'), `${JSON.stringify({ ts: Date.now(), route: state.route ?? null })}\n`);
}

export function activeRoute(payload) {
  const state = readSession(payload);
  return state && state.route ? state : null;
}

export function appendLedger(payload, entry) {
  const id = safeId(payload.session_id);
  if (!id) return;
  const dir = realStateDir(payload, 'ledger');
  if (!dir) return;
  const file = join(dir, `${id}.jsonl`);
  if (isLink(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

export function toolName(payload) {
  return typeof payload.tool_name === 'string' ? payload.tool_name : typeof payload.tool === 'string' ? payload.tool : '';
}

export function toolInput(payload) {
  const input = payload.tool_input ?? payload.input ?? payload.arguments;
  return input && typeof input === 'object' ? input : {};
}

export function pluginVersion() {
  try {
    return JSON.parse(readFileSync(join(PLUGIN_ROOT, '.muse-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

export function cachedLatest() {
  try {
    const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    const cache = JSON.parse(readFileSync(join(dataHome, 'litmuse', 'update-check.json'), 'utf8'));
    return typeof cache.latest === 'string' ? cache.latest : null;
  } catch {
    return null;
  }
}

export function newerThan(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}
