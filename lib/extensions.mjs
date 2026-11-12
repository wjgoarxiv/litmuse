import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { MOVED } from '../plugin/hooks/lib/moved.mjs';
import { SHELF } from '../plugin/hooks/lib/extensions.mjs';
import { assertSafeWritePath } from './guard.mjs';
import { muse } from './muse.mjs';

// `litmuse extensions <verb>`: the stubs' manual lines (look first, move an occupied folder aside, `muse skills
// install`) done in code. Muse owns the install and its receipt, the lock in $CONFIG_DIR/skills/.muse/lock.json;
// LitMuse only moves folders into $CONFIG_DIR/extension-backups/<stamp>/ and keeps a source clone in its own cache.
// Every write verb prints its plan and changes nothing without --yes. None of this runs in a hook.

export const CLI = 'npx @litfamily/litmuse';
const IDS = Object.keys(MOVED);
const STAMP = /^\d{8}-\d{6}(-\d+)?$/;

export function extPaths(env = process.env) {
  const home = env.HOME || homedir();
  const configHome = env.XDG_CONFIG_HOME || join(home, '.config');
  const cacheHome = env.XDG_CACHE_HOME || join(home, '.cache');
  const museDir = join(configHome, 'muse');
  return {
    home,
    museDir,
    skills: join(museDir, 'skills'),
    lock: join(museDir, 'skills', '.muse', 'lock.json'),
    backups: join(museDir, 'extension-backups'),
    cache: join(cacheHome, 'litmuse', 'extensions-src'),
  };
}

const lstatOrNull = (p) => { try { return lstatSync(p); } catch { return null; } };

function readLock(p) {
  try {
    const l = JSON.parse(readFileSync(p.lock, 'utf8'));
    return l && typeof l.skills === 'object' && l.skills ? l.skills : {};
  } catch {
    return {};
  }
}

// Muse prints paths with $CONFIG_DIR and $HOME placeholders, and project paths relative to the workspace.
function expand(path, p, cwd) {
  const s = String(path);
  if (s.startsWith('$CONFIG_DIR')) return join(p.museDir, s.slice('$CONFIG_DIR'.length));
  if (s.startsWith('$HOME')) return join(p.home, s.slice('$HOME'.length));
  return resolve(cwd, s);
}

// Muse copies a symlinked file as the file it points to and records that content, so a link is hashed the same way.
// A link to a folder or to nothing gets a value no receipt holds, which reads as a change.
function fileHashes(dir, base = dir, acc = new Map()) {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    const rel = relative(base, f).split(sep).join('/');
    let st = lstatSync(f);
    if (st.isSymbolicLink()) {
      try { st = statSync(f); } catch { acc.set(rel, 'unreadable link'); continue; }
      if (!st.isFile()) { acc.set(rel, 'link to a folder'); continue; }
    }
    if (st.isDirectory()) fileHashes(f, base, acc);
    else if (st.isFile()) acc.set(rel, `sha256:${createHash('sha256').update(readFileSync(f)).digest('hex')}`);
  }
  return acc;
}

// True when the source folder holds exactly the files, with the same hashes, that Muse recorded at install.
export function sameAsReceipt(sourceDir, entry) {
  const have = fileHashes(sourceDir);
  const recorded = Array.isArray(entry?.files) ? entry.files : [];
  if (have.size !== recorded.length) return false;
  return recorded.every((f) => have.get(f.relative_path) === f.sha256);
}

const ours = (id, entry) => Boolean(entry?.source?.path) && new RegExp(`[\\\\/]variants[\\\\/]litmuse[\\\\/]${id}$`).test(entry.source.path);

function dirSize(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const st = lstatSync(join(dir, name));
    n += st.isDirectory() ? dirSize(join(dir, name)) : st.size;
  }
  return n;
}

export function humanSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function listBackups(p) {
  const st = lstatOrNull(p.backups);
  if (!st || !st.isDirectory() || st.isSymbolicLink()) return [];
  return readdirSync(p.backups).sort().filter((n) => STAMP.test(n)).map((name) => {
    const dir = join(p.backups, name);
    const s = lstatSync(dir);
    if (!s.isDirectory() || s.isSymbolicLink()) return null;
    return { name, dir, ids: readdirSync(dir).sort(), bytes: dirSize(dir), at: stampDate(name) };
  }).filter(Boolean);
}

function stampDate(name) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// One dated folder per run, never reused: a second run in the same second gets -2, -3, ...
function newBackupDir(p) {
  const base = stamp();
  for (let i = 1; ; i += 1) {
    const dir = join(p.backups, i === 1 ? base : `${base}-${i}`);
    if (!existsSync(dir)) return dir;
  }
}

// What Muse and the disk say about each extension id. Read only.
export function survey(env = process.env, { cwd = process.cwd() } = {}) {
  const p = extPaths(env);
  const lock = readLock(p);
  const listing = muse(env, ['skills', 'list', '--workspace', cwd, '--trust-workspace', '--json']);
  if (listing.missing) return { error: 'muse was not found on PATH. Install Muse Code first, then run this again.' };
  // Without the listing the same-name guard has nothing to look at, so stop rather than report a clean slate.
  if (!listing.ok || !Array.isArray(listing.json?.skills)) {
    const why = listing.json?.error?.message || (listing.stderr || listing.stdout).trim().split(/\r?\n/)[0] || `exit ${listing.status}`;
    return { error: `muse skills list failed (${why}). Nothing was changed.` };
  }
  const skills = listing.json.skills;
  const diagnostics = listing.json.diagnostics ?? [];
  const rows = IDS.map((id) => {
    const dest = join(p.skills, id);
    const destSkill = join(dest, 'SKILL.md');
    const entry = lock[id] ?? null;
    const st = lstatOrNull(dest);
    let state;
    if (!st) state = entry ? 'record-only' : 'absent';
    else if (st.isSymbolicLink()) state = 'symlinked';
    else if (!st.isDirectory()) state = 'not-a-folder';
    else if (!entry) state = 'user-managed';
    else state = ours(id, entry) ? 'installed' : 'other-source';
    const competing = [];
    let live = null;
    for (const s of skills) {
      if (String(s.name ?? s.id) !== id || !['user', 'project'].includes(s.scope)) continue;
      live = expand(s.path, p, cwd);
      if (live !== destSkill) competing.push({ path: dirname(live), scope: s.scope, live: true });
    }
    for (const d of diagnostics) {
      if (d.code !== 'skill-shadowed' || !new RegExp(`[\\\\/]${id}[\\\\/]SKILL\\.md$`).test(String(d.path))) continue;
      const path = expand(d.path, p, cwd);
      if (path !== destSkill) competing.push({ path: dirname(path), scope: d.scope, live: false });
    }
    const source = entry?.source?.path ?? null;
    return {
      id, family: MOVED[id].family, dest, state, competing,
      shadowed: state === 'installed' && live !== destSkill,
      receipt: entry ? { source, installedAt: entry.installed_at ?? null, updatedAt: entry.updated_at ?? null, files: entry.files?.length ?? 0 } : null,
      sourceGone: Boolean(source) && !existsSync(source),
      entry,
    };
  });
  return { p, rows, backups: listBackups(p) };
}

// The things `check` flags, each with the exact line that fixes it.
export function findings(sv) {
  const out = [];
  for (const r of sv.rows) {
    if (r.state === 'user-managed') out.push({ id: r.id, what: `${r.dest} is a folder Muse has no record of (an older or hand-made copy)`, fix: `${CLI} extensions install ${r.id} --yes   (moves it aside whole, then installs)` });
    if (r.state === 'symlinked' || r.state === 'not-a-folder') out.push({ id: r.id, what: `${r.dest} is ${r.state === 'symlinked' ? 'a symbolic link' : 'not a folder'}; LitMuse will not move it`, fix: `look at where it points, then move ${r.dest} aside yourself` });
    if (r.state === 'record-only') out.push({ id: r.id, what: `Muse still records ${r.id} but its folder is gone`, fix: `muse skills uninstall ${r.id}   (deletes nothing, drops the record)` });
    if (r.sourceGone && r.state === 'installed') out.push({ id: r.id, what: `the source Muse recorded, ${r.receipt.source}, no longer exists`, fix: `${CLI} extensions update ${r.id} --yes` });
    // With no extension here, a same-name skill is simply the user's own; list shows it and install stops on it.
    for (const c of r.state === 'absent' ? [] : r.competing) {
      out.push(c.live
        ? { id: r.id, what: `${c.path} (${c.scope}) outranks the extension in this folder, so Muse loads that copy`, fix: `move or rename ${c.path} to use the extension here` }
        : { id: r.id, what: `${c.path} (${c.scope}) has the same name${c.live ? '' : ' and is shadowed'}`, fix: `keep one copy: move or rename ${c.path}` });
    }
  }
  return out;
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, ...opts });
  return { ok: r.status === 0, missing: r.error?.code === 'ENOENT', err: (r.stderr || r.error?.message || '').trim() };
}

const fromHint = `Nothing was changed. Clone ${SHELF} yourself and pass --from <path to the clone>.`;

// Finds variants/litmuse. With --from it reads that clone and never writes it. Otherwise LitMuse keeps a shallow,
// sparse clone in its own cache; `fetch` refreshes it (or makes it). Without `fetch` (a dry run) it only looks.
export function resolveSource({ env = process.env, flags = {}, p = extPaths(env), fetch = false }) {
  if (flags.from) {
    const root = resolve(flags.from);
    const variants = join(root, 'variants', 'litmuse');
    if (!existsSync(variants)) return { error: `${root} has no variants/litmuse folder; point --from at a wjgoarxiv-skills clone. Nothing was changed.` };
    return { variants, label: `${root} (--from)` };
  }
  const url = env.LITMUSE_EXTENSIONS_REPO || SHELF;
  const variants = join(p.cache, 'variants', 'litmuse');
  const have = existsSync(join(p.cache, '.git'));
  if (!fetch) return have ? { variants, label: `${p.cache} (cached clone of ${url})`, stale: true } : { pending: true, planned: variants, label: `${url}, cloned into ${p.cache}` };
  const cacheSt = lstatOrNull(p.cache);
  if (cacheSt && (cacheSt.isSymbolicLink() || !cacheSt.isDirectory())) return { error: `${p.cache} is a link or not a folder; LitMuse will not use it. ${fromHint}` };
  assertSafeWritePath(p.cache);
  if (have) {
    const f = git(['-C', p.cache, 'fetch', '--quiet', '--depth', '1', 'origin', 'HEAD']);
    const c = f.ok ? git(['-C', p.cache, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD']) : f;
    if (!c.ok) return { error: `${f.missing ? 'git was not found on PATH' : `could not refresh ${p.cache} from ${url}`}${c.err ? ` (${c.err.split(/\r?\n/)[0]})` : ''}. ${fromHint}` };
  } else {
    mkdirSync(dirname(p.cache), { recursive: true });
    const tmp = `${p.cache}.tmp-${process.pid}`;
    const c = git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', url, tmp]);
    const s = c.ok ? git(['-C', tmp, 'sparse-checkout', 'set', 'variants/litmuse']) : c;
    if (!s.ok) {
      rmSync(tmp, { recursive: true, force: true });
      return { error: `${c.missing ? 'git was not found on PATH' : `could not fetch ${url}`}${s.err ? ` (${s.err.split(/\r?\n/)[0]})` : ''}. ${fromHint}` };
    }
    renameSync(tmp, p.cache);
  }
  if (!existsSync(variants)) return { error: `${p.cache} has no variants/litmuse folder after the fetch. ${fromHint}` };
  return { variants, label: `${p.cache} (${have ? 'refreshed' : 'new'} clone of ${url})` };
}

function targets(args, flags, { allDefault = false } = {}) {
  if (flags.all || (allDefault && !args.length && !flags.family)) return { ids: IDS };
  if (flags.family) {
    const ids = IDS.filter((id) => MOVED[id].family === flags.family);
    const fams = [...new Set(IDS.map((id) => MOVED[id].family))];
    return ids.length ? { ids } : { error: `unknown family ${flags.family}; the families are ${fams.join(', ')}` };
  }
  const bad = args.filter((a) => !IDS.includes(a));
  if (bad.length) return { error: `not a LitMuse extension: ${bad.join(', ')}. The nine: ${IDS.join(', ')}.` };
  if (!args.length) return { error: 'name one or more extensions, or use --family <name> or --all' };
  return { ids: [...new Set(args)] };
}

function stateText(r) {
  switch (r.state) {
    case 'installed': return `installed${r.shadowed ? ' (shadowed here)' : ''} · source ${r.receipt.source} · installed ${r.receipt.installedAt ?? '?'}${r.sourceGone ? ' · source missing' : ''}`;
    case 'absent': return 'not installed';
    case 'user-managed': return `user-managed folder, no Muse record: ${r.dest}`;
    case 'other-source': return `installed by Muse from another source: ${r.receipt.source}`;
    case 'record-only': return 'Muse record without a folder';
    default: return `${r.state}: ${r.dest}`;
  }
}

function listVerb(sv, flags, print) {
  if (flags.json) {
    print(JSON.stringify({
      extensions: sv.rows.map(({ entry, ...r }) => r),
      backups: sv.backups.map(({ name, dir, ids, bytes }) => ({ name, dir, ids, bytes })),
    }, null, 2));
    return 0;
  }
  print('LitFamily extensions for LitMuse (Muse user skills; Muse\'s lock is the receipt)');
  for (const r of sv.rows) {
    print(`  ${r.id.padEnd(30)} ${stateText(r)}`);
    for (const c of r.competing) print(`  ${''.padEnd(30)} same name: ${c.path} (${c.scope}${c.live ? ', loaded' : ', shadowed'})`);
  }
  return 0;
}

function checkVerb(sv, print) {
  const f = findings(sv);
  const total = sv.backups.reduce((n, b) => n + b.bytes, 0);
  if (!f.length) print('extensions check: nothing to fix.');
  else {
    print(`extensions check: ${f.length} thing${f.length === 1 ? '' : 's'} to look at.`);
    for (const x of f) {
      print(`  ${x.id}: ${x.what}`);
      print(`    fix: ${x.fix}`);
    }
  }
  if (sv.backups.length) print(`Backups: ${sv.backups.length} in ${sv.p.backups}, ${humanSize(total)} (list or delete them with ${CLI} extensions prune-backups).`);
  return f.length ? 1 : 0;
}

// Install and update share this: refuse what LitMuse may not touch, move an occupied folder aside, let Muse copy.
function apply({ env, plan, p, flags, print, verb }) {
  const blocked = plan.filter((x) => x.blocked);
  for (const x of blocked) print(`STOP ${x.id}: ${x.blocked}`);
  if (blocked.length) {
    print('Nothing was changed.');
    return 1;
  }
  const work = plan.filter((x) => x.action !== 'skip');
  const repoint = plan.filter((x) => x.repoint);
  for (const x of plan) {
    if (x.action === 'skip') { print(`  ${x.id}: ${x.note}`); continue; }
    for (const w of x.warn ?? []) print(`  ${x.id}: warning: ${w}`);
    if (x.moveAside) print(`  ${x.id}: move ${x.dest} -> ${join(p.backups, '<stamp>', x.id)}`);
    print(`  ${x.id}: muse skills install ${x.src} --scope user`);
  }
  if (!work.length && !repoint.length) return 0;
  if (!flags.yes || flags.dryRun) {
    print('');
    print(`Dry run: nothing was moved or installed. Rerun with --yes to ${verb}.`);
    return 0;
  }
  for (const x of repoint) {
    setReceiptSource(p, x.id, x.src);
    print(`${x.id}: the receipt's source is now ${x.src}`);
  }
  if (!work.length) return 0;
  let backupDir = null;
  for (const x of work) {
    let moved = null;
    if (x.moveAside) {
      if (!backupDir) {
        const bst = lstatOrNull(p.backups);
        if (bst && (bst.isSymbolicLink() || !bst.isDirectory())) { print(`STOP ${p.backups} is a link or not a folder. Nothing more was changed.`); return 1; }
        assertSafeWritePath(p.backups);
        backupDir = newBackupDir(p);
        mkdirSync(backupDir, { recursive: true });
      }
      moved = join(backupDir, x.id);
      renameSync(x.dest, moved);
      print(`moved ${x.dest} -> ${moved}`);
    }
    const r = muse(env, ['skills', 'install', x.src, '--scope', 'user', '--json']);
    if (!r.ok) {
      const why = r.json?.error?.message || (r.stderr || r.stdout).trim().split(/\r?\n/)[0];
      if (moved && !existsSync(x.dest)) { renameSync(moved, x.dest); print(`put ${x.dest} back`); }
      print(`FAIL muse skills install ${x.id}: ${why}. Stopped here; the extensions after it were left alone.`);
      return 1;
    }
    print(`installed ${x.id} into ${x.dest}`);
  }
  print(`Done. Muse recorded each install in ${p.lock}. A new Muse session picks them up.`);
  return 0;
}

// Same files from a new path: only the source field in Muse's lock changes, written to a temp file and renamed over it.
function setReceiptSource(p, id, path) {
  assertSafeWritePath(p.lock);
  const lock = JSON.parse(readFileSync(p.lock, 'utf8'));
  lock.skills[id].source.path = path;
  const tmp = `${p.lock}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(lock, null, 2)}\n`);
  renameSync(tmp, p.lock);
}

function planFor(sv, ids, src, flags, { update = false } = {}) {
  return ids.map((id) => {
    const r = sv.rows.find((x) => x.id === id);
    const srcDir = join(src.variants ?? src.planned, id);
    const base = { id, dest: r.dest, src: srcDir };
    if (r.state === 'symlinked' || r.state === 'not-a-folder') return { ...base, blocked: `${r.dest} is ${r.state === 'symlinked' ? 'a symbolic link' : 'not a folder'}; LitMuse will not move it` };
    if (update) {
      if (r.state === 'absent') return { ...base, action: 'skip', note: 'not installed (install it with extensions install)' };
      if (r.state === 'record-only') return { ...base, action: 'skip', note: `folder gone; run muse skills uninstall ${id}` };
      if (r.state !== 'installed') return { ...base, action: 'skip', note: `${stateText(r)}; left alone (extensions install moves it aside)` };
    }
    if (src.variants && !existsSync(join(srcDir, 'SKILL.md'))) return { ...base, blocked: `the source has no ${id} edition (${srcDir})` };
    const others = r.competing.filter((c) => c.path !== r.dest);
    if (others.length && !flags.allowShadow && !update) {
      return { ...base, blocked: `another skill with this name is there: ${others.map((c) => `${c.path} (${c.scope})`).join(', ')}. LitMuse leaves it alone; move or rename it, or rerun with --allow-shadow to install anyway` };
    }
    const warn = others.map((c) => `${c.path} (${c.scope}) has the same name; ${c.scope === 'project' ? 'it outranks the extension in that project' : 'Muse will report it as shadowed'}`);
    if (r.state === 'installed' && src.variants && r.entry && sameAsReceipt(srcDir, r.entry)) {
      if (r.receipt.source === srcDir) return { ...base, action: 'skip', note: `current (same files as ${r.receipt.source})` };
      return { ...base, action: 'skip', repoint: true, note: `current (same files; the receipt's source becomes ${srcDir} on --yes)` };
    }
    if (r.state === 'installed' && !src.variants) {
      return { ...base, action: 'skip', note: 'compared after the source is fetched' };
    }
    return { ...base, action: 'install', moveAside: r.state !== 'absent' && r.state !== 'record-only', warn };
  });
}

function installVerb({ env, args, flags, print, cwd, update }) {
  const t = targets(args, flags, { allDefault: update });
  if (t.error) { print(t.error); return 2; }
  const p = extPaths(env);
  const src = resolveSource({ env, flags, p, fetch: Boolean(flags.yes && !flags.dryRun) });
  if (src.error) { print(`FAIL ${src.error}`); return 1; }
  const sv = survey(env, { cwd });
  if (sv.error) { print(`FAIL ${sv.error}`); return 1; }
  print(`Source: ${src.label}${src.pending ? ' (on --yes)' : ''}`);
  if (src.stale) print('Compared with the cached copy; --yes fetches first, so the result may differ.');
  const plan = planFor(sv, t.ids, src, flags, { update });
  return apply({ env, plan, p, flags, print, verb: update ? 'update' : 'install' });
}

function removeVerb({ env, args, flags, print, cwd }) {
  const t = targets(args, flags);
  if (t.error) { print(t.error); return 2; }
  const sv = survey(env, { cwd });
  if (sv.error) { print(`FAIL ${sv.error}`); return 1; }
  const p = sv.p;
  const plan = t.ids.map((id) => sv.rows.find((r) => r.id === id));
  let refused = 0;
  for (const r of plan) {
    if (r.state === 'installed') print(`  ${r.id}: move ${r.dest} -> ${join(p.backups, '<stamp>', r.id)}, then muse skills uninstall ${r.id}`);
    else if (r.state === 'record-only') print(`  ${r.id}: muse skills uninstall ${r.id} (the folder is already gone)`);
    else if (r.state === 'absent') print(`  ${r.id}: not installed`);
    else { refused += 1; print(`REFUSED ${r.id}: ${stateText(r)}. LitMuse removes only a copy Muse installed from a wjgoarxiv-skills edition; move ${r.dest} yourself if you want it gone.`); }
  }
  if (refused) { print('Nothing was changed.'); return 1; }
  const work = plan.filter((r) => r.state === 'installed' || r.state === 'record-only');
  if (!work.length) return 0;
  if (!flags.yes || flags.dryRun) {
    print('');
    print('Dry run: nothing was moved or uninstalled. Rerun with --yes to remove.');
    return 0;
  }
  let backupDir = null;
  for (const r of work) {
    if (r.state === 'installed') {
      if (!backupDir) {
        const bst = lstatOrNull(p.backups);
        if (bst && (bst.isSymbolicLink() || !bst.isDirectory())) { print(`STOP ${p.backups} is a link or not a folder.`); return 1; }
        assertSafeWritePath(p.backups);
        backupDir = newBackupDir(p);
        mkdirSync(backupDir, { recursive: true });
      }
      renameSync(r.dest, join(backupDir, r.id));
      print(`moved ${r.dest} -> ${join(backupDir, r.id)}`);
    }
    const u = muse(env, ['skills', 'uninstall', r.id, '--json']);
    if (!u.ok) { print(`FAIL muse skills uninstall ${r.id}: ${u.json?.error?.message || u.stderr.trim()}`); return 1; }
    print(`Muse dropped its record of ${r.id}`);
  }
  print('Done. Nothing was deleted; the folders are in the backup above.');
  return 0;
}

function pruneVerb({ env, flags, print }) {
  const p = extPaths(env);
  const bst = lstatOrNull(p.backups);
  if (bst && (bst.isSymbolicLink() || !bst.isDirectory())) { print(`FAIL ${p.backups} is a link or not a folder; LitMuse will not delete through it.`); return 1; }
  const all = listBackups(p);
  const days = flags.olderThan == null ? null : Number(flags.olderThan);
  if (days != null && !(days >= 0)) { print('--older-than takes a number of days'); return 2; }
  const cutoff = days == null ? Infinity : Date.now() - days * 86400000;
  const pick = all.filter((b) => days == null || (b.at && b.at.getTime() < cutoff));
  if (!all.length) { print(`No backups in ${p.backups}.`); return 0; }
  print(`Backups in ${p.backups}:`);
  for (const b of all) print(`  ${pick.includes(b) ? '*' : ' '} ${b.name}  ${humanSize(b.bytes).padStart(9)}  ${b.ids.join(', ')}`);
  const bytes = pick.reduce((n, b) => n + b.bytes, 0);
  if (!pick.length) { print(`None is older than ${days} days.`); return 0; }
  if (!flags.yes || flags.dryRun) {
    print('');
    print(`Dry run: ${pick.length} marked * (${humanSize(bytes)}) would be deleted. Rerun with --yes to delete them.`);
    return 0;
  }
  const realRoot = realpathSync(p.backups);
  for (const b of pick) {
    const st = lstatSync(b.dir);
    if (st.isSymbolicLink() || !st.isDirectory() || dirname(realpathSync(b.dir)) !== realRoot) { print(`skipped ${b.dir}: not a plain folder inside ${p.backups}`); continue; }
    rmSync(b.dir, { recursive: true });
    print(`deleted ${b.dir}`);
  }
  print(`Freed ${humanSize(bytes)}.`);
  return 0;
}

export const EXT_HELP = `Usage: litmuse extensions <verb> [options]

The nine file-making skills are LitFamily extensions, installed as Muse user skills from the Muse editions in
wjgoarxiv-skills. These verbs run the stubs' lines for you: look first, move an occupied folder aside into
$CONFIG_DIR/extension-backups/<stamp>/, then muse skills install. Muse's lock ($CONFIG_DIR/skills/.muse/lock.json)
is the receipt. Every write verb shows its plan and changes nothing until you add --yes.

Verbs
  list [--json]                      Each extension: not installed, installed (source, time), user-managed, same-name copies
  check                              What needs a look, each with the line that fixes it (exit 1 when something does)
  install <id...|--family f|--all>   Move an existing folder aside, then muse skills install (stops on a same-name skill elsewhere)
  update [<id...>|--all]             Refresh the source; reinstall each installed extension whose files changed
  remove <id...>                     Move the folder aside, then muse skills uninstall; refuses a folder Muse did not install
  prune-backups [--older-than <d>]   List the backups with sizes; delete them only with --yes

Options
  --yes              Do it (without it, every write verb is a dry run)
  --from <path>      Use your own wjgoarxiv-skills clone instead of LitMuse's cached clone
  --allow-shadow     Install even when a same-name skill sits in another folder (it is never touched)
  --family <name>    decks, documents, figures, design or video-covers`;

export async function extensionsCommand({ args = [], flags = {}, env = process.env, print = console.log, cwd = process.cwd() }) {
  const [verb, ...rest] = args;
  if (!verb || verb === 'help' || flags.help) { print(EXT_HELP); return 0; }
  if (verb === 'list' || verb === 'check') {
    const sv = survey(env, { cwd });
    if (sv.error) { print(`FAIL ${sv.error}`); return 1; }
    return verb === 'list' ? listVerb(sv, flags, print) : checkVerb(sv, print);
  }
  if (verb === 'install') return installVerb({ env, args: rest, flags, print, cwd, update: false });
  if (verb === 'update') return installVerb({ env, args: rest, flags, print, cwd, update: true });
  if (verb === 'remove') return removeVerb({ env, args: rest, flags, print, cwd });
  if (verb === 'prune-backups') return pruneVerb({ env, flags, print });
  print(`Unknown extensions verb: ${verb}\n\n${EXT_HELP}`);
  return 2;
}
