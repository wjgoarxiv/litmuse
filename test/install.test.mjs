import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, statSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sandbox, museCalls, walk, collect, setMuseState } from './helpers.mjs';
import { install } from '../lib/install.mjs';
import { uninstall } from '../lib/uninstall.mjs';
import { expectedApprovalIds } from '../lib/approvals.mjs';
import { assertSafeWritePath } from '../lib/guard.mjs';

const BIN = join(ROOT, 'bin', 'litmuse.mjs');
const mutating = (calls) => calls.filter((c) => c[0] === 'plugins' && ['install', 'update', 'approve', 'remove'].includes(c[1]));

test('expected approvals: 10 hooks and 11 agents in the probed id forms', () => {
  const ids = expectedApprovalIds();
  assert.equal(ids.length, 21);
  assert.ok(ids.includes('litmuse:hook:user-prompt-submit'));
  assert.ok(ids.includes('litmuse:hook:session-start'));
  assert.ok(ids.includes('litmuse:agent_definition:litmuse/lit-planner'));
  assert.equal(ids.filter((i) => i.startsWith('litmuse:hook:')).length, 10);
  assert.equal(ids.filter((i) => i.startsWith('litmuse:agent_definition:litmuse/')).length, 11);
});

test('--dry-run lists destinations, approvals and commands and writes nothing', async () => {
  const { home, env } = sandbox();
  const before = walk(home);
  const out = collect();
  const code = await install({ env, flags: { dryRun: true }, interactive: false, print: out.print });
  assert.equal(code, 0);
  assert.deepEqual(walk(home).filter((p) => p !== 'muse-calls.jsonl'), before);
  assert.deepEqual(mutating(museCalls(env)), []);
  assert.match(out.text(), /dry run/i);
  assert.match(out.text(), /litmuse:hook:user-prompt-submit/);
  assert.match(out.text(), /plugins install .* --scope user/);
});

test('non-interactive without --yes previews only', async () => {
  const { env } = sandbox();
  const out = collect();
  const code = await install({ env, flags: {}, interactive: false, print: out.print });
  assert.equal(code, 0);
  assert.match(out.text(), /no files written/i);
  assert.deepEqual(mutating(museCalls(env)), []);
});

test('--yes installs at user scope, stages an owned bundle and prints the approval commands without approving', async () => {
  const { env } = sandbox();
  const out = collect();
  const code = await install({ env, flags: { yes: true }, interactive: false, print: out.print });
  assert.equal(code, 0);
  const calls = mutating(museCalls(env));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['plugins', 'install']);
  assert.ok(calls[0].includes('--scope') && calls[0].includes('user'));
  const stage = join(env.XDG_DATA_HOME, 'litmuse', 'bundle');
  assert.ok(existsSync(join(stage, '.muse-plugin', 'plugin.json')));
  assert.ok(existsSync(join(stage, '.litmuse-owner.json')));
  assert.equal(calls[0][2], stage);
  assert.match(out.text(), /approval needed/i);
  assert.match(out.text(), /muse plugins approve litmuse:agent_definition:litmuse\/lit-verifier/);
  assert.ok(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'receipt.json')));
});

test('--yes --approve approves exactly the 21 expected ids', async () => {
  const { env } = sandbox();
  const code = await install({ env, flags: { yes: true, approve: true }, interactive: false, print: () => {} });
  assert.equal(code, 0);
  const approved = museCalls(env).filter((c) => c[1] === 'approve').map((c) => c[2]);
  assert.deepEqual([...approved].sort(), [...expectedApprovalIds()].sort());
});

test('interactive install asks one yes/no for the approvals', async () => {
  for (const answer of [true, false]) {
    const { env } = sandbox();
    const questions = [];
    const out = collect();
    await install({ env, flags: {}, interactive: true, print: out.print, ask: async (q) => { questions.push(q); return answer; } });
    assert.equal(questions.length, 1);
    assert.match(questions[0], /21/);
    for (const id of expectedApprovalIds()) assert.match(out.text(), new RegExp(id.replace('/', '\\/')));
    const approvals = museCalls(env).filter((c) => c[1] === 'approve').length;
    assert.equal(approvals, answer ? 21 : 0);
  }
});

test('a symlinked, foreign or modified destination fails closed', async () => {
  const cases = {
    symlinked: (env) => {
      const elsewhere = join(env.HOME, 'elsewhere');
      mkdirSync(elsewhere, { recursive: true });
      mkdirSync(join(env.XDG_DATA_HOME, 'litmuse'), { recursive: true });
      symlinkSync(elsewhere, join(env.XDG_DATA_HOME, 'litmuse', 'bundle'));
    },
    foreign: (env) => {
      mkdirSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle'), { recursive: true });
      writeFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle', 'notes.txt'), 'mine');
    },
    modified: async (env) => {
      await install({ env, flags: { yes: true }, interactive: false, print: () => {} });
      appendFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle', 'skills', 'lit-loop', 'SKILL.md'), '\nlocal edit\n');
    },
  };
  for (const [name, arrange] of Object.entries(cases)) {
    const { env } = sandbox();
    await arrange(env);
    const before = mutating(museCalls(env)).length;
    const out = collect();
    const code = await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print });
    assert.equal(code, 1, name);
    assert.match(out.text(), new RegExp(name, 'i'));
    assert.equal(mutating(museCalls(env)).length, before, `${name}: muse was left alone`);
  }
});

test('install never creates or touches a .claude path and backs up host files first', async () => {
  const { home, env } = sandbox();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), 'user rules\n');
  const mtime = statSync(join(home, '.claude', 'CLAUDE.md')).mtimeMs;
  mkdirSync(join(env.XDG_CONFIG_HOME, 'muse'), { recursive: true });
  writeFileSync(join(env.XDG_CONFIG_HOME, 'muse', 'settings.json'), '{"schema_version":1}\n');
  writeFileSync(join(env.XDG_CONFIG_HOME, 'muse', 'auth.json'), 'SECRET');
  const out = collect();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print });
  assert.deepEqual(walk(join(home, '.claude')), ['CLAUDE.md']);
  assert.equal(statSync(join(home, '.claude', 'CLAUDE.md')).mtimeMs, mtime);
  const backups = readdirSync(join(env.XDG_DATA_HOME, 'litmuse', 'backups'));
  assert.ok(backups.some((b) => b.startsWith('settings.json.')), backups.join(','));
  const saved = backups.find((b) => b.startsWith('settings.json.'));
  assert.equal(readFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'backups', saved), 'utf8'), '{"schema_version":1}\n');
  assert.equal(backups.some((b) => b.includes('auth')), false);
  assert.equal(out.text().includes('SECRET'), false);
  const receipt = JSON.parse(readFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'receipt.json'), 'utf8'));
  assert.equal(receipt.written.some((p) => p.includes('.claude')), false);
});

test('the write guard refuses any .claude or .codex path', () => {
  assert.throws(() => assertSafeWritePath('/Users/x/.claude/skills/a'), /refused/);
  assert.throws(() => assertSafeWritePath('/Users/x/.codex/skills'), /refused/);
  assert.doesNotThrow(() => assertSafeWritePath('/Users/x/.local/share/litmuse/bundle'));
});

test('reinstalling the same release updates in place', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true }, interactive: false, print: () => {} });
  const code = await install({ env, flags: { yes: true }, interactive: false, print: () => {} });
  assert.equal(code, 0);
  const verbs = mutating(museCalls(env)).map((c) => c[1]);
  assert.deepEqual(verbs, ['install', 'update']);
});

test('a validator rejection stops before install', async () => {
  const { env } = sandbox();
  const out = collect();
  const code = await install({ env: { ...env, FAKE_MUSE_INVALID: '1' }, flags: { yes: true }, interactive: false, print: out.print });
  assert.equal(code, 1);
  assert.match(out.text(), /fake invalid/);
  assert.deepEqual(mutating(museCalls(env)), []);
});

test('uninstall removes the plugin and the owned bundle and keeps backups', async () => {
  const { env } = sandbox();
  mkdirSync(join(env.XDG_CONFIG_HOME, 'muse'), { recursive: true });
  writeFileSync(join(env.XDG_CONFIG_HOME, 'muse', 'settings.json'), '{}');
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: () => {} });
  const dry = collect();
  assert.equal(await uninstall({ env, flags: { dryRun: true }, print: dry.print }), 0);
  assert.ok(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle')));
  assert.equal(await uninstall({ env, flags: { yes: true }, print: () => {} }), 0);
  assert.ok(museCalls(env).some((c) => c[1] === 'remove' && c[2] === 'litmuse'));
  assert.equal(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle')), false);
  assert.ok(readdirSync(join(env.XDG_DATA_HOME, 'litmuse', 'backups')).length > 0);
});

test('the CLI previews without a TTY and prints help', () => {
  const { env } = sandbox();
  const r = spawnSync(process.execPath, [BIN, 'install'], { env, encoding: 'utf8', input: '' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no files written/i);
  const help = spawnSync(process.execPath, [BIN, '--help'], { env, encoding: 'utf8' });
  assert.match(help.stdout, /install/);
  assert.match(help.stdout, /doctor/);
  const version = spawnSync(process.execPath, [BIN, '--version'], { env, encoding: 'utf8' });
  assert.equal(version.stdout.trim(), JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
});

// Review M1: every destination is checked for links before the first write.
test('a symlinked receipt or backups directory fails closed before any write', async () => {
  for (const which of ['receipt', 'backups']) {
    const { env, home } = sandbox();
    const data = join(env.XDG_DATA_HOME, 'litmuse');
    mkdirSync(data, { recursive: true });
    const victim = join(home, 'victim');
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, 'keep.txt'), 'mine');
    if (which === 'receipt') symlinkSync(join(victim, 'keep.txt'), join(data, 'receipt.json'));
    else symlinkSync(victim, join(data, 'backups'));
    mkdirSync(join(env.XDG_CONFIG_HOME, 'muse'), { recursive: true });
    writeFileSync(join(env.XDG_CONFIG_HOME, 'muse', 'settings.json'), '{}');
    const out = collect();
    const code = await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print });
    assert.equal(code, 1, which);
    assert.match(out.text(), /symlinked/i);
    assert.deepEqual(mutating(museCalls(env)), [], `${which}: muse untouched`);
    assert.deepEqual(readdirSync(victim), ['keep.txt']);
    assert.equal(readFileSync(join(victim, 'keep.txt'), 'utf8'), 'mine');
    assert.equal(existsSync(join(data, 'bundle')), false, `${which}: nothing staged`);
  }
});

test('the update cache is written through a temp file and never through a link', async () => {
  const { env, home } = sandbox();
  const { writeCache } = await import('../lib/update-check.mjs');
  const data = join(env.XDG_DATA_HOME, 'litmuse');
  mkdirSync(data, { recursive: true });
  writeFileSync(join(home, 'rules.md'), 'user rules');
  symlinkSync(join(home, 'rules.md'), join(data, 'update-check.json'));
  assert.equal(writeCache(env, { latest: '1.0.0' }), false);
  assert.equal(readFileSync(join(home, 'rules.md'), 'utf8'), 'user rules');
});

// Review M2: the remedy for a refused bundle actually leads to a working install.
test('a modified bundle: the message names the move, and uninstall --discard-modified clears the way', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true }, interactive: false, print: () => {} });
  appendFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle', 'skills', 'lit-loop', 'SKILL.md'), '\nlocal edit\n');
  const refused = collect();
  assert.equal(await install({ env, flags: { yes: true }, interactive: false, print: refused.print }), 1);
  assert.match(refused.text(), /mv .*litmuse\/bundle/);
  assert.match(refused.text(), /--discard-modified/);
  const plain = collect();
  await uninstall({ env, flags: { yes: true }, print: plain.print });
  assert.ok(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle')), 'plain uninstall keeps edited files');
  assert.equal(await uninstall({ env, flags: { yes: true, discardModified: true }, print: () => {} }), 0);
  assert.equal(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle')), false);
  assert.equal(await install({ env, flags: { yes: true }, interactive: false, print: () => {} }), 0);
});

// Review L1: an installed plugin that points somewhere else is explained instead of silently updated.
test('update refuses when Muse holds LitMuse from another source path', async () => {
  const { env } = sandbox();
  setMuseState(env, { installed: true, source: join(ROOT, 'plugin'), approved: [] });
  const out = collect();
  const code = await install({ env, flags: { yes: true }, interactive: false, print: out.print });
  assert.equal(code, 1);
  assert.match(out.text(), /from .*plugin.*muse plugins remove litmuse/s);
  assert.deepEqual(mutating(museCalls(env)), []);
});

test('the plan line says "up to" before anything was inspected', async () => {
  const { env } = sandbox();
  const out = collect();
  await install({ env, flags: { dryRun: true }, interactive: false, print: out.print });
  assert.match(out.text(), /up to 21 capabilities/);
});

// Review L2: Muse resets the 11 agent approvals on update; one question covers them.
test('after an update the installer asks once for the 11 reset agent approvals', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: () => {} });
  const questions = [];
  await install({ env, flags: {}, interactive: true, print: () => {}, ask: async (q) => { questions.push(q); return true; } });
  assert.equal(questions.length, 1);
  assert.match(questions[0], /\b11\b/);
  const second = museCalls(env).filter((c) => c[1] === 'approve').slice(21).map((c) => c[2]);
  assert.equal(second.length, 11);
  assert.ok(second.every((id) => id.includes(':agent_definition:')));
});
