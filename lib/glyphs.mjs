// Whether LitMuse draws round ends (U+E0B6, U+E0B4) on pills and gauges. Every surface asks here, so one terminal never
// shows both forms. LITMUSE_GLYPHS decides when set (auto, round or nerd, basic or square), then the choice saved by
// `install --glyphs`; on auto it is the terminal's own word, then, off SSH, whether an icon font is installed here. Only
// file names in the font folders are read.
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { readConfig } from './config.mjs';
import { GLYPH_CHOICES, NPX } from './flags.mjs';
import { colourDepth } from './mark.mjs';

export const CAP_LEFT = '';
export const CAP_RIGHT = '';
const MAX_NAMES = 4000;
const MAX_DEPTH = 3;
const FONT = /\.(?:ttf|otf|ttc)$/i;
const ICONS = /nerd[ _-]?font|[ _-]nf[mp]?(?=[ _.-])/i;
const SETTING = new Map([['auto', 'auto'], ['round', 'round'], ['nerd', 'round'], ['square', 'square'], ['basic', 'square']]);

const drawsCaps = (env) => Boolean(env.WT_SESSION || env.KITTY_WINDOW_ID) || env.TERM === 'xterm-kitty'
  || /^(?:vscode|wezterm|ghostty)$/i.test(env.TERM_PROGRAM ?? '');

const fontFolders = (env, platform) => {
  const home = env.HOME || homedir();
  if (platform === 'darwin') return [join(home, 'Library', 'Fonts'), '/Library/Fonts'];
  if (platform === 'win32') return [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'), env.WINDIR && join(env.WINDIR, 'Fonts')].filter(Boolean);
  return [join(isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(home, '.local', 'share'), 'fonts'), join(home, '.fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];
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

/** A font was added or removed: look again. */
export const forgetIconFont = () => { installed = null; };

/** `{choice, from}`: round, square or auto, and whether LITMUSE_GLYPHS, the saved choice or neither said so. */
export function glyphChoice(env = process.env) {
  const set = SETTING.get((env.LITMUSE_GLYPHS ?? '').toLowerCase());
  if (set) return { choice: set, from: 'environment' };
  const saved = readConfig(env).glyphs;
  return GLYPH_CHOICES.includes(saved) ? { choice: saved, from: 'saved' } : { choice: 'auto', from: 'default' };
}

export function roundGlyphs(env = process.env, iconFont = iconFontOnce) {
  const { choice } = glyphChoice(env);
  if (choice !== 'auto') return choice === 'round';
  if (drawsCaps(env)) return true;
  return !env.SSH_CONNECTION && iconFont();
}

// What the window on stdout rules out. Without a terminal it says nothing about the window the user will look at.
function windowLimit(env) {
  if (env.NO_COLOR) return 'NO_COLOR is set; unset it';
  if (/^dumb$/i.test(env.TERM ?? '')) return 'TERM is dumb; use a full terminal';
  if (/;(7|15)$/.test(env.COLORFGBG ?? '')) return 'light ground; use a dark terminal';
  return colourDepth({ env, isTTY: true }) === 'truecolor' ? null : 'fewer colours than truecolor; use a truecolor terminal';
}

/**
 * The ROUND_ENDS line of install, update and doctor. `surface` is whether LitMuse is installed, so that its status card
 * is there; `fontWhy` is why --round could not add the font. An installed font is no proof that the terminal uses it.
 */
export function roundEndsLine({
  env = process.env, surface = true, tty = Boolean(process.stdout.isTTY), platform = process.platform, fontWhy = null,
  iconFont = () => iconFontInstalled({ env, platform }),
} = {}) {
  const again = `${NPX} install --yes`;
  const square = (why) => `ROUND_ENDS: square (${why})`;
  const check = (why) => `ROUND_ENDS: check (${why}; show your user the pill in step 7 of ${NPX} install --agent)`;
  if (!surface) return square(`no surface enabled; run ${again} --round`);
  const limit = tty ? windowLimit(env) : null;
  if (limit) return square(limit);
  const { choice, from } = glyphChoice(env);
  if (choice === 'square') return square(`choice is square; ${from === 'environment' ? 'unset LITMUSE_GLYPHS' : `run ${again} --glyphs auto`}`);
  if (choice === 'round') return from === 'saved' || readConfig(env).glyphs === 'round' ? 'ROUND_ENDS: shown' : check('LITMUSE_GLYPHS asks for round ends and no answer is saved');
  if (drawsCaps(env)) return `ROUND_ENDS: ready${tty ? '' : ' in a dark full-colour terminal'}`;
  if (env.SSH_CONNECTION) return square(`SSH; run ${again} --glyphs round when your user sees the pill in step 7 of ${NPX} install --agent as round`);
  if (iconFont()) return check('an icon font is here, and this terminal is not known to use it');
  if (fontWhy) return square(`font not installed (${fontWhy}); run ${again} --round again`);
  if (platform === 'win32') return square('Windows console; use Windows Terminal or VS Code');
  return square(`no icon font; run ${again} --round`);
}
