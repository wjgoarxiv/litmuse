import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRoute, ROUTE_INTENTS } from '../plugin/hooks/lib/routes.mjs';
import { buildSkillPlan, matchedSkills, parseSkillHatch, skillPlanContext, skillPlanLine, PLAN_CAP } from '../plugin/hooks/lib/skill-plan.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const noCopies = () => ({ HOME: mkdtempSync(join(tmpdir(), 'litmuse-plan-home-')), XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'litmuse-plan-cfg-')) });

function planFor(prompt, env = noCopies()) {
  const hatch = parseSkillHatch(prompt);
  const hit = detectRoute(hatch ? hatch.rest : prompt);
  const companions = hatch ? [] : matchedSkills(hit.task, ROUTE_INTENTS);
  return buildSkillPlan({ primary: hit.route, companions, forced: hatch, task: hit.task, env });
}

test('a task that matches several skills gets a plan: primary first, companions in cascade order', () => {
  const plan = planFor('lit build a dashboard page with a chart of the experiment data');
  assert.deepEqual(plan.entries.map((e) => e.id), ['frontend-ui-ux', 'lit-scientific-visualization']);
  const ko = planFor('lit 실험 데이터 그래프랑 시스템 구성도 그려서 정리해줘');
  assert.deepEqual(ko.entries.map((e) => e.id), ['lit-loop', 'lit-scientific-visualization', 'lit-diagram-drawer']);
});

test('a plain prompt stays one route with no plan block', () => {
  assert.equal(planFor('lit add a --shout flag with a test'), null);
  assert.equal(planFor('lit 이 함수 테스트 먼저 써 줘'), null);
});

test('quoted text, code spans and fences match nothing', () => {
  assert.equal(planFor('lit fix the typo in "a chart of the experiment data"'), null);
  assert.equal(planFor('lit rename `plotChartData` and `drawDiagram` in the loader'), null);
  assert.equal(planFor('lit fix this\n```\nplot the experiment data as a chart\n```'), null);
});

test('a moved skill that is not installed is named once with its install line', () => {
  const plan = planFor('lit 실험 데이터 그래프랑 시스템 구성도 그려서 정리해줘');
  const line = skillPlanLine(plan);
  assert.match(line, /^Skill plan: 1 lit-loop \(primary\) → 2 lit-scientific-visualization \(not installed: muse skills install .*variants\/litmuse\/lit-scientific-visualization --scope user\) → 3 lit-diagram-drawer \(not installed\)$/);
  assert.equal((line.match(/muse skills install/g) ?? []).length, 1, 'one install line per family');
  assert.doesNotMatch(skillPlanContext(plan), /Catalog[^\n]*lit-pptx/, 'the catalog lists installed skills only');
});

test('an installed moved skill is offered by its id and joins the catalog', () => {
  const env = noCopies();
  for (const id of ['frontend-ui-ux', 'lit-scientific-visualization', 'lit-pptx']) {
    mkdirSync(join(env.XDG_CONFIG_HOME, 'muse', 'skills', id), { recursive: true });
    writeFileSync(join(env.XDG_CONFIG_HOME, 'muse', 'skills', id, 'SKILL.md'), '---\nname: x\n---\n');
  }
  const plan = planFor('lit build a dashboard page with a chart of the experiment data', env);
  assert.equal(skillPlanLine(plan), 'Skill plan: 1 frontend-ui-ux (primary) → 2 lit-scientific-visualization');
  assert.match(skillPlanContext(plan, env), /Catalog \(installed here\):[^\n]*lit-pptx — a finished \.pptx deck/);
});

test('the plan caps at three skills and says what it left out', () => {
  const plan = planFor('lit redesign the landing page, plot the measured results as a chart and draw an architecture diagram');
  assert.equal(plan.entries.length, PLAN_CAP);
  assert.equal(plan.entries[1].id, 'lit-crucible', 'a risky design ask puts lit-crucible first among companions');
  assert.ok(plan.dropped.some((d) => d.why === 'over the cap'));
  assert.match(skillPlanContext(plan), /Left out: .* \(over the cap\)\./);
});

test('lit-crucible joins large design asks in both languages, never an explain request', () => {
  assert.equal(planFor('lit migrate the billing service to the new queue').entries[1].id, 'lit-crucible');
  assert.equal(planFor('lit 결제 시스템 아키텍처 재설계해줘').entries[1].id, 'lit-crucible');
  assert.equal(planFor('lit explain the architecture of this repo'), null);
});

test('the escape hatch forces exactly the named plan and strips the + words from the route', () => {
  const plan = planFor('lit +viz +ui +crucible tidy the report page');
  assert.deepEqual(plan.entries.map((e) => e.id), ['frontend-ui-ux', 'lit-scientific-visualization', 'lit-crucible']);
  assert.equal(plan.forced, true);
  assert.match(skillPlanContext(plan), /keep it exactly, add nothing and drop nothing/);
  const odd = planFor('lit +zzz +plan add a flag');
  assert.deepEqual(odd.entries.map((e) => e.id), ['lit-loop', 'lit-plan']);
  assert.match(skillPlanContext(odd), /Ignored unknown plan names: \+zzz\./);
});

test('a read-only primary never gains a companion that can write', () => {
  const plan = planFor('lit review the landing page redesign and the chart of experiment data');
  assert.ok(!plan || plan.entries.every((e) => ['review-work', 'lit-crucible', 'litresearch'].includes(e.id)));
  const forced = planFor('lit +ui +research review this branch');
  assert.deepEqual(forced.entries.map((e) => e.id), ['review-work', 'litresearch']);
  assert.ok(forced.dropped.some((d) => d.id === 'frontend-ui-ux' && /read-only/.test(d.why)));
});

test('the prompt hook appends the plan block to a full activation and records the ids', () => {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-plan-ws-'));
  const env = { ...process.env, ...noCopies(), XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-plan-state-')) };
  const run = (prompt, sid) => spawnSync(process.execPath, [join(HOOKS, 'user-prompt-submit.mjs')], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt, session_id: sid, turn_id: 't1', cwd: ws }), cwd: ws, encoding: 'utf8', env,
  });
  const multi = JSON.parse(run('lit build a dashboard page with a chart of the experiment data', 'plan-a').stdout);
  const text = multi.hookSpecificOutput.additionalContext;
  assert.match(text, /<litmuse-skill-plan>\nSkill plan: 1 frontend-ui-ux \(primary\)[^\n]* → 2 lit-scientific-visualization/);
  assert.doesNotMatch(text, /experiment data/, 'nothing from the prompt is echoed');
  const plain = JSON.parse(run('lit add a --shout flag with a test', 'plan-b').stdout);
  assert.doesNotMatch(plain.hookSpecificOutput.additionalContext, /skill-plan/);
});
