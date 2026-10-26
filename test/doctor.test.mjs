import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, setMuseState, collect } from './helpers.mjs';
import { install } from '../lib/install.mjs';
import { doctor } from '../lib/doctor.mjs';

const quiet = () => {};

test('doctor before install reports FAIL and exits 1', async () => {
  const { env } = sandbox();
  const out = collect();
  const code = await doctor({ env, flags: {}, print: out.print });
  assert.equal(code, 1);
  assert.match(out.text(), /FAIL .*not installed/i);
});

test('unapproved capabilities read "approval needed", never PASS', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true }, interactive: false, print: quiet });
  const out = collect();
  const code = await doctor({ env, flags: {}, print: out.print });
  assert.equal(code, 1);
  assert.match(out.text(), /APPROVAL NEEDED hook:user-prompt-submit .*muse plugins approve litmuse:hook:user-prompt-submit/);
  assert.match(out.text(), /APPROVAL NEEDED agent:lit-planner/);
  assert.match(out.text(), /21 approvals needed/);
  assert.doesNotMatch(out.text(), /LitMuse doctor: PASS/);
});

test('after the approvals doctor passes and lists every skill and the catalog bytes', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const out = collect();
  const code = await doctor({ env, flags: {}, print: out.print });
  assert.equal(code, 0, out.text());
  assert.match(out.text(), /PASS skills: 42\/42 enrolled/);
  assert.match(out.text(), /catalog: LitMuse descriptions \d+ B/);
  assert.match(out.text(), /LitMuse doctor: PASS/);
});

test('overlapping personal skills and LitClaude paths produce a WARN, not a FAIL', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  setMuseState(env, {
    extraSkills: [
      { id: 'lit-plan', name: 'lit-plan', scope: 'user', activation: 'on', path: '$HOME/.claude/skills/lit-plan/SKILL.md', context_cost: { startup_bytes: 400 } },
      { id: 'helper', name: 'helper', scope: 'user', activation: 'on', path: '$HOME/.claude/plugins/cache/x/litclaude/1.0.0/skills/helper/SKILL.md', context_cost: { startup_bytes: 200 } },
    ],
  });
  const out = collect();
  const code = await doctor({ env, flags: {}, print: out.print });
  assert.equal(code, 0);
  assert.match(out.text(), /WARN overlap: personal skill lit-plan/);
  assert.match(out.text(), /WARN overlap: .*\.claude\/plugins/);
});

test('over the catalog cap the WARN says LitMuse descriptions can be shortened too (Muse 1.4.11)', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  setMuseState(env, {
    extraSkills: [
      { id: 'bundled:big', name: 'big', scope: 'bundled', activation: 'on', path: 'bundled://muse-core/skills/big/SKILL.md', context_cost: { startup_bytes: 30000 } },
    ],
  });
  const out = collect();
  const code = await doctor({ env, flags: {}, print: out.print });
  assert.equal(code, 0);
  assert.match(out.text(), /WARN catalog: over the 32 KB cap: .*plugin descriptions in id order.*LitMuse/);
  assert.doesNotMatch(out.text(), /keeps bundled and plugin descriptions/);
});

test('foreign rules file is reported as INFO when present', async () => {
  const { home, env } = sandbox();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), 'x');
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const out = collect();
  await doctor({ env, flags: {}, print: out.print });
  assert.match(out.text(), /INFO foreign rules: ~\/\.claude\/CLAUDE\.md/);
});

test('doctor --json emits machine-readable rows', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true }, interactive: false, print: quiet });
  const out = collect();
  await doctor({ env, flags: { json: true }, print: out.print });
  const report = JSON.parse(out.text());
  assert.equal(report.summary.approvalsNeeded, 21);
  assert.ok(report.rows.some((r) => r.status === 'APPROVAL NEEDED' && r.fix.startsWith('muse plugins approve ')));
});

// Review L4: doctor's expectation comes from the skill folders, not from the manifest it checks.
test('doctor expects every skill folder, including one the manifest forgot', async () => {
  const { expectedSkillIds } = await import('../lib/doctor.mjs');
  const { mkdtempSync, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { ROOT } = await import('./helpers.mjs');
  const copy = mkdtempSync(join(tmpdir(), 'litmuse-plugin-'));
  cpSync(join(ROOT, 'plugin'), copy, { recursive: true });
  mkdirSync(join(copy, 'skills', 'orphan-skill'));
  writeFileSync(join(copy, 'skills', 'orphan-skill', 'SKILL.md'), '---\nname: orphan-skill\ndescription: "x"\n---\n');
  assert.ok(expectedSkillIds(copy).includes('plugin:litmuse:orphan-skill'));
});

// Review L5: the document skills need Poppler; doctor lists it.
test('doctor lists Poppler among the runtimes', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const out = collect();
  await doctor({ env: { ...env, LITMUSE_SKIP_RUNTIMES: '0' }, flags: {}, print: out.print });
  assert.match(out.text(), /runtime Poppler \(pdftoppm, pdftotext\)/);
});

// Parity port: every pinned engine runtime the bundle ships gets a doctor row with its pre-warm command.
test('doctor lists every shipped engine runtime and how to pre-warm it', async () => {
  const { runtimeModules } = await import('../lib/runtime.mjs');
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  const out = collect();
  await doctor({ env: { ...env, LITMUSE_SKIP_RUNTIMES: '0' }, flags: {}, print: out.print });
  const mods = runtimeModules();
  assert.ok(mods.length >= 4, 'office, diagram, readme and sciviz ship');
  for (const m of mods) assert.match(out.text(), new RegExp(`engine ${m.name}\\b`), m.name);
  assert.match(out.text(), /npx @litfamily\/litmuse runtime install /);
});
