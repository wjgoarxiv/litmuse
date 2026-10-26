// Interleaved lit routes, driven through the real user-prompt-submit hook: a lit command asked
// for in the middle of a lit-loop pauses the loop on the workflow stack instead of erasing it,
// `lit continue` closes the side frame and resumes the paused spine at its stage, read-only
// routes change nothing, `lit new` starts clean, two sessions keep separate stacks, and `go`
// consumes this session's next-step record or stays ordinary text.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileURLToPath } from 'node:url';

const HOOKS = fileURLToPath(new URL('../plugin/hooks/user-prompt-submit.mjs', import.meta.url));

const project = () => {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-interleave-'));
  mkdirSync(join(ws, '.git'));
  const stateHome = mkdtempSync(join(tmpdir(), 'litmuse-istate-'));
  const env = { ...process.env, XDG_STATE_HOME: stateHome };
  return { ws, env, stateHome };
};

const runHook = (where, text, sid = 'sess-1') => spawnSync(process.execPath, [HOOKS], {
  input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: text, cwd: where.ws, session_id: sid, turn_id: `t-${Math.random()}` }),
  cwd: where.ws,
  encoding: 'utf8',
  env: where.env,
});

const raw = (where, text, sid) => {
  const r = runHook(where, text, sid);
  assert.equal(r.status, 0, r.stderr);
  return { status: r.status, stdout: r.stdout };
};

const prompt = (where, text, sid = 'sess-1') => {
  const r = runHook(where, text, sid);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
};

const stackOf = (where, sid = 'sess-1') => {
  const file = join(where.ws, '.litmuse', 'workflow-stack', `${sid}.json`);
  assert.ok(existsSync(file), `stack file for ${sid}`);
  return JSON.parse(readFileSync(file, 'utf8'));
};

test('an interjected route pauses the spine; lit continue resumes it and closes the side', () => {
  const where = project();
  try {
    prompt(where, 'lit loop fix the typo');
    assert.deepEqual(stackOf(where).frames.map((f) => `${f.skill}:${f.role}:${f.status}`), ['lit-loop:spine:active']);
    prompt(where, 'lit brainstorm names for the release');
    assert.deepEqual(
      stackOf(where).frames.map((f) => `${f.skill}:${f.role}:${f.status}`),
      ['lit-loop:spine:paused', 'lit-brainstorm:side:active'],
    );
    const ctx = prompt(where, 'lit continue');
    assert.match(ctx, /lit-loop/u, 'the resumed spine is named');
    assert.deepEqual(stackOf(where).frames.map((f) => `${f.skill}:${f.role}:${f.status}`), ['lit-loop:spine:active']);
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('read-only routes leave the stack alone; lit new starts clean', () => {
  const where = project();
  try {
    prompt(where, 'lit loop fix the typo');
    const before = stackOf(where).frames;
    prompt(where, 'lit adhd');
    assert.deepEqual(stackOf(where).frames, before, 'lit-adhd is read-only');
    prompt(where, 'lit recap');
    assert.deepEqual(stackOf(where).frames, before, 'lit-recap is read-only');
    prompt(where, 'lit brainstorm names');
    prompt(where, 'lit new loop from scratch', 'sess-1');
    const frames = stackOf(where).frames;
    assert.equal(frames.length, 1, 'restart drops every frame');
    assert.equal(frames[0].skill, 'lit-loop');
    assert.equal(frames[0].status, 'active');
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('asking for the loop again resumes it; two sessions keep separate stacks', () => {
  const where = project();
  try {
    prompt(where, 'lit loop fix the typo');
    prompt(where, 'lit brainstorm names');
    prompt(where, 'lit loop back to the typo');
    assert.deepEqual(stackOf(where).frames.map((f) => `${f.skill}:${f.status}`), ['lit-loop:active']);
    prompt(where, 'lit plan the release', 'sess-2');
    assert.deepEqual(stackOf(where, 'sess-2').frames.map((f) => f.skill), ['lit-plan']);
    assert.deepEqual(stackOf(where, 'sess-1').frames.map((f) => f.skill), ['lit-loop']);
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('go with a start-plan record starts exactly that plan and consumes the record', () => {
  const where = project();
  try {
    mkdirSync(join(where.ws, 'plans'));
    writeFileSync(join(where.ws, 'plans', 'a.md'), '# A\n\n- [ ] 1. Do the one thing\n');
    writeFileSync(join(where.ws, 'plans', 'b.md'), '# B\n\n- [ ] 1. Do the other thing\n');
    const record = join(where.ws, '.litmuse', 'adhd', 'next-sess-1.json');
    mkdirSync(join(where.ws, '.litmuse', 'adhd'), { recursive: true });
    writeFileSync(record, JSON.stringify({ kind: 'start-plan', target: { plan: 'plans/b.md' }, at: new Date().toISOString() }));
    const ctx = prompt(where, 'go');
    assert.match(ctx, /plans\/b\.md/u, 'the briefed plan is named');
    assert.match(ctx, /approval/u, 'the typed go is the approval');
    assert.equal(existsSync(record), false, 'record deleted after use');
    const again = prompt(where, 'go');
    assert.match(again, /Nothing on record/u, 'a second go is ordinary text');
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('every go spelling continues; a stale record and a longer prompt do not', () => {
  const where = project();
  try {
    mkdirSync(join(where.ws, '.litmuse', 'adhd'), { recursive: true });
    const record = join(where.ws, '.litmuse', 'adhd', 'next-sess-1.json');
    for (const text of ['lit go', 'ㄱㄱ', '고', '진행']) {
      writeFileSync(record, JSON.stringify({ kind: 'approve-boundary', target: { workId: 'w', plan: 'plans/a.md' }, at: new Date().toISOString() }));
      assert.match(prompt(where, text), /lit approve/u, text);
      assert.equal(existsSync(record), false, text);
    }
    writeFileSync(record, JSON.stringify({ kind: 'start-plan', target: { plan: 'plans/a.md' }, at: new Date(Date.now() - 31 * 60_000).toISOString() }));
    assert.match(prompt(where, 'go'), /Nothing on record/u, '31 minutes old');
    writeFileSync(record, JSON.stringify({ kind: 'approve-boundary', target: { workId: 'w', plan: 'plans/a.md' }, at: new Date().toISOString() }));
    assert.deepEqual(raw(where, 'go ahead and delete the tests'), { status: 0, stdout: '' }, 'longer prompt is ordinary text with no hook output');
    assert.equal(existsSync(record), true, 'an ordinary prompt leaves the record alone');
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('go resumes this session\u2019s paused frame through the stack', () => {
  const where = project();
  try {
    prompt(where, 'lit loop fix the typo');
    prompt(where, 'lit brainstorm names');
    const record = join(where.ws, '.litmuse', 'adhd', 'next-sess-1.json');
    mkdirSync(join(where.ws, '.litmuse', 'adhd'), { recursive: true });
    writeFileSync(record, JSON.stringify({ kind: 'resume-frame', target: { skill: 'lit-loop', stage: 'PIN' }, at: new Date().toISOString() }));
    const ctx = prompt(where, 'go');
    assert.match(ctx, /resuming the paused lit-loop/iu);
    const frames = stackOf(where).frames;
    assert.equal(frames.at(-1).skill, 'lit-loop');
    assert.equal(frames.at(-1).status, 'active');
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('a boundary approval is never automatic', () => {
  const where = project();
  try {
    const record = join(where.ws, '.litmuse', 'adhd', 'next-sess-1.json');
    mkdirSync(join(where.ws, '.litmuse', 'adhd'), { recursive: true });
    writeFileSync(record, JSON.stringify({ kind: 'approve-boundary', target: { workId: 'w', plan: 'plans/a.md' }, at: new Date().toISOString() }));
    const ctx = prompt(where, 'go');
    assert.match(ctx, /`lit approve`/u);
    assert.match(ctx, /approves nothing/u);
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});
