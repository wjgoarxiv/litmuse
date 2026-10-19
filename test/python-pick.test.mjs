import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const host = await import(join(ROOT, 'plugin', 'lib', 'host-process.mjs'));
const office = await import(join(ROOT, 'plugin', 'lib', 'office-runtime.mjs'));
const motion = await import(join(ROOT, 'plugin', 'skills', 'lit-typographic-motion', 'engine', 'node', 'runtime.mjs'));
const sciviz = await import(join(ROOT, 'plugin', 'skills', 'lit-scientific-visualization', 'scripts', 'sciviz-runtime.mjs'));
const { runtimeFound } = await import(join(ROOT, 'lib', 'doctor.mjs'));

// A PATH holding only fake interpreters that print a fixed version, so no test depends on the host's Python.
function fakePythons(versions) {
  const bin = mkdtempSync(join(tmpdir(), 'litmuse-py-'));
  for (const [name, version] of Object.entries(versions)) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho ${version}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { PATH: bin };
}
const posix = { skip: process.platform === 'win32' && 'fake interpreters are shell scripts' };

test('pickPython skips a python3 newer than the pinned wheels and takes the newest supported python3.X', () => {
  const seen = [];
  const probe = (command) => {
    seen.push(command);
    if (command === 'python3') return { ok: false, command, version: '3.15.0', detail: '3.15.0 is newer than 3.14' };
    if (command === 'python3.13') return { ok: true, command, version: '3.13.9', detail: '3.13.9' };
    return { ok: false, command, detail: 'not found' };
  };
  assert.equal(host.pickPython(undefined, { probe, platform: 'darwin' }).command, 'python3.13');
  assert.deepEqual(seen, ['python3.14', 'python3.13']);
  const none = host.pickPython(undefined, { probe: (command) => (command === 'python3' ? probe(command) : { ok: false, command, detail: 'not found' }), platform: 'linux' });
  assert.equal(none.ok, false);
  assert.match(none.detail, /no supported Python \(3\.10 to 3\.14\).*python3: 3\.15\.0 is newer than 3\.14/);
});

test('pickPython: an override is the only interpreter tried; Windows tries python before python3', () => {
  const seen = [];
  const probe = (command) => { seen.push(command); return { ok: false, command, detail: 'not found' }; };
  host.pickPython('py3', { probe, platform: 'darwin' });
  assert.deepEqual(seen, ['py3']);
  seen.length = 0;
  host.pickPython(undefined, { probe, platform: 'win32' });
  assert.deepEqual(seen, ['python', 'python3']);
});

test('probePythonCommand reads the version from the PATH it is given', posix, () => {
  const env = fakePythons({ python3: '3.15.0', 'python3.12': '3.12.4', 'python3.9': '3.9.18' });
  assert.deepEqual(host.probePythonCommand('python3', { env }), { ok: false, command: 'python3', version: '3.15.0', detail: '3.15.0 is newer than 3.14' });
  assert.equal(host.probePythonCommand('python3.9', { env }).detail, '3.9.18 is older than 3.10');
  assert.equal(host.probePythonCommand('python3.11', { env }).detail, 'not found');
  assert.equal(host.pickPython(undefined, { env }).command, 'python3.12');
});

test('office, motion audio, sciviz and doctor share the pick: a python3.15 first on PATH is passed over', posix, () => {
  const env = fakePythons({ python3: '3.15.0', 'python3.12': '3.12.4' });
  assert.equal(office.hostPython(env).command, 'python3.12');
  assert.equal(motion.hostPython(env).command, 'python3.12');
  assert.equal(sciviz.hostPython(env).command, 'python3.12');
  assert.equal(runtimeFound({ python: true }, { env }), true);
  assert.equal(motion.hostPython({ ...env, LITMUSE_MOTION_PYTHON: 'python3' }).ok, false, 'an override is never second-guessed');
  assert.equal(office.hostPython({ ...env, LITMUSE_OFFICE_PYTHON: 'python3.12' }).version, '3.12.4');
  const only315 = fakePythons({ python3: '3.15.0' });
  assert.equal(runtimeFound({ python: true }, { env: only315 }), false);
  assert.match(motion.hostPython(only315).detail, /no supported Python/);
});

test('the motion audio venv is keyed by the picked interpreter version', posix, () => {
  const env = { ...fakePythons({ python3: '3.15.0', 'python3.12': '3.12.4' }), LITMUSE_MOTION_RUNTIME: mkdtempSync(join(tmpdir(), 'litmuse-motion-')) };
  assert.equal(motion.audioDir(env), motion.audioDir(env, '3.12'));
  assert.notEqual(motion.audioDir(env), motion.audioDir(env, '3.15'));
});
