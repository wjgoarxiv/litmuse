// The lit-team state lock must never block forever when a holder or a contender died mid-write, or when the recorded
// pid now names another live process. A fresh lock with no owner record yet is still waited on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireOwnerLock, releaseOwnerLock } from '../plugin/skills/lit-team/scripts/owner-lock.mjs';

const DEAD_PID = 999_999;
const longAgo = new Date(Date.now() - 60 * 60 * 1000);
const age = (path) => utimesSync(path, longAgo, longAgo);

function withLock(fn) {
  const root = mkdtempSync(join(tmpdir(), 'litmuse-lock-recovery-'));
  try {
    return fn(join(root, 'team', '.lock'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const take = (lockDir) => acquireOwnerLock(lockDir, { timeoutMs: 300, staleMs: 30_000 });
const owned = (lockDir, record) => {
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'owner.json'), `${JSON.stringify(record)}\n`);
};

test('an old lock folder with no owner record is reclaimed', () => withLock((lockDir) => {
  mkdirSync(lockDir, { recursive: true });
  age(lockDir);
  const owner = take(lockDir);
  assert.ok(owner.nonce);
  assert.ok(releaseOwnerLock(lockDir, owner));
  assert.equal(existsSync(lockDir), false);
}));

test('an old lock folder whose owner record is unreadable is reclaimed', () => withLock((lockDir) => {
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'owner.json'), '{"nonce":');
  age(join(lockDir, 'owner.json'));
  age(lockDir);
  const owner = take(lockDir);
  assert.ok(releaseOwnerLock(lockDir, owner));
}));

test('a fresh lock folder with no owner record yet is waited on, and the error names the lock and its holder', () => withLock((lockDir) => {
  mkdirSync(lockDir, { recursive: true });
  assert.throws(() => acquireOwnerLock(lockDir, { timeoutMs: 100 }), (error) => {
    assert.match(error.message, /timed out/u);
    assert.match(error.message, /no owner record/u);
    assert.ok(error.message.includes(lockDir), error.message);
    return true;
  });
  assert.equal(existsSync(lockDir), true);
}));

test('a live holder within its window is waited on, and the error names its pid and age', () => withLock((lockDir) => {
  owned(lockDir, { nonce: 'live-owner', pid: process.pid, acquired_at_ms: Date.now() });
  assert.throws(() => acquireOwnerLock(lockDir, { timeoutMs: 100 }), new RegExp(`held by pid ${process.pid} for \\d+ s`, 'u'));
}));

test('a dead owner is taken over even when a crashed contender left an unreadable takeover claim', () => withLock((lockDir) => {
  owned(lockDir, { nonce: 'dead-owner', pid: DEAD_PID, acquired_at_ms: 0 });
  const claim = join(lockDir, '.takeover-dead-owner.crashed.json');
  writeFileSync(claim, '{"owner_nonce":"dead-');
  age(claim);
  const owner = take(lockDir);
  assert.notEqual(owner.nonce, 'dead-owner');
  assert.ok(releaseOwnerLock(lockDir, owner));
}));

test('a takeover claim older than the stale window is removed even when its pid looks alive', () => withLock((lockDir) => {
  owned(lockDir, { nonce: 'dead-owner', pid: DEAD_PID, acquired_at_ms: 0 });
  // claimant_nonce "0…" sorts first, so while it stands no later contender can ever win.
  writeFileSync(join(lockDir, '.takeover-dead-owner.0.json'), `${JSON.stringify({ owner_nonce: 'dead-owner', claimant_nonce: '0', pid: process.ppid, acquired_at_ms: 0 })}\n`);
  const owner = take(lockDir);
  assert.notEqual(owner.nonce, 'dead-owner');
  assert.ok(releaseOwnerLock(lockDir, owner));
}));

test('a lock held far longer than any team update is reclaimed even when its pid was reused', () => withLock((lockDir) => {
  // process.ppid is alive: the shape of a recycled pid.
  owned(lockDir, { nonce: 'recycled', pid: process.ppid, acquired_at_ms: 0 });
  const owner = take(lockDir);
  assert.notEqual(owner.nonce, 'recycled');
  assert.ok(releaseOwnerLock(lockDir, owner));
}));
