#!/usr/bin/env node
// Test double for the `muse` CLI. It records every argv line in FAKE_MUSE_LOG and keeps plugin state
// in FAKE_MUSE_STATE, answering with the JSON shapes Muse Code 1.4.10 printed during the task-1 probe.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

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
if (group === 'skills' && cmd === 'list') {
  const skills = state.installed
    ? manifest().capabilities.skills.map((s) => ({
      id: `plugin:litmuse:${s.id}`, name: `plugin:litmuse:${s.id}`, scope: 'plugin', activation: 'on',
      path: `plugin://litmuse/${s.path}`, context_cost: { startup_bytes: 300 },
    }))
    : [];
  out({ skills: [...skills, ...(state.extraSkills || [])], diagnostics: [] });
}
process.stderr.write(`fake-muse: unsupported ${args.join(' ')}\n`);
process.exit(2);
