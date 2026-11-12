// The nine file-making skills are LitFamily extensions on the wjgoarxiv-skills shelf. LitMuse says so twice: in the
// install/update output, and once in the first Muse session after it (through the SessionStart context, because Muse
// logs a hook systemMessage without showing it). An upgrade also names the engine folder an earlier LitMuse left behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, sandbox, collect } from './helpers.mjs';
import { install } from '../lib/install.mjs';
import { doctor } from '../lib/doctor.mjs';
import { PLUGIN_DIR } from '../lib/bundle.mjs';
import { MOVED } from '../plugin/hooks/lib/moved.mjs';

const SHELF = 'https://github.com/wjgoarxiv/wjgoarxiv-skills';
const LINE = 'muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/<skill> --scope user';
const quiet = () => {};
const runtimeDir = (env) => join(env.XDG_DATA_HOME, 'litmuse', 'runtime');
const ownerFile = (env) => join(env.XDG_DATA_HOME, 'litmuse', 'bundle', '.litmuse-owner.json');

// Makes the staged bundle look like an older LitMuse wrote it, with the engine folder that version set up.
function pretendOlderInstall(env, version = '0.1.11') {
  const owner = JSON.parse(readFileSync(ownerFile(env), 'utf8'));
  writeFileSync(ownerFile(env), JSON.stringify({ ...owner, version }));
  mkdirSync(join(runtimeDir(env), 'office'), { recursive: true });
  writeFileSync(join(runtimeDir(env), 'office', 'ready.json'), '{}');
}

function sessionStart(env, sessionId, source = 'startup') {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-ext-ws-'));
  const r = spawnSync(process.execPath, [join(PLUGIN_DIR, 'hooks', 'session-start.mjs')], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source, session_id: sessionId, cwd: ws }),
    cwd: ws, encoding: 'utf8',
    env: { ...process.env, HOME: env.HOME, XDG_DATA_HOME: env.XDG_DATA_HOME, XDG_CONFIG_HOME: env.XDG_CONFIG_HOME, XDG_STATE_HOME: join(env.HOME, '.state') },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

test('a fresh install tells the user about LitFamily extensions, with the shelf and the install lines', async () => {
  const { env } = sandbox();
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print }), 0);
  const text = out.text();
  assert.match(text, /LitFamily extensions/);
  assert.match(text, /core is complete and works on its own/);
  assert.ok(text.includes(SHELF), 'names the extension shelf');
  assert.ok(text.includes(`git clone ${SHELF}`), 'the clone line');
  assert.ok(text.includes(LINE), 'the Muse install line the stubs print');
  assert.match(text, /refuses a folder that is already there/, 'says an occupied folder stops the install');
  assert.match(text, /extensions install <skill>` moves an old copy aside first/, 'and names the verb that moves it aside');
  for (const id of Object.keys(MOVED)) assert.ok(text.includes(id), id);
  assert.match(text, /full LitFamily experience/);
  assert.doesNotMatch(text, /litmuse\/runtime/, 'a fresh install has no leftovers to name');
  const block = text.slice(text.indexOf('LitFamily extensions')).split('\nStatus:')[0].trim().split('\n');
  assert.ok(block.length >= 6 && block.length <= 11, `${block.length} lines`);
  assert.ok(text.indexOf('LitFamily extensions') < text.indexOf('Status: Ready'), 'shown before the closing status line');
});

test('an upgrade also names the engine folder an earlier LitMuse left, and says it can be deleted', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  pretendOlderInstall(env);
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print }), 0);
  const text = out.text();
  assert.match(text, /LitFamily extensions/);
  assert.ok(text.includes(runtimeDir(env)), 'the exact leftover path');
  assert.match(text, /delete/i);
});

test('a preview or dry run carries no notice and arms no first-session notice', async () => {
  const { env } = sandbox();
  for (const flags of [{ dryRun: true }, {}]) {
    const out = collect();
    await install({ env, flags, interactive: false, print: out.print });
    assert.doesNotMatch(out.text(), /LitFamily extensions/);
  }
  assert.equal(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'first-session-notice.json')), false);
});

test('the first Muse session after an install carries the notice once; later sessions do not', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const first = sessionStart(env, 'ext-first');
  assert.match(first, /LitFamily extensions/);
  assert.ok(first.includes(SHELF) && first.includes(LINE), 'shelf and install line reach the model');
  assert.match(first, /once/i);
  assert.equal(sessionStart(env, 'ext-first', 'resume'), first, 'a resume of that session keeps byte-identical context');
  assert.equal(sessionStart(env, 'ext-first', 'compact'), first, 'and so does a compaction');
  const second = sessionStart(env, 'ext-second');
  assert.doesNotMatch(second, /LitFamily extensions are on the shelf|first session after LitMuse/i);
  assert.equal(sessionStart(env, 'ext-first', 'resume'), first, 'the first session stays stable after another session ran');
});

test('the first session after an upgrade names the leftover folder; a same-version reinstall does not re-arm it', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  sessionStart(env, 'ext-a');
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  assert.doesNotMatch(sessionStart(env, 'ext-b'), /first session after LitMuse/i, 'same version: no second notice');
  pretendOlderInstall(env);
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const ctx = sessionStart(env, 'ext-c');
  assert.match(ctx, /first session after LitMuse/i);
  assert.ok(ctx.includes(runtimeDir(env)), 'names the leftover folder');
});

test('a linked notice file is never followed or rewritten', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const notice = join(env.XDG_DATA_HOME, 'litmuse', 'first-session-notice.json');
  const target = join(env.HOME, 'elsewhere.json');
  writeFileSync(target, readFileSync(notice));
  rmSync(notice);
  symlinkSync(target, notice);
  const before = readFileSync(target, 'utf8');
  assert.doesNotMatch(sessionStart(env, 'ext-link'), /first session after LitMuse/i);
  assert.equal(readFileSync(target, 'utf8'), before);
});

test('machine-readable output never carries the notice', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  pretendOlderInstall(env);
  const out = collect();
  await doctor({ env, flags: { json: true, offline: true }, print: out.print });
  const parsed = JSON.parse(out.text());
  assert.doesNotMatch(out.text(), /core is complete|extension shelf|full LitFamily experience/);
  assert.ok(parsed.rows.length > 0);
  for (const args of [['doctor', '--json', '--offline'], ['status', '--card', '--json'], ['models', '--json']]) {
    const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'litmuse.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    assert.doesNotMatch(r.stdout, /core is complete|extension shelf|full LitFamily experience/, args.join(' '));
  }
});

// Finding R3: an edited moved skill is the likeliest edit, and its folder is now a stub.
test('a modified moved skill: the FAIL says it became a LitFamily extension and where to carry the edits', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true }, interactive: false, print: quiet });
  writeFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle', 'skills', 'lit-pptx', 'my-house-rules.md'), 'mine\n');
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true }, interactive: false, print: out.print }), 1);
  const text = out.text();
  assert.match(text, /FAIL destination modified/);
  assert.match(text, /lit-pptx is now a LitFamily extension/);
  assert.ok(text.includes('muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-pptx --scope user'));
  assert.ok(text.includes(join(env.XDG_CONFIG_HOME, 'muse', 'skills', 'lit-pptx')), 'names the user skill folder');
  assert.match(text, /mv .*litmuse\/bundle/, 'keeps the keep-your-edits remedy');
  assert.match(text, /No files written/);
});

test('a modified core skill keeps the plain remedy without extension text', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true }, interactive: false, print: quiet });
  appendFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'bundle', 'skills', 'lit-loop', 'SKILL.md'), '\nlocal edit\n');
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true }, interactive: false, print: out.print }), 1);
  assert.doesNotMatch(out.text(), /LitFamily extension/);
});

test('doctor mentions the orphaned runtime folder when it is there, and only then', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const clean = collect();
  await doctor({ env, flags: { offline: true }, print: clean.print });
  assert.doesNotMatch(clean.text(), /leftover/);
  pretendOlderInstall(env);
  const out = collect();
  await doctor({ env, flags: { offline: true }, print: out.print });
  assert.match(out.text(), new RegExp(`INFO leftover: ${runtimeDir(env).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(out.text(), /delete/i);
  assert.match(out.text(), /PASS bundle/, 'the leftover folder is not part of the bundle check');
});

// The extensions keep their engines under wjgoarxiv-skills/runtime, so the old folder is dead either way: deleting it
// must not read as something only users who skip the extensions should do.
test('the leftover advice holds whether or not the user installs the extensions', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  pretendOlderInstall(env);
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print }), 0);
  const ctx = sessionStart(env, 'ext-leftover');
  for (const [where, text] of [['install output', out.text()], ['first-session context', ctx]]) {
    assert.ok(text.includes(runtimeDir(env)), `${where} names the folder`);
    assert.doesNotMatch(text, /if (you|they) do not install/i, `${where} ties the deletion to skipping the extensions`);
    assert.match(text, /sets up its own engines/, `${where} says an extension brings its own engines`);
  }
});
