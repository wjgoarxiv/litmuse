#!/usr/bin/env node
// Test double for the `muse` CLI. It records every argv line in FAKE_MUSE_LOG and keeps plugin state
// in FAKE_MUSE_STATE, answering with the JSON shapes Muse Code 1.4.10 printed during the task-1 probe.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, lstatSync, cpSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const log = process.env.FAKE_MUSE_LOG;
if (log) writeFileSync(log, `${JSON.stringify(args)}\n`, { flag: 'a' });

const statePath = process.env.FAKE_MUSE_STATE;
const state = statePath && existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { installed: false, approved: [], source: null, extraSkills: [] };
const save = () => statePath && writeFileSync(statePath, JSON.stringify(state));
const out = (obj, code = 0) => { process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`); process.exit(code); };
const dataHome = process.env.XDG_DATA_HOME || join(process.env.HOME, '.local', 'share');
const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME, '.config');

function manifest() {
  return JSON.parse(readFileSync(join(state.source, '.muse-plugin', 'plugin.json'), 'utf8'));
}
function agents() {
  const dir = join(state.source, 'agents');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort() : [];
}

if (args[0] === '--version') {
  process.stdout.write('Muse Code 1.4.10 (fake)\n');
  process.exit(0);
}

const [group, cmd, target] = args;
if (group === 'plugins' && cmd === 'validate') {
  if (process.env.FAKE_MUSE_INVALID) out({ valid: false, diagnostics: [{ code: 'bad', message: 'fake invalid' }] }, 1);
  out({ valid: true, source_path: target, diagnostics: [] });
}
if (group === 'plugins' && cmd === 'list') {
  out({ plugins: state.installed ? [{ record: { id: 'litmuse', version: manifest().version, enabled: true, source: { provenance: 'native-local', path: state.source } }, warning: 'third-party plugin' }] : [] });
}
if (group === 'plugins' && (cmd === 'install' || cmd === 'update')) {
  if (cmd === 'install') state.source = target;
  // Muse 1.4.10 resets agent-definition approvals whenever the package changes; hook approvals survive.
  if (cmd === 'update') state.approved = state.approved.filter((id) => !id.includes(':agent_definition:'));
  state.installed = true;
  const cache = join(dataHome, 'muse', 'plugins', 'cache', 'local', 'litmuse', 'fakehash', 'package');
  mkdirSync(cache, { recursive: true });
  mkdirSync(join(dataHome, 'muse', 'plugins'), { recursive: true });
  writeFileSync(join(dataHome, 'muse', 'plugins', 'installed.json'), JSON.stringify({ version: 1, plugins: { litmuse: { id: 'litmuse' } } }));
  save();
  out({ installed: { id: 'litmuse', version: manifest().version, enabled: true, cache_path: cache }, diagnostics: [] });
}
if (group === 'plugins' && cmd === 'inspect') {
  if (!state.installed) out({ error: { code: 'unknown-plugin' } }, 1);
  const hooks = manifest().capabilities.hooks.map((h) => ({
    candidate: { kind: 'hook', plugin_id: 'litmuse', capability_id: h.id, stable_id: `plugin:litmuse:hook:${h.id}` },
    status: state.approved.includes(`litmuse:hook:${h.id}`) ? 'trusted_enabled' : 'review_needed',
  }));
  const ags = agents().map((a, i) => ({
    candidate: { plugin_id: 'litmuse', scoped_definition_id: `litmuse/${a}`, original_ordinal: i },
    status: state.approved.includes(`litmuse:agent_definition:litmuse/${a}`) ? 'trusted_enabled' : 'review_needed',
  }));
  out({ record: { id: 'litmuse', version: manifest().version, enabled: true }, valid: true, runtime_capabilities: [...hooks, ...ags] });
}
if (group === 'plugins' && cmd === 'approve') {
  state.approved.push(target);
  save();
  const settings = join(configHome, 'muse', 'settings.json');
  const s = existsSync(settings) ? JSON.parse(readFileSync(settings, 'utf8')) : { schema_version: 1 };
  s.runtime_capabilities = { ...(s.runtime_capabilities || {}), [target]: { enabled: true } };
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, JSON.stringify(s, null, 2));
  out({ decision: 'approve', runtime_capabilities: [{ stable_id: target, enabled: true }] });
}
if (group === 'plugins' && cmd === 'remove') {
  state.installed = false;
  state.approved = [];
  save();
  out({ removed: 'litmuse' });
}
// User skills, as Muse Code 1.4.15 printed them: `muse skills install` copies a folder into $CONFIG_DIR/skills/<id>,
// records each file's hash in $CONFIG_DIR/skills/.muse/lock.json, and refuses an occupied folder; `uninstall` deletes
// the recorded files and keeps the rest; `list` reads project, user and personal folders in precedence order and
// reports the losers as skill-shadowed.
const home = process.env.HOME;
const museDir = join(configHome, 'muse');
const userSkills = join(museDir, 'skills');
const lockPath = join(userSkills, '.muse', 'lock.json');
const readLock = () => (existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : { version: 1, skills: {} });
const writeLock = (l) => { mkdirSync(dirname(lockPath), { recursive: true }); writeFileSync(lockPath, JSON.stringify(l, null, 2)); };
const fail = (code, message) => { process.stderr.write(`${message}\n`); out({ error: { code, message, details: {} } }, 1); };
function files(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isDirectory()) files(p, base, acc);
    else if (st.isFile()) acc.push({ relative_path: relative(base, p).split('\\').join('/'), sha256: `sha256:${createHash('sha256').update(readFileSync(p)).digest('hex')}`, bytes: st.size });
  }
  return acc;
}
const flagValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

if (group === 'skills' && cmd === 'install') {
  if (process.env.FAKE_MUSE_SKILL_INSTALL_FAIL) fail('fake-install-failed', 'fake install failure');
  const src = resolve(target);
  if (!existsSync(join(src, 'SKILL.md'))) fail('skill-not-found', `no SKILL.md in ${src}`);
  const id = flagValue('--name') || src.split(/[\\/]/).pop();
  const dest = join(userSkills, id);
  const lock = readLock();
  if (lock.skills[id] && existsSync(dest)) fail('skill-already-installed', `skill already installed: ${id}`);
  if (existsSync(dest)) fail('install-would-overwrite-unmanaged-files', `install would overwrite unmanaged files for skill \`${id}\` at ${dest}`);
  cpSync(src, dest, { recursive: true });
  const list = files(src);
  lock.skills[id] = { id, source: { type: 'local', path: src }, installed_at: new Date().toISOString(), files: list };
  writeLock(lock);
  out({ installed: { id, path: `$CONFIG_DIR/skills/${id}`, provenance: { files: list } }, lockfile_path: '$CONFIG_DIR/skills/.muse/lock.json', diagnostics: [] });
}
if (group === 'skills' && cmd === 'uninstall') {
  const lock = readLock();
  const entry = lock.skills[target];
  if (!entry) fail('skill-not-installed', `skill not installed: ${target}`);
  const dest = join(userSkills, target);
  const removed = [];
  for (const f of entry.files) {
    const p = join(dest, f.relative_path);
    if (existsSync(p)) { rmSync(p); removed.push(f.relative_path); }
  }
  const prune = (d) => {
    if (!existsSync(d) || !lstatSync(d).isDirectory()) return;
    for (const n of readdirSync(d)) prune(join(d, n));
    if (!readdirSync(d).length) rmdirSync(d);
  };
  prune(dest);
  delete lock.skills[target];
  writeLock(lock);
  out({ uninstalled: { id: target, removed_files: removed, kept_files: [] }, lockfile_path: '$CONFIG_DIR/skills/.muse/lock.json' });
}
if (group === 'skills' && cmd === 'list') {
  const skills = state.installed
    ? manifest().capabilities.skills.map((s) => ({
      id: `plugin:litmuse:${s.id}`, name: `plugin:litmuse:${s.id}`, scope: 'plugin', activation: 'on',
      path: `plugin://litmuse/${s.path}`, context_cost: { startup_bytes: 300 },
    }))
    : [];
  const diagnostics = [];
  const trusted = args.includes('--trust-workspace');
  const ws = flagValue('--workspace') || process.cwd();
  const roots = [
    ...(trusted ? [['project', join(ws, '.agents', 'skills'), '.agents/skills'], ['project', join(ws, '.claude', 'skills'), '.claude/skills']] : []),
    ['user', userSkills, '$CONFIG_DIR/skills'],
    ['user', join(home, '.claude', 'skills'), '$HOME/.claude/skills'],
    ['user', join(home, '.codex', 'skills'), '$HOME/.codex/skills'],
  ];
  const seen = new Set();
  for (const [scope, dir, shown] of roots) {
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir).sort()) {
      if (!existsSync(join(dir, id, 'SKILL.md'))) continue;
      const path = `${shown}/${id}/SKILL.md`;
      if (seen.has(id)) {
        diagnostics.push({ code: 'skill-shadowed', message: `skill \`${id}\` skipped because a higher-priority source defines the same id`, scope, path });
        continue;
      }
      seen.add(id);
      skills.push({ id, name: id, scope, activation: 'on', path, context_cost: { startup_bytes: 120 } });
    }
  }
  out({ skills: [...skills, ...(state.extraSkills || [])], diagnostics });
}
process.stderr.write(`fake-muse: unsupported ${args.join(' ')}\n`);
process.exit(2);
