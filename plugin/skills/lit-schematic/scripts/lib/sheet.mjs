import { el, text, doc, comment } from './svg.mjs';
import { WEIGHTS, material } from './theme.mjs';

// Wide A3-tall sheet (mm): border frame with zone ticks, an equipment band on top,
// the drawing field, a legend panel on the right, and a title block along the bottom.
// Every drawn symbol leaves its QA comment behind; the look is new, the contract is not.
const SHEET_W = 470;
const SHEET_H = 297;
const FRAME = 6;
const BAND_TOP = 8;
const BAND_BOTTOM = 36;
const FIELD_TOP = 40;
const FIELD_BOTTOM = 245;
const FIELD_RIGHT = 306;
const LEGEND_X = 340;
const TITLE_TOP = 249;
const INK = '#111';

function route(points) {
  const path = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = path[path.length - 1];
    const [x, y] = points[i];
    if (px !== x && py !== y) path.push([x, py]);
    path.push([x, y]);
  }
  return path;
}

function poly(points) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

const KIND_NAMES = {
  tank: 'Tank',
  pump: 'Dosing pump',
  'valve.gate.hand': 'Gate valve',
  'valve.gate.pneumatic': 'Gate valve',
  'valve.gate.motor': 'Gate valve',
  'valve.ball.hand': 'Ball valve',
  'valve.globe.pneumatic': 'Globe valve',
  'valve.check.auto': 'Check valve',
  'filter.strainer': 'Filter',
  psv: 'Relief valve',
  orifice: 'Orifice',
  instrument: 'Field instr.',
  'instrument.dcs': 'DCS instr.',
  offpage: 'Off-page',
  drain: 'Drain',
  vent: 'Vent',
};

const kindName = (kind) => KIND_NAMES[kind] ?? String(kind).replace(/\./g, ' ');

// First-letter/shift meanings for the instrument identification table.
const VARIABLE_WORDS = { F: 'flow', L: 'level', P: 'pressure', T: 'temperature', E: 'voltage', S: 'speed' };
const FUNCTION_WORDS = { I: 'indicating', C: 'controlling', T: 'transmitting', A: 'alarm', S: 'switching', R: 'recording', V: 'valve' };

const instrumentMeaning = (tag) => {
  const letters = String(tag).split('-')[0] ?? '';
  const words = [];
  if (VARIABLE_WORDS[letters[0]]) words.push(VARIABLE_WORDS[letters[0]]);
  for (const ch of letters.slice(1)) {
    if (FUNCTION_WORDS[ch]) words.push(FUNCTION_WORDS[ch]);
  }
  return words.length ? words.join(' ') : 'instrument function';
};

export function createSheet(opts = {}) {
  const tb = {
    plant: opts.plant ?? 'PLANT', unit: opts.unit ?? 'UNIT',
    sheetNo: opts.sheetNo ?? '00-000', rev: opts.rev ?? '0',
    title: opts.title ?? `${opts.plant ?? 'PLANT'} ${opts.unit ?? 'UNIT'}`,
    subTitle: opts.subTitle ?? 'Piping and instrumentation diagram',
    drawingNo: opts.drawingNo ?? `${opts.plant ?? 'PLANT'}-${opts.sheetNo ?? '00-000'}`,
    project: opts.project ?? 'Worked example', owner: opts.owner ?? 'lit-schematic',
    drawn: opts.drawn ?? '-', date: opts.date ?? '2026-10-26', scale: opts.scale ?? 'NTS',
    sheet: opts.sheet ?? '1 of 1',
  };
  const shapes = [];
  const marks = [comment(`titleblock plant=${tb.plant} unit=${tb.unit} sheetNo=${tb.sheetNo} rev=${tb.rev}`)];
  const kinds = new Set();
  const lines = new Map();
  const equipment = [];
  const lineClasses = new Set();
  const notes = [];
  const instruments = new Map();

  const frame = () => {
    const out = [];
    out.push(el('rect', { x: FRAME, y: FRAME, width: SHEET_W - FRAME * 2, height: SHEET_H - FRAME * 2, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.process }));
    for (let i = 0; i < 8; i += 1) {
      const x = FRAME + ((SHEET_W - FRAME * 2) * (i + 0.5)) / 8;
      out.push(text(x, FRAME - 1, String(i + 1), { size: 6, anchor: 'middle' }));
      out.push(text(x, SHEET_H - FRAME + 5, String(i + 1), { size: 6, anchor: 'middle' }));
    }
    const rows = 'ABCDEF';
    for (let i = 0; i < 6; i += 1) {
      const y = FRAME + ((SHEET_H - FRAME * 2) * (i + 0.5)) / 6;
      out.push(text(FRAME - 2, y + 2, rows[i], { size: 6, anchor: 'middle' }));
      out.push(text(SHEET_W - FRAME + 2, y + 2, rows[i], { size: 6, anchor: 'middle' }));
    }
    out.push(el('line', { x1: FRAME, y1: BAND_BOTTOM, x2: SHEET_W - FRAME, y2: BAND_BOTTOM, stroke: INK, 'stroke-width': WEIGHTS.utility }));
    out.push(el('line', { x1: FRAME, y1: FIELD_TOP, x2: SHEET_W - FRAME, y2: FIELD_TOP, stroke: INK, 'stroke-width': WEIGHTS.utility }));
    return out.join('\n');
  };

  const band = () => {
    if (!equipment.length) return '';
    const out = [text(12, BAND_TOP + 6, 'EQUIPMENT', { size: 7 })];
    equipment.slice(0, 3).forEach(([tag, info], i) => {
      out.push(text(12, BAND_TOP + 14 + i * 6, tag, { size: 6 }));
      out.push(text(56, BAND_TOP + 14 + i * 6, info, { size: 6 }));
    });
    return out.join('\n');
  };

  const titleBlock = () => {
    const out = [];
    out.push(el('line', { x1: FRAME, y1: TITLE_TOP, x2: SHEET_W - FRAME, y2: TITLE_TOP, stroke: INK, 'stroke-width': WEIGHTS.process }));
    for (const x of [150, 320]) out.push(el('line', { x1: x, y1: TITLE_TOP, x2: x, y2: SHEET_H - FRAME, stroke: INK, 'stroke-width': WEIGHTS.utility }));
    out.push(text(10, TITLE_TOP + 8, 'NOTES', { size: 7 }));
    notes.slice(0, 4).forEach((note, i) => {
      out.push(text(10, TITLE_TOP + 18 + i * 7, `${i + 1}. ${note}`, { size: 6 }));
    });
    out.push(text(154, TITLE_TOP + 8, 'TITLE', { size: 6 }));
    out.push(text(154, TITLE_TOP + 20, tb.title, { size: 10 }));
    out.push(text(154, TITLE_TOP + 29, tb.subTitle, { size: 7 }));
    out.push(text(154, TITLE_TOP + 38, `PROJECT ${tb.project}   OWNER ${tb.owner}`, { size: 6 }));
    out.push(text(324, TITLE_TOP + 8, 'DRAWING NO.', { size: 6 }));
    out.push(text(324, TITLE_TOP + 18, tb.drawingNo, { size: 8 }));
    out.push(text(324, TITLE_TOP + 28, `REV ${tb.rev}   SHEET ${tb.sheet}`, { size: 6 }));
    out.push(text(324, TITLE_TOP + 38, `DATE ${tb.date}   SCALE ${tb.scale}`, { size: 6 }));
    return out.join('\n');
  };

  // Glyph thumbnails for the legend panel, drawn small at (x, y).
  const thumb = (kind, x, y) => {
    const s = [];
    if (kind === 'tank') {
      s.push(el('rect', { x: x - 6, y: y - 6, width: 12, height: 12, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      s.push(el('path', { d: `M ${x - 6} ${y - 6} L ${x + 6} ${y - 6} L ${x} ${y - 10} Z`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind === 'pump') {
      s.push(el('circle', { cx: x, cy: y, r: 6, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      s.push(el('path', { d: `M ${x - 3} ${y - 3} L ${x - 3} ${y + 3} L ${x + 3} ${y} Z`, fill: INK }));
    } else if (kind.startsWith('valve.check')) {
      s.push(el('path', { d: `M ${x - 5} ${y - 4} L ${x + 3} ${y} L ${x - 5} ${y + 4} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      s.push(el('line', { x1: x + 3, y1: y - 4, x2: x + 3, y2: y + 4, stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind.startsWith('valve')) {
      s.push(el('path', { d: `M ${x - 5} ${y - 4} L ${x} ${y} L ${x - 5} ${y + 4} M ${x + 5} ${y - 4} L ${x} ${y} L ${x + 5} ${y + 4}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      if (kind.includes('globe')) s.push(el('circle', { cx: x, cy: y, r: 2, fill: INK }));
    } else if (kind.startsWith('filter')) {
      s.push(el('path', { d: `M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind === 'psv') {
      s.push(el('path', { d: `M ${x - 4} ${y + 6} L ${x - 4} ${y - 2} L ${x - 1} ${y} L ${x + 2} ${y - 4} L ${x + 5} ${y} L ${x + 5} ${y - 6} L ${x + 9} ${y - 2}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind === 'orifice') {
      s.push(el('line', { x1: x - 4, y1: y - 4, x2: x + 4, y2: y - 4, stroke: INK, 'stroke-width': WEIGHTS.process }));
      s.push(el('line', { x1: x - 2, y1: y - 5, x2: x - 2, y2: y + 5, stroke: INK, 'stroke-width': WEIGHTS.process }));
      s.push(el('line', { x1: x + 2, y1: y - 5, x2: x + 2, y2: y + 5, stroke: INK, 'stroke-width': WEIGHTS.process }));
    } else if (kind === 'instrument.dcs') {
      s.push(el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      s.push(el('line', { x1: x - 5, y1: y, x2: x + 5, y2: y, stroke: INK, 'stroke-width': WEIGHTS.signal }));
    } else if (kind === 'instrument') {
      s.push(el('circle', { cx: x, cy: y, r: 5, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind === 'offpage') {
      s.push(el('path', { d: `M ${x - 7} ${y - 4} L ${x + 3} ${y - 4} L ${x + 7} ${y} L ${x + 3} ${y + 4} L ${x - 7} ${y + 4} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind === 'drain') {
      s.push(el('path', { d: `M ${x - 4} ${y - 4} L ${x + 4} ${y - 4} L ${x} ${y + 4} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else if (kind === 'vent') {
      s.push(el('path', { d: `M ${x - 4} ${y + 4} L ${x - 4} ${y} A 4 4 0 0 1 ${x + 4} ${y} L ${x + 4} ${y + 4}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    } else {
      s.push(el('rect', { x: x - 5, y: y - 4, width: 10, height: 8, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    }
    return s.join('\n');
  };

  const legendPanel = () => {
    const out = [el('line', { x1: LEGEND_X - 2, y1: FIELD_TOP, x2: LEGEND_X - 2, y2: TITLE_TOP, stroke: INK, 'stroke-width': WEIGHTS.utility })];
    out.push(text(LEGEND_X, FIELD_TOP + 8, 'LEGEND', { size: 8 }));
    let y = FIELD_TOP + 22;
    // Two columns of 64: the widest thumbnail (relief zigzag, off-page hexagon)
    // ends 12 past its origin, so labels start at +15 and the longest name still
    // clears the next column's thumbnails.
    for (const [index, kind] of [...kinds].sort().entries()) {
      const col = index < Math.ceil([...kinds].length / 2) ? 0 : 1;
      const yy = y + (index % Math.ceil([...kinds].length / 2)) * 11;
      const xx = LEGEND_X + col * 64;
      out.push(thumb(kind, xx + 3, yy - 2));
      out.push(text(xx + 15, yy, kindName(kind), { size: 6 }));
    }
    y += Math.ceil([...kinds].length / 2) * 11 + 6;
    const lineSample = (yy, weight, dash, name) => {
      out.push(el('line', { x1: LEGEND_X, y1: yy - 2, x2: LEGEND_X + 14, y2: yy - 2, stroke: INK, 'stroke-width': weight, ...(dash ? { 'stroke-dasharray': dash } : {}) }));
      out.push(text(LEGEND_X + 18, yy, name, { size: 6 }));
    };
    for (const [cls, weight, dash, name] of [['process', WEIGHTS.process, null, 'Main process line'], ['utility', WEIGHTS.utility, null, 'Utility line'], ['signal', WEIGHTS.signal, '6,2,1,2', 'Electric signal']]) {
      if (!lineClasses.has(cls)) continue;
      lineSample(y, weight, dash, name);
      y += 12;
    }
    y += 6;
    if (instruments.size) {
      out.push(text(LEGEND_X, y + 2, 'INSTRUMENT', { size: 7 }));
      y += 12;
      for (const [letters, tag] of instruments) {
        out.push(text(LEGEND_X, y, letters, { size: 6 }));
        out.push(text(LEGEND_X + 20, y, instrumentMeaning(tag), { size: 6 }));
        y += 8;
      }
    }
    return out.join('\n');
  };

  const labelAt = (pts, number, at = 0.5) => {
    let best = null;
    for (let i = 1; i < pts.length; i += 1) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (!best || len > best.len) best = { x1, y1, x2, y2, len };
    }
    if (!best || best.len < 12) return '';
    const x = best.x1 + (best.x2 - best.x1) * at;
    const y = best.y1 + (best.y2 - best.y1) * at;
    const vertical = best.x1 === best.x2;
    return vertical
      ? el('text', { x: x + 5, y, 'font-size': 6, 'font-family': 'Arial, sans-serif', fill: INK, transform: `rotate(-90 ${x + 5} ${y})`, 'data-clear': 'true' }, number)
      : text(x, y - 4, number, { size: 6, anchor: 'middle' });
  };

  const api = {
    add(kind, id, x, y, label) {
      kinds.add(kind);
      marks.push(comment(`symbol kind=${kind} id=${id}`));
      if (kind === 'tank') return api.tank(id, x, y);
      if (kind === 'pump') return api.pump(id, x, y);
      shapes.push(el('rect', { x: x - 6, y: y - 4, width: 12, height: 8, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(text(x, y + 14, label ?? id, { size: 7 }));
      return id;
    },
    tank(tag, x, y) {
      kinds.add('tank');
      marks.push(comment(`symbol kind=tank id=${tag}`));
      shapes.push(el('path', { d: `M ${x - 22} ${y - 26} L ${x + 22} ${y - 26} L ${x} ${y - 40} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('rect', { x: x - 22, y: y - 26, width: 44, height: 52, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('rect', { x: x - 3, y: y - 46, width: 6, height: 6, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      shapes.push(el('rect', { x: x - 3, y: y + 26, width: 6, height: 6, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      shapes.push(text(x + 10, y + 40, tag, { size: 7 }));
      return tag;
    },
    pump(tag, x, y, side = 'below') {
      kinds.add('pump');
      marks.push(comment(`symbol kind=pump id=${tag}`));
      shapes.push(el('circle', { cx: x, cy: y, r: 10, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('path', { d: `M ${x - 5} ${y - 6} L ${x - 5} ${y + 6} L ${x + 6} ${y} Z`, fill: INK }));
      shapes.push(el('rect', { x: x - 12, y: y + 10, width: 24, height: 4, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      // A vertical drop through the tag reads as a strike-through, so a stacked
      // pump takes its tag beside the circle, a row below center so it also clears
      // the suction-header labels; below stays the default elsewhere.
      if (side === 'left') shapes.push(text(x - 14, y + 10, tag, { size: 7, anchor: 'end' }));
      else if (side === 'right') shapes.push(text(x + 14, y + 10, tag, { size: 7, anchor: 'start' }));
      else shapes.push(text(x, y + 26, tag, { size: 7, anchor: 'middle' }));
      return tag;
    },
    strainer(id, x, y) {
      kinds.add('filter.strainer');
      marks.push(comment(`symbol kind=filter.strainer id=${id}`));
      shapes.push(el('path', { d: `M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(text(x, y + 18, id, { size: 7, anchor: 'middle' }));
      return id;
    },
    psv(tag, x, y, set) {
      kinds.add('psv');
      marks.push(comment(`symbol kind=psv id=${tag}`));
      shapes.push(el('line', { x1: x, y1: y + 10, x2: x, y2: y - 4, stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('path', { d: `M ${x} ${y - 4} L ${x + 3} ${y - 1} L ${x - 3} ${y + 2} L ${x + 3} ${y + 5} L ${x - 3} ${y + 8}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      shapes.push(el('path', { d: `M ${x} ${y - 4} L ${x + 12} ${y - 4} L ${x + 12} ${y + 2} L ${x} ${y + 2}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(text(x + 14, y - 2, tag, { size: 6 }));
      if (set) shapes.push(text(x + 14, y + 6, set, { size: 6 }));
      return tag;
    },
    orifice(id, x, y) {
      kinds.add('orifice');
      marks.push(comment(`symbol kind=orifice id=${id}`));
      shapes.push(el('line', { x1: x, y1: y - 9, x2: x, y2: y - 5, stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('line', { x1: x, y1: y + 5, x2: x, y2: y + 9, stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('line', { x1: x - 2, y1: y - 5, x2: x - 2, y2: y + 5, stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(el('line', { x1: x + 2, y1: y - 5, x2: x + 2, y2: y + 5, stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(text(x + 5, y + 2, id, { size: 6 }));
      return id;
    },
    instrument(tag, x, y, opts2 = {}) {
      const dcs = opts2.dcs === true;
      const kind = dcs ? 'instrument.dcs' : 'instrument';
      kinds.add(kind);
      marks.push(comment(`symbol kind=${kind} id=${tag}`));
      marks.push(comment(`tag ${tag}`));
      const letters = String(tag).split('-')[0] ?? '';
      const number = String(tag).split('-').slice(1).join('-');
      if (!instruments.has(letters)) instruments.set(letters, tag);
      const r = Math.max(9, 3.4 * Math.max(letters.length, number.length) + 3);
      if (dcs) {
        shapes.push(el('rect', { x: x - r, y: y - r, width: r * 2, height: r * 2, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
        shapes.push(el('line', { x1: x - r, y1: y, x2: x + r, y2: y, stroke: INK, 'stroke-width': WEIGHTS.signal }));
      } else {
        shapes.push(el('circle', { cx: x, cy: y, r, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      }
      shapes.push(text(x, y - 1, letters, { size: 6, anchor: 'middle' }));
      shapes.push(text(x, y + 7, number, { size: 6, anchor: 'middle' }));
      // A signal leaving the bubble at mid-height would strike a right-side tag,
      // and a side tag can hit the next symbol; below or left keep it clear.
      const place = opts2.tag ?? 'right';
      if (place === 'below') shapes.push(text(x, y + r + 9, tag, { size: 6, anchor: 'middle' }));
      else if (place === 'left') shapes.push(text(x - r - 3, y + 2, tag, { size: 6, anchor: 'end' }));
      else shapes.push(text(x + r + 3, y + 2, tag, { size: 6 }));
      return tag;
    },
    offpage(label, x, y, dir = 'out', w = 22) {
      kinds.add('offpage');
      marks.push(comment(`symbol kind=offpage id=${label}`));
      // The connector always fits its text: a long destination name widens the box
      // instead of overflowing into the legend. Estimate 3.7 units per character at
      // 6 pt plus padding; an explicit wider box is kept.
      w = Math.max(w, Math.ceil(String(label).length * 3.7) + 8);
      const d = dir === 'in'
        ? `M ${x + w} ${y - 6} L ${x + 6} ${y - 6} L ${x} ${y} L ${x + 6} ${y + 6} L ${x + w} ${y + 6} Z`
        : `M ${x} ${y - 6} L ${x + w - 6} ${y - 6} L ${x + w} ${y} L ${x + w - 6} ${y + 6} L ${x} ${y + 6} Z`;
      shapes.push(el('path', { d, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.process }));
      shapes.push(text(w > 30 ? x + w / 2 : dir === 'in' ? x + 11 : x + 2, y + 2, label, { size: 6, anchor: w > 30 || dir === 'in' ? 'middle' : 'start' }));
      return label;
    },
    drain(x, y) {
      kinds.add('drain');
      marks.push(comment('symbol kind=drain id=DR'));
      shapes.push(el('line', { x1: x, y1: y, x2: x, y2: y + 5, stroke: INK, 'stroke-width': WEIGHTS.utility }));
      shapes.push(el('path', { d: `M ${x - 4} ${y + 5} L ${x + 4} ${y + 5} L ${x} ${y + 11} Z`, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      shapes.push(text(x + 6, y + 11, 'DR', { size: 6 }));
      return 'DR';
    },
    vent(x, y) {
      kinds.add('vent');
      marks.push(comment('symbol kind=vent id=ATM'));
      shapes.push(el('path', { d: `M ${x} ${y} L ${x} ${y - 8} A 5 5 0 0 1 ${x + 10} ${y - 8} L ${x + 10} ${y - 2}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      // The label sits left of the vent pipe so it never touches the arc.
      shapes.push(text(x - 5, y - 1, 'ATM', { size: 6, anchor: 'end' }));
      return 'ATM';
    },
    pipe(points, opts2 = {}) {
      const id = `L${lines.size + 1}`;
      const cls = opts2.cls ?? 'process';
      marks.push(comment(`line class=${cls} w=${WEIGHTS[cls]}`));
      lineClasses.add(cls);
      if (opts2.number) marks.push(comment(`linenumber line=${opts2.number}`));
      const routed = route(points);
      shapes.push(el('polyline', { points: poly(routed), fill: 'none', stroke: INK, 'stroke-width': WEIGHTS[cls] }));
      if (opts2.number) {
        const label = labelAt(routed, opts2.number, opts2.at ?? 0.5);
        if (label) shapes.push(label);
      }
      lines.set(id, points);
      return id;
    },
    signal(points, kind = 'electric') {
      const id = `S${lines.size + 1}`;
      lineClasses.add('signal');
      marks.push(comment(`line class=signal w=${WEIGHTS.signal} kind=${kind}`));
      shapes.push(el('polyline', {
        points: poly(route(points)), fill: 'none', stroke: INK,
        'stroke-width': WEIGHTS.signal, 'stroke-dasharray': kind === 'pneumatic' ? '3,1' : '6,2,1,2',
      }));
      lines.set(id, points);
      return id;
    },
    inline(lineId, kind, id, at = 0.5) {
      const pts = lines.get(lineId) ?? [[0, 0], [10, 0]];
      const [x1, y1] = pts[0];
      const [x2, y2] = pts[pts.length - 1];
      return api.add(kind, id, x1 + (x2 - x1) * at, y1 + (y2 - y1) * at, id);
    },
    valve(body, actuator, id, x, y, fail = 'FC', orient = 'h') {
      kinds.add(`valve.${body}.${actuator}`);
      marks.push(comment(`symbol kind=valve.${body}.${actuator} id=${id} fail=${fail}`));
      const v = orient === 'v';
      const bow = v
        ? `M ${x - 4} ${y - 5} L ${x} ${y} L ${x + 4} ${y - 5} M ${x - 4} ${y + 5} L ${x} ${y} L ${x + 4} ${y + 5}`
        : `M ${x - 5} ${y - 4} L ${x} ${y} L ${x - 5} ${y + 4} M ${x + 5} ${y - 4} L ${x} ${y} L ${x + 5} ${y + 4}`;
      if (body === 'check') {
        shapes.push(el('path', { d: v ? `M ${x - 4} ${y - 5} L ${x} ${y + 2} L ${x + 4} ${y - 5}` : `M ${x - 5} ${y - 4} L ${x + 2} ${y} L ${x - 5} ${y + 4}`, fill: INK }));
        shapes.push(el('line', v
          ? { x1: x - 4, y1: y - 5, x2: x + 4, y2: y - 5, stroke: INK, 'stroke-width': WEIGHTS.process }
          : { x1: x + 2, y1: y - 4, x2: x + 2, y2: y + 4, stroke: INK, 'stroke-width': WEIGHTS.process }));
      } else {
        shapes.push(el('path', { d: bow, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.process }));
        // The globe reads apart from the gate by its filled seat dot, drawn large
        // enough to survive at print scale; the gate stays an open bow-tie.
        if (body === 'globe') shapes.push(el('circle', { cx: x, cy: y, r: 2.6, fill: INK }));
        if (body === 'ball') shapes.push(el('circle', { cx: x, cy: y, r: 1.6, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
      }
      if (body !== 'check') {
        if (actuator === 'hand') {
          shapes.push(el('line', v ? { x1: x, y1: y, x2: x + 8, y2: y, stroke: INK, 'stroke-width': WEIGHTS.utility } : { x1: x, y1: y, x2: x, y2: y - 9, stroke: INK, 'stroke-width': WEIGHTS.utility }));
          shapes.push(el('line', v ? { x1: x + 8, y1: y - 3, x2: x + 8, y2: y + 3, stroke: INK, 'stroke-width': WEIGHTS.utility } : { x1: x - 4, y1: y - 9, x2: x + 4, y2: y - 9, stroke: INK, 'stroke-width': WEIGHTS.utility }));
        } else if (actuator === 'pneumatic') {
          shapes.push(el('path', { d: v ? `M ${x} ${y} L ${x + 8} ${y} M ${x + 4} ${y} A 4 4 0 0 1 ${x + 12} ${y}` : `M ${x} ${y} L ${x} ${y - 6} M ${x - 4} ${y - 6} A 4 4 0 0 1 ${x + 4} ${y - 6}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
        } else if (actuator === 'motor') {
          shapes.push(el('circle', { cx: v ? x + 9 : x, cy: v ? y : y - 10, r: 3.4, fill: '#fff', stroke: INK, 'stroke-width': WEIGHTS.utility }));
          shapes.push(text(v ? x + 9 : x, (v ? y : y - 10) + 2, 'M', { size: 6, anchor: 'middle' }));
        }
      }
      if (body !== 'check' || fail !== 'FC') shapes.push(text(x + 8, y - 6, fail, { size: 6 }));
      shapes.push(text(v ? x : x - 6, y + (v ? 16 : 14), id, { size: 7, anchor: 'middle' }));
      return id;
    },
    arrow(x, y, clear = true) {
      marks.push(comment(`arrow at=${x},${y} clear=${clear ? 'true' : 'false'}`));
      shapes.push(el('path', { d: `M ${x - 4} ${y - 2} L ${x} ${y} L ${x - 4} ${y + 2}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.process }));
    },
    hop(x, y, r = 1.5) {
      marks.push(comment(`hop r=${r}`));
      shapes.push(el('path', { d: `M ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y}`, fill: 'none', stroke: INK, 'stroke-width': WEIGHTS.utility }));
    },
    callout(partText, x, y, spacing = 1.4) {
      marks.push(comment(`leader spacing=${spacing} part=${partText}`));
      shapes.push(el('circle', { cx: x, cy: y, r: 0.9, fill: INK }));
      shapes.push(text(x + 4, y + 2, partText, { size: 6 }));
    },
    equipmentInfo(tag, info) {
      equipment.push([tag, info]);
      return tag;
    },
    notes(list) {
      for (const item of list ?? []) notes.push(String(item));
      return notes.length;
    },
    legend() {
      for (const kind of [...kinds].sort()) marks.push(comment(`legend kind=${kind}`));
      return kinds.size;
    },
    toSVG() {
      return doc({ width: SHEET_W, height: SHEET_H, title: `${tb.plant} ${tb.unit} ${tb.sheetNo}` }, `${marks.join('\n')}\n${frame()}\n${band()}\n${shapes.join('\n')}\n${legendPanel()}\n${titleBlock()}`);
    },
  };
  return api;
}

export { material };
