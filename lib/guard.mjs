import { sep } from 'node:path';

const FOREIGN_DIRS = new Set(['.claude', '.codex']);

// LitMuse writes only to its own data directory; another tool's home is never a destination.
export function assertSafeWritePath(target) {
  const parts = String(target).split(/[\\/]/).filter(Boolean);
  const hit = parts.find((p) => FOREIGN_DIRS.has(p));
  if (hit) throw new Error(`refused: LitMuse never writes under ${hit}${sep} (${target})`);
  return target;
}
