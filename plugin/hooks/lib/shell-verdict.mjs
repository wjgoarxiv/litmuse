import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir, userInfo } from 'node:os';

// The start-work run guard reads one shell command and says what happens to it while a run is active:
//   allow   ordinary local work in the workspace or in a plan `Scope roots:` folder granted `write`
//           (Muse's own approval mode and sandbox still decide the call)
//   refuse  secrets, host homes, run state and .git internals: denied and never stored
//   park    a step that needs the user's word: tier B (on the B allowlist, every path inside a known root and
//           undoable) or tier X (everything else); a command the guard cannot follow is parked as held and is
//           never replayed
//   split   a self-check refused only for its shape: the model is told which parts to run as separate calls
// It reads the command, never the scripts the command runs.

const FOLDS_CASE = process.platform === 'darwin' || process.platform === 'win32';
const fold = (p) => (FOLDS_CASE ? p.toLowerCase() : p);

const held = (reason) => ({ held: reason });

// --- words ---------------------------------------------------------------------------------------------------

// Splits a command into segments joined by &&, ||, ;, | or a line break. Expansion, substitution, escapes,
// subshells, background jobs, here-documents, comments and unpaired quotes make the command uncheckable.
export function tokenize(command) {
  if (typeof command !== 'string' || !command.trim()) return held('empty command');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(command)) return held('control characters in the command');
  const segments = [];
  let seg = { words: [], redirects: [] };
  let word = null;
  let quote = null;
  const pushWord = () => { if (word) seg.words.push(word); word = null; };
  const endSeg = (sepText) => {
    pushWord();
    if (!seg.words.length && !seg.redirects.length) return false;
    seg.sep = sepText;
    segments.push(seg);
    seg = { words: [], redirects: [] };
    return true;
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote === "'") { if (ch === "'") quote = null; else word.text += ch; continue; }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if ('$`\\'.includes(ch)) return held('expansion inside double quotes');
      else word.text += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { word ??= { text: '', quoted: true }; word.quoted = true; quote = ch; continue; }
    if (ch === ' ' || ch === '\t') { pushWord(); continue; }
    if (ch === '\n' || ch === '\r' || ch === ';') { if (!endSeg(';')) return held('empty step'); continue; }
    if (ch === '&') {
      if (command[i + 1] === '&') { i += 1; if (!endSeg('&&')) return held('empty step'); continue; }
      return held('background job or `&>` redirect');
    }
    if (ch === '|') {
      const two = command[i + 1] === '|';
      if (two) i += 1;
      if (!endSeg(two ? '||' : '|')) return held('empty step');
      continue;
    }
    if (ch === '>' || ch === '<') {
      let fd = '';
      if (word && /^\d+$/.test(word.text) && !word.quoted) { fd = word.text; word = null; }
      pushWord();
      let op = ch;
      if (command[i + 1] === ch) { op += ch; i += 1; }
      if (op === '<<' || command[i + 1] === '(') return held('here-document or process substitution');
      if (command[i + 1] === '&') {
        const dup = /^&(\d+|-)/.exec(command.slice(i + 1));
        if (!dup) return held('unreadable redirect');
        i += dup[0].length;
        continue;
      }
      while (command[i + 1] === ' ' || command[i + 1] === '\t') i += 1;
      const m = /^[^\s;&|<>()]+/.exec(command.slice(i + 1));
      if (!m || /[$`'"\\*?[\]{}~]/.test(m[0])) return held('unreadable redirect target');
      i += m[0].length;
      seg.redirects.push({ op, fd, target: m[0] });
      continue;
    }
    if (ch === '$') return held('shell expansion (`$`)');
    if (ch === '`') return held('command substitution (backticks)');
    if (ch === '\\') return held('backslash escape');
    if (ch === '(' || ch === ')') return held('subshell or grouping');
    if (ch === '#' && !word) return held('comment text');
    word ??= { text: '' };
    if ('*?['.includes(ch) || '{}'.includes(ch)) word.glob = true;
    if (ch === '~' && word.text === '') word.tilde = true;
    word.text += ch;
  }
  if (quote) return held('quotes do not pair');
  if (!endSeg(null)) return held('empty step');
  return { segments };
}

// --- paths ---------------------------------------------------------------------------------------------------

function realOr(p) {
  try { return realpathSync(p); } catch { return resolve(p); }
}

const LINK_HOPS = 16;

// The real location a path names: the nearest existing ancestor through realpath, plus the rest. A dangling link
// counts as present and is reported, so a write through it is never taken for a new path inside the workspace; its
// whole chain is followed (each hop's own ancestors resolved too) up to LINK_HOPS, and a loop or a longer chain is
// reported as `loop`, which the protected check refuses.
export function locate(abs, hops = LINK_HOPS) {
  let cur = abs;
  const rest = [];
  for (;;) {
    let st = null;
    try { st = lstatSync(cur); } catch { st = null; }
    if (st) {
      try {
        return { real: join(realpathSync(cur), ...rest), exists: rest.length === 0, dangling: false };
      } catch (err) {
        if (err?.code === 'ELOOP' || hops <= 0) return { real: join(cur, ...rest), exists: false, dangling: true, loop: true };
        let target;
        try { target = resolve(dirname(cur), readlinkSync(cur)); } catch { return { real: join(cur, ...rest), exists: false, dangling: true }; }
        const next = locate(target, hops - 1);
        return { real: join(next.real, ...rest), exists: false, dangling: true, loop: Boolean(next.loop) };
      }
    }
    const parent = dirname(cur);
    if (parent === cur) return { real: abs, exists: false, dangling: false };
    rest.unshift(basename(cur));
    cur = parent;
  }
}

export const within = (base, p) => {
  const rel = relative(fold(base), fold(p));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

function homes(env) {
  const out = new Set();
  for (const h of [env.HOME, homedir(), (() => { try { return userInfo().homedir; } catch { return null; } })()]) {
    if (h) out.add(realOr(h));
  }
  return [...out];
}

const HOME_SECRETS = ['.ssh', '.aws', '.gnupg', '.npmrc', '.netrc', '.gitconfig', '.docker', '.kube', '.claude', '.claude.json',
  '.codex', '.hermes', '.grok', '.gemini', '.zshrc', '.zprofile', '.zshenv', '.bashrc', '.bash_profile', '.profile',
  '.config/muse', '.config/gh', '.config/opencode', '.local/state/litmuse'];
// Muse keeps session logs and long tool results in its data folder; a run may read its own there, never write.
const HOME_WRITE_ONLY = ['.local/share/muse'];
// Case-insensitive: on a case-folding disk `.ENV` and `ID_RSA` are the same files.
const ENV_FILE = /^\.env(?:\.[\w-]+)*$|^\.envrc$/i;
const ENV_EXAMPLE = /\.(?:example|sample|template)$/i;
const KEY_FILE = /^id_(?:rsa|dsa|ecdsa|ed25519)$|\.pem$|^\.mcp\.json$|^\.(?:npmrc|netrc|pypirc)$/i;

function stateHome(env) {
  return env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state');
}

// A write, move or remove whose target is, holds or sits inside the run's state: the hook state folder and the
// workspace's `.litmuse` folder (its session records outright; the whole folder when the target contains it).
function stateFolderReason(abs, real, env, root) {
  const state = join(stateHome(env), 'litmuse');
  const local = root ? join(root, '.litmuse') : null;
  for (const p of new Set([resolve(abs), real])) {
    for (const s of new Set([state, realOr(state)])) {
      if (within(p, s) || within(s, p)) return 'LitMuse run state belongs to the hooks';
    }
    if (local && (within(p, local) || within(join(local, 'sessions'), p))) return 'the workspace .litmuse folder holds LitMuse run records';
  }
  return null;
}

// Why a path may never be touched during a run, or null. Checked on the lexical path and on its real location.
export function protectedReason(abs, env = process.env, write = false, root = null) {
  const loc = locate(abs);
  if (loc.loop) return 'a link loop or a link chain too long to follow';
  if (write) {
    const state = stateFolderReason(abs, loc.real, env, root);
    if (state) return state;
  }
  for (const p of new Set([resolve(abs), loc.real])) {
    const name = basename(p);
    if (ENV_FILE.test(name) && !ENV_EXAMPLE.test(name)) return `${name} holds secrets`;
    if (KEY_FILE.test(name)) return `${name} is a key or host config file`;
    if (within(realOr(join(stateHome(env), 'litmuse')), p) || within(join(stateHome(env), 'litmuse'), p)) return 'LitMuse run state belongs to the hooks';
    if (env.XDG_CONFIG_HOME && within(realOr(join(env.XDG_CONFIG_HOME, 'muse')), p)) return 'Muse configuration';
    if (write && env.XDG_DATA_HOME && within(realOr(join(env.XDG_DATA_HOME, 'muse')), p)) return 'Muse data (read-only during a run)';
    for (const home of homes(env)) {
      for (const s of write ? [...HOME_SECRETS, ...HOME_WRITE_ONLY] : HOME_SECRETS) {
        if (within(join(home, s), p)) return `${join('~', s)} is a secret or host home`;
      }
    }
  }
  return null;
}

// Any path through a `.git` folder, inside the workspace or not (a linked worktree's git dir lives elsewhere).
function inGit(root, real) {
  return real.split(sep).some((part) => fold(part) === '.git');
}

// --- verbs ---------------------------------------------------------------------------------------------------

const OPAQUE = new Set(['pushd', 'popd', 'builtin', 'command', 'exec', 'eval', 'source', '.', 'alias', 'unalias', 'enable',
  'set', 'shopt', 'trap', 'env', 'sudo', 'doas', 'su', 'xargs', 'time', 'nice', 'nohup', 'timeout', 'stdbuf', 'ionice',
  'chroot', '!', 'watch', 'parallel', 'nsenter', 'unshare', 'script', 'osascript', 'open', 'caffeinate', 'until', 'while',
  'for', 'if', 'then', 'do', 'function', 'case', 'select', 'coproc', 'declare', 'export', 'local', 'readonly', 'typeset']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const RUNNERS = new Set(['node', 'python', 'python3', 'perl', 'ruby', 'php', 'tsx', 'ts-node', ...SHELLS]);
const INLINE_FLAG = /^(?:-e|-p|-c|-lc|-ic|-[a-z]*c|--eval|--print|-E|-r)$/;
const NETWORK = new Set(['curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'nc', 'ncat', 'telnet', 'docker', 'podman', 'aws',
  'gcloud', 'az', 'kubectl', 'helm', 'terraform', 'gh', 'npx', 'bunx', 'pipx', 'vercel', 'netlify', 'fly', 'flyctl', 'heroku',
  'firebase', 'twine', 'gsutil', 's3cmd', 'muse']);
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
// A package script is code the guard cannot read, so only the names a run checks itself with run directly.
const CHECK_SCRIPT = /^(?:test|check|lint|build|verify|typecheck|format|fmt)(?::[\w.-]+)?$/;
const PM_READERS = new Set(['ls', 'list', 'outdated', 'view', 'info', 'why', 'explain', 'audit', 'doctor', 'help', '--version', '-v']);
const INSTALLERS = new Set(['pip', 'pip3', 'brew', 'gem', 'cargo', 'go', 'apt', 'apt-get', 'yum', 'dnf', 'port', 'conda', 'uv']);
const INSTALL_SUBS = new Set(['install', 'uninstall', 'publish', 'upgrade', 'update', 'get', 'add', 'remove', 'login', 'yank', 'owner']);
const MAKE_SAFE = new Set(['test', 'check', 'verify', 'lint', 'build', 'fmt', 'format']);
// Toolchain subcommands that are a project's own tests and checks; any other subcommand (`go run`, `cargo run`,
// `uv run`, installs) parks.
const TOOLCHAIN_CHECKS = {
  cargo: new Set(['test', 'check', 'clippy', 'fmt', 'build']),
  go: new Set(['test', 'vet', 'build']),
  pip: new Set(['list', 'show', 'freeze', 'check']),
  pip3: new Set(['list', 'show', 'freeze', 'check']),
};
const TEST_RUNNERS = new Set(['pytest', 'vitest', 'jest', 'mocha', 'tsc', 'eslint', 'ruff', 'mypy', 'pyright']);
// Verbs that only read or print (their writing forms are caught by readerWrites first). Everything else parks.
const SAFE_VERBS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'ls', 'sed', 'jq', 'sort', 'uniq', 'cut',
  'diff', 'cmp', 'comm', 'stat', 'file', 'tr', 'nl', 'column', 'basename', 'dirname', 'pwd', 'echo', 'printf', 'true', 'false',
  'test', '[', 'realpath', 'readlink', 'du', 'df', 'tree', 'date', 'which', 'type', 'uname', 'sleep', 'shasum', 'sha256sum',
  'md5', 'md5sum', 'od', 'hexdump', 'xxd', 'fold', 'expand', 'paste', 'rev', 'seq', 'yes', 'tac', 'strings']);
const DELETERS = new Set(['rm', 'rmdir', 'unlink', 'shred']);
const B_FLAGS = { touch: /^$/, mkdir: /^-p$/, cp: /^-[rRp]+$/, mv: /^$/ };
const GIT_LOCAL = new Set(['status', 'diff', 'log', 'show', 'blame', 'ls-files', 'grep', 'rev-parse', 'describe', 'shortlog']);
const DECODERS = (w) => (w[0] === 'base64' && w.some((a) => /^(?:-d|-D|--decode)$/.test(a)))
  || (w[0] === 'xxd' && w.includes('-r'))
  || (w[0] === 'openssl' && w.some((a) => a === 'enc' || a === '-d' || a === 'base64'))
  || w[0] === 'uudecode';

// Text-level test for a held step that may still reach outside or be irreversible: it keeps a finished run open.
export const OUTWARD_TEXT = /\b(?:push|publish|unpublish|deprecate|dist-tag|tag|version|release|deploy|gh|curl|wget|ssh|scp|sftp|rsync|ftp|nc|telnet|docker|podman|aws|gcloud|az|kubectl|helm|terraform|npx|reset|clean|fetch|pull|clone|ls-remote)\b|\bremote[ \t]+(?:show|update|add|set-url|set-head|set-branches|prune|remove|rm|rename)\b|\b(?:npm|pnpm|yarn|pip3?|brew|gem|cargo)[ \t]+(?:install|i|ci|add|update|upgrade)\b|(?:^|[\s;&|])make\b|\b(?:rm|rmdir|unlink|shred)\b|-delete\b/;

const rank = { allow: 0, B: 1, X: 2, held: 3, refuse: 4 };
const worse = (a, b) => (rank[b.level] >= rank[a.level] ? b : a);

// --- the guard -----------------------------------------------------------------------------------------------

// ctx: { cwd, root (the workspace, real), roots ([{path, write}] from Scope roots lines and granted boundaries),
//        charter ([{branch, repo}]), check (the plan's Done-when command), denied ({commands, paths}), env }
export function classifyCommand(command, ctx) {
  const env = ctx.env ?? process.env;
  if (ctx.denied?.commands?.includes(command)) return { action: 'refuse', reason: 'the user answered `lit deny` to this exact step in this run' };
  const tok = tokenize(command);
  if (tok.held) {
    const split = shapeSplit(command, ctx);
    if (split) return { action: 'split', parts: split, reason: tok.held };
    const prot = scanProtected(command, ctx);
    if (prot) return { action: 'refuse', reason: prot };
    return { action: 'park', tier: 'X', held: tok.held, reason: `cannot check this command: ${tok.held}` };
  }
  const st = { here: ctx.cwd, root: ctx.root, env };
  let verdict = { level: 'allow' };
  let bShaped = true;
  for (const seg of tok.segments) {
    const v = classifySegment(seg, st, ctx);
    if (v.level === 'refuse') return { action: 'refuse', reason: v.reason };
    if (!v.bVerb) bShaped = false;
    if (seg.sep && seg.sep !== '&&') bShaped = false;
    verdict = worse(verdict, v);
  }
  if (verdict.level === 'allow') return { action: 'allow' };
  if (verdict.level === 'held') return { action: 'park', tier: 'X', held: verdict.reason, reason: `cannot check this command: ${verdict.reason}` };
  if (verdict.level === 'B' && bShaped) return { action: 'park', tier: 'B', reason: verdict.reason };
  return { action: 'park', tier: 'X', reason: verdict.reason };
}

// A held command still refuses outright when it plainly names a protected path (`cd ~ && cat .aws/credentials`).
function scanProtected(command, ctx) {
  const env = ctx.env ?? process.env;
  const plain = command.replace(/["']/g, '');
  for (const raw of plain.split(/[\s;&|<>()=]+/)) {
    if (!raw) continue;
    const word = raw.replace(/^~(?=\/|$)/, homes(env)[0] ?? '~').replace(/^\$\{?HOME\}?(?=\/|$)/, env.HOME ?? homedir());
    if (/^~[^/]/.test(word)) return 'a `~user` path names another account';
    for (const base of [ctx.cwd, ...homes(env)]) {
      const reason = protectedReason(resolve(base, word), env);
      if (reason && (isAbsolute(word) || base === ctx.cwd)) return reason;
    }
  }
  return null;
}

const STATUS_ONLY = /^(?:echo|printf|true|false|:)(?:\s|$)/;

// `node check.mjs; echo "exit=$?"` is held only for its shape. When every part is a reader, a status echo or the
// plan's own check, the model gets the parts to run one by one; nothing is parked.
function shapeSplit(command, ctx) {
  const parts = command.split(/;|\|\||&&|\n/).map((p) => p.replace(/\s+2>&1\s*$/, '').trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // A status echo is dropped only when it writes nothing: `echo x > ../f` is work, and it fails the reader test below.
  const work = parts.filter((p) => !(STATUS_ONLY.test(p) && !/>/.test(p.replace(/\s*2>&1|\s*\d?>\s*\/dev\/null/g, ''))));
  if (!work.length) return null;
  for (const p of work) {
    if (ctx.check && p === ctx.check) continue;
    const v = classifyCommand(p, { ...ctx, check: null });
    if (v.action !== 'allow' || !readerOnly(p)) return null;
  }
  return work;
}

// A split hint names only reading parts; a part with a redirect, an in-place edit or a writing option is never one.
const READERS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'ls', 'sed', 'jq', 'sort', 'uniq', 'cut', 'diff', 'stat', 'file', 'git', 'node']);
function readerOnly(part) {
  if (/>/.test(part.replace(/\s*2>&1|\s*\d?>\s*\/dev\/null/g, ''))) return false;
  const w = part.split(/\s+/);
  if (w[0] === 'git') return GIT_LOCAL.has(w[1]) && !w.some((a) => /^--output/.test(a));
  if (w[0] === 'sed') return !w.some((a) => /^-[a-zA-Z]*i|^--in-place/.test(a));
  if (w[0] === 'sort') return !w.some((a) => /^(?:-o|--output)/.test(a));
  if (w[0] === 'uniq') return w.slice(1).filter((a) => !a.startsWith('-')).length <= 1;
  if (w[0] === 'find') return !w.some((a) => /^-(?:exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(a));
  return READERS.has(w[0]);
}

function homeWord(word, env) {
  if (!word.tilde) return { text: word.text };
  if (word.text === '~' || word.text.startsWith('~/')) return { text: join(homes(env)[0] ?? homedir(), word.text.slice(2)) };
  return { refuse: 'a `~user` path names another account' };
}

// Where one path lands: the workspace, a Scope root (writable or read-only), or outside every known root.
function pathFacts(st, ctx, text) {
  const abs = resolve(st.here, text);
  const loc = locate(abs);
  let zone = 'outside';
  if (!loc.dangling) {
    const root = (ctx.roots ?? []).find((r) => within(r.path, loc.real));
    if (within(st.root, loc.real)) zone = 'workspace';
    else if (root) zone = root.write ? 'root-write' : 'root-read';
  }
  return {
    abs,
    real: loc.real,
    exists: loc.exists,
    dangling: loc.dangling,
    zone,
    writable: zone === 'workspace' || zone === 'root-write',
    git: inGit(st.root, loc.real) || inGit(st.root, abs),
  };
}

const where = (f) => (f.dangling ? `a dangling link (${f.abs})` : f.zone === 'root-read' ? `a Scope root the plan grants for reading only (${f.abs})` : `a path outside the workspace (${f.abs})`);

// --- globs -----------------------------------------------------------------------------------------------------

const GLOB_WORDS = 256;

// One glob segment as a regex, the way bash matches it without dotglob: a leading dot is matched only by a pattern
// that starts with one. A `[` without its `]` is literal.
function globRegex(part) {
  let re = '';
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      let j = i + 1;
      if (part[j] === '!' || part[j] === '^') j += 1;
      if (part[j] === ']') j += 1;
      const close = part.indexOf(']', j);
      if (close < 0) { re += '\\['; continue; }
      let body = part.slice(i + 1, close);
      if (body[0] === '!') body = `^${body.slice(1)}`;
      re += `[${body.replace(/\\/g, '\\\\')}]`;
      i = close;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${part.startsWith('.') ? '' : '(?!\\.)'}${re}$`, 's');
}

// The words a one-pair brace word expands to, or null when the guard cannot tell (nested, several pairs, a sequence).
function braceWords(text) {
  if (!/[{}]/.test(text)) return [text];
  const m = /^([^{}]*)\{([^{}]*)\}([^{}]*)$/.exec(text);
  if (!m) return /\{[^}]*\}/.test(text) ? null : [text];
  if (m[2].includes('..')) return null;
  return m[2].includes(',') ? m[2].split(',').map((alt) => m[1] + alt + m[3]) : [text];
}

// What one glob word in the workspace matches, walked with readdir, or null when a folder it walks is unreadable,
// or it climbs with `..`, uses `**` or matches too many names.
function globMatches(st, text) {
  if (text.split('/').includes('..')) return null;
  let dirs = [sep];
  const parts = resolve(st.here, text).split(sep).filter(Boolean);
  for (let p = 0; p < parts.length; p += 1) {
    const part = parts[p];
    if (!/[*?[]/.test(part)) { dirs = dirs.map((d) => join(d, part)); continue; }
    if (part.includes('**')) return null;
    const re = globRegex(part);
    const last = p === parts.length - 1;
    const next = [];
    for (const d of dirs) {
      let names;
      try { names = readdirSync(d); } catch { return null; }
      for (const name of names) {
        if (!re.test(name)) continue;
        const hit = join(d, name);
        if (!last) {
          try { if (!statSync(hit).isDirectory()) continue; } catch { continue; }
        }
        next.push(hit);
        if (next.length > GLOB_WORDS) return null;
      }
    }
    dirs = next.sort();
  }
  return dirs;
}

// Expands the unquoted braces and globs of a reader's operands in the workspace into the words the shell would pass,
// so the checks below see every file a pattern names. Verbs that write or delete, git, and patterns that leave the
// workspace keep their glob word and are held further down.
function expandWords(st, words) {
  const verb = words[0]?.text;
  if (!verb || words[0].glob || B_FLAGS[verb] || DELETERS.has(verb) || verb === 'git') return words;
  const out = [words[0]];
  for (const w of words.slice(1)) {
    if (!w.glob) { out.push(w); continue; }
    if (w.quoted) return { held: 'a glob word that is partly quoted' };
    const alts = braceWords(w.text);
    if (!alts) return { held: 'a brace form the guard cannot expand' };
    for (const alt of alts) {
      if (!/[*?[]/.test(alt)) { out.push({ text: alt }); continue; }
      // POSIX classes, equivalence classes and collating symbols are left to the shell, which the regex cannot follow.
      if (/\[[:=.]/.test(alt)) return { held: `\`${alt}\` uses a bracket class the guard does not read` };
      if (!within(st.root, resolve(st.here, alt))) { out.push({ ...w, text: alt }); continue; }
      const hits = globMatches(st, alt);
      if (!hits) return { held: `the guard could not expand \`${alt}\` (an unreadable folder, \`..\`, \`**\` or too many matches)` };
      // No match: the shell may still expand what the guard matched differently, so it is held, not passed as text.
      if (!hits.length) return { held: `\`${alt}\` matches nothing the guard can see` };
      out.push(...hits.map((h) => ({ text: h })));
    }
    if (out.length > GLOB_WORDS) return { held: 'a glob that matches too many names' };
  }
  return out;
}

function classifySegment(seg, st, ctx) {
  const env = st.env;
  const homed = [];
  for (const w of seg.words) {
    const h = homeWord(w, env);
    if (h.refuse) return { level: 'refuse', reason: h.refuse };
    homed.push({ ...w, text: h.text });
  }
  const raw = expandWords(st, homed);
  if (raw.held) return { level: 'held', reason: raw.held };
  const words = raw.map((w) => w.text);
  // Every word that could name a path is checked against the protected list, wherever it sits.
  // A `name=value` operand (dd of=, make DESTDIR=, --flag=) is checked on its value too.
  for (const w of words.slice(1).concat(seg.redirects.map((r) => r.target))) {
    const values = w.startsWith('-') ? [] : [w];
    if (w.includes('=')) values.push(w.slice(w.indexOf('=') + 1));
    // `REV:path` (git show HEAD:.env) and `host:path` name a path after the colon.
    if (/^[^:/\s]+:[^/]/.test(w)) values.push(w.slice(w.indexOf(':') + 1));
    // `:path` and `:<stage>:path` name a file in the git index (git show :.env).
    const index = /^:(?:\d:)?(.+)/.exec(w);
    if (index) values.push(index[1]);
    for (const value of values.filter(Boolean)) {
      const reason = protectedReason(resolve(st.here, value), env);
      if (reason) return { level: 'refuse', reason };
      if (ctx.denied?.paths?.some((d) => within(d, locate(resolve(st.here, value)).real))) return { level: 'refuse', reason: 'the user answered `lit deny` to this path in this run' };
    }
  }
  for (const root of recursiveRoots(words[0], words.slice(1))) {
    const reason = protectedBelow(resolve(st.here, root), env);
    if (reason) return { level: 'refuse', reason };
  }
  let v = { level: 'allow' };
  for (const r of seg.redirects) {
    if (r.op === '<' || r.target === '/dev/null') continue;
    v = worse(v, writeTarget(st, ctx, r.target));
    if (v.level === 'refuse') return v;
  }
  const verb = words[0];
  if (verb === undefined) return v;
  if (raw[0].glob) return { level: 'held', reason: 'a glob in the verb' };
  if (ASSIGNMENT.test(verb)) return { level: 'held', reason: `an assignment (\`${verb.split('=')[0]}=\`) before the verb changes what runs` };
  if (OPAQUE.has(verb)) return { level: 'held', reason: `\`${verb}\` runs another verb or moves the shell in a way the guard cannot follow` };
  if (DECODERS(words)) return { level: 'held', reason: 'decoded bytes may hide a command' };
  if (raw.slice(1).some((w) => w.glob && !w.quoted)) {
    const outside = raw.slice(1).some((w) => w.glob && !within(st.root, resolve(st.here, w.text)));
    if (outside || B_FLAGS[verb] || DELETERS.has(verb) || verb === 'git') return { level: 'held', reason: 'a glob or brace the guard cannot expand' };
  }
  const args = words.slice(1);
  const hidden = readerWrites(st, ctx, verb, args);
  if (hidden) {
    v = worse(v, hidden);
    if (v.level === 'refuse' || v.level === 'held') return v;
  }
  if (verb === 'cd') return worse(v, cdSegment(st, ctx, args));
  if (B_FLAGS[verb]) return worse(v, fileVerb(st, ctx, verb, args));
  if (verb === 'git') return worse(v, gitSegment(st, ctx, args));
  if (verb === 'tee') {
    for (const a of args.filter((x) => !x.startsWith('-'))) v = worse(v, writeTarget(st, ctx, a));
    return v;
  }
  if (DELETERS.has(verb)) return worse(v, deleter(st, ctx, args.filter((a) => !a.startsWith('-')), verb));
  if (verb === 'find') {
    if (args.some((a) => /^-(?:exec|execdir|ok|okdir)$/.test(a))) return { level: 'held', reason: '`find -exec` runs another verb' };
    if (args.includes('-delete')) {
      const starts = args.slice(0, Math.max(0, args.findIndex((a) => a.startsWith('-')))).filter(Boolean);
      return worse(v, deleter(st, ctx, starts.length ? starts : ['.'], 'find -delete'));
    }
    return v;
  }
  if (NETWORK.has(verb)) return worse(v, { level: 'X', reason: `\`${verb}\` reaches outside the machine or a host home` });
  if (PACKAGE_MANAGERS.has(verb)) return worse(v, packageScript(verb, args, ctx));
  if (INSTALLERS.has(verb)) {
    const sub = args.find((a) => !a.startsWith('-'));
    if (TOOLCHAIN_CHECKS[verb]?.has(sub)) return v;
    return worse(v, { level: 'X', reason: `\`${verb} ${sub ?? ''}\` ${sub && INSTALL_SUBS.has(sub) ? 'installs or publishes' : 'is not one of the project\'s test or check commands'}` });
  }
  if (TEST_RUNNERS.has(verb)) return v;
  if (verb === 'make') {
    const targets = args.filter((a) => !a.startsWith('-') && !a.includes('='));
    if (!targets.length || targets.some((t) => !MAKE_SAFE.has(t))) return worse(v, { level: 'X', reason: '`make` runs whatever the target says' });
    return v;
  }
  if (RUNNERS.has(verb) || verb.includes('/')) return worse(v, runner(st, ctx, verb, args));
  if (SAFE_VERBS.has(verb)) return v;
  // Default deny: a verb the guard does not know is parked, whatever it does.
  return worse(v, { level: 'X', reason: `\`${verb}\` is not a verb the run guard knows` });
}

// A sed script is read only when it is a run of p, d, q and s///[gpiI0-9] commands with optional line or /re/
// addresses. Its w, W, r, R and e commands (and the s///w and s///e flags) write, read or run something else.
const SED_ADDR = String.raw`(?:\d+|\$|\/(?:[^\/\\]|\\.)*\/)`;
const SED_CMD = new RegExp(String.raw`\s*(?:${SED_ADDR}(?:,${SED_ADDR})?)?\s*!?\s*(?:[pdqP=]|s([^\s\\\n])(?:(?!\1)[^\\]|\\.)*\1(?:(?!\1)[^\\]|\\.)*\1[gpiI0-9]*)\s*(?:[;\n]|$)`, 'y');
export function sedScriptIsReadOnly(script) {
  if (!script.trim()) return true;
  SED_CMD.lastIndex = 0;
  let at = 0;
  while (at < script.length) {
    SED_CMD.lastIndex = at;
    const m = SED_CMD.exec(script);
    if (!m || m[0].length === 0) return false;
    at += m[0].length;
  }
  return true;
}

// Option values that name a file the verb writes (`sort -o f`, `git diff --output=f`) or a program it starts
// (`rg --pre cmd`, `sort --compress-program`), and operands that are output files (`uniq in out`).
function optionValues(args, names) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    for (const n of names) {
      if (a === n && args[i + 1] !== undefined) out.push(args[i + 1]);
      else if (n.startsWith('--') && a.startsWith(`${n}=`)) out.push(a.slice(n.length + 1));
      else if (!n.startsWith('--') && a.startsWith(n) && a.length > n.length) out.push(a.slice(n.length));
    }
  }
  return out;
}

function readerWrites(st, ctx, verb, args) {
  const writes = (targets) => targets.reduce((v, t) => worse(v, writeTarget(st, ctx, t)), { level: 'allow' });
  if (verb === 'sed') {
    if (args.some((a) => /^(?:-f|--file)(?:=|$)/.test(a) || /^-[a-zA-Z]*f$/.test(a))) return { level: 'held', reason: '`sed -f` reads its script from a file the guard cannot check' };
    const exprs = optionValues(args, ['-e', '--expression']);
    const operands = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '-e' || args[i] === '--expression') { i += 1; continue; }
      if (!args[i].startsWith('-')) operands.push(args[i]);
    }
    const scripts = exprs.length ? exprs : operands.slice(0, 1);
    const files = exprs.length ? operands : operands.slice(1);
    if (!scripts.every(sedScriptIsReadOnly)) return { level: 'held', reason: 'a sed script with a w, W, r, R or e command (or an s///w or s///e flag) writes, reads or runs something the guard cannot check' };
    if (args.some((a) => /^(?:-i|--in-place)/.test(a) || /^-[a-zA-Z]*i/.test(a) && !a.startsWith('--'))) return writes(files);
    return null;
  }
  // A pager's +command runs on open (`+!cmd` starts a shell); jq can print the environment or the file it reads;
  // rg --hostname-bin starts a program.
  if ((verb === 'less' || verb === 'more') && args.some((a) => a.startsWith('+') || /^--?(?:cmd|command)/.test(a))) {
    return { level: 'held', reason: `\`${verb} +command\` runs a command on open` };
  }
  if (verb === 'jq' && args.some((a) => /\benv\b|\$ENV\b|\binput_filename\b|\$__loc__|\$__prog_args\b/.test(a))) {
    return { level: 'held', reason: '`jq` reading the environment or its own input names' };
  }
  if (verb === 'rg' && args.some((a) => /^--hostname-bin(?:=|$)/.test(a))) return { level: 'held', reason: '`rg --hostname-bin` starts a program' };
  if (verb === 'grep' || verb === 'egrep' || verb === 'fgrep' || verb === 'rg') {
    const { files } = searchArgs(verb, args);
    if (files.some((p) => !p || pathFacts(st, ctx, p).zone === 'outside')) return { level: 'held', reason: `\`${verb} -f\` reads its patterns from a file outside the project` };
  }
  if (verb === 'awk' || verb === 'gawk' || verb === 'mawk' || verb === 'nawk') {
    if (args.some((a) => a === '-f' || a.startsWith('--file'))) return { level: 'held', reason: '`awk -f` reads its program from a file the guard cannot check' };
    const program = args.find((a) => !a.startsWith('-')) ?? '';
    if (/\bsystem\s*\(|\bgetline\b|\||>|\bclose\s*\(|\bfflush\b|@load|@include/.test(program)) return { level: 'held', reason: 'an awk program that may run a command or write a file (system, getline, |, >)' };
    return null;
  }
  if (verb === 'sort' || verb === 'file') {
    const o = readOptions(args, OPTION_SPECS[verb]);
    if (o.held) return { level: 'held', reason: `\`${verb} ${o.held}\` is not one of its read-only options` };
    if (o.x) return { level: 'X', reason: `\`${verb} ${o.x}\` writes a file` };
    return o.writes.length ? writes(o.writes) : null;
  }
  if (verb === 'uniq') {
    const operands = args.filter((a) => !a.startsWith('-') || a === '-');
    return operands.length > 1 ? writes(operands.slice(1)) : null;
  }
  if (verb === 'tree') return writes(optionValues(args, ['-o']));
  if (verb === 'rg') {
    if (optionValues(args, ['--pre']).length || args.some((a) => a === '--pre' || a.startsWith('--pre='))) return { level: 'held', reason: '`rg --pre` runs a program on every file' };
    return null;
  }
  if (verb === 'git') {
    if (args.some((a) => /^(?:-O|--open-files-in-pager)/.test(a))) return { level: 'held', reason: '`git grep -O` starts a pager program' };
    if (args.some((a) => /^--(?:ext-diff|textconv)$/.test(a))) return { level: 'held', reason: 'an external diff or textconv program runs' };
    return writes(optionValues(args, ['--output', '--output-directory']));
  }
  if (verb === 'find') {
    const idx = args.findIndex((a) => /^-(?:fprint|fprint0|fprintf|fls)$/.test(a));
    if (idx >= 0) return worse(writes([args[idx + 1] ?? '.']), { level: 'X', reason: '`find -fprint` writes a file' });
    return null;
  }
  return null;
}

// Option allowlists for readers whose options can write or run something. Short options may be clustered
// (`-uo F`), long ones abbreviated to any unambiguous prefix (`--out=F`, `--comp`), as GNU tools accept; an option
// off the list, or an ambiguous prefix, is held. `write` names an output file, `x` writes by itself.
const OPTION_SPECS = {
  sort: {
    short: { flags: 'bdfghiMmnRrsuVzcC', value: 'ktS', write: 'o', held: 'T' },
    long: { flags: ['ignore-leading-blanks', 'dictionary-order', 'ignore-case', 'general-numeric-sort', 'ignore-nonprinting', 'month-sort',
      'human-numeric-sort', 'numeric-sort', 'random-sort', 'reverse', 'version-sort', 'merge', 'stable', 'unique', 'zero-terminated', 'check',
      'debug', 'help', 'version'],
    value: ['key', 'field-separator', 'buffer-size', 'parallel', 'sort'], write: ['output'],
    held: ['compress-program', 'temporary-directory', 'files0-from', 'random-source'] },
  },
  file: {
    short: { flags: 'bcdEhiIklLNnprsSvzZ0', value: 'eFP', x: 'C', held: 'fmM' },
    long: { flags: ['brief', 'checking-printout', 'dereference', 'no-dereference', 'mime', 'mime-type', 'mime-encoding', 'keep-going', 'list',
      'raw', 'special-files', 'uncompress', 'uncompress-noreport', 'no-pad', 'no-buffer', 'preserve-date', 'print0', 'extension', 'apple',
      'help', 'version'],
    value: ['separator', 'exclude', 'exclude-quiet', 'parameter'], x: ['compile'], held: ['magic-file', 'files-from'] },
  },
};

function readOptions(args, spec) {
  const out = { writes: [], held: null, x: null };
  const longNames = Object.entries(spec.long).flatMap(([kind, names]) => names.map((n) => [n, kind]));
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') break;
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s);
      const exact = longNames.find(([n]) => n === name);
      const hits = exact ? [exact] : longNames.filter(([n]) => n.startsWith(name));
      if (hits.length !== 1) { out.held ??= a; continue; }
      const [, kind] = hits[0];
      const takes = kind === 'value' || kind === 'write' || kind === 'held';
      const value = inline !== undefined ? inline : (takes ? args[(i += 1)] : undefined);
      if (kind === 'held') out.held ??= a;
      else if (kind === 'x') out.x ??= a;
      else if (kind === 'write') out.writes.push(value ?? '');
      continue;
    }
    if (!a.startsWith('-') || a === '-') continue;
    for (let j = 1; j < a.length; j += 1) {
      const c = a[j];
      if (spec.short.flags.includes(c)) continue;
      if (spec.short.x?.includes(c)) { out.x ??= a; continue; }
      const takes = spec.short.value.includes(c) || spec.short.write?.includes(c) || spec.short.held?.includes(c);
      if (!takes) { out.held ??= a; break; }
      const value = j + 1 < a.length ? a.slice(j + 1) : args[(i += 1)];
      if (spec.short.write?.includes(c)) out.writes.push(value ?? '');
      else if (spec.short.held?.includes(c)) out.held ??= a;
      break;
    }
  }
  return out;
}

// grep and rg options that take a value, so the word after them (or the rest of a short cluster) is not a path.
const SEARCH_VALUES = {
  grep: { short: 'ABCDdefm', long: ['after-context', 'before-context', 'context', 'devices', 'directories', 'regexp', 'file', 'max-count',
    'label', 'include', 'exclude', 'exclude-from', 'exclude-dir', 'group-separator', 'binary-files'] },
  rg: { short: 'ABCdEefgjMmrTt', long: ['regexp', 'file', 'glob', 'iglob', 'type', 'type-not', 'type-add', 'type-clear', 'max-count', 'max-depth',
    'replace', 'encoding', 'threads', 'max-columns', 'after-context', 'before-context', 'context', 'pre', 'pre-glob', 'ignore-file',
    'path-separator', 'sort', 'sortr', 'colors', 'context-separator', 'field-match-separator', 'field-context-separator', 'max-filesize',
    'dfa-size-limit', 'regex-size-limit', 'engine', 'hostname-bin', 'hyperlink-format', 'generate'] },
};

// One parse of a grep or rg command line: whether it recurses, its pattern files, and the paths it reads. A short
// cluster may end in a value option (`-rf FILE`, `-reKEY`); a pattern given by -e or -f leaves every operand a path,
// and so does `rg --files`. A long option is matched by its unambiguous prefix, as GNU grep accepts.
function searchArgs(verb, args) {
  const spec = SEARCH_VALUES[verb === 'rg' ? 'rg' : 'grep'];
  const out = { recursive: verb === 'rg', files: [], paths: [] };
  let given = false;
  const operands = [];
  const take = (name, value) => {
    if (name === 'e' || name === 'regexp') given = true;
    if (name === 'f' || name === 'file') { given = true; out.files.push(value ?? ''); }
    if ((name === 'd' || name === 'directories') && verb !== 'rg' && value === 'recurse') out.recursive = true;
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') { operands.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s);
      if (verb !== 'rg' && (name === 'recursive' || name === 'dereference-recursive')) out.recursive = true;
      if (verb === 'rg' && name === 'files') given = true;
      const prefixed = spec.long.filter((n) => n.startsWith(name));
      const known = spec.long.includes(name) ? name : prefixed.length === 1 ? prefixed[0] : null;
      if (known) take(known, inline !== undefined ? inline : args[(i += 1)]);
      continue;
    }
    if (!a.startsWith('-') || a === '-') { operands.push(a); continue; }
    for (let j = 1; j < a.length; j += 1) {
      const c = a[j];
      if ((c === 'r' || c === 'R') && verb !== 'rg') { out.recursive = true; continue; }
      if (!spec.short.includes(c)) continue;
      take(c, j + 1 < a.length ? a.slice(j + 1) : args[(i += 1)]);
      break;
    }
  }
  out.paths = given ? operands : operands.slice(1);
  return out;
}


// The folders a recursive reader would walk, or [] when it does not recurse. Over-reading an option value as a
// folder only checks one more path.
function recursiveRoots(verb, args) {
  const nonOpt = args.filter((a) => !a.startsWith('-'));
  if (verb === 'find') {
    // -H, -L, -P, -O<level> and -D <list> come before the start paths.
    let k = 0;
    while (k < args.length && /^-(?:[HLP]+|O\d*|D)$/.test(args[k])) k += args[k] === '-D' ? 2 : 1;
    const rest = args.slice(k);
    const end = rest.findIndex((a) => a.startsWith('-') || a === '(' || a === '!');
    const starts = (end < 0 ? rest : rest.slice(0, end)).filter(Boolean);
    return starts.length ? starts : ['.'];
  }
  if (verb === 'grep' || verb === 'egrep' || verb === 'fgrep' || verb === 'rg') {
    const s = searchArgs(verb, args);
    if (!s.recursive) return [];
    return s.paths.length ? s.paths : ['.'];
  }
  if (verb === 'diff') return args.some((a) => a === '--recursive' || (/^-[a-zA-Z]*r/.test(a) && !a.startsWith('--'))) ? nonOpt : [];
  if (verb === 'ls') return args.some((a) => /^-[a-zA-Z]*R/.test(a) || a === '--recursive') ? (nonOpt.length ? nonOpt : ['.']) : [];
  if (verb === 'tree' || verb === 'du') return nonOpt.length ? nonOpt : ['.'];
  return [];
}

// Why walking this folder would read a protected place below it, or null.
export function protectedBelow(abs, env) {
  const real = locate(abs).real;
  for (const p of new Set([resolve(abs), real])) {
    for (const home of homes(env)) {
      for (const s of HOME_SECRETS) if (within(p, join(home, s))) return `a recursive read over ${join('~', s)}`;
    }
    if (within(p, join(stateHome(env), 'litmuse'))) return 'a recursive read over the LitMuse run state';
  }
  return null;
}

// npm, pnpm, yarn and bun: test and check scripts (and the plan's own check) run; every other script, install,
// publish, exec or download is parked as X, whatever its body says.
function packageScript(verb, args, ctx) {
  const words = args.filter((a) => !a.startsWith('-'));
  const [sub, name] = words;
  if (ctx.check && [verb, ...args].join(' ') === ctx.check) return { level: 'allow' };
  if (!sub && verb !== 'npm') return { level: 'X', reason: `a bare \`${verb}\` installs dependencies` };
  if (!sub || PM_READERS.has(sub) || PM_READERS.has(args[0])) return { level: 'allow' };
  if (sub === 'test' || sub === 't') return { level: 'allow' };
  if ((sub === 'run' || sub === 'run-script') && name && CHECK_SCRIPT.test(name)) return { level: 'allow' };
  if ((verb === 'yarn' || verb === 'pnpm' || verb === 'bun') && CHECK_SCRIPT.test(sub)) return { level: 'allow' };
  return { level: 'X', reason: `\`${verb} ${sub}${name && (sub === 'run' || sub === 'run-script') ? ` ${name}` : ''}\` runs package code, changes dependencies or reaches the registry` };
}

// A write into the account's real home, outside the workspace and every Scope root, is refused, never parked.
function homeWrite(f, env) {
  return f.zone === 'outside' && homes(env).some((h) => within(h, f.real) || within(h, f.abs)) ? 'a write into the real host home outside the workspace' : null;
}

// A shell write by redirect or tee. A writable Scope root takes it; inside the workspace it parks, because file
// edits go through the file tools (write_file, edit_file, apply_patch), which the guard checks path by path.
function writeTarget(st, ctx, text) {
  const f = pathFacts(st, ctx, text);
  const prot = protectedReason(f.abs, st.env, true, st.root) ?? homeWrite(f, st.env);
  if (prot) return { level: 'refuse', reason: prot };
  if (f.git) return { level: 'refuse', reason: 'writes inside .git are refused during a run' };
  if (f.zone === 'root-write') return { level: 'allow' };
  if (f.zone === 'workspace') return { level: 'X', reason: `a shell write to ${f.abs}; write files with write_file or edit_file instead` };
  return { level: 'X', reason: where(f) };
}

function cdSegment(st, ctx, args) {
  const dir = args.find((a) => !a.startsWith('-') || a === '-');
  if (args.length && args.every((a) => a.startsWith('-') && a !== '-')) return { level: 'held', reason: '`cd` flags' };
  if (dir === undefined) return { level: 'refuse', reason: 'a bare `cd` goes to the home folder' };
  if (dir === '-') return { level: 'held', reason: '`cd -` goes to a folder the guard cannot see' };
  st.here = resolve(st.here, dir);
  const f = pathFacts({ ...st, here: st.here }, ctx, '.');
  if (f.zone === 'outside') return { level: 'X', reason: `\`cd ${dir}\` leaves the workspace and its Scope roots`, bVerb: true };
  return { level: 'allow', bVerb: true };
}

// touch, mkdir, cp and mv: writable roots run; a new destination in a read-only Scope root is tier B; anything that
// leaves every known root, follows a dangling link, overwrites or uses an unlisted flag is X. A destination that is
// an existing folder is checked as the paths written inside it, so `cp a .` in the project root is an ordinary copy;
// mv sources are removals and cp sources are reads of the run state, so both keep the run-state check.
function fileVerb(st, ctx, verb, args) {
  const flags = args.filter((a) => a.startsWith('-'));
  const paths = args.filter((a) => !a.startsWith('-'));
  if (!paths.length) return { level: 'X', reason: `\`${verb}\` with no path`, bVerb: true };
  if ((verb === 'cp' || verb === 'mv') && paths.length < 2) return { level: 'X', reason: `\`${verb}\` needs a source and a destination`, bVerb: true };
  const sources = verb === 'cp' || verb === 'mv' ? paths.slice(0, -1) : [];
  const dest = paths[paths.length - 1];
  const landing = sources.length && isDir(pathFacts(st, ctx, dest).real) ? sources.map((p) => join(dest, basename(p))) : [dest];
  const writes = verb === 'cp' ? landing : verb === 'mv' ? [...sources, ...landing] : paths;
  const reads = verb === 'cp' ? sources : [];
  let level = 'allow';
  let reason;
  for (const p of writes) {
    const f = pathFacts(st, ctx, p);
    const prot = protectedReason(f.abs, st.env, true, st.root) ?? homeWrite(f, st.env);
    if (prot) return { level: 'refuse', reason: prot };
    if (f.git) return { level: 'refuse', reason: 'writes inside .git are refused during a run' };
    if (f.zone === 'outside') return { level: 'X', reason: where(f), bVerb: true };
    if (f.zone !== 'root-write' && level === 'allow') {
      level = 'B';
      reason = f.zone === 'workspace' ? `a new path in the workspace made by the shell (${f.abs})` : where(f);
    }
  }
  for (const p of reads) {
    const f = pathFacts(st, ctx, p);
    const state = stateFolderReason(f.abs, locate(f.abs).real, st.env, st.root);
    if (state) return { level: 'refuse', reason: state };
    if (f.zone === 'outside') return { level: 'X', reason: `a source outside the workspace and its Scope roots (${f.abs})`, bVerb: true };
  }
  if (verb === 'cp' || verb === 'mv') {
    const dst = pathFacts(st, ctx, paths[paths.length - 1]);
    let overwrite = dst.exists && !isDir(dst.real);
    if (dst.exists && isDir(dst.real)) overwrite = paths.slice(0, -1).some((s) => existsSync(join(dst.real, basename(s))));
    if (overwrite) return { level: 'X', reason: 'the destination exists, so this would overwrite it', bVerb: true };
  }
  if (level === 'B' && !flags.every((f) => B_FLAGS[verb].test(f))) return { level: 'X', reason: `\`${verb}\` with flags off the B list`, bVerb: true };
  return { level, reason, bVerb: true };
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

// A delete cannot be undone, so it is always X; protected paths and .git refuse.
function deleter(st, ctx, paths, label) {
  if (!paths.length) return { level: 'X', reason: `\`${label}\` with no path` };
  for (const p of paths) {
    const f = pathFacts(st, ctx, p);
    const prot = protectedReason(f.abs, st.env, true, st.root) ?? homeWrite(f, st.env);
    if (prot) return { level: 'refuse', reason: prot };
    if (f.git) return { level: 'refuse', reason: 'deleting inside .git is refused during a run' };
  }
  return { level: 'X', reason: `\`${label}\` cannot be undone` };
}

function runner(st, ctx, verb, args) {
  if (verb.includes('/')) {
    const f = pathFacts(st, ctx, verb);
    return f.writable ? { level: 'allow' } : { level: 'X', reason: `a program outside the workspace (${f.abs})` };
  }
  const flag = args.find((a) => a.startsWith('-'));
  const script = args.find((a) => !a.startsWith('-'));
  const firstIsFlag = args.length && args[0].startsWith('-');
  if (args.some((a) => INLINE_FLAG.test(a)) && (verb !== 'node' || args.some((a) => /^(?:-e|-p|--eval|--print)$/.test(a)))) {
    return { level: 'held', reason: `inline code (\`${verb} ${flag}\`)` };
  }
  if (SHELLS.has(verb) && (!script || firstIsFlag)) return { level: 'held', reason: `\`${verb}\` reading commands the guard cannot see` };
  if (!script) return { level: 'allow' };
  if ((verb === 'python' || verb === 'python3') && args[0] === '-m') {
    return /^(?:pytest|unittest)$/.test(args[1] ?? '') ? { level: 'allow' } : { level: 'X', reason: `\`${verb} -m ${args[1] ?? ''}\` runs a module that is not the project's test runner` };
  }
  const f = pathFacts(st, ctx, script);
  if (!f.writable) return { level: 'X', reason: `a script outside the workspace (${f.abs})` };
  return { level: 'allow' };
}

// --- git -----------------------------------------------------------------------------------------------------

function gitSegment(st, ctx, args) {
  let i = 0;
  let here = st.here;
  while (i < args.length && args[i].startsWith('-')) {
    if (args[i] === '-C' && args[i + 1]) {
      here = resolve(here, args[i + 1]);
      if (!within(st.root, locate(here).real)) return { level: 'X', reason: '`git -C` names a folder outside the workspace' };
      i += 2;
      continue;
    }
    return { level: 'X', reason: `\`git ${args[i]}\` changes how git runs` };
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  const viaC = i > 0;
  if (!sub) return { level: 'allow' };
  if (GIT_LOCAL.has(sub)) return { level: 'allow' };
  if (sub === 'branch' && rest.every((a) => /^(?:--show-current|--list|-a|-v|-vv|--all|-r)$/.test(a))) return { level: 'allow' };
  if ((sub === 'worktree' || sub === 'stash') && rest[0] === 'list') return { level: 'allow' };
  // `git remote`, `-v` and `get-url` read the local config; `show`, `update` and the rest reach or change a remote.
  if (sub === 'remote' && (!rest.length || (rest.length === 1 && /^(?:-v|--verbose)$/.test(rest[0])) || (rest[0] === 'get-url' && rest.slice(1).every((a) => /^(?:--push|--all|[\w.-]+)$/.test(a))))) return { level: 'allow' };
  if (sub === 'add') {
    const added = gitAdd({ ...st, here }, ctx, rest);
    return added.level === 'allow' && !ctx.charter?.length ? { level: 'B', reason: '`git add` stages files for a commit the plan has no `Run charter:` for', bVerb: true } : added;
  }
  if (sub === 'commit') return viaC ? { level: 'X', reason: '`git -C` commit is outside the charter' } : commitVerdict({ ...st, here }, ctx, rest);
  return { level: 'X', reason: `\`git ${sub}\` may rewrite history, reach a remote, or is not a subcommand the guard knows` };
}

function gitAdd(st, ctx, rest) {
  const paths = rest.filter((a) => !a.startsWith('-'));
  if (rest.some((a) => /^(?:-A|--all|-u|--update|--no-ignore-removal|-f|--force|--)$/.test(a)) || !paths.length) {
    return { level: 'X', reason: '`git add` must name the files (no -A, -u, -f or empty list)', bVerb: true };
  }
  for (const p of paths) {
    if (p === '.' || p === ':/' || p.startsWith(':')) return { level: 'X', reason: '`git add .` stages everything', bVerb: true };
    const f = pathFacts(st, ctx, p);
    if (f.git) return { level: 'refuse', reason: '.git internals' };
    if (f.zone !== 'workspace') return { level: 'X', reason: `\`git add\` outside the workspace (${f.abs})`, bVerb: true };
  }
  return { level: 'allow', bVerb: true };
}

export function gitRoot(dir) {
  for (let cur = resolve(dir); ; cur = dirname(cur)) {
    if (existsSync(join(cur, '.git'))) return cur;
    if (dirname(cur) === cur) return null;
  }
}

// The branch HEAD names, read at call time; a linked worktree's `.git` file points at its own HEAD.
export function headBranch(repo) {
  try {
    let gitDir = join(repo, '.git');
    if (lstatSync(gitDir).isFile()) {
      const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(gitDir, 'utf8'));
      if (!m) return null;
      gitDir = resolve(repo, m[1].trim());
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const COMMIT_SWITCH = /^(?:-[aq]+|--all|--quiet)$/;
const COMMIT_MESSAGE = /^-[aq]*([mF])$/;

// A commit runs only under a `Run charter: commit on <branch> in <repo>` line the run started with, on that branch
// in that repo, with a plain message. Amend, no-verify, other flags, other branches and other repos are parked.
function commitVerdict(st, ctx, rest) {
  if (!ctx.charter?.length) return { level: 'X', reason: 'a commit needs a `Run charter:` line in the plan' };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (COMMIT_SWITCH.test(a)) continue;
    const m = COMMIT_MESSAGE.exec(a);
    if (m && rest[i + 1] !== undefined) { i += 1; continue; }
    return { level: 'X', reason: `\`git commit ${a}\` is outside the charter (plain -m, -F, -a, -q only)` };
  }
  const repo = gitRoot(st.here);
  const branch = repo && headBranch(repo);
  const hit = ctx.charter.find((c) => repo && realOr(c.repo) === realOr(repo) && c.branch === branch);
  if (!hit) return { level: 'X', reason: `the charter grants commits on ${ctx.charter.map((c) => `${c.branch} in ${c.repo}`).join(', ')}; this is ${branch ?? 'no branch'} in ${repo ?? 'no repo'}` };
  return { level: 'allow' };
}

// File tools (write_file, edit_file, apply_patch, delete_file) during a run: protected and .git targets are refused;
// a target outside the workspace and every writable Scope root becomes a path boundary the user can grant.
export function classifyWrite(target, ctx) {
  const abs = resolve(ctx.cwd, target);
  const reason = protectedReason(abs, ctx.env ?? process.env, true, ctx.root);
  if (reason) return { action: 'refuse', reason };
  if (ctx.denied?.paths?.some((d) => within(d, locate(abs).real))) return { action: 'refuse', reason: 'the user answered `lit deny` to this path in this run' };
  const f = pathFacts({ here: ctx.cwd, root: ctx.root }, ctx, abs);
  if (f.git) return { action: 'refuse', reason: 'writes inside .git (hooks, config, worktrees) are refused during a run' };
  const home = homeWrite(f, ctx.env ?? process.env);
  if (home) return { action: 'refuse', reason: home };
  if (f.writable) return { action: 'allow' };
  const boundary = f.exists && isDir(f.real) ? f.real : dirname(f.real);
  return { action: 'park', boundary, reason: f.zone === 'root-read' ? 'in a Scope root granted for reading only' : 'outside the workspace' };
}
