import { appendFileSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { assertSafeWritePath } from './guard.mjs';

// An append-only record of the notice texts LitMuse has already printed: one JSON line `{hash, at}` per text, in
// LitMuse's own data folder. Anything unreadable, oversized or linked counts as "nothing shown yet", so a broken
// record can only bring a notice back, never hide a new one.
const READ_LIMIT = 256 * 1024;

export const noticeHash = (text) => createHash('sha256').update(String(text).replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 16);

function realFile(file) {
  try {
    const st = lstatSync(file);
    return st.isFile() && st.size <= READ_LIMIT;
  } catch {
    return false;
  }
}

export function wasShown(file, hash) {
  if (!realFile(file)) return false;
  try {
    return readFileSync(file, 'utf8').split('\n').some((line) => {
      try {
        return JSON.parse(line)?.hash === hash;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function recordShown(file, hash) {
  try {
    assertSafeWritePath(file);
    const parent = lstatSyncOrNull(dirname(file));
    if (parent && (parent.isSymbolicLink() || !parent.isDirectory())) return false;
    const own = lstatSyncOrNull(file);
    if (own && !own.isFile()) return false;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ hash, at: Date.now() })}\n`);
    return true;
  } catch {
    return false;
  }
}

function lstatSyncOrNull(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}
