// Whether LitMuse draws round ends (U+E0B6, U+E0B4) on pills and gauges. Every surface asks here, so one terminal never
// shows both forms. LITMUSE_GLYPHS decides when set (round or nerd, basic or square); otherwise the terminal's own
// word, then, off SSH, whether an icon font is installed here. Only file names in the font folders are read.
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CAP_LEFT = '';
export const CAP_RIGHT = '';
const MAX_NAMES = 4000;
const MAX_DEPTH = 3;
const FONT = /\.(?:ttf|otf|ttc)$/i;
const ICONS = /nerd[ _-]?font|[ _-]nf[mp]?(?=[ _.-])/i;

const drawsCaps = (env) => Boolean(env.WT_SESSION || env.KITTY_WINDOW_ID) || env.TERM === 'xterm-kitty'
  || /^(?:vscode|wezterm|ghostty)$/i.test(env.TERM_PROGRAM ?? '');

const fontFolders = (env, platform) => {
  const home = env.HOME || homedir();
  if (platform === 'darwin') return [join(home, 'Library', 'Fonts'), '/Library/Fonts'];
  if (platform === 'win32') return [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'), env.WINDIR && join(env.WINDIR, 'Fonts')].filter(Boolean);
  return [join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'fonts'), join(home, '.fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];
};

/** An icon font file is installed. Links are not followed; an unreadable folder or too many names means no. */
export function iconFontInstalled({ env = process.env, platform = process.platform, folders = fontFolders(env, platform), limit = MAX_NAMES } = {}) {
  const queue = folders.map((path) => [path, 0]);
  let seen = 0;
  for (const [path, depth] of queue) {
    let entries = [];
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch { /* no such folder here */ }
    for (const entry of entries) {
      seen += 1;
      if (seen > limit) return false;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) queue.push([join(path, entry.name), depth + 1]);
      } else if (entry.isFile() && FONT.test(entry.name) && ICONS.test(entry.name)) return true;
    }
  }
  return false;
}

// The font folders are read at most once per process.
let installed = null;
const iconFontOnce = () => (installed ??= iconFontInstalled());

export function roundGlyphs(env = process.env, iconFont = iconFontOnce) {
  const chosen = (env.LITMUSE_GLYPHS ?? '').toLowerCase();
  if (chosen === 'round' || chosen === 'nerd') return true;
  if (chosen === 'square' || chosen === 'basic') return false;
  if (drawsCaps(env)) return true;
  return !env.SSH_CONNECTION && iconFont();
}
