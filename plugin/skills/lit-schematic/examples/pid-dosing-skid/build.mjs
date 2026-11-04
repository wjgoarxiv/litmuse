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
sheet.pipe([[76, 110], [121, 110]], { cls: 'process', number: '2-NAOCL-100', at: 0.52 });
sheet.tank('TK-101', 143, 126, 'right'); // tag beside the shell, clear of the outlet and the PSV
sheet.vent(143, 80); // leg starts on the roof nozzle
sheet.instrument('LT-101', 78, 140);
sheet.signal([[91, 140], [121, 140]], 'electric');
sheet.instrument('LIA-101', 78, 80, { dcs: true });
sheet.signal([[78, 93], [78, 127]], 'electric');

sheet.pipe([[143, 152], [143, 182]], { cls: 'process' });
sheet.pipe([[40, 182], [250, 182]], { cls: 'process', number: '2-NAOCL-101', at: 0.24 });
sheet.drain(60, 182);
sheet.valve('gate', 'hand', 'FV-101', 120, 182, 'FC');
sheet.strainer('STR-101', 157, 182);
sheet.arrow(96, 182, true);

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
sheet.pipe([[128, 232], [284, 232]], { cls: 'process', number: '2-NAOCL-102', at: 0.532 });
sheet.valve('globe', 'pneumatic', 'FV-102', 140, 232, 'FO');
sheet.pipe([[284, 232], [284, 100]], { cls: 'process' });
sheet.arrow(284, 186, true, 'up');
sheet.orifice('FE-101', 284, 140);
sheet.instrument('FT-101', 266, 165);
sheet.signal([[266, 151.8], [266, 140], [281, 140]], 'electric');
sheet.instrument('PI-101', 268, 200);
sheet.pipe([[281.2, 200], [284, 200]], { cls: 'utility' });
sheet.instrument('FIC-101', 198, 96, { dcs: true });
sheet.signal([[198, 109], [198, 165], [252.8, 165]], 'electric'); // FIC reads FT-101
sheet.offpage('TO INJECTOR', 284, 100, 'out');

// PSV spillback, between the two headers west of the globe valve: the angle body
// takes its inlet from the discharge header below and spills right, then up into
// the suction header, so no line crosses a pump. The tag sits opposite the outlet;
// the set pressure rides in note 3.
sheet.pipe([[128, 232], [128, 224]], { cls: 'process' });
sheet.psv('PSV-101', 128, 214, null, { outlet: 'right' });
sheet.pipe([[138, 214], [138, 182]], { cls: 'process' });
sheet.arrow(138, 196, true, 'up');

sheet.legend();
writeFileSync(join(out, 'drawing.svg'), sheet.toSVG());
console.log('wrote drawing.svg');
