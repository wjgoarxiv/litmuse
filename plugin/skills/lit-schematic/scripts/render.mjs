import { spawnSync } from 'node:child_process';
import { firstLine } from '../../../lib/host-process.mjs';

const args = process.argv.slice(2);
const file = args[0];
const pngI = args.indexOf('--png');
const pdfI = args.indexOf('--pdf');
const dpiI = args.indexOf('--dpi');
const png = pngI >= 0 ? args[pngI + 1] : null;
const pdf = pdfI >= 0 ? args[pdfI + 1] : null;
const dpi = dpiI >= 0 ? args[dpiI + 1] : '600';
if (!file) {
  console.error('usage: render.mjs drawing.svg --png out.png --dpi 600 --pdf out.pdf');
  process.exit(2);
}
const has = (bin) => spawnSync('which', [bin]).status === 0;
function run(bin, binArgs, label) {
  const r = spawnSync(bin, binArgs, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log(`RENDER_INCOMPLETE ${label}: ${firstLine(r.stderr || r.stdout)}`);
    process.exit(3);
  }
  console.log(`rendered ${label} at ${dpi} dpi`);
}
if (png) {
  if (has('rsvg-convert')) run('rsvg-convert', ['-d', `${dpi}`, '-p', `${dpi}`, '-o', png, file], png);
  else {
    console.log(`RENDER_SKIP ${png}: rasterizer missing on this machine`);
    process.exit(0);
  }
}
if (pdf) {
  if (has('rsvg-convert')) run('rsvg-convert', ['-f', 'pdf', '-o', pdf, file], pdf);
  else {
    console.log(`RENDER_SKIP ${pdf}: rasterizer missing on this machine`);
    process.exit(0);
  }
}
