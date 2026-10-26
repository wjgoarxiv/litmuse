import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIsoView } from '../../scripts/lib/iso.mjs';
import { scene } from './scene.mjs';

const out = process.argv[2] ?? '.';
const s = scene();
const view = createIsoView({ plant: 'SHOP', sheetNo: 'ISO-001' });
view.box(s.base.w, s.base.h, s.base.d, s.base.at, s.base.tone);
view.vessel(s.vessel.tag, s.vessel.x, s.vessel.y, s.vessel.r, s.vessel.h, s.vessel.tone);
for (const [points, r, tone] of s.pipes) view.pipe(points, r, tone);
for (const [partText, x, y] of s.callouts) view.callout(partText, x, y);
writeFileSync(join(out, 'drawing.svg'), view.toSVG());
console.log('wrote drawing.svg');
