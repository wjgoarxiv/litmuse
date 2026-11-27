import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalWord } from '../plugin/hooks/lib/autopilot.mjs';
import { CATALOG_SKILLS, SUGGEST_RULES } from '../plugin/hooks/lib/suggest.mjs';

// Organic enrollment: the autopilot and the suggestion tier are wired into the hooks the manifest declares, the
// skills that carry the run, the package, the docs and the answer words the user types, not only present as modules.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const manifest = JSON.parse(read('plugin/.muse-plugin/plugin.json'));
const hook = (event) => manifest.capabilities.hooks.find((h) => h.event === event);

test('the manifest runs the hooks that import the autopilot and the suggestion tier', () => {
  const wiring = {
    UserPromptSubmit: ['user-prompt-submit.mjs', ['./lib/autopilot.mjs', './lib/suggest.mjs']],
    PreToolUse: ['pre-tool-use.mjs', ['./lib/autopilot.mjs', './lib/shell-verdict.mjs']],
    Stop: ['stop.mjs', ['./lib/continuation.mjs']],
    SubagentStart: ['subagent-start.mjs', ['./lib/common.mjs']],
  };
  for (const [event, [file, imports]] of Object.entries(wiring)) {
    const h = hook(event);
    assert.ok(h, event);
    assert.ok(h.command.some((part) => part.endsWith(file)), `${event} runs ${file}`);
    const src = read(`plugin/hooks/${file}`);
    for (const imp of imports) assert.ok(src.includes(imp), `${file} imports ${imp}`);
  }
  assert.match(read('plugin/hooks/lib/continuation.mjs'), /from '\.\/autopilot\.mjs'/);
  assert.match(read('plugin/skills/lit-plan/scripts/goal-propose.mjs'), /hooks\/lib\/autopilot\.mjs/);
});

test('hook deadlines cover the done check (90 s) and one replay (100 s)', () => {
  assert.ok(hook('Stop').timeoutMs >= 95_000);
  assert.ok(hook('UserPromptSubmit').timeoutMs >= 105_000);
});

test('the new modules and the eval script ship in the package', () => {
  const pinned = JSON.parse(read('skills.lock.json')).pack;
  for (const f of ['autopilot', 'shell-verdict', 'suggest']) assert.ok(pinned.includes(`plugin/hooks/lib/${f}.mjs`), f);
  assert.equal(JSON.parse(read('package.json')).scripts['eval:routing'], 'node scripts/routing-eval.mjs dev');
});

test('every answer word the skill and READMEs teach parses as that answer', () => {
  const words = { 'lit approve': 'approve', 'lit 승인': 'approve', 'lit approve x': 'approve-x', 'lit deny': 'deny', 'lit 거절': 'deny',
    'lit skip-row 3': 'skip-row', 'lit pause': 'pause', 'lit 멈춤': 'pause', 'lit resume': 'resume', 'lit 재개': 'resume' };
  for (const [text, word] of Object.entries(words)) assert.equal(approvalWord(text)?.word, word, text);
  const skill = read('plugin/skills/start-work/SKILL.md');
  for (const text of ['`lit approve`', '`lit approve x`', '`lit deny`', '`lit skip-row [N]`', '`lit pause`', '`lit resume`', 'WAITING-ON-USER:',
    'IMPOSSIBLE: <reason>', '`goal: native`', '`Run charter: commit on <branch> in <repo>`', '`Scope roots:', 'muse plugins approve']) {
    assert.ok(skill.includes(text), `start-work teaches ${text}`);
  }
  assert.equal(/lit cancel/i.test(skill), false, 'start-work never sends the user to lit cancel');
  const plan = read('plugin/skills/lit-plan/SKILL.md');
  for (const text of ['Scope roots:', '`Run charter:', '`goal: native`', '## Done when']) assert.ok(plan.includes(text), `lit-plan writes ${text}`);
});

test('the READMEs, the reference and the changelog describe both features', () => {
  for (const file of ['README.md', 'README_ko-KR.md', 'docs/reference.md', 'docs/reference_ko-KR.md']) {
    const text = read(file);
    for (const needle of ['lit approve x', 'WAITING-ON-USER', 'lit skip-row', 'goal: native', 'Run charter', 'plot this csv']) {
      assert.ok(text.includes(needle), `${file} mentions ${needle}`);
    }
  }
  const released = read('CHANGELOG.md').split(/\n## /).find((s) => /^0\.1\.23/.test(s));
  assert.ok(released, 'CHANGELOG has a 0.1.23 section');
  assert.match(released, /lit approve x/);
  assert.match(released, /suggest/i);
  assert.match(released, /muse plugins approve/);
});

test('every suggestion and catalog id is a LitMuse skill that ships a SKILL.md', () => {
  for (const id of [...SUGGEST_RULES.map((r) => r.id), ...CATALOG_SKILLS]) {
    assert.ok(existsSync(join(ROOT, 'plugin', 'skills', id, 'SKILL.md')), `${id} ships a SKILL.md`);
  }
});
