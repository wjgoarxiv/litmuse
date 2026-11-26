// The opt-in icon font of `install --round`: the symbols-only Nerd Font, which holds the round ends (U+E0B6, U+E0B4).
// It comes from one pinned release archive, and archive and files must match their SHA-256. A file that is already there
// is never replaced, and icon-font.json in LitMuse's data folder lists what LitMuse added, so uninstall removes only that.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { forgetIconFont, iconFontInstalled } from './glyphs.mjs';
import { FONT_FILES, assertFontPath, assertSafeWritePath, fontFolder, fontFolderProblem } from './guard.mjs';
import { paths } from './paths.mjs';
import { realExistingAncestor, writeFileAtomic } from './safe-write.mjs';

const MIB = 1024 * 1024;
export const ICON_FONT = Object.freeze({
  release: 'v3.5.1',
  url: 'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.5.1/NerdFontsSymbolsOnly.zip',
  sha256: 'fdca3682534f6f65e1ccb2345b0362ccf67d9b8eca7c8025330946e93e2473bc',
  maxBytes: 8 * MIB,
  files: Object.freeze([
    Object.freeze({ entry: 'SymbolsNerdFontMono-Regular.ttf', name: FONT_FILES.font, sha256: 'fe471e538392f51910faab985fa8e192a39dd3426125edd15b71b3680df0e749' }),
    Object.freeze({ entry: 'LICENSE', name: FONT_FILES.license, sha256: '84a7a98c82140fb12c37fe42b93805baa16024cb3e5acc599b7ffe612c55d847' }),
  ]),
});
const DOWNLOAD_MS = 60_000;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lstatOrNull = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};
// absent, same (a regular file with exactly these bytes) or other.
const stateOf = (path, hash) => {
  const st = lstatOrNull(path);
  if (!st) return 'absent';
  return st.isFile() && sha256(readFileSync(path)) === hash ? 'same' : 'other';
};

/** Bytes of the named entries of a zip held in memory; a missing name is left out. */
export function unzip(zip, names) {
  const out = new Map();
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('the archive is not a zip file');
  let at = zip.readUInt32LE(end + 16);
  for (let left = zip.readUInt16LE(end + 10); left > 0; left -= 1) {
    const [nameSize, extraSize, noteSize] = [28, 30, 32].map((offset) => zip.readUInt16LE(at + offset));
    const name = zip.toString('utf8', at + 46, at + 46 + nameSize);
    if (names.includes(name)) {
      const local = zip.readUInt32LE(at + 42);
      const from = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(from, from + zip.readUInt32LE(at + 20));
      const method = zip.readUInt16LE(at + 10);
      if (method !== 0 && method !== 8) throw new Error(`the archive packs ${name} in a way LitMuse does not read`);
      out.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: 4 * ICON_FONT.maxBytes }));
    }
    at += 46 + nameSize + extraSize + noteSize;
  }
  return out;
}

async function download(pins, fetchImpl) {
  const res = await fetchImpl(pins.url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_MS) });
  if (!res.ok) throw new Error(`the download answered HTTP ${res.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > pins.maxBytes) throw new Error('the download is larger than 8 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** The pinned archive: the file LITMUSE_ICON_FONT_SOURCE names (tests, offline), else the download. */
async function archiveBytes({ env, pins, fetchImpl }) {
  const local = env.LITMUSE_ICON_FONT_SOURCE;
  let bytes;
  if (local) {
    const st = lstatSync(local);
    if (!st.isFile() || st.size > pins.maxBytes) throw new Error(`${local} is not a regular file of at most 8 MiB`);
    bytes = readFileSync(local);
  } else bytes = await download(pins, fetchImpl);
  if (sha256(bytes) !== pins.sha256) throw new Error('the archive does not match its pinned SHA-256');
  return bytes;
}

const readManifest = (file) => {
  try {
    const { files } = lstatSync(file).isFile() ? JSON.parse(readFileSync(file, 'utf8')) : {};
    return Array.isArray(files) ? files.filter((f) => typeof f?.path === 'string' && typeof f?.sha256 === 'string') : [];
  } catch {
    return [];
  }
};

// Why the folder or the font's own place in it cannot take the file, or null. Nothing is written or fetched before this.
function blocked(target, where) {
  const problem = fontFolderProblem(where);
  if (problem) return problem;
  assertSafeWritePath(realExistingAncestor(dirname(target)));
  return lstatOrNull(target) ? `something else is already at ${target}` : null;
}

// The bytes go to a temporary file in LitMuse's own folder; the hard link that claims the name fails when anything is
// there already. Returns false in that case.
function claim(target, bytes, data, write) {
  mkdirSync(data, { recursive: true });
  const staged = join(data, `.icon-font-${process.pid}`);
  try {
    write(staged, bytes, { flag: 'wx', mode: 0o644 });
    try {
      linkSync(staged, target);
    } catch (e) {
      if (e.code === 'EEXIST') return false;
      throw e.code === 'EXDEV' ? new Error(`${dirname(target)} and ${data} are on different disks`) : e;
    }
    return true;
  } finally {
    rmSync(staged, { force: true });
  }
}

/** What `--round` would do, for the plan and the dry run. */
export function iconFontPlan({ env = process.env, platform = process.platform, hasFont = () => iconFontInstalled({ env, platform }) } = {}) {
  if (hasFont()) return 'an icon font is already here; nothing is added';
  const dir = fontFolder({ env, platform });
  if (!dir) return 'no font is installed on Windows (Windows Terminal and VS Code draw the round ends)';
  return `add ${FONT_FILES.font} and its licence (${FONT_FILES.license}) to ${dir}, ${env.LITMUSE_ICON_FONT_SOURCE ? `from ${env.LITMUSE_ICON_FONT_SOURCE}` : `downloaded from ${ICON_FONT.url}`}`;
}

/**
 * Adds the icon font when none is here. Returns `{status, why?, written}` with status here, added, unsupported or failed;
 * it never throws, because an install succeeds with square ends too.
 */
export async function addIconFont({
  env = process.env, platform = process.platform, pins = ICON_FONT, fetchImpl = globalThis.fetch, spawn = spawnSync, write = writeFileSync,
  hasFont = () => iconFontInstalled({ env, platform }),
} = {}) {
  const linked = [];
  try {
    if (hasFont()) return { status: 'here', written: [] };
    const p = paths(env);
    const dir = fontFolder({ env, platform });
    if (!dir) return { status: 'unsupported', why: 'LitMuse installs no font on Windows', written: [] };
    const why = blocked(join(dir, FONT_FILES.font), { env, platform });
    if (why) return { status: 'failed', why, written: [] };
    const entries = unzip(await archiveBytes({ env, pins, fetchImpl }), pins.files.map((f) => f.entry));
    for (const f of pins.files) {
      const bytes = entries.get(f.entry);
      if (!bytes || sha256(bytes) !== f.sha256) throw new Error(`${f.entry} in the archive does not match its pinned SHA-256`);
    }
    mkdirSync(dir, { recursive: true });
    const late = blocked(join(dir, FONT_FILES.font), { env, platform });
    if (late) throw new Error(late);
    for (const f of pins.files) {
      const path = assertFontPath(join(dir, f.name), { env, platform });
      if (claim(path, entries.get(f.entry), p.data, write)) linked.push({ path, sha256: f.sha256 });
      else if (f.name === FONT_FILES.font) throw new Error(`something else is already at ${path}`);
    }
    const kept = readManifest(p.iconFont).filter((f) => !linked.some((l) => l.path === f.path) && stateOf(f.path, f.sha256) === 'same');
    writeFileAtomic(p.iconFont, `${JSON.stringify({ release: pins.release, files: [...kept, ...linked] }, null, 2)}\n`);
    if (platform !== 'darwin') spawn('fc-cache', ['-f', dir], { stdio: 'ignore', timeout: DOWNLOAD_MS });
    return { status: 'added', written: [...linked.map((f) => f.path), p.iconFont] };
  } catch (e) {
    for (const f of linked) rmSync(f.path, { force: true });
    return { status: 'failed', why: e.name === 'TimeoutError' ? 'the download took longer than 60 seconds' : e.code ? `${e.code}${e.path ? ` ${e.path}` : ''}` : e.message, written: [] };
  } finally {
    forgetIconFont();
  }
}

/** The files LitMuse added that are still exactly as written (`remove`), and those that changed since (`keep`). */
export function ownedIconFont({ env = process.env, platform = process.platform } = {}) {
  const out = { remove: [], keep: [] };
  const linked = fontFolderProblem({ env, platform });
  for (const f of readManifest(paths(env).iconFont)) {
    let state = 'other';
    try {
      const found = stateOf(assertFontPath(f.path, { env, platform }), f.sha256);
      state = linked && found === 'same' ? 'other' : found;
    } catch { /* not a path LitMuse writes: left alone */ }
    if (state !== 'absent') out[state === 'same' ? 'remove' : 'keep'].push(f.path);
  }
  return out;
}

export function removeIconFont({ env = process.env, platform = process.platform } = {}) {
  const owned = ownedIconFont({ env, platform });
  for (const path of owned.remove) rmSync(path, { force: true });
  const list = assertSafeWritePath(paths(env).iconFont);
  if (lstatOrNull(list)?.isFile()) rmSync(list);
  forgetIconFont();
  return owned;
}
