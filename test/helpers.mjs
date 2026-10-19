import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FAKE_MUSE = join(ROOT, 'test', 'fixtures', 'fake-muse.mjs');
chmodSync(FAKE_MUSE, 0o755);

// A throwaway HOME with XDG dirs and a fake muse binary, so no test touches the real machine.
export function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-home-'));
  const env = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_CACHE_HOME: join(home, '.cache'),
    LITMUSE_MUSE_BIN: FAKE_MUSE,
    LITMUSE_NO_UPDATE_CHECK: '1',
    LITMUSE_SKIP_RUNTIMES: '1',
    FAKE_MUSE_LOG: join(home, 'muse-calls.jsonl'),
    FAKE_MUSE_STATE: join(home, 'muse-state.json'),
    PATH: process.env.PATH,
  };
  return { home, env };
}

export function museCalls(env) {
  if (!existsSync(env.FAKE_MUSE_LOG)) return [];
  return readFileSync(env.FAKE_MUSE_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function setMuseState(env, patch) {
  const cur = existsSync(env.FAKE_MUSE_STATE) ? JSON.parse(readFileSync(env.FAKE_MUSE_STATE, 'utf8')) : { installed: false, approved: [], source: null, extraSkills: [] };
  writeFileSync(env.FAKE_MUSE_STATE, JSON.stringify({ ...cur, ...patch }));
}

export function walk(dir, base = dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    acc.push(relative(base, p));
    if (lstatSync(p).isDirectory()) walk(p, base, acc);
  }
  return acc;
}

export function collect() {
  const lines = [];
  return { lines, print: (l) => lines.push(l), text: () => lines.join('\n') };
}
