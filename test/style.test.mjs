import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleCommand, readStyle, STYLES } from '../lib/style.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFor = () => {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-style-'));
  return { home, env: { HOME: home, XDG_DATA_HOME: join(home, 'data'), XDG_STATE_HOME: join(home, 'state') } };
};
const run = (args, env) => { const lines = []; const code = styleCommand(args, env, (l) => lines.push(l)); return { code, text: lines.join('\n') }; };
const stylePath = (env) => join(env.XDG_DATA_HOME, 'litmuse', 'style.json');

test('style on, status and off round-trip through style.json', () => {
  const { env } = envFor();
  assert.deepEqual(STYLES, ['eli5', 'asd-ste100']);
  assert.match(run(['status'], env).text, /off/);
  assert.equal(run(['eli5'], env).code, 0);
  assert.equal(JSON.parse(readFileSync(stylePath(env), 'utf8')).style, 'eli5');
  assert.equal(readStyle(env), 'eli5');
  assert.match(run(['status'], env).text, /eli5/);
  assert.equal(run(['asd-ste100'], env).code, 0);
  assert.equal(readStyle(env), 'asd-ste100');
  assert.equal(run(['off'], env).code, 0);
  assert.equal(readStyle(env), null);
});

test('style rejects an unknown name and leaves state untouched', () => {
  const { env } = envFor();
  const r = run(['pirate'], env);
  assert.notEqual(r.code, 0);
  assert.equal(existsSync(stylePath(env)), false);
});

test('style refuses a symlinked style.json', () => {
  const { env, home } = envFor();
  mkdirSync(join(env.XDG_DATA_HOME, 'litmuse'), { recursive: true });
  const target = join(home, 'victim.json');
  writeFileSync(target, 'keep');
  symlinkSync(target, stylePath(env));
  const r = run(['eli5'], env);
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(target, 'utf8'), 'keep');
});

test('style refuses a data dir under a foreign tool home', () => {
  const { home } = envFor();
  const env = { HOME: home, XDG_DATA_HOME: join(home, '.claude', 'data') };
  assert.notEqual(run(['eli5'], env).code, 0);
});

function startCtx(env) {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-style-ws-'));
  const r = spawnSync(process.execPath, [join(ROOT, 'plugin', 'hooks', 'session-start.mjs')], {
    input: JSON.stringify({ source: 'startup', session_id: 's', cwd: ws }), encoding: 'utf8', cwd: ws, env: { ...process.env, ...env },
  });
  assert.ok(Buffer.byteLength(r.stdout) < 16 * 1024);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

test('session-start appends the chosen style text only when selected', () => {
  const { env } = envFor();
  assert.doesNotMatch(startCtx(env), /Output style/);
  run(['eli5'], env);
  assert.match(startCtx(env), /Output style: ELI5/);
  run(['asd-ste100'], env);
  const ctx = startCtx(env);
  assert.match(ctx, /ASD-STE100/);
  assert.doesNotMatch(ctx, /Output style: ELI5/);
  run(['off'], env);
  assert.doesNotMatch(startCtx(env), /Output style/);
});

test('session-start ignores an unknown or corrupt style.json', () => {
  const { env } = envFor();
  mkdirSync(join(env.XDG_DATA_HOME, 'litmuse'), { recursive: true });
  writeFileSync(stylePath(env), JSON.stringify({ style: '../../etc/passwd' }));
  assert.doesNotMatch(startCtx(env), /Output style/);
  writeFileSync(stylePath(env), '{nope');
  assert.doesNotMatch(startCtx(env), /Output style/);
});
