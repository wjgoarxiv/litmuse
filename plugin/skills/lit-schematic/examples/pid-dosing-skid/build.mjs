import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSheet } from '../../scripts/lib/sheet.mjs';

const out = process.argv[2] ?? '.';
const sheet = createSheet({
  plant: 'DEMO', unit: 'DOSING', sheetNo: '01-001', rev: 'A',
  title: 'Sodium hypochlorite dosing skid',
  subTitle: 'Piping and instrumentation diagram',
  drawingNo: 'EX-PID-001', project: 'Worked example', owner: 'lit-schematic',
  date: '2026-10-26', scale: 'NTS', sheet: '1 of 1',
});
sheet.equipmentInfo('TK-101', 'Hypochlorite tank, 2.5 m3, HDPE, atmospheric');
sheet.equipmentInfo('P-101A', 'Dosing pump, 0-40 L/h at 6 barg, duty');
sheet.equipmentInfo('P-101B', 'Dosing pump, 0-40 L/h at 6 barg, standby');
sheet.notes([
  'Line numbers read size-fluid-sequence.',
  'Pumps P-101A/B: duty and standby; one runs.',
  'PSV-101 spills pump discharge back to suction.',
]);

// Feed from unloading into the tank. The off-page box sits clear of the
// level instruments, and the loop tag goes left so it never meets the tank.
sheet.offpage('FROM UNLOADING', 12, 106, 'out', 64);
sheet.pipe([[76, 106], [118, 106]], { cls: 'process', number: '2-NAOCL-100', at: 0.548 });
sheet.tank('TK-101', 140, 130);
sheet.vent(140, 76);
sheet.instrument('LT-101', 78, 140, { tag: 'below' });
sheet.signal([[91, 140], [118, 140]], 'electric');
sheet.instrument('LIA-101', 78, 80, { dcs: true, tag: 'left' });
sheet.signal([[78, 93], [78, 127]], 'electric');

sheet.pipe([[140, 156], [140, 182]], { cls: 'process' });
sheet.pipe([[40, 182], [250, 182]], { cls: 'process', number: '2-NAOCL-101', at: 0.24 });
sheet.drain(60, 182);
sheet.valve('gate', 'hand', 'FV-101', 120, 182, 'FC');
sheet.strainer('STR-101', 150, 182);
sheet.arrow(134, 182, true);

// Duty and standby pump branches. Tags sit beside the circles: a vertical drop
// through a centered tag would strike it, and the checks below need the room.
sheet.pipe([[188, 182], [188, 190]], { cls: 'process' });
sheet.pump('P-101A', 188, 200, 'left');
sheet.pipe([[188, 210], [188, 232]], { cls: 'process' });
sheet.valve('check', 'auto', 'XV-101A', 188, 224, 'FC', 'v');
sheet.pipe([[234, 182], [234, 190]], { cls: 'process' });
sheet.pump('P-101B', 234, 200, 'left');
sheet.pipe([[234, 210], [234, 232]], { cls: 'process' });
sheet.valve('check', 'auto', 'XV-101B', 234, 224, 'FC', 'v');

// Discharge header to the injection riser. The globe sits west of the duty
// branch with its fail tag clear of the drop; the line number rides east of it.
sheet.pipe([[120, 232], [246, 232]], { cls: 'process', number: '2-NAOCL-102', at: 0.72 });
sheet.valve('globe', 'pneumatic', 'FV-102', 140, 232, 'FO');
sheet.pipe([[246, 232], [246, 100]], { cls: 'process' });
sheet.orifice('FE-101', 246, 140);
sheet.instrument('FT-101', 266, 160);
sheet.signal([[253, 160], [250, 160], [250, 150]], 'electric');
sheet.instrument('PI-101', 270, 214);
sheet.pipe([[257, 214], [246, 214]], { cls: 'utility' });
sheet.instrument('FIC-101', 198, 96, { dcs: true });
sheet.signal([[198, 109], [198, 144]], 'electric');
sheet.offpage('TO INJECTION POINT', 246, 100, 'out', 60);

// PSV spillback to the suction header, west of the duty branch so the tags,
// the tank outlet, and the line number each keep their own lane.
sheet.pipe([[180, 232], [180, 170]], { cls: 'process' });
sheet.psv('PSV-101', 180, 160, 'SET 8 barg');
sheet.pipe([[186, 156], [186, 150], [206, 150], [226, 150], [226, 184]], { cls: 'process', number: '1-NAOCL-103', at: 0.5 });

sheet.legend();
writeFileSync(join(out, 'drawing.svg'), sheet.toSVG());
console.log('wrote drawing.svg');
