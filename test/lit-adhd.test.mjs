// lit-adhd and its alias lit-rewind: every typed route reaches lit-adhd through the real hook,
// near-miss words do not, a brief leaves the workflow stack alone, `go` reads this session's
// next-step record, and the skill is enrolled on every surface that lists skills.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { detectRoute, SKILL_ROUTES } from '../plugin/hooks/lib/routes.mjs';
import { readManifest } from '../lib/bundle.mjs';
import { expectedSkillIds } from '../lib/doctor.mjs';
import { READ_ONLY_DISCIPLINES } from '../plugin/hooks/lib/workflow-stack.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HOOKS = join(ROOT, 'plugin', 'hooks', 'user-prompt-submit.mjs');
const SKILL = join(ROOT, 'plugin', 'skills', 'lit-adhd');

const project = () => {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-adhd-'));
  mkdirSync(join(ws, '.git'));
  const stateHome = mkdtempSync(join(tmpdir(), 'litmuse-adhd-state-'));
  return { ws, env: { ...process.env, XDG_STATE_HOME: stateHome }, stateHome };
};

const ignite = (where, prompt, sid = 'sess-adhd') => {
  const r = spawnSync(process.execPath, [HOOKS], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt, cwd: where.ws, session_id: sid, turn_id: 't1' }),
    cwd: where.ws,
    encoding: 'utf8',
    env: where.env,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
};

test('every typed route activates lit-adhd with the read-only brief contract', () => {
  const where = project();
  try {
    let sid = 0;
    for (const prompt of ['lit adhd', 'lit rewind', 'lit-adhd', 'lit adhd 요약해줘', 'lit rewind --here']) {
      const ctx = ignite(where, prompt, `sess-fresh-${(sid += 1)}`);
      assert.match(ctx, /LIT IGNITED · lit-adhd/u, prompt);
      assert.match(ctx, /plugin:litmuse:lit-adhd/u, prompt);
      assert.match(ctx, /litmuse rewind --json/u, prompt);
      assert.match(ctx, /READ-ONLY/u, prompt);
      assert.match(ctx, /\[▉▉▉░░\] 3\/5/u, `gauge rule in context: ${prompt}`);
      assert.match(ctx, /… N steps/u, `pulse line in context: ${prompt}`);
    }
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('near-miss words do not activate it and recap keeps its own route', () => {
  const where = project();
  try {
    for (const prompt of ['adhdx', 'rewinding the tape', 'adhd', 'lit adhder', 'lit rewinding']) {
      const ctx = ignite(where, prompt);
      assert.doesNotMatch(ctx, /lit-adhd/u, prompt);
    }
    for (const prompt of ['lit recap']) {
      const ctx = ignite(where, prompt);
      assert.match(ctx, /plugin:litmuse:lit-recap/u, prompt);
      assert.doesNotMatch(ctx, /plugin:litmuse:lit-adhd/u, prompt);
    }
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('a brief in the middle of a loop leaves the workflow stack alone', () => {
  const where = project();
  try {
    ignite(where, 'lit loop fix the typo', 'sess-stack');
    const stackFile = join(where.ws, '.litmuse', 'workflow-stack', 'sess-stack.json');
    const before = JSON.parse(readFileSync(stackFile, 'utf8')).frames;
    assert.equal(before.at(-1).skill, 'lit-loop');
    ignite(where, 'lit adhd', 'sess-stack');
    assert.deepEqual(JSON.parse(readFileSync(stackFile, 'utf8')).frames, before);
    assert.ok(READ_ONLY_DISCIPLINES.includes('lit-adhd'), 'read-only discipline');
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('approve and deny answer a start-work boundary instead of starting new work', () => {
  assert.equal(detectRoute('lit approve')?.route, 'start-work');
  assert.equal(detectRoute('lit deny')?.route, 'start-work');
  const where = project();
  try {
    const ctx = ignite(where, 'lit approve');
    assert.match(ctx, /LIT IGNITED · start-work/u);
    assert.match(ctx, /lit approve/u, 'the keyword is the boundary decision');
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});

test('go spellings route through the hook without touching lit-loop', () => {
  for (const spelling of ['go', 'lit go', 'ㄱㄱ', '고', '진행']) {
    const where = project();
    try {
      const ctx = ignite(where, spelling);
      assert.match(ctx, /Nothing on record/u, spelling);
    } finally {
      rmSync(where.ws, { recursive: true, force: true });
      rmSync(where.stateHome, { recursive: true, force: true });
    }
  }
});

test('lit-adhd is enrolled on every surface that lists skills', () => {
  assert.ok(readManifest().capabilities.skills.some((skill) => skill.id === 'lit-adhd'), 'manifest');
  assert.ok(SKILL_ROUTES.some((route) => route.id === 'lit-adhd'), 'route table');
  assert.ok([...expectedSkillIds()].includes('plugin:litmuse:lit-adhd'), 'doctor listing');
  assert.equal(detectRoute('lit rewind --here')?.route, 'lit-adhd', 'alias routes');
  for (const path of ['SKILL.md', 'references/status-taxonomy.md', 'references/card-examples.md', 'scripts/rewind.mjs']) {
    assert.ok(existsSync(join(SKILL, path)), `${path} ships`);
  }
});

test('the skill body carries its contracts and cross-links lit-recap both ways', () => {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.ok(text.split(/\s+/u).length >= 1000, 'dense body');
  for (const heading of ['## When this applies', '## Inputs and state', '## Procedure', '## Muse tools and approvals', '## Evidence', '## Stop and report', '## Pitfalls']) {
    assert.ok(text.includes(heading), heading);
  }
  for (const rule of [/\[▉▉▉░░\] 3\/5/u, /remaining items?/iu, /never `?`/u, /… \d+ steps/u]) {
    assert.match(text, rule, 'gauge rule');
  }
  for (const ref of ['references/status-taxonomy.md', 'references/card-examples.md']) {
    assert.ok(text.includes(ref), ref);
    assert.ok(existsSync(join(SKILL, ref)), ref);
  }
  const description = /^description: "(.*)"$/mu.exec(text)[1];
  assert.ok(Buffer.byteLength(description) <= 110, `catalog description ${Buffer.byteLength(description)} B fits the budget`);
  assert.match(text, /lit recap/u, 'cross-links lit-recap');
  assert.match(readFileSync(join(ROOT, 'plugin', 'skills', 'lit-recap', 'SKILL.md'), 'utf8'), /lit adhd/u, 'lit-recap cross-links lit-adhd');
});

test('the collector runs from the package bin and the skill fallback runs the same code', () => {
  const where = project();
  try {
    mkdirSync(join(where.ws, 'plans'));
    writeFileSync(join(where.ws, 'plans', 'a.md'), '# A\n- [ ] 1. Do the one thing\n');
    const bin = spawnSync(process.execPath, [join(ROOT, 'bin', 'litmuse.mjs'), 'rewind', '--json', '--here'], {
      cwd: where.ws,
      encoding: 'utf8',
      env: { ...process.env, LITMUSE_SESSION_STORE: join(where.ws, 'no-store') },
    });
    assert.equal(bin.status, 0, bin.stderr);
    const brief = JSON.parse(bin.stdout);
    assert.equal(brief.sources.transcripts, 'unknown');
    assert.equal(brief.sources.plans, 'ok');
    assert.equal(brief.next.kind, 'start-plan');
    const fallback = spawnSync(process.execPath, [join(SKILL, 'scripts', 'rewind.mjs'), '--json', '--here'], {
      cwd: where.ws,
      encoding: 'utf8',
      env: { ...process.env, LITMUSE_SESSION_STORE: join(where.ws, 'no-store') },
    });
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.equal(JSON.parse(fallback.stdout).next.kind, 'start-plan');
    const bad = spawnSync(process.execPath, [join(ROOT, 'bin', 'litmuse.mjs'), 'rewind', '--bogus'], { cwd: where.ws, encoding: 'utf8' });
    assert.equal(bad.status, 64);
  } finally {
    rmSync(where.ws, { recursive: true, force: true });
    rmSync(where.stateHome, { recursive: true, force: true });
  }
});
