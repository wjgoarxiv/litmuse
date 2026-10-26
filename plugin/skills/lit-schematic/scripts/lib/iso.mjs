import { el, text, doc, comment } from './svg.mjs';
import { material } from './theme.mjs';

const C = Math.cos(Math.PI / 6);
const S = Math.sin(Math.PI / 6);

export function iso(x, y, z) {
  return [(x - y) * C, (x + y) * S - z];
}

export function createIsoView(opts = {}) {
  const marks = [comment(`titleblock plant=${opts.plant ?? 'SHOP'} unit=ISO sheetNo=${opts.sheetNo ?? 'ISO-001'} rev=0`)];
  const shapes = [];
  const kinds = new Set();
  const api = {
    box(w, h, d, at, tone = 'painted-steel') {
      const [x, y, z] = at;
      const m = material(tone);
      kinds.add('iso-box');
      marks.push(comment(`symbol kind=iso-box id=box-${shapes.length}`));
      const p = [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)];
      const top = p.map(([a, b]) => `${(a + 210).toFixed(1)},${(b + 150 - h).toFixed(1)}`).join(' ');
      shapes.push(el('polygon', { points: top, fill: m.fill, stroke: m.stroke, 'stroke-width': 0.5 }));
      return api;
    },
    vessel(tag, x, y, r, h, tone = 'stainless') {
      const m = material(tone);
      kinds.add('iso-vessel');
      marks.push(comment(`symbol kind=iso-vessel id=${tag}`));
      const [cx, cy] = iso(x, y, 0);
      shapes.push(el('ellipse', { cx: (cx + 210).toFixed(1), cy: (cy + 150).toFixed(1), rx: (r * C).toFixed(1), ry: (r * S).toFixed(1), fill: m.fill, stroke: m.stroke, 'stroke-width': 0.5 }));
      shapes.push(el('ellipse', { cx: (cx + 210).toFixed(1), cy: (cy + 150 - h).toFixed(1), rx: (r * C).toFixed(1), ry: (r * S).toFixed(1), fill: m.fill, stroke: m.stroke, 'stroke-width': 0.5 }));
      shapes.push(text(cx + 210 + r * C + 4, cy + 150 - h / 2, tag, { size: 6 }));
      return api;
    },
    pipe(points, r = 1, tone = 'painted-steel') {
      const m = material(tone);
      kinds.add('iso-pipe');
      marks.push(comment('symbol kind=iso-pipe id=pipe'));
      marks.push(comment('line class=process w=0.7'));
      const flat = points.map(([x, y, z]) => { const [a, b] = iso(x, y, z); return `${(a + 210).toFixed(1)},${(b + 150).toFixed(1)}`; }).join(' ');
      shapes.push(el('polyline', { points: flat, fill: 'none', stroke: m.stroke, 'stroke-width': 0.7 }));
      return api;
    },
    callout(partText, x, y, spacing = 1.4) {
      marks.push(comment(`leader spacing=${spacing} part=${partText}`));
      const [a, b] = iso(x, y, 0);
      shapes.push(el('circle', { cx: (a + 210).toFixed(1), cy: (b + 150).toFixed(1), r: 0.9, fill: '#111' }));
      shapes.push(text(a + 210 + 4, b + 150 + 2, partText, { size: 6 }));
      return api;
    },
    toSVG() {
      for (const kind of [...kinds].sort()) marks.push(comment(`legend kind=${kind}`));
      return doc({ width: 420, height: 297, title: 'isometric cutaway' }, `${marks.join('\n')}\n${shapes.join('\n')}`);
    },
  };
  return api;
}
