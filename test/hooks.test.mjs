import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, utimesSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionPath } from '../plugin/hooks/lib/common.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const STDOUT_CAP = 16 * 1024;
// Route state lives outside the workspace (review R2-H2), in a per-run state home.
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-state-'));
const HOOK_ENV = { ...process.env, XDG_STATE_HOME: STATE_HOME };

function runHook(name, payload, cwd, args = []) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`), ...args], {
    input: JSON.stringify(payload),
    cwd,
    encoding: 'utf8',
    env: HOOK_ENV,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const stateFile = (ws, sid) => sessionPath(ws, sid, HOOK_ENV);
const readState = (ws, sid) => JSON.parse(readFileSync(stateFile(ws, sid), 'utf8'));

function workspace() {
  return mkdtempSync(join(tmpdir(), 'litmuse-hook-'));
}

test('user-prompt-submit: bare lit emits additionalContext naming the skill to load', () => {
  const ws = workspace();
  const r = runHook('user-prompt-submit', {
    hook_event_name: 'UserPromptSubmit', prompt: 'lit plan a tiny todo app',
    session_id: 'sess-1', turn_id: 'turn-1', cwd: ws,
  }, ws);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /plugin:litmuse:lit-plan/);
  assert.match(ctx, /LIT IGNITED · lit-plan/);
  assert.ok(Buffer.byteLength(r.stdout) < STDOUT_CAP);
  const state = readState(ws, 'sess-1');
  assert.equal(existsSync(join(ws, '.litmuse', 'sessions')), false, 'no route state inside the workspace');
  assert.match(ctx, /\.litmuse\/ledger\/sess-1\.jsonl/, 'context names the ledger path');
  assert.equal(state.route, 'lit-plan');
  assert.equal(state.turnId, 'turn-1');
});

test('user-prompt-submit: ordinary prompt prints nothing and clears the route', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 's2', turn_id: 't1', cwd: ws }, ws);
  const r = runHook('user-prompt-submit', { prompt: 'thanks, looks good', session_id: 's2', turn_id: 't2', cwd: ws }, ws);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  const state = readState(ws, 's2');
  assert.equal(state.route, null);
});

test('user-prompt-submit: an unrouted prompt in a fresh session writes no state', () => {
  const ws = workspace();
  const r = runHook('user-prompt-submit', { prompt: 'hello', session_id: 's3', cwd: ws }, ws);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(join(ws, '.litmuse')), false);
});

test('hooks fail open on malformed stdin', () => {
  const ws = workspace();
  for (const name of ['session-start', 'user-prompt-submit', 'pre-tool-use', 'post-tool-use', 'post-tool-use-failure', 'stop', 'subagent-start', 'subagent-stop', 'session-end', 'pre-compact']) {
    const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], { input: 'not json', cwd: ws, encoding: 'utf8' });
    assert.equal(r.status, 0, name);
  }
});

test('session-start: steering context lists every skill and fits the stdout cap', () => {
  const ws = workspace();
  const r = runHook('session-start', { hook_event_name: 'SessionStart', source: 'startup', session_id: 's4', cwd: ws }, ws);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /LitMuse 0\.1\.1/);
  assert.match(ctx, /plugin:litmuse:/);
  assert.match(ctx, /personal/i, 'foreign personal context steering is present');
  for (const id of ['lit-loop', 'lit-plan', 'browser-drive', 'lit-humanizer']) assert.match(ctx, new RegExp(`\\b${id}\\b`));
  assert.ok(Buffer.byteLength(r.stdout) < 12 * 1024, `session context is ${Buffer.byteLength(r.stdout)} B`);
});

test('session-start: a cached newer version adds one update line', () => {
  const ws = workspace();
  const data = mkdtempSync(join(tmpdir(), 'litmuse-data-'));
  mkdirSync(join(data, 'litmuse'), { recursive: true });
  writeFileSync(join(data, 'litmuse', 'update-check.json'), JSON.stringify({ latest: '9.9.9', checkedAt: Date.now() }));
  const r = spawnSync(process.execPath, [join(HOOKS, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 's5', cwd: ws }), cwd: ws, encoding: 'utf8',
    env: { ...process.env, XDG_DATA_HOME: data },
  });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /9\.9\.9/);
});

test('pre-tool-use: lit-plan route refuses product writes and allows plans/', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit plan auth', session_id: 's6', turn_id: 't1', cwd: ws }, ws);
  const blocked = runHook('pre-tool-use', { tool_name: 'write_file', tool_input: { path: 'src/app.js', content: 'x' }, session_id: 's6', cwd: ws }, ws);
  assert.equal(blocked.code, 2);
  assert.match(blocked.stderr, /planning/i);
  const allowed = runHook('pre-tool-use', { tool_name: 'write_file', tool_input: { path: 'plans/auth.md', content: '# Plan\n' }, session_id: 's6', cwd: ws }, ws);
  assert.equal(allowed.code, 0);
});

test('pre-tool-use: negation clusters in Markdown are refused during a lit route', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit write the guide', session_id: 's7', turn_id: 't1', cwd: ws }, ws);
  const text = 'Never run this twice. Do not edit the lock file. You cannot skip the review.\n';
  const r = runHook('pre-tool-use', { tool_name: 'write_file', tool_input: { path: 'docs/guide.md', content: text }, session_id: 's7', cwd: ws }, ws);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /positive/i);
  const ok = runHook('pre-tool-use', { tool_name: 'write_file', tool_input: { path: 'docs/guide.md', content: 'Run this once. Keep the lock file as it is.\n' }, session_id: 's7', cwd: ws }, ws);
  assert.equal(ok.code, 0);
  const code = runHook('pre-tool-use', { tool_name: 'write_file', tool_input: { path: 'src/a.js', content: text }, session_id: 's7', cwd: ws }, ws);
  assert.equal(code.code, 0, 'code files are left to the code skills');
});

test('pre-tool-use: no route means no guard', () => {
  const ws = workspace();
  const r = runHook('pre-tool-use', { tool_name: 'write_file', tool_input: { path: 'src/app.js', content: 'Never. Do not. Cannot.' }, session_id: 's8', cwd: ws }, ws);
  assert.equal(r.code, 0);
});

test('post-tool-use hooks append to the ledger only while a route is active', () => {
  const ws = workspace();
  runHook('post-tool-use', { tool_name: 'read_file', tool_input: { path: 'a' }, session_id: 's9', cwd: ws }, ws);
  assert.equal(existsSync(join(ws, '.litmuse', 'ledger', 's9.jsonl')), false);
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 's9', turn_id: 't1', cwd: ws }, ws);
  runHook('post-tool-use', { tool_name: 'bash', tool_input: { command: 'npm test' }, session_id: 's9', cwd: ws }, ws);
  runHook('post-tool-use-failure', { tool_name: 'bash', tool_input: { command: 'npm test' }, error: 'exit 1', session_id: 's9', cwd: ws }, ws);
  const lines = readFileSync(join(ws, '.litmuse', 'ledger', 's9.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.event, l.tool, l.ok]), [['PostToolUse', 'bash', true], ['PostToolUseFailure', 'bash', false]]);
  assert.deepEqual(lines[0].inputKeys, ['command']);
  assert.equal(JSON.stringify(lines).includes('npm test'), false, 'tool input values stay out of the ledger');
});

test('stop: lit-plan turn is held once until a plan file exists', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit plan a tiny todo app', session_id: 's10', turn_id: 't1', cwd: ws }, ws);
  const first = runHook('stop', { session_id: 's10', turn_id: 't1', cwd: ws }, ws);
  assert.equal(first.code, 2);
  assert.match(first.stderr, /plans\//);
  const second = runHook('stop', { session_id: 's10', turn_id: 't1', cwd: ws }, ws);
  assert.equal(second.code, 0, 'the gate holds a turn at most once');

  runHook('user-prompt-submit', { prompt: 'lit plan another', session_id: 's11', turn_id: 't1', cwd: ws }, ws);
  mkdirSync(join(ws, 'plans'), { recursive: true });
  writeFileSync(join(ws, 'plans', 'todo.md'), '# Plan\n- [ ] 1. Do it\n');
  const future = new Date(Date.now() + 5000);
  utimesSync(join(ws, 'plans', 'todo.md'), future, future);
  assert.equal(runHook('stop', { session_id: 's11', turn_id: 't1', cwd: ws }, ws).code, 0);
});

test('stop: other routes and unrouted sessions end normally', () => {
  const ws = workspace();
  assert.equal(runHook('stop', { session_id: 's12', cwd: ws }, ws).code, 0);
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 's13', turn_id: 't1', cwd: ws }, ws);
  assert.equal(runHook('stop', { session_id: 's13', turn_id: 't1', cwd: ws }, ws).code, 0);
});

test('subagent-start: child gets the reader-mode return contract', () => {
  const ws = workspace();
  const r = runHook('subagent-start', { hook_event_name: 'SubagentStart', session_id: 's14', cwd: ws }, ws);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(out.hookSpecificOutput.additionalContext, /conclusions/i);
});

test('session-end closes the ledger and clears the route', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 's15', turn_id: 't1', cwd: ws }, ws);
  runHook('subagent-stop', { session_id: 's15', cwd: ws }, ws);
  runHook('session-end', { session_id: 's15', cwd: ws }, ws);
  const lines = readFileSync(join(ws, '.litmuse', 'ledger', 's15.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.event), ['SubagentStop', 'SessionEnd']);
  assert.equal(readState(ws, 's15').route, null);
});

test('session ids with path characters are refused', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: '../../evil', cwd: ws }, ws);
  assert.equal(sessionPath(ws, '../../evil', HOOK_ENV), null);
  assert.equal(existsSync(join(ws, '.litmuse')), false);
});

// Review H1: every write-capable tool Muse 1.4.10 exposes (write_file, edit_file, apply_patch, delete_file and the
// shell tools bash, bash_input, exec_command, shell) goes through the lit-plan limit.
function planSession(name) {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit plan auth', session_id: name, turn_id: 't1', cwd: ws }, ws);
  return ws;
}
const pre = (ws, sid, tool, input) => runHook('pre-tool-use', { tool_name: tool, tool_input: input, session_id: sid, cwd: ws }, ws);

test('lit-plan: a plans/.. escape is refused', () => {
  const ws = planSession('h1a');
  assert.equal(pre(ws, 'h1a', 'write_file', { path: 'plans/../src/app.js', content: 'x' }).code, 2);
  assert.equal(pre(ws, 'h1a', 'write_file', { path: join(ws, 'plans', '..', 'src', 'app.js'), content: 'x' }).code, 2);
  assert.equal(pre(ws, 'h1a', 'write_file', { path: join(ws, 'plans', 'ok.md'), content: '# ok\n' }).code, 0);
});

test('lit-plan: apply_patch outside plans/ is refused, inside is allowed', () => {
  const ws = planSession('h1b');
  const add = '*** Begin Patch\n*** Add File: src/app.js\n+x\n*** End Patch\n';
  assert.equal(pre(ws, 'h1b', 'apply_patch', { patch: add }).code, 2);
  assert.equal(pre(ws, 'h1b', 'apply_patch', { input: add }).code, 2);
  assert.equal(pre(ws, 'h1b', 'apply_patch', { path: 'src/app.js', patch: '@@\n-a\n+b\n' }).code, 2);
  const move = '*** Begin Patch\n*** Update File: plans/a.md\n*** Move to: src/a.md\n@@\n-a\n+b\n*** End Patch\n';
  assert.equal(pre(ws, 'h1b', 'apply_patch', { patch: move }).code, 2);
  assert.equal(pre(ws, 'h1b', 'apply_patch', { patch: '*** Begin Patch\n*** Add File: plans/a.md\n+# Plan\n*** End Patch\n' }).code, 0);
});

test('lit-plan: delete_file outside plans/ is refused', () => {
  const ws = planSession('h1c');
  assert.equal(pre(ws, 'h1c', 'delete_file', { path: 'src/app.js' }).code, 2);
  assert.equal(pre(ws, 'h1c', 'delete_file', { path: 'plans/old.md' }).code, 0);
});

test('lit-plan: shell tools run only provably read-only commands', () => {
  const ws = planSession('h1d');
  for (const [tool, cmd] of [
    ['bash', 'echo x > src/app.js'],
    ['bash', 'rm -rf src'],
    ['bash', 'cat a | tee b'],
    ['bash', 'sed -i s/a/b/ f'],
    ['bash', 'ls; npm install'],
    ['bash', 'git commit -m x'],
    ['bash', 'cat $(touch x)'],
    ['exec_command', 'echo x >> README.md'],
    ['shell', 'mv a b'],
  ]) {
    assert.equal(pre(ws, 'h1d', tool, { command: cmd }).code, 2, `${tool}: ${cmd}`);
  }
  assert.equal(pre(ws, 'h1d', 'bash_input', { input: 'y\n' }).code, 2, 'bash_input cannot be proven read-only');
  for (const cmd of ['git status', 'git log --oneline -5', 'rg -n todo src', 'wc -l src/a.js']) {
    assert.equal(pre(ws, 'h1d', 'bash', { command: cmd }).code, 0, cmd);
  }
  for (const cmd of ['ls -la && cat AGENTS.md 2>/dev/null; cat package.json 2>/dev/null | head -50', 'find . -name "*.js"', 'find . -name x -delete']) {
    assert.equal(pre(ws, 'h1d', 'bash', { command: cmd }).code, 2, cmd);
  }
});

test('lit-plan: a symlink inside plans/ that points outside is refused', () => {
  const ws = planSession('h1e');
  mkdirSync(join(ws, 'plans'), { recursive: true });
  mkdirSync(join(ws, 'src'), { recursive: true });
  symlinkSync(join(ws, 'src'), join(ws, 'plans', 'link'));
  assert.equal(pre(ws, 'h1e', 'write_file', { path: 'plans/link/app.js', content: 'x' }).code, 2);
});

test('negation guard reads Markdown added through apply_patch', () => {
  const ws = workspace();
  runHook('user-prompt-submit', { prompt: 'lit write the guide', session_id: 'h1f', turn_id: 't1', cwd: ws }, ws);
  const patch = '*** Begin Patch\n*** Add File: docs/guide.md\n+Never run this twice. Do not edit the lock file. You cannot skip the review.\n*** End Patch\n';
  const r = pre(ws, 'h1f', 'apply_patch', { patch });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /three/);
});

// Review M3: the guard counts only negations a write adds, and stays off on the prose-editing route.
test('negation guard ignores negations already in the file and the humanizer route', () => {
  const ws = workspace();
  mkdirSync(join(ws, 'docs'), { recursive: true });
  const ko = '이 기능은 윈도우를 지원하지 않습니다. 설정 파일도 자동으로 만들지 않습니다.\n';
  writeFileSync(join(ws, 'docs', 'a.md'), ko);
  runHook('user-prompt-submit', { prompt: 'lit loop tidy docs', session_id: 'm3a', turn_id: 't1', cwd: ws }, ws);
  assert.equal(pre(ws, 'm3a', 'write_file', { path: 'docs/a.md', content: `${ko}\n추가 문단입니다.\n` }).code, 0, 'existing sentences are the user\'s');
  assert.equal(pre(ws, 'm3a', 'write_file', { path: 'docs/b.md', content: ko }).code, 2, 'new Korean negation pair is refused');
  runHook('user-prompt-submit', { prompt: 'lit korean docs/b.md', session_id: 'm3b', turn_id: 't1', cwd: ws }, ws);
  assert.equal(pre(ws, 'm3b', 'write_file', { path: 'docs/b.md', content: ko }).code, 0, 'lit-humanizer keeps claim direction');
  const edit = pre(ws, 'm3a', 'edit_file', { path: 'docs/a.md', old_string: '추가 문단입니다.', new_string: '추가 문단입니다. 지금은 쓰지 않습니다. 앞으로도 쓰지 않습니다.' });
  assert.equal(edit.code, 2);
  assert.match(edit.stderr, /two Korean/);
});

// Review L6: state directories that are symlinks are left alone.
test('hooks skip state writes when .litmuse or its subdirectories are links', () => {
  const ws = workspace();
  const elsewhere = mkdtempSync(join(tmpdir(), 'litmuse-elsewhere-'));
  symlinkSync(elsewhere, join(ws, '.litmuse'));
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 'l6', turn_id: 't1', cwd: ws }, ws);
  assert.deepEqual(readdirSync(elsewhere), []);
});

// Live finding (fix round): a lit-plan turn whose write was refused spawned a general-purpose child that copied the
// file with cp. During lit-plan only read-only LitMuse agents may be spawned, and other ways to start writers wait.
test('lit-plan: only read-only LitMuse agents can be spawned; workflows and schedules wait', () => {
  const ws = planSession('h1g');
  assert.equal(pre(ws, 'h1g', 'subagent_spawn', { objective: 'copy plans/a.md to docs/a.md', role: 'copy' }).code, 2, 'general-purpose child');
  assert.equal(pre(ws, 'h1g', 'subagent_spawn', { objective: 'x', subagent_type: 'general-purpose' }).code, 2);
  assert.equal(pre(ws, 'h1g', 'subagent_spawn', { objective: 'x', subagent_type: 'litmuse/lit-executor' }).code, 2);
  assert.equal(pre(ws, 'h1g', 'subagent_spawn', { objective: 'x', subagent_type: 'litmuse/qa-runner' }).code, 2);
  assert.equal(pre(ws, 'h1g', 'subagent_spawn', { objective: 'research', subagent_type: 'litmuse/lit-planner' }).code, 0);
  assert.equal(pre(ws, 'h1g', 'subagent_spawn', { objective: 'docs', subagent_type: 'litmuse/librarian-researcher' }).code, 0);
  for (const tool of ['workflow', 'cron_create', 'monitor']) assert.equal(pre(ws, 'h1g', tool, {}).code, 2, tool);
  const other = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 'h1h', turn_id: 't1', cwd: other }, other);
  assert.equal(pre(other, 'h1h', 'subagent_spawn', { objective: 'x' }).code, 0, 'other routes spawn freely');
});


// Review round 2, R2-H1: the shell path is deny-by-default. Every probe from the review is refused.
test('lit-plan shell: the round-2 probes are refused', () => {
  const ws = planSession('r2h1');
  for (const cmd of [
    'ls & touch src/app.js',
    'sort -o src/app.js plans/p.md',
    'uniq plans/p.md src/app.js',
    'git diff --output=src/app.js',
    'find . -fls src/app.js',
    'tree -o src/app.js',
    'rg --pre ./plans/run.sh x .',
    'git grep --open-files-in-pager=touch x',
    'ls\rtouch x',
    'git -c core.pager=touch log',
    'git log --ext-diff',
    'cat README.md 2>/dev/null',
    'head -n 5 a\\ b',
    'git log -O src/app.js',
    'rg -n x --replace y src',
  ]) {
    assert.equal(pre(ws, 'r2h1', 'bash', { command: cmd }).code, 2, cmd);
  }
  for (const cmd of ['ls -la', 'ls src', 'cat package.json', 'head -n 20 README.md', 'tail -5 log.txt', 'wc -l src/a.js', 'rg -n -i "todo item" src', 'git status --short', 'git diff --stat', 'git show HEAD --stat', 'git log --oneline -n 5']) {
    assert.equal(pre(ws, 'r2h1', 'bash', { command: cmd }).code, 0, cmd);
  }
});

// R2-H2: the route state sits outside the workspace, the model cannot reach it, and losing it fails closed.
test('lit-plan state: out of reach, and a missing or corrupt state file keeps the limit on', () => {
  const ws = planSession('r2h2');
  const file = stateFile(ws, 'r2h2');
  assert.ok(file && existsSync(file));
  assert.equal(file.startsWith(ws), false);
  assert.equal(pre(ws, 'r2h2', 'write_file', { path: file, content: '{"route":null}' }).code, 2, 'absolute write to state');
  assert.equal(pre(ws, 'r2h2', 'delete_file', { path: file }).code, 2);
  assert.equal(pre(ws, 'r2h2', 'write_file', { path: '.litmuse/sessions/r2h2.json', content: '{"route":null}' }).code, 2, 'old location refused on every route');
  writeFileSync(file, 'not json');
  assert.equal(pre(ws, 'r2h2', 'write_file', { path: 'src/app.js', content: 'x' }).code, 2, 'corrupt state fails closed');
  rmSync(file);
  assert.equal(pre(ws, 'r2h2', 'write_file', { path: 'src/app.js', content: 'x' }).code, 2, 'missing state, journal says lit-plan');
  runHook('user-prompt-submit', { prompt: 'thanks', session_id: 'r2h2', turn_id: 't2', cwd: ws }, ws);
  assert.equal(pre(ws, 'r2h2', 'write_file', { path: 'src/app.js', content: 'x' }).code, 0, 'a new non-lit prompt clears the route');
  const loop = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 'r2h2b', turn_id: 't1', cwd: loop }, loop);
  assert.equal(pre(loop, 'r2h2b', 'write_file', { path: '.litmuse/sessions/x.json', content: '{}' }).code, 2);
});

// R2-M1: during lit-plan only listed read-only tools pass; MCP and unknown tools are refused.
test('lit-plan tools: allowlist only', () => {
  const ws = planSession('r2m1');
  for (const tool of ['mcp__filesystem__write_file', 'mcp__git__commit', 'brand_new_tool', 'add_memory', 'send_session_message', 'write_todos']) {
    assert.equal(pre(ws, 'r2m1', tool, { path: 'src/app.js' }).code, 2, tool);
  }
  for (const tool of ['read_file', 'search', 'read_skill', 'web_search', 'web_fetch', 'read_memory', 'subagent_wait', 'subagent_read_result', 'work_status']) {
    assert.equal(pre(ws, 'r2m1', tool, { path: 'src/app.js' }).code, 0, tool);
  }
});

// R2-L1, R2-L2, R2-L3.
test('apply_patch targets are found in any string field; messages point to the right way out', () => {
  const ws = planSession('r2l');
  assert.equal(pre(ws, 'r2l', 'apply_patch', { path: 'plans/p.md', patch_text: '*** Add File: src/app.js\n+x' }).code, 2);
  const child = pre(ws, 'r2l', 'subagent_spawn', { objective: 'x' });
  assert.match(child.stderr, /read-only litmuse\/\* agent/);
  const loop = workspace();
  runHook('user-prompt-submit', { prompt: 'lit loop docs', session_id: 'r2l2', turn_id: 't1', cwd: loop }, loop);
  const neg = pre(loop, 'r2l2', 'write_file', { path: 'docs/b.md', content: '지원하지 않습니다. 만들지 않습니다.\n' });
  assert.equal(neg.code, 2);
  assert.match(neg.stderr, /lit-humanizer/);
});

// Hook-trust mitigation: each declared hook command carries a digest of its code; a changed script refuses to run.
test('hook digests: the manifest pins them and a mismatch refuses', async () => {
  const { readManifest } = await import('../lib/bundle.mjs');
  const { hookDigest } = await import('../plugin/hooks/lib/digest.mjs');
  for (const h of readManifest().capabilities.hooks) {
    const [, script, flag, digest] = h.command;
    assert.equal(flag, '--digest', h.id);
    assert.equal(digest, hookDigest(join(HOOKS, '..', script)), `${h.id}: run npm run sync:digests`);
  }
  const ws = workspace();
  const good = readManifest().capabilities.hooks.find((h) => h.id === 'user-prompt-submit').command[3];
  assert.equal(runHook('user-prompt-submit', { prompt: 'lit loop', session_id: 'dg1', cwd: ws }, ws, ['--digest', good]).code, 0);
  const bad = runHook('pre-tool-use', { tool_name: 'read_file', session_id: 'dg1', cwd: ws }, ws, ['--digest', '0000000000000000']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /digest/i);
});

// Hook trust is keyed on the digest, so every file a hook loads at run time must be inside it, including the
// lit-humanizer detector that PostToolUse imports from the skill folder.
test('the hook digest covers the files hooks load from skill folders', async () => {
  const { DIGEST_EXTRAS } = await import('../plugin/hooks/lib/digest.mjs');
  const loaded = readFileSync(join(HOOKS, 'post-tool-use.mjs'), 'utf8');
  assert.match(loaded, /'skills', 'lit-humanizer'/);
  for (const rel of ['skills/lit-humanizer/scripts/core.mjs', 'skills/lit-humanizer/rules.json']) {
    assert.ok(DIGEST_EXTRAS.includes(rel), rel);
    assert.ok(existsSync(join(HOOKS, '..', rel)), rel);
  }
});
