// The status card's sunset, for a person's truecolor terminal only: a half-sunk sun with stars over it and a sea under
// it, painted only in cells that hold no text.
// `t` is seconds into the motion; null is the resting pose. Shapes hold still: only colours move, plus the ASCII sea,
// stars and shooting star.
import { displayWidth } from '../plugin/lib/rewind/gauge.mjs';
import { sample } from './mark.mjs';

const ESC = '\u001b';
export const MIN_COLS = 64;
export const MAX_WIDTH = 120;
export const SUN_W = 18;
export const SUN_ROWS = 3;
// The moment a single print of a working card shows. No shooting star is in flight then.
export const STILL_T = 4;
const NEON = Object.freeze(['#ff2d95', '#b48cff', '#8be9fd']);
export const FAINT = '#30363d';
const SLIT = '#1a1030';

const LOOKS = {
  sunset: { sun: [['#ffd24a', '#fff0a0'], ['#ff8f3c', '#ffc15a'], ['#ff2d8a', '#ff6b8f']], sea: ['#ffdc73', '#ff9a4a', '#ff4f8b', '#b457d6', '#5a46a8'] },
  turn: { sun: [['#ffc95a', '#fff0b8'], ['#ffaf3c', '#ffd98a'], ['#e08a1e', '#ffb95a']], sea: ['#ffd98a', '#ffaf3c', '#e08a1e', '#9a6420', '#5a4020'] },
};
const RAINBOW = ['#ff6b6b', '#ffaf5f', '#ffff87', '#87ff9f', '#87d7ff', '#af87ff', '#ff87d7', '#ff6b6b'];

// Who sees the scene: truecolor, not a background the terminal says is light, and wide enough.
export function sceneOn({ depth, env = process.env, cols }) {
  const light = /;(7|15)$/.test(env.COLORFGBG ?? '');
  return depth === 'truecolor' && !light && cols >= MIN_COLS;
}

export const motionOff = (env = process.env) => /^(off|reduced|0)$/i.test(env.LITMUSE_MOTION ?? '');

const SGR = /\u001b\[[0-9;]*m/gu;
const charCells = (ch) => Math.max(displayWidth(ch), /\p{Emoji_Presentation}/u.test(ch) ? 2 : 0);

// A row cut into rows of at most `width` cells; the colour in force carries on. Control characters are dropped.
export function wrapRow(row, width) {
  const out = [];
  let text = '';
  let used = 0;
  let sgr = '';
  for (const [token] of row.matchAll(/\u001b\[[0-9;]*m|[^]/gu)) {
    if (token.startsWith(`${ESC}[`)) {
      sgr = token === `${ESC}[0m` ? '' : sgr + token;
      text += token;
      continue;
    }
    if (/\p{Cc}/u.test(token)) continue;
    const cells = charCells(token);
    if (used + cells > width) {
      out.push(sgr ? `${text}${ESC}[0m` : text);
      text = sgr;
      used = 0;
    }
    text += token;
    used += cells;
  }
  return [...out, text];
}

// Colours mix in eight kept steps, so a frame mixes nothing twice and neighbours merge.
const kept = new Map();
export function mix(a, b, k) {
  const step = Math.max(0, Math.min(8, Math.round(k * 8)));
  const key = a + b + step;
  if (kept.size > 4000) kept.clear();
  if (!kept.has(key)) kept.set(key, sample([a, b], step / 8));
  return kept.get(key);
}

const channel = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(';');
const codes = new Map();
const codeOf = ({ fg, bg, bold }) => {
  const key = `${fg ?? ''}|${bg ?? ''}${bold ? 'b' : ''}`;
  if (codes.size > 4000) codes.clear();
  if (!codes.has(key)) codes.set(key, [bold && '1', fg && `38;2;${channel(fg)}`, bg && `48;2;${channel(bg)}`].filter(Boolean).join(';'));
  return codes.get(key);
};

// Cells `{ ch, fg?, bg?, bold? }` as one string; a colour is written only where it changes.
export function ink(cells) {
  let out = '';
  let last = '';
  for (const cell of cells) {
    const code = cell ? codeOf(cell) : '';
    if (code !== last) out += `${ESC}[0${code ? `;${code}` : ''}m`;
    last = code;
    out += cell ? cell.ch : ' ';
  }
  return last ? `${out}${ESC}[0m` : out;
}

// The neon a place on the card takes, pink to violet to cyan.
export const neon = (k) => (k < 0.5 ? mix(NEON[0], NEON[1], k * 2) : mix(NEON[1], NEON[2], k * 2 - 1));

// The dome in eighth blocks, with a thin dark slit over the second row and a thicker one over the third.
const DOME = [0, 1, 2].map((r) => Array.from({ length: SUN_W }, (_, x) => {
  const d = (x - (SUN_W - 1) / 2) / (SUN_W / 2);
  const fill = Math.max(0, Math.min(8, Math.round(Math.sqrt(1 - d * d) * 24) - (2 - r) * 8));
  if (fill === 0) return null;
  if (fill < 8) return { ch: '▁▂▃▄▅▆▇'[fill - 1] };
  return r === 0 ? { ch: '█' } : { ch: r === 1 ? '▇' : '▆', bg: SLIT };
}));
// Stars as [row, cells from the sun's left edge].
const STARS = [[0, -30], [1, -24], [0, -18], [1, -13], [0, -9], [1, -5], [0, 22], [1, 25], [0, 29], [1, 32], [0, 35]];
const CLEAR = 3;

/**
 * Where the scene goes over rows of cells, where an empty cell is null: the lowest three rows in a run that leave the
 * sun room, as near its usual place as they allow. `top` is null when there is no room anywhere.
 */
export function place(grid, width) {
  const home = Math.round(width * 0.62);
  const free = (r, from, to) => {
    for (let x = from; x < to; x += 1) if (x < 0 || x >= width || grid[r][x]) return false;
    return true;
  };
  const spots = Array.from({ length: Math.max(0, width - SUN_W - 1) }, (_, i) => i).filter((at) => Math.abs(at - home) <= 14).sort((a, b) => Math.abs(a - home) - Math.abs(b - home));
  for (let top = grid.length - SUN_ROWS; top >= 0; top -= 1) {
    const at = spots.find((x) => [0, 1, 2].every((i) => free(top + i, x - 2, x + SUN_W + 2)));
    if (at !== undefined) return { grid, width, at, top, sea: top + 2 };
  }
  return { grid, width, at: home, top: null, sea: grid.length - 1 };
}

function seaCell(dx, s, stops) {
  const far = Math.abs(dx);
  const wave = Math.sin(far * 0.62 - s * 2.3) + 0.8 * Math.sin(dx * 0.31 + s * 1.1) + 0.6 * Math.sin(dx * 1.37 - s * 0.7);
  const level = wave * 0.62 + 1.05 - far / 34;
  if (level < 0.22) return null;
  const hue = Math.min(3.99, far / 13);
  const base = mix(stops[Math.floor(hue)], stops[Math.floor(hue) + 1], hue % 1);
  return { ch: level > 1 ? '~' : level > 0.55 ? '-' : '.', fg: mix(FAINT, base, Math.min(1, 0.18 + level * 0.55)), bold: level > 1.5 };
}

/**
 * The scene for one moment: a Map from row index to that row's cells, `width` long and holey, and holey wherever the
 * grid holds text. `look` is sunset, turn (amber) or rainbow; `dim` is the resting card's quieter light.
 */
export function paint(spot, { t = null, look = 'sunset', dim = false } = {}) {
  const { grid, width, at, top, sea } = spot;
  const out = new Map();
  if (top === null && (t === null || sea < 0)) return out;
  const s = t ?? 0;
  const shade = (hex) => (dim ? mix(hex, FAINT, 0.6) : hex);
  const turning = (k) => sample(RAINBOW, (((k + s / 4.8) % 1) + 1) % 1);
  const stops = look === 'rainbow' ? [0, 0.15, 0.3, 0.45, 0.6].map(turning) : LOOKS[look].sea;
  const row = (r) => {
    if (!out.has(r)) out.set(r, new Array(width).fill(null));
    return out.get(r);
  };
  const clear = (r, x) => {
    if (x < 0 || x >= width) return false;
    for (let d = -CLEAR + 1; d < CLEAR; d += 1) if (grid[r][x + d]) return false;
    return true;
  };
  const mid = at + SUN_W / 2 - 0.5;
  if (top !== null) {
    for (const [r, dx] of STARS) {
      const x = at + dx;
      if (!clear(top + r, x)) continue;
      const glow = 0.5 + 0.5 * Math.sin(s * 1.7 + dx * 2.1);
      row(top + r)[x] = { ch: glow > 0.85 ? '*' : glow > 0.45 ? '+' : '.', fg: mix(FAINT, shade(dx % 2 ? '#a99bff' : '#ff9ad5'), 0.35 + 0.65 * glow) };
    }
    const dash = t === null ? 9 : s % 9;
    if (dash < 1.1) {
      const head = Math.round(at + SUN_W + 22 - (dash / 1.1) * 34);
      ['*', '-', '-', '.'].forEach((ch, i) => {
        if (clear(top, head + i)) row(top)[head + i] = { ch, fg: mix('#fff4e0', '#b457d6', i / 3), bold: i === 0 };
      });
    }
  }
  for (let x = 0; x < width; x += 1) {
    const cell = clear(sea, x) ? seaCell(x - mid, s, stops) : null;
    if (cell) row(sea)[x] = { ...cell, fg: shade(cell.fg) };
  }
  if (top !== null) {
    DOME.forEach((line, r) => line.forEach((cell, x) => {
      if (!cell) return;
      const heat = t === null ? 0.25 : 0.5 + 0.5 * Math.sin(s * 2.1 + r * 1.5 + 0.55 * Math.sin(x * 0.8 + s * 1.6));
      const fg = look === 'rainbow' ? mix(turning(x / SUN_W / 2 + r * 0.12), '#ffffff', 0.3 + 0.25 * heat) : mix(...LOOKS[look].sun[r], heat);
      row(top + r)[at + x] = { ...cell, fg: shade(fg) };
    }));
  }
  return out;
}
