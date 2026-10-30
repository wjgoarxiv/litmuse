import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sandbox, collect, walk } from './helpers.mjs';
import { paths } from '../lib/paths.mjs';
import { install } from '../lib/install.mjs';
import { uninstall } from '../lib/uninstall.mjs';
import { doctor } from '../lib/doctor.mjs';
import { packageVersion } from '../lib/bundle.mjs';
import { inspectBlock, upsertBlock, removeBlock } from '../lib/managed-block.mjs';
import {
  AGENT_FILE_ID, AGENT_FILE_MAX_BYTES, MUSE_LOAD_LIMIT, agentFileBody, applyAgentFile, agentFileState,
  readAgentFileSetting, writeAgentFileSetting,
} from '../lib/agent-file.mjs';

const BIN = join(ROOT, 'bin', 'litmuse.mjs');
const quiet = () => {};
const version = packageVersion();

// A throwaway Muse config dir holding the user's rules file, with the sandbox env that points at it.
function rulesFile(content) {
  const box = sandbox();
  const file = paths(box.env).museRules;
  if (content !== undefined) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
  }
  return { ...box, file };
}

const block = (file, extra = {}) => applyAgentFile({
  path: file, version, body: agentFileBody(), action: 'install', backupDir: join(file, '..', 'saved'), ...extra,
});
const startMarkers = (text) => text.match(/<!-- litfamily:litmuse:start /g)?.length ?? 0;

test('the target is the user rules file Muse owns, inside the sandbox HOME', () => {
  const { env, home } = sandbox();
  const p = paths(env);
  assert.equal(p.museRules, join(env.XDG_CONFIG_HOME, 'muse', 'AGENTS.md'));
  assert.ok(p.museRules.startsWith(home));
  assert.equal(paths({ HOME: '/h' }).museRules, '/h/.config/muse/AGENTS.md');
});

test('the block text is short, names only LitMuse and Muse, and carries the ground rules', () => {
  const body = agentFileBody();
  assert.ok(Buffer.byteLength(body) <= AGENT_FILE_MAX_BYTES, `${Buffer.byteLength(body)} bytes`);
  assert.match(body, /LitMuse/);
  assert.match(body, /Muse Code/);
  assert.doesNotMatch(body, /claude|codex|opencode|hermes|grok|gravity|gemini|antigravity/i);
  assert.match(body, /Never push, publish, tag or bump a version/);
  assert.match(body, /config agentFile off/);
});

test('add then remove returns the original bytes, with and without a final newline', () => {
  for (const original of ['', 'one\n', 'no final newline', '# Mine\n\ntext\n\n', '\n']) {
    const added = upsertBlock(original, { id: AGENT_FILE_ID, version, body: agentFileBody() });
    assert.equal(added.changed, true);
    assert.equal(startMarkers(added.text), 1);
    assert.ok(added.text.startsWith(original), JSON.stringify(original));
    assert.equal(removeBlock(added.text, AGENT_FILE_ID).text, original, JSON.stringify(original));
  }
});

test('CRLF files stay CRLF through add and remove', () => {
  const original = 'line one\r\nline two\r\n';
  const added = upsertBlock(original, { id: AGENT_FILE_ID, version, body: agentFileBody() });
  assert.ok(added.text.startsWith(original));
  assert.equal(/[^\r]\n/.test(added.text.slice(original.length)), false, 'every new line ends in CRLF');
  assert.equal(removeBlock(added.text, AGENT_FILE_ID).text, original);
});

test('only the bytes between the markers change on an update', () => {
  const first = upsertBlock('top\n', { id: AGENT_FILE_ID, version: '0.0.1', body: 'old body\n' });
  const user = first.text.replace('top\n', 'top, edited\n') + 'tail the user typed\n';
  const next = upsertBlock(user, { id: AGENT_FILE_ID, version: '0.0.2', body: 'new body\n' });
  assert.ok(next.text.startsWith('top, edited\n'));
  assert.ok(next.text.endsWith('tail the user typed\n'));
  assert.match(next.text, /v=0\.0\.2/);
  assert.doesNotMatch(next.text, /old body/);
  assert.equal(upsertBlock(next.text, { id: AGENT_FILE_ID, version: '0.0.2', body: 'new body\n' }).changed, false);
});

test('a malformed pair is reported and refused, never guessed at', () => {
  const start = `<!-- litfamily:litmuse:start v=${version} -->`;
  const end = '<!-- litfamily:litmuse:end -->';
  const bad = [`${start}\nno end\n`, `text\n${end}\n`, `${end}\n${start}\n`, `${start}\n${start}\n${end}\n`, `${start}\n${end}\n${end}\n`];
  for (const text of bad) {
    assert.equal(inspectBlock(text, AGENT_FILE_ID).state, 'malformed', text);
    assert.throws(() => upsertBlock(text, { id: AGENT_FILE_ID, version, body: 'x\n' }), /malformed/);
  }
  const { file } = rulesFile(bad[0]);
  const result = block(file);
  assert.equal(result.status, 'refused-malformed');
  assert.equal(readFileSync(file, 'utf8'), bad[0]);
});

test('install creates the file, a second install changes nothing, uninstall removes a file it made', () => {
  const { file } = rulesFile();
  assert.equal(block(file).status, 'created');
  const once = readFileSync(file, 'utf8');
  assert.equal(startMarkers(once), 1);
  assert.equal(block(file).status, 'unchanged');
  assert.equal(readFileSync(file, 'utf8'), once);
  assert.equal(applyAgentFile({ path: file, version, action: 'uninstall' }).status, 'removed');
  assert.equal(existsSync(file), false);
  assert.equal(applyAgentFile({ path: file, version, action: 'uninstall' }).status, 'absent');
});

test('a file the block created keeps the text the user added afterwards', () => {
  const { file } = rulesFile();
  block(file);
  writeFileSync(file, `${readFileSync(file, 'utf8')}my own rule\n`);
  assert.equal(applyAgentFile({ path: file, version, action: 'uninstall' }).status, 'removed');
  assert.equal(readFileSync(file, 'utf8'), 'my own rule\n');
});

test('an existing file gets one backup copy on first insertion only, then returns to its bytes', () => {
  const original = '# My Muse rules\n\n- be brief\n';
  const { file } = rulesFile(original);
  const saved = join(file, '..', 'saved');
  const first = block(file);
  assert.equal(first.status, 'updated');
  assert.ok(first.backup && first.backup.startsWith(saved));
  assert.equal(readFileSync(first.backup, 'utf8'), original);
  assert.equal(block(file).status, 'unchanged');
  assert.equal(block(file, { version: '9.9.9' }).backup, undefined, 'a refresh makes no new copy');
  assert.equal(readdirSync(saved).length, 1);
  assert.equal(applyAgentFile({ path: file, version, action: 'uninstall' }).status, 'removed');
  assert.equal(readFileSync(file, 'utf8'), original);
  assert.equal(block(file).backup, undefined, 'the same bytes are not copied twice');
  assert.equal(readdirSync(saved).length, 1);
  applyAgentFile({ path: file, version, action: 'uninstall' });
  writeFileSync(file, `${original}- edited since\n`);
  assert.ok(block(file).backup, 'a changed file is copied again');
  assert.equal(readdirSync(saved).length, 2);
});

test('a symlink, a directory and a non-UTF-8 file are refused and left alone', () => {
  const { env, home } = sandbox();
  const dir = join(env.XDG_CONFIG_HOME, 'muse');
  mkdirSync(dir, { recursive: true });
  const target = join(home, 'real-rules.md');
  writeFileSync(target, 'dotfiles repo\n');
  symlinkSync(target, join(dir, 'AGENTS.md'));
  assert.equal(block(join(dir, 'AGENTS.md')).status, 'refused-symlink');
  assert.equal(agentFileState({ path: join(dir, 'AGENTS.md'), version }), 'symlink');
  assert.equal(readFileSync(target, 'utf8'), 'dotfiles repo\n');

  mkdirSync(join(dir, 'folder', 'AGENTS.md'), { recursive: true });
  assert.equal(block(join(dir, 'folder', 'AGENTS.md')).status, 'refused-not-file');

  const utf16 = join(dir, 'utf16.md');
  writeFileSync(utf16, Buffer.from([0xff, 0xfe, 0x41, 0x00]));
  assert.equal(block(utf16).status, 'refused-not-utf8');
  assert.deepEqual([...readFileSync(utf16)], [0xff, 0xfe, 0x41, 0x00]);
});

test('Muse truncates a rules file past its load limit, so a block that would land there is refused', () => {
  const filler = `${'x'.repeat(78)}\n`.repeat(Math.ceil(MUSE_LOAD_LIMIT / 79));
  const { file } = rulesFile(filler);
  assert.equal(block(file).status, 'refused-too-large');
  assert.equal(readFileSync(file, 'utf8'), filler);
  assert.equal(MUSE_LOAD_LIMIT, 32000);
});

test('state words: absent, present, stale, malformed, and a block Muse would cut off', () => {
  const { file } = rulesFile();
  assert.equal(agentFileState({ path: file, version }), 'absent');
  block(file);
  assert.equal(agentFileState({ path: file, version }), `present v=${version}`);
  assert.equal(agentFileState({ path: file, version: '99.0.0' }), `stale v=${version}`);
  writeFileSync(file, `${'y'.repeat(MUSE_LOAD_LIMIT)}\n${readFileSync(file, 'utf8')}`);
  assert.match(agentFileState({ path: file, version }), /^truncated v=/);
  writeFileSync(file, `<!-- litfamily:litmuse:start v=${version} -->\n`);
  assert.equal(agentFileState({ path: file, version }), 'malformed');
});

test('dry run previews the new text and writes nothing', () => {
  const { file } = rulesFile('mine\n');
  const result = block(file, { dryRun: true });
  assert.equal(result.status, 'dry-run');
  assert.match(result.preview, /litfamily:litmuse:start/);
  assert.equal(readFileSync(file, 'utf8'), 'mine\n');
  assert.equal(existsSync(join(file, '..', 'saved')), false);
});

test('the setting: LITMUSE_AGENT_FILE beats the stored value, which beats the default', () => {
  const { env } = sandbox();
  assert.deepEqual(readAgentFileSetting(env), { mode: 'on', stored: undefined });
  writeAgentFileSetting(env, 'off');
  assert.deepEqual(readAgentFileSetting(env), { mode: 'off', stored: 'off' });
  assert.equal(readAgentFileSetting({ ...env, LITMUSE_AGENT_FILE: 'on' }).mode, 'on');
  assert.throws(() => writeAgentFileSetting(env, 'maybe'), /on, off/);
  assert.ok(existsSync(join(env.XDG_DATA_HOME, 'litmuse', 'config.json')));
});

test('install --yes adds the block, a second install keeps one block and the receipt lists the file', async () => {
  const { env, file } = rulesFile('# Mine\n');
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true }, interactive: false, print: out.print }), 0);
  assert.match(out.text(), new RegExp(`AGENT_FILE: updated ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  const text = readFileSync(file, 'utf8');
  assert.ok(text.startsWith('# Mine\n'));
  assert.equal(startMarkers(text), 1);
  const receipt = JSON.parse(readFileSync(join(env.XDG_DATA_HOME, 'litmuse', 'receipt.json'), 'utf8'));
  assert.ok(receipt.written.includes(file));
  const again = collect();
  await install({ env, flags: { yes: true }, interactive: false, print: again.print });
  assert.match(again.text(), /AGENT_FILE: unchanged/);
  assert.equal(readFileSync(file, 'utf8'), text);
});

test('install without a terminal and without --yes never writes the block', async () => {
  const { env, file } = rulesFile('# Mine\n');
  const out = collect();
  assert.equal(await install({ env, flags: {}, interactive: false, print: out.print }), 0);
  assert.equal(readFileSync(file, 'utf8'), '# Mine\n');
  const bare = sandbox();
  await install({ env: bare.env, flags: {}, interactive: false, print: quiet });
  assert.equal(existsSync(paths(bare.env).museRules), false);
});

test('--dry-run names the block and the file and writes nothing', async () => {
  const { env, file, home } = rulesFile('# Mine\n');
  const before = walk(home);
  const out = collect();
  await install({ env, flags: { dryRun: true }, interactive: false, print: out.print });
  assert.deepEqual(walk(home).filter((p) => p !== 'muse-calls.jsonl'), before);
  assert.match(out.text(), /Would add the LitFamily block to /);
  assert.match(out.text(), /--no-agent-file/);
  assert.equal(readFileSync(file, 'utf8'), '# Mine\n');
});

test('--no-agent-file skips the block for one run without storing anything', async () => {
  const { env, file } = rulesFile('# Mine\n');
  const out = collect();
  await install({ env, flags: { yes: true, noAgentFile: true }, interactive: false, print: out.print });
  assert.equal(readFileSync(file, 'utf8'), '# Mine\n');
  assert.match(out.text(), /AGENT_FILE: skipped/);
  assert.equal(readAgentFileSetting(env).stored, undefined);
});

test('an interactive install asks once; Yes adds the block, No stores off and the next --yes respects it', async () => {
  const yes = rulesFile('# Mine\n');
  const asked = [];
  await install({ env: yes.env, flags: {}, interactive: true, print: quiet, ask: async (q) => { asked.push(q); return /LitFamily block/.test(q); } });
  assert.equal(asked.filter((q) => /LitFamily block/.test(q)).length, 1);
  assert.match(asked.find((q) => /LitFamily block/.test(q)), /Your own text stays/);
  assert.equal(startMarkers(readFileSync(yes.file, 'utf8')), 1);

  const no = rulesFile('# Mine\n');
  const out = collect();
  await install({ env: no.env, flags: {}, interactive: true, print: out.print, ask: async (q) => !/LitFamily block/.test(q) });
  assert.equal(readFileSync(no.file, 'utf8'), '# Mine\n');
  assert.equal(readAgentFileSetting(no.env).stored, 'off');
  assert.match(out.text(), /AGENT_FILE: off/);
  await install({ env: no.env, flags: { yes: true }, interactive: false, print: quiet });
  assert.equal(readFileSync(no.file, 'utf8'), '# Mine\n');
});

test('an install refreshes a block that is already there, even after the setting was turned off by LITMUSE_AGENT_FILE=on', async () => {
  const { env, file } = rulesFile();
  await install({ env, flags: { yes: true }, interactive: false, print: quiet });
  writeFileSync(file, readFileSync(file, 'utf8').replace(`v=${version}`, 'v=0.0.1'));
  assert.match(agentFileState({ path: file, version }), /^stale/);
  const out = collect();
  await install({ env, flags: { yes: true }, interactive: false, print: out.print });
  assert.match(out.text(), /AGENT_FILE: updated/);
  assert.equal(agentFileState({ path: file, version }), `present v=${version}`);
});

test('install leaves a symlinked rules file alone and says so', async () => {
  const { env, home } = sandbox();
  const dir = join(env.XDG_CONFIG_HOME, 'muse');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(home, 'dotfile.md'), 'dot\n');
  symlinkSync(join(home, 'dotfile.md'), join(dir, 'AGENTS.md'));
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true }, interactive: false, print: out.print }), 0);
  assert.match(out.text(), /AGENT_FILE: symlink /);
  assert.equal(readFileSync(join(home, 'dotfile.md'), 'utf8'), 'dot\n');
});

test('uninstall removes the block, keeps the user text, and a dry run only says so', async () => {
  const original = '# Mine\n\n- keep\n';
  const { env, file } = rulesFile(original);
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const dry = collect();
  await uninstall({ env, flags: { dryRun: true }, print: dry.print });
  assert.match(dry.text(), /Would remove the LitFamily block from /);
  assert.equal(startMarkers(readFileSync(file, 'utf8')), 1);
  const out = collect();
  assert.equal(await uninstall({ env, flags: { yes: true }, print: out.print }), 0);
  assert.match(out.text(), /AGENT_FILE: removed/);
  assert.equal(readFileSync(file, 'utf8'), original);
});

test('uninstall deletes a rules file the block created and reports absent when none is there', async () => {
  const { env, file } = rulesFile();
  await install({ env, flags: { yes: true }, interactive: false, print: quiet });
  assert.equal(existsSync(file), true);
  await uninstall({ env, flags: { yes: true }, print: quiet });
  assert.equal(existsSync(file), false);
  const out = collect();
  await uninstall({ env, flags: { yes: true }, print: out.print });
  assert.match(out.text(), /AGENT_FILE: absent/);
});

test('the CLI: config agentFile off removes the block at once, on writes it, no argument lists the setting', () => {
  const { env, file } = rulesFile('# Mine\n');
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8', input: '' });
  const listing = run('config');
  assert.equal(listing.status, 0);
  assert.match(listing.stdout, /agentFile\s+on/);
  const on = run('config', 'agentFile', 'on');
  assert.equal(on.status, 0, on.stderr);
  assert.match(on.stdout, /AGENT_FILE: on/);
  assert.equal(startMarkers(readFileSync(file, 'utf8')), 1);
  const off = run('config', 'agentFile', 'off');
  assert.match(off.stdout, /AGENT_FILE: removed/);
  assert.equal(readFileSync(file, 'utf8'), '# Mine\n');
  assert.equal(readAgentFileSetting(env).stored, 'off');
  const bad = run('config', 'agentFile', 'maybe');
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /agentFile takes one of: on, off/);
  assert.equal(run('config', 'nonsense', 'on').status, 2);
});

test('doctor and status show the state: present, stale, absent, malformed, off', async () => {
  const { env, file } = rulesFile();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const line = async () => {
    const out = collect();
    await doctor({ env, flags: {}, print: out.print });
    return out.lines.find((l) => /agent file:/.test(l));
  };
  assert.match(await line(), new RegExp(`^PASS agent file: present v=${version.replace(/\./g, '\\.')}`));
  const status = spawnSync(process.execPath, [BIN, 'status', '--offline'], { env, encoding: 'utf8' });
  assert.match(status.stdout, /agent file present v=/);

  writeFileSync(file, readFileSync(file, 'utf8').replace(`v=${version}`, 'v=0.0.1'));
  assert.match(await line(), /^WARN agent file: stale v=0\.0\.1/);
  writeFileSync(file, 'no block here\n');
  assert.match(await line(), /^INFO agent file: absent .*litmuse config agentFile on/);
  writeFileSync(file, `<!-- litfamily:litmuse:start v=${version} -->\n`);
  assert.match(await line(), /^WARN agent file: malformed/);
  writeAgentFileSetting(env, 'off');
  assert.match(await line(), /^INFO agent file: off .*litmuse config agentFile on/);
});

test('no run of the installer, the CLI or the tests touched the real host files', async () => {
  const { env, home } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  assert.equal(existsSync(join(home, '.claude')), false);
  assert.equal(existsSync(join(home, '.codex')), false);
  assert.ok(statSync(paths(env).museRules).isFile());
  assert.ok(paths(env).museRules.startsWith(home));
});
