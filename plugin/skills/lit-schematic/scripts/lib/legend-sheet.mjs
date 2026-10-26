import { el, text, doc, comment } from './svg.mjs';

export function createLegendSheet(symbols) {
  const rows = [...new Set(symbols)].sort();
  const marks = [comment('titleblock plant=LEGEND unit=SYMBOLS sheetNo=LG-001 rev=0')];
  for (const kind of rows) marks.push(comment(`legend kind=${kind}`));
  for (const kind of rows) marks.push(comment(`symbol kind=${kind} id=legend-${kind}`));
  const body = rows.map((k, i) => text(20, 30 + i * 9, k, { size: 7 })).join('\n');
  return doc({ title: 'legend sheet' }, `${marks.join('\n')}\n${body}`);
}
