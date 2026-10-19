// Starting host programs the same way on macOS, Linux and Windows.
//
// Node (20.12.2 and later, and every 22+) refuses to start a .cmd or .bat file without a shell
// (CVE-2024-27980), so `spawnSync("npm.cmd", ...)` fails with EINVAL on Windows. This module is the
// one place that knows that, plus the other two Windows differences the runtimes hit: program lookup
// has to honour PATHEXT, and `where` output ends lines with CRLF. Every function takes the platform,
// environment and filesystem probe as options so the Windows branch can be tested on any host.

import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import path from "node:path";

const WIN_SCRIPT = /\.(cmd|bat)$/iu;
// Characters that stay literal in a cmd.exe command line without quotes.
const CMD_PLAIN = /^[A-Za-z0-9_\-.,:=@+/\\]+$/u;

/** First non-empty line of child output, trimmed; CRLF-safe. */
export const firstLine = (text) => String(text ?? "").split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? "";

/**
 * Quote one argument for cmd.exe. Arguments here are our own literals and paths, never user text, so
 * a character that cannot be quoted safely (a double quote, %, a line break) is refused instead of escaped.
 */
export function quoteCmdArg(arg) {
  const text = String(arg);
  if (/["%\r\n\0]/u.test(text)) throw new Error(`cannot pass ${JSON.stringify(text.slice(0, 60))} through cmd.exe safely`);
  if (text && CMD_PLAIN.test(text)) return text;
  // A backslash run before the closing quote would escape it, so double that run.
  return `"${text.replace(/\\+$/u, (run) => run + run)}"`;
}

/**
 * The program an npm-generated .cmd shim runs: its last line is `"%dp0%\\..\\pkg\\bin\\tool.js" %*`
 * (or `%~dp0` in older shims). Returns the absolute target, or null when the file is not such a shim.
 */
export function shimTarget(file, readFile = (f) => readFileSync(f, "utf8")) {
  let text;
  try {
    text = readFile(file);
  } catch {
    return null;
  }
  const lines = [...String(text).matchAll(/"(?:%dp0%|%~dp0)\\([^"\r\n]+)"\s+%\*/giu)];
  const target = lines.at(-1)?.[1];
  return target ? path.win32.join(path.win32.dirname(file), target) : null;
}

/**
 * The command, arguments and options to hand to spawn. On Windows a .cmd or .bat file cannot be started directly:
 * an npm shim is replaced by the program it wraps (node plus its script, or the .exe), so arguments pass through
 * untouched; any other script goes through a shell with every argument quoted.
 */
export function prepareSpawn(command, args = [], options = {}, { platform = process.platform, readFile, execPath = process.execPath } = {}) {
  if (platform !== "win32" || !WIN_SCRIPT.test(String(command))) return { command, args, options };
  const target = /\.cmd$/iu.test(command) ? shimTarget(command, readFile) : null;
  if (target && /\.(c|m)?js$/iu.test(target)) return { command: execPath, args: [target, ...args], options };
  if (target && /\.exe$/iu.test(target)) return { command: target, args, options };
  return { command: quoteCmdArg(command), args: args.map(quoteCmdArg), options: { ...options, shell: true } };
}

/** spawnSync that also works for .cmd and .bat files on Windows. */
export function spawnSafe(command, args = [], options = {}, ctx = {}) {
  const run = prepareSpawn(command, args, options, ctx);
  return (ctx.spawnSync ?? spawnSync)(run.command, run.args, run.options);
}

/** Async counterpart of spawnSafe. */
export function spawnSafeAsync(command, args = [], options = {}, ctx = {}) {
  const run = prepareSpawn(command, args, options, ctx);
  return (ctx.spawn ?? spawn)(run.command, run.args, run.options);
}

const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};
const isRunnable = (file) => {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const pathVariable = (env, platform) => {
  if (platform !== "win32") return env.PATH ?? "";
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH");
  return key ? env[key] ?? "" : "";
};
const pathExt = (env) => {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATHEXT");
  return (key && env[key] ? env[key] : ".COM;.EXE;.BAT;.CMD").split(";").map((ext) => ext.trim()).filter(Boolean);
};

/**
 * Absolute path of a program on PATH, or null. On Windows a name without an extension is tried with
 * each PATHEXT entry, so `ffmpeg` finds `ffmpeg.exe`. `dirs` are searched before PATH.
 */
export function findOnPath(name, { env = process.env, platform = process.platform, dirs = [], exists } = {}) {
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  const probe = exists ?? (win ? isFile : isRunnable);
  const exts = win ? pathExt(env) : [];
  const hasExt = win && exts.some((ext) => name.toUpperCase().endsWith(ext.toUpperCase()));
  const names = win && !hasExt ? exts.map((ext) => name + ext) : [name];
  if (p.isAbsolute(name) || /[\\/]/u.test(name)) return names.find((n) => probe(n)) ?? null;
  const searched = [...dirs, ...pathVariable(env, platform).split(p.delimiter)].map((dir) => dir.replace(/^"(.*)"$/u, "$1")).filter(Boolean);
  for (const dir of searched) {
    for (const candidate of names) {
      const file = p.join(dir, candidate);
      if (probe(file)) return file;
    }
  }
  return null;
}

/**
 * How to run npm. On Windows prefer node + npm-cli.js (no shell, no quoting): npm_execpath when it
 * names npm-cli.js, else the copy bundled beside node. With neither, fall back to npm.cmd through a shell.
 */
export function npmInvocation(args, options = {}, { platform = process.platform, env = process.env, execPath = process.execPath, exists = isFile } = {}) {
  if (platform !== "win32") return { command: "npm", args, options };
  const cli = [env.npm_execpath, path.win32.join(path.win32.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js")]
    .find((file) => file && /npm-cli\.js$/iu.test(file) && exists(file));
  if (cli) return { command: execPath, args: [cli, ...args], options };
  return prepareSpawn("npm.cmd", args, options, { platform, readFile: () => { throw new Error("npm.cmd is not an npm-generated shim"); } });
}

/** spawnSync of npm that works on Windows. */
export function spawnNpm(args, options = {}, ctx = {}) {
  const run = npmInvocation(args, options, ctx);
  return (ctx.spawnSync ?? spawnSync)(run.command, run.args, run.options);
}

/** One line naming why a child failed: could not start, killed, or its exit code, with the tail of stderr. */
export function failureDetail(result, tail = 600) {
  if (result.error) return `could not start (${result.error.code ?? "error"}: ${result.error.message})`;
  const how = result.status === null || result.status === undefined ? `ended by ${result.signal ?? "a signal"}` : `exit ${result.status}`;
  const text = String(result.stderr || result.stdout || "").trim();
  return text ? `${how}: ${text.slice(-tail)}` : how;
}

// The office, motion-audio and sciviz locks pin binary wheels (--only-binary) that exist from CPython 3.10
// through 3.14, so a newer python3 (3.15 on a current Homebrew) fails pip on its first package. Every
// runtime picks its host interpreter here.
const MIN_PYTHON = [3, 10];
const MAX_PYTHON = [3, 14];
const PYTHON_RANGE = `${MIN_PYTHON.join(".")} to ${MAX_PYTHON.join(".")}`;

/** Version of one interpreter name, looked up on env.PATH, and whether it falls inside the supported range. */
export function probePythonCommand(command, { env = process.env, platform = process.platform, spawnSync: spawn } = {}) {
  const probe = spawnSafe(command, ["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"], { encoding: "utf8", env, timeout: 15000 }, { platform, spawnSync: spawn });
  if (probe.error || probe.status !== 0) {
    return { ok: false, command, detail: probe.error?.code === "ENOENT" ? "not found" : (probe.stderr || probe.error?.message || "not found").trim() };
  }
  const version = firstLine(probe.stdout);
  const [major, minor] = version.split(".").map(Number);
  if (major < MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor < MIN_PYTHON[1])) return { ok: false, command, version, detail: `${version} is older than ${MIN_PYTHON.join(".")}` };
  if (major > MAX_PYTHON[0] || (major === MAX_PYTHON[0] && minor > MAX_PYTHON[1])) return { ok: false, command, version, detail: `${version} is newer than ${MAX_PYTHON.join(".")}` };
  return { ok: true, command, version, detail: version };
}

/**
 * The host Python a runtime builds its venv from. An override (the runtime's LITMUSE_*_PYTHON) is the
 * only interpreter tried. Otherwise the newest python3.X inside the range, then python3 and python
 * (on Windows, where versioned names do not exist: python, then python3).
 */
export function pickPython(override, { env = process.env, platform = process.platform, probe = (command) => probePythonCommand(command, { env, platform }) } = {}) {
  if (override) return probe(override);
  const versioned = Array.from({ length: MAX_PYTHON[1] - MIN_PYTHON[1] + 1 }, (_, i) => `python3.${MAX_PYTHON[1] - i}`);
  const candidates = platform === "win32" ? ["python", "python3"] : [...versioned, "python3", "python"];
  const tried = [];
  for (const command of candidates) {
    const found = probe(command);
    if (found.ok) return found;
    if (found.detail !== "not found") tried.push(`${command}: ${found.detail}`);
  }
  return { ok: false, command: candidates[0], detail: `no supported Python (${PYTHON_RANGE}) on PATH${tried.length ? `; tried ${tried.join(", ")}` : ""}` };
}
