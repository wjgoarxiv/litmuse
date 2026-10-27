// lit-plan's `Scope roots:` rule: a todo that names an absolute path outside the project needs a
// `Scope roots: <path> (<actions>)` line, so start-work's envelope covers it before the work starts.
// `check-plan.mjs --check` names each uncovered folder; fenced blocks and inline-code commands do not count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uncoveredScopePaths } from '../plugin/skills/lit-plan/scripts/check-plan.mjs';

const SCRIPT = fileURLToPath(new URL('../plugin/skills/lit-plan/scripts/check-plan.mjs', import.meta.url));

const setup = () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-scope-')));
  const project = join(base, 'project');
  const outside = join(base, 'shared', 'notes');
  mkdirSync(join(project, 'plans'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  return { base, project, outside };
};

const ROW = (body) => `- [ ] 1. Do it\n  What to do: ${body}\n  Files: src/a.mjs\n  References: none\n  Tests: test/a.test.mjs\n  Acceptance: passes\n  QA scenario: run it\n  Depends on: none\n  Commit: N\n`;
const PLAN = ({ scope = '', todo, extra = '' }) => [
  '# P', '', 'Status: approved', '', '## TL;DR (for humans)', 'x', scope, '## Scope', 'x', '## Bootstrap', 'x',
  '## Verification strategy', 'x', '## Execution strategy', 'x', '## Todos', ROW(todo), extra,
  '## Final verification wave', '- [ ] F1. Audit /etc/hosts-like/review', '## Commit strategy', 'x', '## Success criteria', 'x', '## DoneClaim', 'x', '',
].join('\n');

const check = (project, text) => {
  const path = join(project, 'plans', 'p.md');
  writeFileSync(path, text);
  return spawnSync(process.execPath, [SCRIPT, '--check', path], { cwd: project, encoding: 'utf8' });
};

test('an outside path in a todo with no Scope roots line fails and names the line to add', () => {
  const { project, outside } = setup();
  const r = check(project, PLAN({ todo: `read ${join(outside, 'today.md')} for context` }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`FAIL .*${join(outside, 'today.md').replace(/[.]/g, '\\.')}.*Scope roots: ${outside.replace(/[.]/g, '\\.')} \\(read\\)`));
});

test('a covering Scope roots line passes, and paths inside the project never need one', () => {
  const { project, outside, base } = setup();
  assert.equal(check(project, PLAN({ scope: `Scope roots: ${join(base, 'shared')} (read)`, todo: `read ${join(outside, 'today.md')}` })).status, 0);
  assert.equal(check(project, PLAN({ todo: `edit ${join(project, 'src', 'a.mjs')}` })).status, 0);
});

test('fenced blocks and inline-code commands do not count; an inline-code path alone does', () => {
  const { project, outside } = setup();
  const fenced = PLAN({ todo: 'see below', extra: `\`\`\`bash\ncat ${join(outside, 'x.md')}\n\`\`\`\n` });
  assert.equal(check(project, fenced).status, 0, 'a fenced command is data');
  assert.equal(check(project, PLAN({ todo: `run \`ls ${outside}\` once` })).status, 0, 'an inline command is data');
  assert.equal(check(project, PLAN({ todo: `read \`${outside}\`` })).status, 1, 'an inline path is a folder the work reaches');
});

test('paths outside the Todos section and too-broad folders are handled without a guess', () => {
  const { project } = setup();
  assert.deepEqual(uncoveredScopePaths(PLAN({ todo: 'nothing outside' }), project), [], 'the final wave and the TL;DR are not todos');
  const [broad] = uncoveredScopePaths(PLAN({ todo: 'read /nonexistent-top/x/y.md' }), project);
  assert.equal(broad.suggestion, undefined, 'a top-level folder is never suggested');
  assert.match(broad.problem, /narrower/);
});
