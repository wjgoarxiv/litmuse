// The installed plugin bundle holds plugin/ only, so no module under plugin/ may import a file outside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { PLUGIN_DIR } from '../lib/bundle.mjs';

const modules = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) modules(path, out);
    else if (/\.m?js$/u.test(name)) out.push(path);
  }
  return out;
};

test('every relative import under plugin/ stays inside plugin/', () => {
  const outside = [];
  for (const file of modules(PLUGIN_DIR)) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gmu)) {
      const target = resolve(dirname(file), spec);
      if (relative(PLUGIN_DIR, target).startsWith('..')) outside.push(`${relative(PLUGIN_DIR, file)} -> ${spec}`);
    }
  }
  assert.deepEqual(outside, []);
});
