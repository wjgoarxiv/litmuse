import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, walk } from './helpers.mjs';

const NOTICE = '{"version":"0.0.0","pending":true,"leftovers":[]}\n';

// The caller's folders, each with a first-session notice a SessionStart hook would claim.
function callersHome() {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-caller-'));
  const xdg = { XDG_DATA_HOME: join(home, 'data'), XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache') };
  for (const data of [xdg.XDG_DATA_HOME, join(home, '.local', 'share')]) {
    mkdirSync(join(data, 'litmuse'), { recursive: true });
    writeFileSync(join(data, 'litmuse', 'first-session-notice.json'), NOTICE);
  }
  const env = { ...process.env, ...xdg, HOME: home, USERPROFILE: home };
  delete env.NODE_TEST_CONTEXT;
  return { home, env, data: xdg.XDG_DATA_HOME };
}

test('the hook tests leave the caller\'s home and XDG folders alone', { timeout: 180_000 }, () => {
  for (const [file, pattern] of [['hooks', 'session-start: steering context'], ['moved-stubs', 'the session route table']]) {
    const { home, env, data } = callersHome();
    const before = walk(home).sort();
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern', pattern, join(ROOT, 'test', `${file}.test.mjs`)], { cwd: ROOT, env, encoding: 'utf8' });
    assert.match(r.stdout, /^# pass 1$/m, r.stdout);
    assert.deepEqual(walk(home).sort(), before, file);
    for (const dir of [data, join(home, '.local', 'share')]) assert.equal(readFileSync(join(dir, 'litmuse', 'first-session-notice.json'), 'utf8'), NOTICE, file);
    rmSync(home, { recursive: true, force: true });
  }
});

test('every test file starts with the throwaway home', () => {
  const files = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs'));
  const missing = files.filter((f) => /^import .*$/m.exec(readFileSync(join(ROOT, 'test', f), 'utf8'))?.[0] !== "import './home.mjs';");
  assert.deepEqual(missing, []);
});
