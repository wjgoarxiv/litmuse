// The install output prints the LitFamily extensions notice. A second run that would print the same text leaves it out,
// because the user has read it; the record is append-only, lives in LitMuse's own data folder, and a missing, corrupt or
// linked record means the notice is printed as before.
import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, collect } from './helpers.mjs';
import { install } from '../lib/install.mjs';

const quiet = () => {};
const record = (env) => join(env.XDG_DATA_HOME, 'litmuse', 'shown.jsonl');
const run = async (env, flags = { yes: true, approve: true }) => {
  const out = collect();
  assert.equal(await install({ env, flags, interactive: false, print: out.print }), 0);
  return out.text();
};

test('the extensions notice is printed once; a same-text reinstall leaves it out but keeps the live lines', async () => {
  const { env } = sandbox();
  const first = await run(env);
  assert.match(first, /LitFamily extensions/);
  assert.match(first, /Muse refuses a folder that is already there/);
  const second = await run(env);
  assert.doesNotMatch(second, /LitFamily extensions/);
  assert.doesNotMatch(second, /Muse refuses a folder that is already there/);
  assert.match(second, /Status: Ready/, 'the closing status line is never skipped');
  const lines = readFileSync(record(env), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1, 'one record for one text');
  const entry = JSON.parse(lines[0]);
  assert.match(entry.hash, /^[0-9a-f]{16}$/);
  assert.equal(typeof entry.at, 'number');
});

test('a changed notice text is printed again and appended', async () => {
  const { env } = sandbox();
  await run(env);
  const runtime = join(env.XDG_DATA_HOME, 'litmuse', 'runtime');
  mkdirSync(runtime, { recursive: true });
  const text = await run(env);
  assert.match(text, /LitFamily extensions/);
  assert.ok(text.includes(runtime), 'the new leftover line is part of the new text');
  assert.equal(readFileSync(record(env), 'utf8').trim().split('\n').length, 2);
});

test('a missing, corrupt or linked record prints the notice as before', async () => {
  const { env } = sandbox();
  await run(env);
  rmSync(record(env));
  assert.match(await run(env), /LitFamily extensions/, 'missing record');
  writeFileSync(record(env), 'not json\n{"hash": 5}\n\u0000\u0000');
  assert.match(await run(env), /LitFamily extensions/, 'corrupt record');
  rmSync(record(env));
  const target = join(env.HOME, 'elsewhere.jsonl');
  writeFileSync(target, '');
  symlinkSync(target, record(env));
  assert.match(await run(env), /LitFamily extensions/, 'linked record');
  assert.equal(readFileSync(target, 'utf8'), '', 'a link is never written through');
});

test('a preview, a dry run and a refused install record nothing', async () => {
  const { env } = sandbox();
  await install({ env, flags: { dryRun: true }, interactive: false, print: quiet });
  await install({ env, flags: {}, interactive: false, print: quiet });
  assert.equal(existsSync(record(env)), false);
});
