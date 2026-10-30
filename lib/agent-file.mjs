import { chmodSync, lstatSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './paths.mjs';
import { packageVersion } from './bundle.mjs';
import { writeFileAtomic, copyFileAtomic } from './safe-write.mjs';
import { inspectBlock, ManagedBlockError, removeBlock, upsertBlock } from './managed-block.mjs';

// The short LitFamily block in Muse's own user rules file, `$XDG_CONFIG_HOME/muse/AGENTS.md`. Muse loads that
// file as user-scope rules in every session (probed on 1.4.14), so it is the one place a global ground rule
// can live without writing into another tool's home. The on/off choice is `agentFile` in LitMuse's own
// config.json; LITMUSE_AGENT_FILE overrides it for a run.

export const AGENT_FILE_ID = 'litmuse';
export const AGENT_FILE_MODES = Object.freeze(['on', 'off']);
// The block is read at the start of every session, so it stays small.
export const AGENT_FILE_MAX_BYTES = 1200;
// Muse cuts a rules file after this many bytes (its startup context limit), so a block past it is never read.
export const MUSE_LOAD_LIMIT = 32000;

const BLOCK_FILE = join(dirname(fileURLToPath(import.meta.url)), 'agent-file-block.md');
const CONFIG_CMD = 'npx @litfamily/litmuse config agentFile';
const QUESTION = 'Add the short LitFamily block to your Muse user rules file? Your own text stays as it is. [Y/n] ';

export const agentFileBody = () => readFileSync(BLOCK_FILE, 'utf8');

function readConfig(env) {
  try {
    const file = paths(env).config;
    if (lstatSync(file).isSymbolicLink()) return {};
    return JSON.parse(readFileSync(file, 'utf8')) ?? {};
  } catch {
    return {};
  }
}

/** `{mode, stored}`: `mode` is what acts (LITMUSE_AGENT_FILE, else the stored value, else on); `stored` is only what the user chose. */
export function readAgentFileSetting(env = process.env) {
  const stored = readConfig(env).agentFile;
  const choice = AGENT_FILE_MODES.includes(stored) ? stored : undefined;
  const override = String(env.LITMUSE_AGENT_FILE ?? '').trim().toLowerCase();
  return { mode: AGENT_FILE_MODES.includes(override) ? override : (choice ?? 'on'), stored: choice };
}

export function writeAgentFileSetting(env, mode) {
  if (!AGENT_FILE_MODES.includes(mode)) throw new Error(`agentFile takes one of: ${AGENT_FILE_MODES.join(', ')}`);
  writeFileAtomic(paths(env).config, `${JSON.stringify({ ...readConfig(env), agentFile: mode }, null, 2)}\n`);
}

// 'missing', 'file', 'symlink' or 'other', without following a link.
function entryKind(path) {
  try {
    const st = lstatSync(path);
    return st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : 'other';
  } catch (e) {
    if (e.code === 'ENOENT') return 'missing';
    throw e;
  }
}

// The file's text, or null when it is not UTF-8 (UTF-16 from a Windows editor, Latin-1): rewriting those would
// corrupt the user's bytes outside the markers.
function readUtf8(path) {
  const bytes = readFileSync(path);
  if (bytes.includes(0) || (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

const reaches = (text, end) => Buffer.byteLength(text.slice(0, end));

/**
 * Installs or removes the block in `path`. Returns `{status, path, backup?, preview?, error?}` with status
 * created | updated | unchanged | removed | absent | dry-run | refused-symlink | refused-not-file |
 * refused-not-utf8 | refused-malformed | refused-too-large | refused-io. The user's file is copied into
 * `backupDir` when the block first goes in, unless an identical copy is already there.
 */
export function applyAgentFile({ path, id = AGENT_FILE_ID, version, body = agentFileBody(), action, dryRun = false, now = new Date(), backupDir }) {
  try {
    const kind = entryKind(path);
    if (kind === 'symlink') return { status: 'refused-symlink', path };
    if (kind === 'other') return { status: 'refused-not-file', path };
    const text = kind === 'file' ? readUtf8(path) : '';
    if (text === null) return { status: 'refused-not-utf8', path };
    let next;
    try {
      next = action === 'uninstall' ? removeBlock(text, id) : upsertBlock(text, { id, version, body }, { created: kind === 'missing' });
    } catch (e) {
      if (e instanceof ManagedBlockError) return { status: 'refused-malformed', path };
      throw e;
    }
    if (!next.changed) return { status: action === 'uninstall' ? 'absent' : 'unchanged', path };
    if (action !== 'uninstall' && reaches(next.text, inspectBlock(next.text, id).end) > MUSE_LOAD_LIMIT) return { status: 'refused-too-large', path };
    if (dryRun) return { status: 'dry-run', path, preview: next.text };
    if (action === 'uninstall') {
      if (next.text === '' && next.created) unlinkSync(path);
      else rewrite(path, next.text);
      return { status: 'removed', path };
    }
    let backup;
    if (backupDir && kind === 'file' && inspectBlock(text, id).state === 'absent' && !alreadySaved(backupDir, text)) {
      backup = join(backupDir, `AGENTS.md.${now.toISOString().replace(/[:.]/g, '-')}.bak`);
      copyFileAtomic(path, backup);
    }
    rewrite(path, next.text);
    return { status: kind === 'file' ? 'updated' : 'created', path, ...(backup ? { backup } : {}) };
  } catch (e) {
    return { status: 'refused-io', path, error: e?.code ?? e?.message };
  }
}

// True when `backupDir` already holds a copy of exactly this text, so turning the block off and on again
// does not pile up identical copies.
function alreadySaved(backupDir, text) {
  try {
    return readdirSync(backupDir).some((name) => /^AGENTS\.md\..*\.bak$/u.test(name) && readUtf8(join(backupDir, name)) === text);
  } catch {
    return false;
  }
}

// Replaces the file through a temporary one and keeps its permissions.
function rewrite(path, text) {
  let mode = null;
  try {
    mode = statSync(path).mode & 0o7777;
  } catch {
    // A new file takes the default mode.
  }
  writeFileAtomic(path, text);
  if (mode !== null) chmodSync(path, mode);
}

/**
 * `present v=<x>` (current), `stale v=<x>` (an older install's block), `truncated v=<x>` (the block sits past
 * Muse's load limit), `absent`, `malformed`, or `symlink` / `not-file` / `not-utf8` for a file LitMuse will not write.
 */
export function agentFileState({ path, id = AGENT_FILE_ID, version }) {
  const kind = entryKind(path);
  if (kind === 'missing') return 'absent';
  if (kind === 'symlink') return 'symlink';
  if (kind === 'other') return 'not-file';
  const text = readUtf8(path);
  if (text === null) return 'not-utf8';
  const found = inspectBlock(text, id);
  if (found.state !== 'present') return found.state;
  if (reaches(text, found.end) > MUSE_LOAD_LIMIT) return `truncated v=${found.version}`;
  return `${found.version === version ? 'present' : 'stale'} v=${found.version}`;
}

export const agentFileLine = (r) => `AGENT_FILE: ${r.status} ${r.path}${r.backup ? ` (backup: ${r.backup})` : ''}${r.error ? ` (${r.error})` : ''}`;

/** The install plan line for the block, shown before anything is written. */
export function agentFilePlan({ env, flags }) {
  const path = paths(env).museRules;
  if (flags.noAgentFile || readAgentFileSetting(env).mode === 'off') return `off (${path} left as it is)`;
  return `Would add the LitFamily block to ${path} (asks first; --yes adds it, --no-agent-file skips)`;
}

/** The install step: adds or refreshes the block when the setting and the user's answer allow it. Returns the paths it wrote. */
export async function installAgentFile({ env, flags, interactive, ask, print, version, backupDir }) {
  const path = paths(env).museRules;
  const { mode, stored } = readAgentFileSetting(env);
  if (flags.noAgentFile) {
    print(`AGENT_FILE: skipped (this run only; ${path} left as it is)`);
    return [];
  }
  if (mode === 'off') {
    print(`AGENT_FILE: off (${path} left as it is; turn on: ${CONFIG_CMD} on)`);
    return [];
  }
  const state = agentFileState({ path, version });
  // A linked, non-file or non-UTF-8 rules file is never written, so asking about it would only mislead.
  if (['symlink', 'not-file', 'not-utf8'].includes(state)) {
    print(`AGENT_FILE: ${state} ${path}; left as it is`);
    return [];
  }
  if (state === 'absent' && !flags.yes && stored !== 'on') {
    if (!interactive || !ask) {
      print(`AGENT_FILE: skipped (add the LitFamily block to ${path}: ${CONFIG_CMD} on)`);
      return [];
    }
    if (!(await ask(QUESTION, { defaultYes: true }))) {
      writeAgentFileSetting(env, 'off');
      print(`AGENT_FILE: off (turn on later: ${CONFIG_CMD} on)`);
      return [];
    }
  }
  const result = applyAgentFile({ path, version, action: 'install', backupDir });
  print(agentFileLine(result));
  return ['created', 'updated'].includes(result.status) ? [path] : [];
}

/** The doctor row for the block. */
export function agentFileRow({ env, version }) {
  const path = paths(env).museRules;
  const { mode } = readAgentFileSetting(env);
  const label = 'agent file';
  if (mode === 'off') return { status: 'INFO', label, detail: `off (${path} left as it is)`, fix: `${CONFIG_CMD} on` };
  const state = agentFileState({ path, version });
  if (state.startsWith('present')) return { status: 'PASS', label, detail: `${state} (${path})` };
  if (state.startsWith('stale')) return { status: 'WARN', label, detail: `${state} (${path}); run npx @litfamily/litmuse install to refresh it` };
  if (state.startsWith('truncated')) return { status: 'WARN', label, detail: `${state} (${path}); Muse cuts a rules file after ${MUSE_LOAD_LIMIT} bytes, so Muse never reads the block; trim the file above it` };
  if (state === 'absent') return { status: 'INFO', label, detail: `absent (${path})`, fix: `${CONFIG_CMD} on` };
  return { status: 'WARN', label, detail: `${state} (${path}); LitMuse leaves the file as it is` };
}

/** `litmuse config [agentFile on|off]`; returns the exit code. */
export function configCommand(args, env = process.env, print = console.log) {
  const [key, value, ...extra] = args;
  const p = paths(env);
  const version = packageVersion();
  if (!key) {
    print(`agentFile ${readAgentFileSetting(env).mode.padEnd(3)} (${AGENT_FILE_MODES.join(', ')})`);
    print(`Change it with: litmuse config agentFile <${AGENT_FILE_MODES.join('|')}>. It acts at once on ${p.museRules}.`);
    return 0;
  }
  if (key !== 'agentFile') {
    print(`Unknown option: ${key}. Options: agentFile`);
    return 2;
  }
  const mode = String(value ?? '').trim().toLowerCase();
  if (!AGENT_FILE_MODES.includes(mode) || extra.length) {
    print(`agentFile takes one of: ${AGENT_FILE_MODES.join(', ')}`);
    return 2;
  }
  try {
    writeAgentFileSetting(env, mode);
  } catch (e) {
    print(`litmuse: could not save the setting: ${e.message}`);
    return 1;
  }
  const result = applyAgentFile({ path: p.museRules, version, action: mode === 'off' ? 'uninstall' : 'install', backupDir: p.backups });
  print(`AGENT_FILE: ${mode}`);
  print(agentFileLine(result));
  return result.status.startsWith('refused') ? 1 : 0;
}

/** Removes the block for `uninstall`; returns the line to print. */
export function removeAgentFile({ env, version, dryRun }) {
  const path = paths(env).museRules;
  const result = applyAgentFile({ path, version, action: 'uninstall', dryRun });
  return result.status === 'dry-run' ? `Would remove the LitFamily block from ${path} (your own text stays)` : agentFileLine(result);
}
