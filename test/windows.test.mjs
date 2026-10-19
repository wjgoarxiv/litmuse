// Windows hardening. Real Windows is not available to the suite, so the win32 branches take the platform,
// environment and filesystem probe as injected values; the POSIX paths run for real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { EXIT } from '../plugin/skills/lit-typographic-motion/engine/core/constants.mjs';
import { motionCli, needsRender, coverRun } from './motion-helpers.mjs';

const LIB = join(ROOT, 'plugin', 'lib');
const SKILLS = join(ROOT, 'plugin', 'skills');
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
    // The Stop hook loads chrome.mjs, so its bytes are part of every hook digest and an edit would make the user approve all ten hooks
    // again. Its `where` call is unreachable on Windows: the win32 candidates are absolute paths.
    if (file === join(SKILLS, 'lit-typographic-motion', 'engine', 'node', 'chrome.mjs')) continue;
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
    'plugin/lib/office-runtime.mjs',
    'plugin/skills/lit-typographic-motion/engine/node/runtime.mjs',
    'plugin/skills/lit-diagram-drawer/scripts/diagram-runtime.mjs',
    'plugin/skills/readme-studio/scripts/readme-runtime.mjs',
    'plugin/skills/lsp/scripts/tsserver-query.mjs',
  ]) assert.match(uses(file), /host-process\.mjs/, file);
});

function fakeNpm(exitCode, message) {
  const bin = temp('litmuse-fakenpm-');
  const npm = join(bin, 'npm');
  writeFileSync(npm, `#!/bin/sh\necho "${message}" >&2\nexit ${exitCode}\n`);
  chmodSync(npm, 0o755);
  return bin;
}

test('office runtime: a failed npm install reports the child exit code and its stderr', () => {
  const bin = fakeNpm(7, 'npm ERR! registry unreachable');
  const r = spawnSync(process.execPath, [join(LIB, 'office-runtime.mjs'), 'node-modules'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LITMUSE_OFFICE_RUNTIME: temp('litmuse-office-'), npm_execpath: '' },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /OFFICE_RUNTIME_NODE_INSTALL_FAILED/);
  assert.match(r.stderr, /exit 7: npm ERR! registry unreachable/);
});

test('office runtime: the host Python probe line is CRLF-safe and the default interpreter name follows the platform', async () => {
  const crlf = () => ({ status: 0, stdout: '3.12.4\r\n', stderr: '' });
  assert.deepEqual(host.probePythonCommand('python', { platform: 'win32', env: {}, spawnSync: crlf }), { ok: true, command: 'python', version: '3.12.4', detail: '3.12.4' });
  const tried = [];
  host.pickPython(undefined, { platform: 'win32', probe: (command) => (tried.push(command), { ok: false, command, detail: 'not found' }) });
  assert.deepEqual(tried, ['python', 'python3']);
  const office = await import(join(LIB, 'office-runtime.mjs'));
  assert.equal(office.hostPython({ PATH: '', LITMUSE_OFFICE_PYTHON: 'py3-missing' }).command, 'py3-missing');
});

test('motion engine: which and the ffmpeg finders honour PATHEXT and a CRLF-free path result', async () => {
  const encode = await import(join(SKILLS, 'lit-typographic-motion', 'engine', 'node', 'encode.mjs'));
  const ctx = { platform: 'win32', exists: (f) => f.toLowerCase() === 'c:\\ff\\ffmpeg.exe' };
  assert.equal(encode.which('ffmpeg', { Path: 'C:\\ff' }, ctx).toLowerCase(), 'c:\\ff\\ffmpeg.exe');
  assert.equal(encode.which('ffprobe', { Path: 'C:\\ff' }, ctx), null);
});

test('doctor: a runtime is found by PATHEXT lookup on win32 and by the same lookup on POSIX, with no shell', async () => {
  const doctor = await import(join(ROOT, 'lib', 'doctor.mjs'));
  const ffmpeg = doctor.RUNTIMES.find((r) => r.label === 'ffmpeg');
  const poppler = doctor.RUNTIMES.find((r) => r.label.startsWith('Poppler'));
  const chrome = doctor.RUNTIMES.find((r) => r.label.startsWith('Chrome'));
  const win = (env, have) => ({ env, platform: 'win32', exists: (f) => have.some((h) => h.toLowerCase() === f.toLowerCase()) });
  assert.equal(doctor.runtimeFound(ffmpeg, win({ Path: 'C:\\ff' }, ['C:\\ff\\ffmpeg.exe'])), true);
  assert.equal(doctor.runtimeFound(ffmpeg, win({ Path: 'C:\\ff' }, [])), false);
  assert.equal(doctor.runtimeFound(poppler, win({ Path: 'C:\\p' }, ['C:\\p\\pdftoppm.exe'])), false, 'needs both tools');
  assert.equal(doctor.runtimeFound(poppler, win({ Path: 'C:\\p' }, ['C:\\p\\pdftoppm.exe', 'C:\\p\\pdftotext.exe'])), true);
  assert.equal(doctor.runtimeFound(chrome, win({ CHROME_PATH: 'C:\\anything' }, [])), true);
  assert.equal(doctor.runtimeFound(chrome, win({ Path: '' }, ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])), true);
});

// ---- Python ----------------------------------------------------------------------------------

const py = (code, env = {}) => spawnSync('python3', ['-I', '-B', '-c', `import sys\nsys.path.insert(0, ${JSON.stringify(LIB)})\n${code}`], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ...env } });

test('office bootstrap on win32 returns the child exit code instead of replacing the process', () => {
  const dir = temp('litmuse-reexec-');
  const script = join(dir, 'exit3.py');
  writeFileSync(script, 'import sys\nsys.exit(3)\n');
  const r = py(`
import office_runtime_bootstrap as b
try:
    b.reexec(sys.executable, ${JSON.stringify(script)}, [], {}, platform="win32")
except SystemExit as e:
    print("EXIT", e.code)
`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /EXIT 3/);
});

test('office bootstrap on POSIX keeps execve with the same interpreter, script and arguments', () => {
  const r = py(`
import office_runtime_bootstrap as b
seen = []
b.reexec("/venv/bin/python", "/skill/qa.py", ["--a", "b"], {"K": "v"}, platform="darwin", execve=lambda *a: seen.append(a))
print(seen)
`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[\('\/venv\/bin\/python', \['\/venv\/bin\/python', '\/skill\/qa\.py', '--a', 'b'\], \{'K': 'v'\}\)\]/);
});

test('a helper that fails its gate exits non-zero through the bootstrap (POSIX, real process)', () => {
  const dir = temp('litmuse-gate-');
  writeFileSync(join(dir, 'gate.py'), `import os, sys
sys.path.insert(0, ${JSON.stringify(LIB)})
from office_runtime_bootstrap import reexec
if os.environ.get("INNER") != "1":
    reexec(sys.executable, os.path.abspath(__file__), sys.argv[1:], dict(os.environ, INNER="1"))
sys.exit(5)
`);
  const r = spawnSync('python3', ['-I', '-B', join(dir, 'gate.py')], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(r.status, 5, r.stdout + r.stderr);
});

test('PDF font preflight names the missing font and how to install it; unknown font lists are not guessed', () => {
  const r = py(`
import pdf_fonts as f
need = {"main font": "Times New Roman", "Korean font": "Pretendard"}
fc = lambda: {"liberation serif", "pretendard variable", "dejavu sans"}
print(f.missing_fonts(need, {"times new roman", "noto sans"}))
print(f.missing_fonts(need, {"times new roman", "pretendard"}))
print(f.missing_fonts(need, None))
print(f.parse_fc_list("Pretendard,Pretendard Black\\r\\nDejaVu Sans\\r\\n"))
print(sorted(f.parse_reg_fonts("    Times New Roman Bold (TrueType)    REG_SZ    timesbd.ttf\\r\\n    Pretendard Regular (OpenType)    REG_SZ    P.otf\\r\\n    Junk    REG_SZ    x\\r\\n")))
try:
    f.require_fonts(need, installed={"noto sans"})
except SystemExit as e:
    print(e)
`);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n');
  assert.equal(lines[0], "[('Korean font', 'Pretendard')]");
  assert.equal(lines[1], '[]');
  assert.equal(lines[2], '[]');
  assert.match(lines[3], /pretendard/);
  assert.equal(lines[4], "['pretendard regular', 'times new roman bold']");
  const message = lines.slice(5).join('\n');
  assert.match(message, /^BLOCKED: the PDF profile needs fonts that are not installed/);
  assert.match(message, /Times New Roman/);
  assert.match(message, /Pretendard/);
  assert.match(message, /github\.com\/orioncactus\/pretendard/);
});

test('every LaTeX template loads the packages pandoc output needs (longtable for tables, \\tightlist for lists)', () => {
  const root = join(SKILLS, 'lit-docx', 'templates', 'latex');
  const names = readdirSync(root).filter((d) => existsSync(join(root, d, 'template.tex')));
  assert.ok(names.length >= 5, names.join(','));
  for (const name of names) {
    const tex = readFileSync(join(root, name, 'template.tex'), 'utf8');
    assert.match(tex, /\\usepackage\{longtable\}/, `${name}: longtable`);
    assert.match(tex, /\\providecommand\{\\tightlist\}/, `${name}: tightlist`);
  }
});

// ---- cover renderer: fail fast ---------------------------------------------------------------

test('a cover page that throws while loading stops the render at once with its message, not after the 60 s ready wait', (t) => {
  if (needsRender(t)) return;
  const out = coverRun('good');
  writeFileSync(join(out, 'cover', 'index.html'), `<!doctype html>
<meta charset="utf-8">
<body>
<script>
window.renderFrame = () => {};
throw new Error("ART.lights has no entry for the hero bay 7");
</script>
</body>
`);
  const started = Date.now();
  const r = motionCli(['cover', '--out', out, '--round', '1']);
  const seconds = (Date.now() - started) / 1000;
  assert.equal(r.status, EXIT.STAGE_CONTRACT_ERROR, r.stdout + r.stderr);
  assert.match(r.stderr, /STAGE_CONTRACT_ERROR: .*ART\.lights has no entry for the hero bay 7/);
  assert.ok(seconds < 45, `took ${seconds} s`);
});
