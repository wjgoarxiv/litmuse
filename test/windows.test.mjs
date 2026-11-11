// Windows hardening. Real Windows is not available to the suite, so the win32 branches take the platform,
// environment and filesystem probe as injected values; the POSIX paths run for real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const LIB = join(ROOT, 'plugin', 'lib');
const host = await import(join(LIB, 'host-process.mjs'));
const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

test('prepareSpawn: a .cmd or .bat file on win32 goes through a shell with quoted arguments; everything else is untouched', () => {
  const win = { platform: 'win32', readFile: () => 'echo plain batch' };
  const cmd = host.prepareSpawn('C:\\Program Files\\nodejs\\npm.cmd', ['ci', '--prefix', 'C:\\Users\\a b\\cache\\'], { cwd: 'x' }, win);
  assert.equal(cmd.options.shell, true);
  assert.equal(cmd.options.cwd, 'x');
  assert.equal(cmd.command, '"C:\\Program Files\\nodejs\\npm.cmd"');
  assert.deepEqual(cmd.args, ['ci', '--prefix', '"C:\\Users\\a b\\cache\\\\"']);
  assert.equal(host.prepareSpawn('tool.BAT', [], {}, win).options.shell, true);
  const exe = host.prepareSpawn('ffmpeg.exe', ['-version'], {}, win);
  assert.deepEqual(exe, { command: 'ffmpeg.exe', args: ['-version'], options: {} });
  assert.deepEqual(host.prepareSpawn('npm.cmd', ['ci'], {}, { platform: 'linux' }), { command: 'npm.cmd', args: ['ci'], options: {} });
});

test('prepareSpawn: an npm-generated .cmd shim becomes node plus its script, so arguments with quotes need no shell', () => {
  const shim = [
    '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0', '',
    'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"', ')', '',
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\..\\agent-browser\\bin\\agent-browser.js" %*', '',
  ].join('\r\n');
  const win = { platform: 'win32', execPath: 'C:\\node\\node.exe', readFile: () => shim };
  const run = host.prepareSpawn('C:\\app\\node_modules\\.bin\\agent-browser.cmd', ['eval', 'document.title + "x" + 100 + "%"'], { env: {} }, win);
  assert.equal(run.command, 'C:\\node\\node.exe');
  assert.deepEqual(run.args, ['C:\\app\\node_modules\\agent-browser\\bin\\agent-browser.js', 'eval', 'document.title + "x" + 100 + "%"']);
  assert.equal(run.options.shell, undefined);
  const exeShim = 'x & "%~dp0\\..\\tool\\tool.exe" %*';
  assert.equal(host.prepareSpawn('C:\\b\\tool.cmd', ['a'], {}, { ...win, readFile: () => exeShim }).command, 'C:\\tool\\tool.exe');
  assert.equal(host.prepareSpawn('C:\\b\\plain.cmd', ['a'], {}, { ...win, readFile: () => 'echo hi' }).options.shell, true, 'not a shim: shell route');
  assert.equal(host.prepareSpawn('C:\\b\\gone.cmd', ['a'], {}, { ...win, readFile: () => { throw new Error('ENOENT'); } }).options.shell, true);
});

test('quoteCmdArg refuses what it cannot quote safely instead of building a shell string from it', () => {
  for (const bad of ['a"b', '%PATH%', 'a\nb']) assert.throws(() => host.quoteCmdArg(bad), /cannot pass/);
  assert.equal(host.quoteCmdArg('--no-audit'), '--no-audit');
  assert.equal(host.quoteCmdArg('a & b'), '"a & b"');
  assert.equal(host.quoteCmdArg(''), '""');
});

test('npmInvocation: win32 runs npm-cli.js under node when it is known, else npm.cmd through a shell; POSIX runs npm', () => {
  const win = { platform: 'win32', execPath: 'C:\\node\\node.exe' };
  const viaEnv = host.npmInvocation(['ci'], {}, { ...win, env: { npm_execpath: 'C:\\npm\\bin\\npm-cli.js' }, exists: () => true });
  assert.deepEqual(viaEnv, { command: 'C:\\node\\node.exe', args: ['C:\\npm\\bin\\npm-cli.js', 'ci'], options: {} });
  const beside = host.npmInvocation(['ci'], {}, { ...win, env: { npm_execpath: 'C:\\npm\\bin\\npx-cli.js' }, exists: (f) => f === 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js' });
  assert.equal(beside.args[0], 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js');
  const fallback = host.npmInvocation(['ci', '--omit=dev'], { cwd: 'd' }, { ...win, env: {}, exists: () => false });
  assert.deepEqual(fallback, { command: 'npm.cmd', args: ['ci', '--omit=dev'], options: { cwd: 'd', shell: true } });
  assert.deepEqual(host.npmInvocation(['ci'], {}, { platform: 'darwin' }), { command: 'npm', args: ['ci'], options: {} });
});

test('spawnNpm hands the prepared command to the spawner', () => {
  const calls = [];
  const spawnSync = (...a) => { calls.push(a); return { status: 0 }; };
  host.spawnNpm(['root', '-g'], { encoding: 'utf8' }, { platform: 'win32', env: {}, exists: () => false, spawnSync });
  assert.deepEqual(calls, [['npm.cmd', ['root', '-g'], { encoding: 'utf8', shell: true }]]);
});

test('findOnPath: win32 tries PATHEXT, matches Path case-insensitively and strips quotes; POSIX needs the plain name', () => {
  const have = new Set(['C:\\tools\\ffmpeg.exe', 'C:\\tools\\npm.cmd', 'C:\\bin\\git.com', '/usr/bin/ffmpeg']);
  const lower = new Set([...have].map((f) => f.toLowerCase()));
  const win = (env) => ({ platform: 'win32', env, exists: (f) => lower.has(f.toLowerCase()) });
  const found = (name, ctx) => host.findOnPath(name, ctx)?.toLowerCase() ?? null;
  assert.equal(found('ffmpeg', win({ Path: '"C:\\other";"C:\\tools"', PATHEXT: '.COM;.EXE;.BAT;.CMD' })), 'c:\\tools\\ffmpeg.exe');
  assert.equal(found('npm', win({ PATH: 'c:\\tools' })), 'c:\\tools\\npm.cmd', 'default PATHEXT when unset');
  assert.equal(found('npm.cmd', win({ PATH: 'c:\\tools' })), 'c:\\tools\\npm.cmd');
  assert.equal(found('git', win({ PATH: 'c:\\bin', PATHEXT: '.exe;.com' })), 'c:\\bin\\git.com');
  assert.equal(found('ffmpeg', win({ PATH: 'c:\\nowhere' })), null);
  const posix = { platform: 'linux', exists: (f) => have.has(f) };
  assert.equal(host.findOnPath('ffmpeg', { ...posix, env: { PATH: '/bin:/usr/bin' } }), '/usr/bin/ffmpeg');
  assert.equal(host.findOnPath('ffmpeg', { ...posix, env: { PATH: '/bin' }, dirs: ['/usr/bin'] }), '/usr/bin/ffmpeg');
  assert.equal(host.findOnPath('ffmpeg.exe', { ...posix, env: { PATH: '/usr/bin' } }), null, 'POSIX never adds extensions');
});

test('findOnPath finds a real executable on this host', () => {
  const dir = temp('litmuse-path-');
  const tool = join(dir, 'lit-probe-tool');
  writeFileSync(tool, '#!/bin/sh\nexit 0\n');
  assert.equal(host.findOnPath('lit-probe-tool', { env: { PATH: dir } }), null, 'not executable yet');
  chmodSync(tool, 0o755);
  assert.equal(host.findOnPath('lit-probe-tool', { env: { PATH: dir } }), tool);
});

test('firstLine drops the carriage return that Windows tools leave on every line', () => {
  assert.equal(host.firstLine('C:\\tools\\ffmpeg.exe\r\nC:\\other\\ffmpeg.exe\r\n'), 'C:\\tools\\ffmpeg.exe');
  assert.equal(host.firstLine('\r\n  \r\nsecond\r\n'), 'second');
  assert.equal(host.firstLine(undefined), '');
});

test('failureDetail names why a child failed: could not start, exit code with stderr, or a signal', () => {
  assert.match(host.failureDetail({ error: Object.assign(new Error('spawnSync npm.cmd EINVAL'), { code: 'EINVAL' }), status: null }), /could not start \(EINVAL: spawnSync npm\.cmd EINVAL\)/);
  assert.equal(host.failureDetail({ status: 7, stderr: 'npm ERR! nope\n' }), 'exit 7: npm ERR! nope');
  assert.equal(host.failureDetail({ status: null, signal: 'SIGKILL', stderr: '' }), 'ended by SIGKILL');
  assert.equal(host.failureDetail({ status: 1, stderr: 'x'.repeat(900) }).length, 'exit 1: '.length + 600);
});

// ---- call sites -------------------------------------------------------------------------------

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') sourceFiles(file, acc); } else if (/\.(mjs|js|py)$/u.test(entry.name)) acc.push(file);
  }
  return acc;
}
const ALL_SOURCES = [...sourceFiles(join(ROOT, 'plugin')), ...sourceFiles(join(ROOT, 'lib')), ...sourceFiles(join(ROOT, 'bin'))];
const rel = (file) => file.slice(ROOT.length + 1);

test('no runtime starts npm, a .cmd file or `where` by hand; the shared helper is the only place that knows', () => {
  const offenders = [];
  for (const file of ALL_SOURCES.filter((f) => f.endsWith('.mjs') || f.endsWith('.js'))) {
    if (file === join(LIB, 'host-process.mjs')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/u.test(line)) return;
      if (/["']np[mx]\.cmd["']/u.test(line)) offenders.push(`${rel(file)}:${i + 1}: names npm.cmd or npx.cmd`);
      if (/spawn(Sync)?\(\s*["']np[mx]["']/u.test(line)) offenders.push(`${rel(file)}:${i + 1}: spawns npm or npx directly`);
      if (/["']where["']/u.test(line)) offenders.push(`${rel(file)}:${i + 1}: shells out to where`);
      if (/\.split\(["']\\n["']\)\[0\]/u.test(line) && /(stdout|stderr|probe|\br\.|run\.|raw\.)/u.test(line)) offenders.push(`${rel(file)}:${i + 1}: first line of child output split on \\n only`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('every .cmd-capable launcher in the skill scripts goes through the helper', () => {
  const uses = (file) => readFileSync(join(ROOT, file), 'utf8');
  for (const file of [
    'plugin/skills/lsp/scripts/tsserver-query.mjs',
    'plugin/skills/lsp/scripts/diagnostics.mjs',
    'plugin/skills/lsp-setup/scripts/detect-lsp.mjs',
    'plugin/skills/lsp-setup/scripts/verify-lsp.mjs',
    'plugin/skills/browser-drive/scripts/capability-probe.mjs',
  ]) assert.match(uses(file), /host-process\.mjs/, file);
});

test('the host Python probe line is CRLF-safe and the default interpreter name follows the platform', () => {
  const crlf = () => ({ status: 0, stdout: '3.12.4\r\n', stderr: '' });
  assert.deepEqual(host.probePythonCommand('python', { platform: 'win32', env: {}, spawnSync: crlf }), { ok: true, command: 'python', version: '3.12.4', detail: '3.12.4' });
  const tried = [];
  host.pickPython(undefined, { platform: 'win32', probe: (command) => (tried.push(command), { ok: false, command, detail: 'not found' }) });
  assert.deepEqual(tried, ['python', 'python3']);
  assert.equal(host.pickPython('py3-missing', { env: { PATH: '' } }).command, 'py3-missing');
});

test('doctor: a runtime is found by PATHEXT lookup on win32 and by the same lookup on POSIX, with no shell', async () => {
  const doctor = await import(join(ROOT, 'lib', 'doctor.mjs'));
  const astGrep = doctor.RUNTIMES.find((r) => r.label === 'ast-grep');
  const chrome = doctor.RUNTIMES.find((r) => r.label.startsWith('Chrome'));
  const win = (env, have) => ({ env, platform: 'win32', exists: (f) => have.some((h) => h.toLowerCase() === f.toLowerCase()) });
  assert.equal(doctor.runtimeFound(astGrep, win({ Path: 'C:\\ag' }, ['C:\\ag\\sg.exe'])), true);
  assert.equal(doctor.runtimeFound(astGrep, win({ Path: 'C:\\ag' }, [])), false);
  assert.equal(doctor.runtimeFound({ all: ['a', 'b'] }, win({ Path: 'C:\\p' }, ['C:\\p\\a.exe'])), false, 'an all-spec needs every tool');
  assert.equal(doctor.runtimeFound({ all: ['a', 'b'] }, win({ Path: 'C:\\p' }, ['C:\\p\\a.exe', 'C:\\p\\b.exe'])), true);
  assert.equal(doctor.runtimeFound(chrome, win({ CHROME_PATH: 'C:\\anything' }, [])), true);
  assert.equal(doctor.runtimeFound(chrome, win({ Path: '' }, ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])), true);
});
