// The goal question carries an answer guide under it, so a first-time user knows what to type and what each answer does.
// Muse shows no hook text: every surface here is a model-written reply, so the guide is Markdown the model renders.
import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOAL_ANSWERS, GOAL_STATUS, answerGuide, buildLoopConsent } from '../plugin/hooks/lib/goal.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..', 'plugin');
const PROPOSE = join(PLUGIN, 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs');
const env = { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-guide-state-')) };

function project(planText) {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-guide-'));
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }));
  if (planText) {
    mkdirSync(join(ws, 'plans'));
    writeFileSync(join(ws, 'plans', 'flag.md'), planText);
  }
  return ws;
}
const propose = (ws, ...args) => spawnSync(process.execPath, [PROPOSE, ...args], { cwd: ws, encoding: 'utf8', env }).stdout;
const rowsOf = (guide) => guide.split('\n').filter((line) => /^> \| \*\*`/u.test(line)).map((line) => /`(\w+)`/u.exec(line)[1]);

test('the question suffix and the guide rows come from one option list per question', () => {
  assert.deepEqual(Object.keys(GOAL_ANSWERS), ['plan', 'start', 'loop']);
  assert.ok(GOAL_STATUS.asked('c').endsWith(`(${GOAL_ANSWERS.plan.answers.map(([word]) => word).join(' / ')})`));
  assert.ok(GOAL_STATUS.askedStart.endsWith(`(${GOAL_ANSWERS.start.answers.map(([word]) => word).join(' / ')})`));
  assert.ok(GOAL_STATUS.loopAsked('c').endsWith(`(${GOAL_ANSWERS.loop.answers.map(([word]) => word).join(' / ')})`));
  assert.deepEqual(rowsOf(answerGuide('plan', 'c')), ['yes', 'edit', 'no']);
  assert.deepEqual(rowsOf(answerGuide('start')), ['yes', 'no']);
  assert.deepEqual(rowsOf(answerGuide('loop', 'c')), ['yes', 'no']);
});

test('the plan guide is a Markdown block quote: title, the goal, one row per answer and the type-alone line', () => {
  const guide = answerGuide('plan', 'Every row in plans/flag.md is ticked and `npm test` exits 0 [lit:0123abcd]');
  assert.equal(guide, [
    '> **▶ Answer: approve plan · start work · set goal**',
    '>',
    '> Goal: ``/goal Every row in plans/flag.md is ticked and `npm test` exits 0 [lit:0123abcd]``',
    '>',
    '> | Type | What happens |',
    '> |---|---|',
    '> | **`yes`** | Starts the work now and sets this goal |',
    "> | **`edit`** | Change the plan or the goal's check first, then you are asked again |",
    '> | **`no`** | Nothing starts and no goal is set |',
    '>',
    '> Type the word alone.',
  ].join('\n'));
  const start = answerGuide('start');
  assert.doesNotMatch(start, /Goal:/, 'a start-only question names no goal');
  assert.match(start, /^> \*\*▶ Answer: approve plan · start work\*\*$/mu);
  assert.match(start, /^> \| \*\*`yes`\*\* \| Starts the work now, with no goal \|$/mu);
  assert.match(answerGuide('loop', 'c'), /^> \*\*▶ Answer: set goal for this lit-loop\*\*$/mu);
});

test('goal-propose prints the unchanged question line, then the guide for the model to render under it', () => {
  const ws = project('# Flag\n\n## Done when\n\n- check: `npm test`\n\n## Tasks\n\n- [ ] 1. Add the flag\n');
  const [first, blank, ...rest] = propose(ws, 'plans/flag.md').split('\n');
  assert.match(first, /^Approve plan, start work and set goal: \/goal Every row in plans\/flag\.md is ticked and `npm test` exits 0 \[lit:[0-9a-f]{8}\]\? \(yes \/ edit \/ no\)$/u);
  assert.equal(blank, '');
  assert.equal(rest.join('\n'), `${answerGuide('plan', first.slice(first.indexOf('/goal ') + 6, -'? (yes / edit / no)'.length))}\n`);
  const bare = project('# x\n- [ ] 1. a\n');
  assert.equal(propose(bare, 'plans/flag.md'), `Approve plan and start work? (yes / no)\nNo goal set: the plan has no \`## Done when\` block\n\n${answerGuide('start')}\n`);
  assert.equal(propose(bare, 'plans/missing.md'), 'No goal set: plans/missing.md cannot be read\n', 'no question, no guide');
});

test('the lit-loop question carries its guide on both routes: hook context and goal-propose --loop', () => {
  const offer = buildLoopConsent({ cwd: '.', check: 'npm test', objective: 'fix it', falsifyNow: false });
  assert.equal(offer.guide, answerGuide('loop', offer.consent.condition));
  assert.equal(buildLoopConsent({ cwd: '.', check: 'rm -rf x', objective: 'o', falsifyNow: false }).guide, undefined);
  const ws = project();
  const r = spawnSync(process.execPath, [join(PLUGIN, 'hooks', 'user-prompt-submit.mjs')], {
    input: JSON.stringify({ cwd: ws, hook_event_name: 'UserPromptSubmit', prompt: 'lit loop fix the parser', session_id: 'G1', turn_id: 't' }), cwd: ws, encoding: 'utf8', env,
  });
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Set goal for this lit-loop: \/goal `npm test` exits 0 and this is done: fix the parser \[lit:[0-9a-f]{8}\]\? \(yes \/ no\)\n\n> \*\*▶ Answer: set goal for this lit-loop\*\*/u);
  assert.match(ctx, /descriptions in the user's language/u);
  mkdirSync(join(ws, 'scripts'));
  writeFileSync(join(ws, 'scripts', 'red.mjs'), 'process.exit(1);\n');
  const printed = propose(ws, '--loop', '--check', 'node scripts/red.mjs', 'fix', 'it');
  assert.match(printed, /^Set goal for this lit-loop: [^\n]+\? \(yes \/ no\)\n\n> \*\*▶ Answer: set goal for this lit-loop\*\*\n[\s\S]*> Type the word alone\.\n$/u);
});

test('the skills tell the model to render the guide under the question with the answer words in English', () => {
  for (const id of ['lit-plan', 'lit-loop']) {
    const body = readFileSync(join(PLUGIN, 'skills', id, 'SKILL.md'), 'utf8');
    assert.match(body, /answer guide/u, id);
    assert.match(body, /user's language/u, id);
  }
});
