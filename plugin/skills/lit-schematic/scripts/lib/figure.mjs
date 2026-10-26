import { el, text, doc, comment } from './svg.mjs';
import { STREAMS } from './theme.mjs';

export function createFigure(opts = {}) {
  const width = opts.width ?? 85;
  const marks = [comment(`titleblock plant=FIGURE unit=JOURNAL sheetNo=${width}MM rev=0`)];
  const shapes = [];
  const kinds = new Set(['panel', 'stream', 'key']);
  const api = {
    canvas(label = 'a') {
      kinds.add('panel');
      marks.push(comment('symbol kind=panel id=' + label));
      const g = [];
      return {
        stream(role, x1, y1, x2, y2) {
          const color = STREAMS[role.length % STREAMS.length];
          marks.push(comment(`line class=signal w=0.35 kind=stream role=${role}`));
          kinds.add('stream');
          g.push(el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 0.35 }));
          g.push(text((x1 + x2) / 2, (y1 + y2) / 2 - 2, role, { size: 6, fill: color }));
        },
        box(x, y, w, h, labelText) {
          kinds.add('cell');
          marks.push(comment(`symbol kind=cell id=${labelText}`));
          g.push(el('rect', { x, y, width: w, height: h, fill: '#fff', stroke: '#111', 'stroke-width': 0.5 }));
          g.push(text(x + 2, y + 8, labelText, { size: 6 }));
        },
        label(s, x, y) {
          g.push(text(x, y, s, { size: 7 }));
        },
        commit() {
          shapes.push(el('g', { id: `panel-${label}` }, `\n${g.join('\n')}\n`));
        },
      };
    },
    key(roles, x, y) {
      kinds.add('key');
      roles.forEach((r, i) => {
        shapes.push(el('line', { x1: x, y1: y + i * 8, x2: x + 10, y2: y + i * 8, stroke: STREAMS[i % STREAMS.length], 'stroke-width': 0.35 }));
        shapes.push(text(x + 13, y + i * 8 + 2, r, { size: 6 }));
      });
    },
    toSVG() {
      for (const kind of [...kinds].sort()) marks.push(comment(`legend kind=${kind}`));
      return doc({ width, height: Math.round(width * 0.7), title: 'journal figure' }, `${marks.join('\n')}\n${shapes.join('\n')}`);
    },
  };
  return api;
}
