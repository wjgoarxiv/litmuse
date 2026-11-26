import { lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

const FOREIGN_DIRS = new Set(['.claude', '.codex']);

// LitMuse writes only to its own data directory; another tool's home is never a destination.
export function assertSafeWritePath(target) {
  const parts = String(target).split(/[\\/]/).filter(Boolean);
  const hit = parts.find((p) => FOREIGN_DIRS.has(p));
  if (hit) throw new Error(`refused: LitMuse never writes under ${hit}${sep} (${target})`);
  return target;
}

export const FONT_FILES = Object.freeze({ font: 'SymbolsNerdFontMono-Regular.ttf', license: 'SymbolsNerdFontMono-LICENSE.txt' });

/** XDG_DATA_HOME where it is absolute; by the XDG rule a relative one counts as not set. A slash at its end would hide a link. */
export const xdgData = (env) => (isAbsolute(env.XDG_DATA_HOME ?? '') ? resolve(env.XDG_DATA_HOME) : null);

/** The per-user font folder, or null on Windows, where LitMuse installs no font. */
export function fontFolder({ env = process.env, platform = process.platform } = {}) {
  const home = env.HOME || homedir();
  if (platform === 'win32') return null;
  return platform === 'darwin' ? join(home, 'Library', 'Fonts') : join(xdgData(env) ?? join(home, '.local', 'share'), 'fonts');
}

/**
 * Why the font folder cannot be used, or null: it, or a folder between it and the user's home (or XDG_DATA_HOME), is a
 * link or no folder. A missing folder is fine.
 */
export function fontFolderProblem({ env = process.env, platform = process.platform } = {}) {
  const home = env.HOME || homedir();
  const steps = platform === 'darwin' ? [join(home, 'Library'), join(home, 'Library', 'Fonts')]
    : xdgData(env) ? [xdgData(env), join(xdgData(env), 'fonts')]
      : [join(home, '.local'), join(home, '.local', 'share'), join(home, '.local', 'share', 'fonts')];
  for (const step of steps) {
    const st = lstatSync(step, { throwIfNoEntry: false });
    if (st && !st.isDirectory()) return `${step} is ${st.isSymbolicLink() ? 'a link' : 'not a folder'}`;
  }
  return null;
}

// `install --round` is the one write outside LitMuse's folder and Muse's own files: these two names, in that folder.
export function assertFontPath(target, { env = process.env, platform = process.platform } = {}) {
  const dir = fontFolder({ env, platform });
  if (!dir || !Object.values(FONT_FILES).some((name) => target === join(dir, name))) throw new Error(`refused: ${target} is not an icon font path LitMuse writes`);
  return assertSafeWritePath(target);
}
