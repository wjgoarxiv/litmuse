import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, utimesSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-cstate-'));
const DATA_HOME = mkdtempSync(join(tmpdir(), 'litmuse-cdata-'));
const HOOK_ENV = { ...process.env, XDG_STATE_HOME: STATE_HOME, XDG_DATA_HOME: DATA_HOME };

function runHook(name, payload, cwd, input) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], {
    input: input ?? JSON.stringify(payload), cwd, encoding: 'utf8', env: HOOK_ENV,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const workspace = () => mkdtempSync(join(tmpdir(), 'litmuse-compact-'));
const SECRET = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';

function seed(ws, sid) {
  mkdirSync(join(ws, 'plans'), { recursive: true });
  writeFileSync(join(ws, 'plans', 'demo.md'), '# Demo\n\n- [x] 1. Done thing\n- [ ] 2. Second thing\n- [ ] 3. Third thing\n```\n- [ ] 9. fenced\n```\n');
  mkdirSync(join(ws, '.litmuse', 'goals'), { recursive: true });
  writeFileSync(join(ws, '.litmuse', 'goals', 'g.json'), JSON.stringify({
    objective: 'Ship the demo', status: 'active', session_id: sid,
    criteria: [{ id: 'c1', text: 'done one', status: 'pass' }, { id: 'c2', text: 'open one', status: 'open' }],
  }));
  mkdirSync(join(ws, '.litmuse', 'ledger'), { recursive: true });
  const long = 'x'.repeat(500);
  writeFileSync(join(ws, '.litmuse', 'ledger', `${sid}.jsonl`), [
    JSON.stringify({ ts: '2026-10-20T00:00:00Z', kind: 'note', text: `token=${SECRET} ${long}` }),
    JSON.stringify({ ts: '2026-10-20T00:00:01Z', event: 'PostToolUse', route: 'lit-plan', tool: 'read_file' }),
  ].join('\n') + '\n');
  runHook('user-prompt-submit', { prompt: 'lit plan demo', session_id: sid, turn_id: 't7', cwd: ws }, ws);
}

const compact = (ws, sid) => runHook('pre-compact', { hook_event_name: 'PreCompact', session_id: sid, cwd: ws, trigger: 'auto' }, ws);
const latest = (ws) => join(ws, '.litmuse', 'handoff', 'latest.md');

test('pre-compact writes a redacted snapshot and only a systemMessage', () => {
  const ws = workspace();
  seed(ws, 'c1');
  const r = compact(ws, 'c1');
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout), { systemMessage: 'LitMuse saved .litmuse/handoff/latest.md' });
  const text = readFileSync(latest(ws), 'utf8');
  assert.match(text, /lit-plan/);
  assert.match(text, /t7/);
  assert.match(text, /plans\/demo\.md/);
  assert.match(text, /1 ticked/);
  assert.match(text, /2 open/);
  assert.match(text, /2\. Second thing/);
  assert.match(text, /Ship the demo/);
  assert.match(text, /c2/);
  assert.doesNotMatch(text, /ghp_abc/);
  assert.doesNotMatch(text, /x{201}/);
  const copies = readdirSync(join(ws, '.litmuse', 'handoff')).filter((f) => f !== 'latest.md');
  assert.equal(copies.length, 1);
  assert.match(copies[0], /^\d{8}T\d{9}Z\.md$/);
});

test('pre-compact keeps only the last five timestamped copies', () => {
  const ws = workspace();
  seed(ws, 'c2');
  for (let i = 0; i < 8; i += 1) compact(ws, 'c2');
  const copies = readdirSync(join(ws, '.litmuse', 'handoff')).filter((f) => f !== 'latest.md');
  assert.equal(copies.length, 5);
});

test('pre-compact refuses a symlinked .litmuse and stays silent', () => {
  const ws = workspace();
  const elsewhere = mkdtempSync(join(tmpdir(), 'litmuse-elsewhere-'));
  symlinkSync(elsewhere, join(ws, '.litmuse'));
  const r = compact(ws, 'c3');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('pre-compact fails open on malformed stdin', () => {
  const ws = workspace();
  const r = runHook('pre-compact', null, ws, 'not json');
  assert.equal(r.code, 0);
});

const start = (ws, sid, source) => runHook('session-start', { hook_event_name: 'SessionStart', source, session_id: sid, cwd: ws }, ws);
const ctxOf = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;

test('session-start re-injects the snapshot once after compact, fenced as untrusted', () => {
  const ws = workspace();
  seed(ws, 'c4');
  compact(ws, 'c4');
  const r = start(ws, 'c4', 'compact');
  const ctx = ctxOf(r);
  assert.match(ctx, /untrusted/i);
  assert.match(ctx, /Second thing/);
  assert.match(ctx, /~~~~/);
  const again = start(ws, 'c4', 'compact');
  assert.doesNotMatch(ctxOf(again), /Second thing/);
  const t = new Date(Date.now() + 5000);
  utimesSync(latest(ws), t, t);
  assert.match(ctxOf(start(ws, 'c4', 'compact')), /Second thing/);
});

test('session-start accepts resume and ignores startup', () => {
  const ws = workspace();
  seed(ws, 'c5');
  compact(ws, 'c5');
  assert.doesNotMatch(ctxOf(start(ws, 'c5', 'startup')), /Second thing/);
  assert.match(ctxOf(start(ws, 'c5', 'resume')), /Second thing/);
});

test('session-start ignores a snapshot older than 24 hours', () => {
  const ws = workspace();
  seed(ws, 'c6');
  compact(ws, 'c6');
  const old = new Date(Date.now() - 25 * 3600 * 1000);
  utimesSync(latest(ws), old, old);
  assert.doesNotMatch(ctxOf(start(ws, 'c6', 'compact')), /Second thing/);
});

test('session-start keeps stdout under 16 KiB with an oversized snapshot', () => {
  const ws = workspace();
  mkdirSync(join(ws, '.litmuse', 'handoff'), { recursive: true });
  writeFileSync(latest(ws), `# big\n${'line of notes that goes on\n'.repeat(8000)}`);
  const r = start(ws, 'c7', 'compact');
  assert.ok(Buffer.byteLength(r.stdout) < 16 * 1024, String(Buffer.byteLength(r.stdout)));
  assert.match(ctxOf(r), /line of notes/);
});

test('session-start does not follow a symlinked latest.md', () => {
  const ws = workspace();
  const target = join(mkdtempSync(join(tmpdir(), 'litmuse-sl-')), 'secret.md');
  writeFileSync(target, 'SENSITIVE-OUTSIDE');
  mkdirSync(join(ws, '.litmuse', 'handoff'), { recursive: true });
  symlinkSync(target, latest(ws));
  assert.doesNotMatch(start(ws, 'c8', 'compact').stdout, /SENSITIVE-OUTSIDE/);
  assert.equal(existsSync(target), true);
});
