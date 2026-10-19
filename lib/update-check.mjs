import { paths } from './paths.mjs';
import { writeFileAtomic } from './safe-write.mjs';

const REGISTRY = 'https://registry.npmjs.org/@litfamily%2flitmuse/latest';

// Asks npm for the latest published version and caches the answer for the SessionStart hook.
export async function checkUpdate(env = process.env) {
  if (env.LITMUSE_NO_UPDATE_CHECK === '1') return { skipped: true };
  let latest = null;
  let error = null;
  try {
    const res = await fetch(REGISTRY, { signal: AbortSignal.timeout(3000) });
    if (res.ok) latest = (await res.json()).version ?? null;
    else if (res.status !== 404) error = `registry answered ${res.status}`;
  } catch (e) {
    error = e.name === 'TimeoutError' ? 'registry timed out' : 'registry unreachable';
  }
  if (!error) writeCache(env, { latest });
  return { latest, error };
}

// The cache is a convenience for the SessionStart hook; a link or odd file in its place is left alone.
export function writeCache(env, { latest }) {
  try {
    writeFileAtomic(paths(env).updateCache, `${JSON.stringify({ latest, checkedAt: Date.now() })}\n`);
    return true;
  } catch {
    return false;
  }
}
