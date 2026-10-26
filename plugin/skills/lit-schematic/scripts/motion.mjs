import { findOnPath } from '../../../lib/host-process.mjs';

const args = process.argv.slice(2);
if (!findOnPath('ffmpeg') || !findOnPath('img2webp')) {
  console.log('ENCODER_REQUIRED: install ffmpeg and libwebp (brew install ffmpeg webp), then rerun');
  process.exit(14);
}
console.log(`motion loop source: ${args[0] ?? '(missing scene)'} -> ${args[args.indexOf('--out') + 1] ?? '(missing out)'}`);
