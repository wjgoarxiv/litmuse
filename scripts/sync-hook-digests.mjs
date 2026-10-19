#!/usr/bin/env node
// Writes each hook's code digest into its declared command in plugin/.muse-plugin/plugin.json.
// `--check` only compares and exits 1 on drift (the test suite runs the same comparison).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookDigest } from '../plugin/hooks/lib/digest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'plugin', '.muse-plugin', 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let drift = 0;
for (const h of manifest.capabilities.hooks) {
  const script = h.command[1];
  const want = ['node', script, '--digest', hookDigest(join(root, 'plugin', script))];
  if (JSON.stringify(h.command) !== JSON.stringify(want)) {
    drift += 1;
    console.log(`${h.id}: ${h.command.slice(2).join(' ') || '(no digest)'} -> --digest ${want[3]}`);
    h.command = want;
  }
}
if (process.argv.includes('--check')) {
  console.log(drift ? `hook digests: ${drift} out of date (run npm run sync:digests)` : 'hook digests: OK');
  process.exitCode = drift ? 1 : 0;
} else {
  if (drift) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(drift ? `hook digests: updated ${drift}` : 'hook digests: already current');
}
