// The vendored three.js build is pinned by the sha256 hashes in THIRD_PARTY_NOTICES:
// a changed file or a changed notice fails here, not in a user session.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'skills', 'lit-typographic-motion', 'engine');

test('vendored three.js files match the THIRD_PARTY_NOTICES hashes', () => {
  const notices = readFileSync(join(ENGINE, 'THIRD_PARTY_NOTICES'), 'utf8');
  const section = notices.slice(notices.indexOf('files (sha256)'));
  assert.notEqual(notices.indexOf('files (sha256)'), -1, 'the hash section is present');
  const isHex64 = (s) => s.length === 64 && [...s].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
  const rows = section.split('\n').map((line) => line.trim().split(' ').filter(Boolean)).filter((parts) => parts.length === 2 && isHex64(parts[1]));
  assert.equal(rows.length, 3, 'three pinned files, no more and no fewer');
  for (const [rel, hash] of rows) {
    const actual = createHash('sha256').update(readFileSync(join(ENGINE, 'vendor', 'three', rel))).digest('hex');
    assert.equal(actual, hash, rel + ' drifts from its notice');
  }
});
