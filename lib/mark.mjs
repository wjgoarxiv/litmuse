// The synthwave LIT mark and the LIT pill, for the person at the terminal only: install, doctor and a
// TTY `status --card`; piped, install and doctor get the one plain line. Hooks, context files and command text never call it: what they print is
// model-visible.
import { MONO_ROWS, PIXEL_ROWS, SHARED_COLOURS } from './synthwave-data.mjs';

export const HOST = 'muse code';
// LitMuse chrome: peach at the top of each letter, plum at the base.
export const CHROME = Object.freeze(['#fff1e6', '#ffc29e', '#ff7a59', '#ffffff', '#ffd6e7', '#3b0a2a']);
const TAGLINE = Object.freeze(['#8be9fd', '#ff2d95', '#ffd23f']);
const EDGE = '#ffffff';
const PILL_INK = '#0b0e14';
export const SIZES = Object.freeze([['B-L', 76], ['B-M', 44], ['B-S', 24]]);
export const FALLBACK = `LIT · ${HOST}`;

const ESC = '\u001b';
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

// Piecewise-linear sample of a stop list at t in [0, 1].
export function sample(stops, t) {
  const span = stops.length - 1;
  const i = Math.min(span - 1, Math.floor(t * span));
  const f = t * span - i;
  const a = rgb(stops[i]);
  const b = rgb(stops[i + 1]);
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('')}`;
}

const pixel = (sym) => {
  if (sym === ' ') return null;
  if (sym >= 'a' && sym <= 'l') return sample(CHROME, (sym.charCodeAt(0) - 97) / 11);
  if (sym === 'm') return EDGE;
  return SHARED_COLOURS[sym] ?? null;
};

const cube = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => Math.round((v / 255) * 5));
  return 16 + 36 * r + 6 * g + b;
};
const sgr = (hex, layer, depth) => (depth === 'truecolor'
  ? `${layer === 'fg' ? 38 : 48};2;${rgb(hex).join(';')}`
  : `${layer === 'fg' ? 38 : 48};5;${cube(hex)}`);

// truecolor, 256 or none. NO_COLOR, a pipe or a dumb terminal mean none; a plain 8/16-colour
// terminal also gets none, since the mark needs at least the 256-colour cube.
export function colourDepth({ env = process.env, isTTY = process.stdout.isTTY } = {}) {
  if (env.NO_COLOR || !isTTY || env.TERM === 'dumb') return 'none';
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '')) return 'truecolor';
  if (/256/.test(env.TERM ?? '')) return '256';
  return 'none';
}

// Terminal width in cells; unknown counts as 80.
export function termColumns({ env = process.env, stream = process.stdout } = {}) {
  const cols = Number(stream?.columns) || Number.parseInt(env.COLUMNS ?? '', 10);
  return Number.isFinite(cols) && cols > 0 ? cols : 80;
}

export function markSize(cols) {
  const width = Number.isFinite(cols) && cols > 0 ? cols : 80;
  return SIZES.find(([, min]) => width >= min)?.[0] ?? null;
}

// One coloured row: cells are [glyph, fg, bg]; an SGR is written only when the colours change.
const paintRow = (cells, depth) => {
  let out = '';
  let last = '';
  for (const [glyph, fg, bg] of cells) {
    const codes = [fg && sgr(fg, 'fg', depth), bg && sgr(bg, 'bg', depth)].filter(Boolean).join(';');
    if (codes !== last) {
      out += `${ESC}[0m${codes ? `${ESC}[${codes}m` : ''}`;
      last = codes;
    }
    out += glyph;
  }
  return last ? `${out}${ESC}[0m` : out;
};

const artRows = (size, depth) => {
  const rows = PIXEL_ROWS[size];
  const out = [];
  for (let y = 0; y < rows.length; y += 2) {
    const cells = [...rows[y]].map((sym, x) => {
      const top = pixel(sym);
      const bottom = pixel(rows[y + 1][x]);
      if (top === bottom) return [' ', null, top];
      if (top === null) return ['▄', bottom, null];
      return ['▀', top, bottom];
    });
    out.push(paintRow(cells, depth));
  }
  return out;
};

const tagline = (width, depth) => {
  const pad = ' '.repeat(Math.max(0, Math.floor((width - FALLBACK.length) / 2)));
  if (depth === 'none') return `${pad}${FALLBACK}`;
  const glyphs = [...FALLBACK];
  return pad + paintRow(glyphs.map((g, i) => [g, g === ' ' ? null : sample(TAGLINE, i / (glyphs.length - 1)), null]), depth);
};

// The mark as printable rows for `cols` cells at `depth`: the art, then one centred tagline.
// Below 24 columns it is the single plain line.
export function markRows({ cols = 80, depth = 'none', size = markSize(cols) } = {}) {
  if (!size) return [FALLBACK];
  const art = depth === 'none' ? [...MONO_ROWS[size]] : artRows(size, depth);
  return [...art, tagline(PIXEL_ROWS[size][0].length, depth)];
}

// The mark for this process's stdout, as one string ending in a blank line. When stdout is not a
// terminal (a pipe, the model's bash tool, a CI log) it is only the plain line: art is for people.
export function markFor({ env = process.env, stream = process.stdout } = {}) {
  if (stream?.isTTY !== true) return `${FALLBACK}\n`;
  const rows = markRows({ cols: termColumns({ env, stream }), depth: colourDepth({ env, isTTY: stream?.isTTY }) });
  return `${rows.join('\n')}\n`;
}

// The LIT pill: bold dark ink on a gradient from chrome stop 1 to stop 4. Truecolor only; at any
// other depth it is null and the caller keeps its plain text.
export const pillLabel = (version) => ` 🔥LIT v${version} `;
export function litPill(version, depth) {
  if (depth !== 'truecolor') return null;
  const glyphs = [...pillLabel(version)];
  const ink = rgb(PILL_INK).join(';');
  const body = glyphs.map((g, i) => `${ESC}[48;2;${rgb(sample([CHROME[1], CHROME[4]], glyphs.length > 1 ? i / (glyphs.length - 1) : 0)).join(';')}m${g}`).join('');
  return `${ESC}[1;38;2;${ink}m${body}${ESC}[0m`;
}

// Display width of the pill: the flame is two cells wide.
export const pillWidth = (version) => [...pillLabel(version)].length + 1;
