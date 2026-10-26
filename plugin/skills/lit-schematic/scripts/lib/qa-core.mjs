import { ALLOWED_WIDTHS } from './theme.mjs';
import { validateTag, parseLineNumber } from './isa.mjs';

function comments(svg, prefix) {
  const out = [];
  const re = new RegExp(`<!--\\s*${prefix}[:\\s]([^>]*)-->`, 'g');
  let m;
  while ((m = re.exec(svg)) !== null) out.push(m[1].trim());
  return out;
}

function kv(s) {
  const o = {};
  for (const part of s.split(/\s+/)) {
    const i = part.indexOf('=');
    if (i > 0) o[part.slice(0, i)] = part.slice(i + 1);
  }
  return o;
}

export const CODES = [
  'TITLEBLOCK.FIELDS', 'LEGEND.COVERAGE', 'TAG.ORDER', 'LINE.NUMBER',
  'LINE.WEIGHT', 'LINE.ARROW_IN_SYMBOL', 'LINE.BEND_ON_LINE', 'LEADER.SPACING',
  'LABEL.CLEARANCE',
];

// ---- LABEL.CLEARANCE geometry: no label sits on another label or a line ----
// Per-glyph advances as fractions of an em (Arial-like): caps and digits run
// wide, lowercase narrow. A flat average would acquit real collisions and
// convict tight-but-clean rows like the title against its divider.
const GLYPH_W = {
  A: 0.72, B: 0.72, C: 0.72, D: 0.72, E: 0.67, F: 0.61, G: 0.78, H: 0.72, I: 0.28,
  J: 0.5, K: 0.72, L: 0.61, M: 0.83, N: 0.72, O: 0.78, P: 0.67, Q: 0.78, R: 0.72,
  S: 0.67, T: 0.61, U: 0.72, V: 0.67, W: 0.94, X: 0.67, Y: 0.67, Z: 0.61,
  a: 0.55, b: 0.55, c: 0.5, d: 0.55, e: 0.55, f: 0.28, g: 0.55, h: 0.55, i: 0.22,
  j: 0.28, k: 0.5, l: 0.22, m: 0.83, n: 0.55, o: 0.55, p: 0.55, q: 0.55, r: 0.33,
  s: 0.5, t: 0.28, u: 0.55, v: 0.5, w: 0.72, x: 0.5, y: 0.5, z: 0.5,
  ' ': 0.28, '-': 0.33, '.': 0.28, '/': 0.28,
};
const CAP_H = 0.72; // cap height above the baseline, in em
const DESC_H = 0.21; // descender depth below the baseline, in em
const INSET = 0.5; // shrink each label box this far: grazes pass, strikes fail

function decodeEntities(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function textWidth(content, size) {
  let em = 0;
  for (const ch of content) em += GLYPH_W[ch] ?? 0.6;
  return em * size;
}

// Every <text> as an axis-aligned box. Rotated (-90) line numbers read
// bottom-to-top, so their advance runs up the page and their cap height left.
function textBoxes(svg) {
  const boxes = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1];
    const content = decodeEntities(m[2]);
    if (!content) continue;
    const num = (name, fallback) => {
      const hit = attrs.match(new RegExp(`${name}="([\\d.]+)"`));
      return hit ? Number(hit[1]) : fallback;
    };
    const x = num('x', 0);
    const y = num('y', 0);
    const size = num('font-size', 7);
    const anchor = (attrs.match(/text-anchor="(\w+)"/) ?? [])[1] ?? 'start';
    const w = textWidth(content, size);
    const desc = /[gjpqyQJ]/.test(content) ? DESC_H * size : 0;
    const rot = attrs.match(/rotate\(-90\s+([\d.]+)\s+([\d.]+)\)/);
    if (rot) {
      const xx = Number(rot[1]);
      boxes.push({ x0: xx - CAP_H * size, x1: xx + desc, y0: y - w, y1: y, label: content });
    } else {
      const top = y - CAP_H * size;
      const bottom = y + desc;
      if (anchor === 'middle') boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: top, y1: bottom, label: content });
      else if (anchor === 'end') boxes.push({ x0: x - w, x1: x, y0: top, y1: bottom, label: content });
      else boxes.push({ x0: x, x1: x + w, y0: top, y1: bottom, label: content });
    }
  }
  return boxes;
}

function shrink(box) {
  return { x0: box.x0 + INSET, x1: box.x1 - INSET, y0: box.y0 + INSET, y1: box.y1 - INSET, label: box.label };
}

function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// Line, polyline and path segments as centerlines. Curves contribute only
// their endpoints (rects and circles are checked by their edges, not needed
// here): clearance is about labels struck by straight runs.
function lineSegments(svg) {
  const segs = [];
  const push = (x1, y1, x2, y2) => {
    if (Number.isFinite(x1 + y1 + x2 + y2) && (x1 !== x2 || y1 !== y2)) segs.push([x1, y1, x2, y2]);
  };
  for (const m of svg.matchAll(/<line\b[^>]*x1="([\d.]+)"[^>]*y1="([\d.]+)"[^>]*x2="([\d.]+)"[^>]*y2="([\d.]+)"[^>]*\/>/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]));
  }
  for (const m of svg.matchAll(/<polyline\b[^>]*points="([^"]+)"[^>]*\/>/g)) {
    const pts = m[1].trim().split(/\s+/).map((p) => p.split(',').map(Number));
    for (let i = 1; i < pts.length; i++) push(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  for (const m of svg.matchAll(/<path\b[^>]*d="([^"]+)"[^>]*\/>/g)) {
    const toks = m[1].match(/[MLHVZACSTQmlhvzcqsta]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let i = 0;
    const take = () => [Number(toks[i++]), Number(toks[i++])];
    // The engine emits absolute commands only; anything else is skipped.
    while (i < toks.length) {
      const cmd = toks[i++];
      if (!/[MLHVZACSTQ]/.test(cmd)) continue;
      if (cmd === 'M') {
        [cx, cy] = take();
        [sx, sy] = [cx, cy];
      } else if (cmd === 'L') {
        const [x, y] = take();
        push(cx, cy, x, y);
        [cx, cy] = [x, y];
      } else if (cmd === 'H') {
        const x = Number(toks[i++]);
        push(cx, cy, x, cy);
        cx = x;
      } else if (cmd === 'V') {
        const y = Number(toks[i++]);
        push(cx, cy, cx, y);
        cy = y;
      } else if (cmd === 'Z') {
        push(cx, cy, sx, sy);
        [cx, cy] = [sx, sy];
      } else if (/[ACSTQ]/i.test(cmd)) {
        // Curves and arcs: only the endpoint matters for clearance.
        const count = /A/i.test(cmd) ? 7 : /C/i.test(cmd) ? 6 : 4;
        const nums = [];
        for (let k = 0; k < count && i < toks.length; k++) nums.push(Number(toks[i++]));
        if (nums.length >= 2) [cx, cy] = nums.slice(-2);
      }
    }
  }
  for (const m of svg.matchAll(/<rect\b[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*\/>/g)) {
    const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    push(x, y, x + w, y);
    push(x + w, y, x + w, y + h);
    push(x + w, y + h, x, y + h);
    push(x, y + h, x, y);
  }
  return segs;
}

function segHitsBox(x1, y1, x2, y2, box) {
  if (x1 >= box.x0 && x1 <= box.x1 && y1 >= box.y0 && y1 <= box.y1) return true;
  if (x2 >= box.x0 && x2 <= box.x1 && y2 >= box.y0 && y2 <= box.y1) return true;
  const edges = [
    [box.x0, box.y0, box.x1, box.y0],
    [box.x1, box.y0, box.x1, box.y1],
    [box.x1, box.y1, box.x0, box.y1],
    [box.x0, box.y1, box.x0, box.y0],
  ];
  for (const [x3, y3, x4, y4] of edges) {
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (!d) continue;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    if (t > 0 && t < 1 && u > 0 && u < 1) return true;
  }
  return false;
}

export function runQA(svg) {
  const fails = [];
  const tb = comments(svg, 'titleblock').map(kv)[0] ?? {};
  for (const f of ['plant', 'unit', 'sheetNo', 'rev']) {
    if (!tb[f]) fails.push({ code: 'TITLEBLOCK.FIELDS', msg: `title block lacks ${f}` });
  }
  const symbols = new Set(comments(svg, 'symbol').map((c) => kv(c).kind).filter(Boolean));
  const legend = new Set(comments(svg, 'legend').map((c) => kv(c).kind).filter(Boolean));
  for (const kind of symbols) {
    if (!legend.has(kind)) fails.push({ code: 'LEGEND.COVERAGE', msg: `drawn symbol ${kind} lacks a legend row` });
  }
  for (const c of comments(svg, 'tag')) {
    const r = validateTag(kv(c).tag ?? c);
    if (!r.ok) fails.push({ code: 'TAG.ORDER', msg: r.reason });
  }
  for (const c of comments(svg, 'linenumber')) {
    const r = parseLineNumber(kv(c).line ?? c);
    if (!r.ok) fails.push({ code: 'LINE.NUMBER', msg: r.reason });
  }
  for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) {
    if (!ALLOWED_WIDTHS.has(Number(m[1]))) {
      fails.push({ code: 'LINE.WEIGHT', msg: `stroke width ${m[1]} sits outside 0.7/0.5/0.35/0.18` });
      break;
    }
  }
  for (const m of svg.matchAll(/font-size="([\d.]+)"/g)) {
    if (Number(m[1]) < 6) {
      fails.push({ code: 'LABEL.CLEARANCE', msg: `type size ${m[1]} drops below the 6 pt floor` });
      break;
    }
  }
  for (const c of comments(svg, 'arrow')) {
    if (kv(c).clear !== 'true') fails.push({ code: 'LINE.ARROW_IN_SYMBOL', msg: `arrow at ${c} sits inside a symbol span` });
  }
  for (const c of comments(svg, 'hop')) {
    if (Number(kv(c).r ?? 99) > 2) fails.push({ code: 'LINE.BEND_ON_LINE', msg: `hop radius ${kv(c).r} reads as a bend` });
  }
  for (const c of comments(svg, 'leader')) {
    if (Number(kv(c).spacing ?? 0) < 1.2) {
      fails.push({ code: 'LEADER.SPACING', msg: `leader spacing ${kv(c).spacing} falls below 1.2 mm` });
    }
  }
  // No label sits on another label (legend rows, side tags) or on a line
  // (a tag struck by its own signal, text overflowing its off-page box).
  // P&ID sheets only: journal figures compose overlaid state panels by design,
  // so their shared-region labels are out of this rule's reach.
  const tbPlant = (comments(svg, 'titleblock').map(kv)[0] ?? {}).plant;
  const labels = tbPlant === 'FIGURE' ? [] : textBoxes(svg).map(shrink);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (overlaps(labels[i], labels[j])) {
        fails.push({ code: 'LABEL.CLEARANCE', msg: `labels collide: “${labels[i].label}” on “${labels[j].label}”` });
      }
    }
  }
  if (!fails.some((f) => f.code === 'LABEL.CLEARANCE')) {
    const runs = lineSegments(svg);
    for (const box of labels) {
      const hit = runs.find(([x1, y1, x2, y2]) => segHitsBox(x1, y1, x2, y2, box));
      if (hit) fails.push({ code: 'LABEL.CLEARANCE', msg: `“${box.label}” sits on a line` });
    }
  }
  return { pass: fails.length === 0, fails };
}
