import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = dirname(fileURLToPath(import.meta.url));
const CONTEXT = join(LIB, '..', '..', 'context');

const PLUGIN = join(LIB, '..', '..');

// Files outside hooks/lib that a hook loads at run time: PostToolUse runs the lit-humanizer detector, and Stop runs the
// lit-typographic-motion done-check with every engine module it imports.
const MOTION_DONE = ['node/done.mjs', 'node/cover-assets.mjs', 'core/constants.mjs', 'node/chrome.mjs', 'node/cover-image.mjs', 'node/cover-treatment.mjs', 'node/treatment.mjs', 'node/sound.mjs', 'node/house.mjs', 'node/styles.mjs', 'node/score.mjs', 'core/presets.mjs', 'core/util.mjs', 'node/look.mjs', 'node/stills.mjs', 'node/analysis.mjs', 'core/flash.mjs', 'node/png.mjs'];
export const DIGEST_EXTRAS = ['skills/lit-humanizer/scripts/core.mjs', 'skills/lit-humanizer/rules.json', ...MOTION_DONE.map((f) => `skills/lit-typographic-motion/engine/${f}`)];

const listed = (dir, ext) => readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => join(dir, f));

// Digest of everything a hook executes or injects: its own script, the shared hook library, the context text and
// the skill files a hook loads.
// Muse keys hook trust on the declared command, so carrying this digest in the command makes any code change a new
// declaration that the user approves again.
export function hookDigest(scriptPath) {
  const h = createHash('sha256');
  for (const file of [scriptPath, ...listed(LIB, '.mjs'), ...listed(CONTEXT, '.md'), ...DIGEST_EXTRAS.map((rel) => join(PLUGIN, rel))]) {
    h.update(`${basename(file)}\0`);
    h.update(readFileSync(file));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

// Returns null when the hook may run, or the reason it must refuse.
export function digestMismatch(argv = process.argv) {
  const i = argv.indexOf('--digest');
  if (i < 0) return null;
  const want = argv[i + 1];
  const have = hookDigest(argv[1]);
  return want === have ? null : `declared ${want ?? '(none)'}, code is ${have}`;
}
