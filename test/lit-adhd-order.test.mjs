// lit-adhd counts the other lanes at work before it offers this session's own resume or run: the session
// that started the lanes must not be told to continue while they work. A pending approval stays offered.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { collectRewind, renderRewind } from '../plugin/lib/rewind/collect.mjs';
import { progressOf } from '../plugin/lib/rewind/gauge.mjs';
import { chooseNextStep } from '../plugin/lib/rewind/next-step.mjs';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const base = { workflows: [], startWork: [], roadmap: { plans: [] } };
const lanes = { count: 1, waiting: 0, items: [{ id8: 'lane0001', waiting: false, worktree: 'unknown' }] };
const ownFrame = { sessionId: 's1', role: 'spine', status: 'paused', skill: 'lit-loop', stage: 'verify', progress: progressOf(1, 2) };
const ownRun = { workId: 'w1', plan: 'plans/c.md', status: 'active', sessionId: 's1' };
const boundary = { ...ownRun, status: 'paused', pendingBoundary: { action: 'read', root: '/x' } };

test('this session\'s own paused frame is offered alone, and held while another lane is at work', () => {
  assert.equal(chooseNextStep({ ...base, workflows: [ownFrame] }, 's1').say, 'lit continue');
  assert.deepEqual(chooseNextStep({ ...base, workflows: [ownFrame], lanes }, 's1'), { kind: 'none', target: null });
});

test('this session\'s own active run is offered alone, and held while another lane is at work', () => {
  assert.equal(chooseNextStep({ ...base, startWork: [ownRun] }, 's1').say, 'go');
  assert.deepEqual(chooseNextStep({ ...base, startWork: [ownRun], lanes }, 's1'), { kind: 'none', target: null });
});

test('an approval at a boundary is the user\'s call, so lanes at work do not hide it', () => {
  assert.equal(chooseNextStep({ ...base, startWork: [boundary], lanes }, 's1').say, 'lit approve');
  assert.equal(chooseNextStep({ ...base, workflows: [ownFrame], startWork: [boundary], lanes }, 's1').say, 'lit approve');
});

test('the session card and the brief do not show the resume command while lanes work', () => {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-order-'));
  try {
    const repo = join(home, 'repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, 'README.md'), 'x\n');
    const env = { HOME: home, XDG_DATA_HOME: join(home, 'data'), XDG_STATE_HOME: join(home, 'state'), LITMUSE_SESSION_STORE: join(home, 'no-store'), HERDR_ENV: '' };
    const data = collectRewind({ cwd: repo, env, now: NOW, sessionId: 's1', exec: () => { throw new Error('no git'); } });
    const self = { id8: 's1000000', sessionId: 's1', title: 'own work', asked: [], worktree: '~/repo', last: new Date(NOW - 60_000).toISOString(), status: 'waiting-on-user', waitingReason: 'paused workflow', self: true, progress: { gauge: '[…] running', remaining: [] }, done: { tools: {}, files: [], commits: [] } };
    const frame = { ...ownFrame, id8: 's1000000', self: true };
    const render = (withLanes) => {
      const shaped = { ...data, sessions: [self], workflows: [frame], lanes: withLanes ? lanes : { count: 0, waiting: 0, items: [] } };
      shaped.next = chooseNextStep(shaped, 's1');
      return renderRewind(shaped, 100);
    };
    assert.match(render(false), /lit continue/u, 'alone, the paused frame is offered');
    const held = render(true);
    assert.doesNotMatch(held, /lit continue/u);
    assert.doesNotMatch(held, /resume the paused/u);
    assert.match(held, /Wait for 1 lane to finish/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
