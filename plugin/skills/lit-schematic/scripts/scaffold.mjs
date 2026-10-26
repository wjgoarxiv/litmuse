import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), 'lib');

function pidBuild() {
  return `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSheet } from '${join(KIT, 'sheet.mjs')}';

const out = process.argv[2] ?? '.';
const sheet = createSheet({ plant: 'DEMO', unit: 'DOSING', sheetNo: '01-001', rev: '0' });
sheet.equipmentInfo('TK-101', 'Dosing tank, 2 m3');
sheet.add('tank', 'TK-101', 80, 120, 'TK-101');
sheet.add('pump', 'P-101', 180, 120, 'P-101');
sheet.pipe([[80, 120], [180, 120]], { cls: 'process', number: '2-P-101' });
sheet.valve('gate', 'hand', 'XV-101', 130, 120, 'FC');
sheet.instrument('FIC-101', 130, 80);
sheet.signal([[130, 84], [130, 116]]);
sheet.arrow(155, 120, true);
sheet.callout('TK-101', 80, 112);
sheet.legend();
writeFileSync(join(out, 'drawing.svg'), sheet.toSVG());
console.log('wrote drawing.svg');
`;
}

function journalBuild() {
  return `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFigure } from '${join(KIT, 'figure.mjs')}';

const out = process.argv[2] ?? '.';
const fig = createFigure({ width: 85 });
const panel = fig.canvas('a');
panel.box(10, 20, 40, 30, 'cell');
panel.stream('sample in', 0, 35, 10, 35);
panel.stream('waste', 50, 35, 75, 35);
panel.label('(a) Adsorption rig', 10, 12);
panel.commit();
fig.key(['sample in', 'waste'], 10, 60);
writeFileSync(join(out, 'drawing.svg'), fig.toSVG());
console.log('wrote drawing.svg');
`;
}

function isoBuild() {
  return `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIsoView } from '${join(KIT, 'iso.mjs')}';

const out = process.argv[2] ?? '.';
const view = createIsoView({ plant: 'SHOP', sheetNo: 'ISO-001' });
view.box(60, 8, 40, [0, 0, 0], 'concrete');
view.vessel('E-101', 30, 20, 12, 40, 'stainless');
view.pipe([[30, 20, 44], [30, 20, 60], [60, 20, 60]], 1, 'painted-steel');
view.callout('shell', 30, 20);
view.callout('saddle', 8, 8);
writeFileSync(join(out, 'drawing.svg'), view.toSVG());
console.log('wrote drawing.svg');
`;
}

const TEMPLATES = { pid: pidBuild, journal: journalBuild, iso: isoBuild };
const [mode, dir] = process.argv.slice(2);
if (!TEMPLATES[mode] || !dir) {
  console.error('usage: scaffold.mjs pid|journal|iso <dir>');
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'build.mjs'), TEMPLATES[mode]());
console.log(`scaffolded ${mode} build in ${dir}`);
