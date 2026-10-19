import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { sandbox, collect } from './helpers.mjs';
import { doctor } from '../lib/doctor.mjs';
import { runtime } from '../lib/runtime.mjs';
import { SKILL, coverRun, motionCli, NO_RUNTIME } from './motion-helpers.mjs';

const RUNTIME_CLI = join(SKILL, 'scripts', 'motion-runtime.mjs');
const runtimeCli = (args, env) => spawnSync(process.execPath, [RUNTIME_CLI, ...args], { encoding: 'utf8', env });

test('motion runtime: status --json answers in the LitMuse runtime shape and caches under the LitMuse data dir', () => {
  const { home, env } = sandbox();
  const r = runtimeCli(['status', '--json'], env);
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.name, 'motion');
  assert.equal(s.ready, false);
  assert.equal(s.cache, join(home, '.local', 'share', 'litmuse', 'runtime', 'motion'));
  assert.ok(s.missing.some((m) => /engine deps \(opentype\.js 2\.0\.0\)/.test(m)), s.missing.join('; '));
  assert.equal(s.prewarm, true, 'a render never installs; doctor says to pre-warm');
  assert.equal(s.command, 'npx @litfamily/litmuse runtime install motion');
  assert.equal(runtimeCli(['install', '--dry'], env).status, 2, 'an unknown install flag stops before anything is written');
  assert.equal(runtimeCli(['path'], env).status, 1);
});

test('motion runtime: litmuse runtime lists it, and a dry install names the LitMuse cache', async () => {
  const { home, env } = sandbox();
  const out = collect();
  assert.equal(await runtime({ env, flags: { dryRun: true }, args: ['install', 'motion'], print: out.print }), 0);
  assert.match(out.text(), new RegExp(`would install runtime motion with skills/lit-typographic-motion/scripts/motion-runtime\\.mjs into ${join(home, '.local', 'share', 'litmuse', 'runtime', 'motion').replace(/[.]/g, '\\.')}`));
});

test('doctor: ffmpeg and libwebp rows name the motion skill, and the motion engine says to pre-warm from a terminal', async () => {
  const { env } = sandbox();
  delete env.LITMUSE_SKIP_RUNTIMES;
  const out = collect();
  await doctor({ env, flags: { offline: true }, print: out.print });
  assert.match(out.text(), /runtime ffmpeg: (found|missing \(used by lit-typographic-motion\))/);
  assert.match(out.text(), /runtime libwebp \(img2webp, dwebp\): (found|missing \(used by lit-typographic-motion\))/);
  assert.match(out.text(), /engine motion: not installed yet: .*run the fix from a terminal before first use \(fix: npx @litfamily\/litmuse runtime install motion\)/);
});

test('a render with no pre-warmed runtime is BLOCKED 14 and names the LitMuse pre-warm command', () => {
  const r = motionCli(['cover', '--out', coverRun('good'), '--round', '1'], { LITMUSE_MOTION_RUNTIME: NO_RUNTIME });
  assert.equal(r.status, 14, r.stdout + r.stderr);
  assert.match(r.stdout, /^exit 14 BLOCKED_DEPS_NOT_PREWARMED$/m);
  assert.match(r.stderr, /npx @litfamily\/litmuse runtime install motion/);
  assert.doesNotMatch(r.stderr + r.stdout, /lit-?claude|motion-runtime install(?! motion)/i);
});
