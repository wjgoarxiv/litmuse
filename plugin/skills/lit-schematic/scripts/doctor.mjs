import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOnPath } from '../../../lib/host-process.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const report = {
  node: process.version,
  chrome: Boolean(findOnPath('google-chrome') || findOnPath('chromium') || findOnPath('chromium-browser')),
  fonts: existsSync(join(here, '..', '..', 'lit-diagram-drawer', 'assets', 'fonts', 'PretendardVariable.woff2')),
  encoders: { ffmpeg: Boolean(findOnPath('ffmpeg')), img2webp: Boolean(findOnPath('img2webp')) },
};
console.log(JSON.stringify(report, null, 2));
