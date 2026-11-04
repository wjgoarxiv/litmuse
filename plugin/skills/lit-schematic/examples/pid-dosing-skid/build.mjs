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
  'PSV-101, set 8 barg, spills back to suction.',
]);

// Feed from unloading into the tank. The off-page box sits clear of the
// level instruments; each bubble carries its own tag, so none is printed beside it.
sheet.offpage('FROM UNLOADING', 12, 110, 'out', 64);
sheet.pipe([[76, 110], [118, 110]], { cls: 'process', number: '2-NAOCL-100', at: 0.52 });
sheet.tank('TK-101', 140, 126);
sheet.vent(140, 72);
sheet.instrument('LT-101', 78, 140);
sheet.signal([[91, 140], [118, 140]], 'electric');
sheet.instrument('LIA-101', 78, 80, { dcs: true });
sheet.signal([[78, 93], [78, 127]], 'electric');

sheet.pipe([[140, 152], [140, 182]], { cls: 'process' });
sheet.pipe([[40, 182], [250, 182]], { cls: 'process', number: '2-NAOCL-101', at: 0.24 });
sheet.drain(60, 182);
sheet.valve('gate', 'hand', 'FV-101', 120, 182, 'FC');
sheet.strainer('STR-101', 150, 182);
sheet.arrow(134, 182, true);

// Duty and standby pump branches, far enough apart that the standby tag clears
// the duty pump's circle. Pump tags sit beside the circles: a vertical
// drop through a centered tag would strike it. The check valves on the vertical
// discharge drops take their tags beside the pipe, to the right, clear of the drop.
sheet.pipe([[188, 182], [188, 190]], { cls: 'process' });
sheet.pump('P-101A', 188, 200, 'left');
sheet.pipe([[188, 210], [188, 232]], { cls: 'process' });
sheet.valve('check', 'auto', 'XV-101A', 188, 219, 'FC', 'v', 'right');
sheet.pipe([[240, 182], [240, 190]], { cls: 'process' });
sheet.pump('P-101B', 240, 200, 'left');
sheet.pipe([[240, 210], [240, 232]], { cls: 'process' });
sheet.valve('check', 'auto', 'XV-101B', 240, 219, 'FC', 'v', 'right');

// Discharge header to the injection riser. The globe sits west of the duty
// branch with its fail tag clear of the drop; the line number rides between the
// two pump drops, under the duty check valve's tag. The riser runs east of the
// standby tag, and its flow arrow points up.
sheet.pipe([[120, 232], [284, 232]], { cls: 'process', number: '2-NAOCL-102', at: 0.555 });
sheet.valve('globe', 'pneumatic', 'FV-102', 140, 232, 'FO');
sheet.pipe([[284, 232], [284, 100]], { cls: 'process' });
sheet.arrow(284, 186, true, 'up');
sheet.orifice('FE-101', 284, 140);
sheet.instrument('FT-101', 266, 165);
sheet.signal([[266, 151.8], [266, 140], [281, 140]], 'electric');
sheet.instrument('PI-101', 268, 200);
sheet.pipe([[281.2, 200], [284, 200]], { cls: 'utility' });
sheet.instrument('FIC-101', 198, 96, { dcs: true });
sheet.signal([[198, 109], [198, 144]], 'electric');
sheet.offpage('TO INJECTOR', 284, 100, 'out');

// PSV spillback to the suction header. The angle body takes its inlet from
// below and its outlet to the right; the spring rises clear of the inlet and the
// tag sits opposite the outlet, between the tank's bottom edge and its tag. The set pressure
// rides in note 3 so the tag keeps clear of the tank tag.
sheet.pipe([[180, 232], [180, 172]], { cls: 'process' });
sheet.psv('PSV-101', 180, 162, null, { outlet: 'right' });
sheet.pipe([[190, 162], [226, 162], [226, 182]], { cls: 'process', number: '1-NAOCL-103', at: 0.5 });
sheet.arrow(226, 176, true, 'down');

sheet.legend();
writeFileSync(join(out, 'drawing.svg'), sheet.toSVG());
console.log('wrote drawing.svg');
