// Muse shows no hook message to the user, so the ignition line has to be the model's own first output. The prompt hook
// leads its context with that exact line, once, and the re-entry notes do the same with the continue line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = process.env.LITMUSE_IGNITION_HOOKS || join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-ignition-state-'));
const CONTINUE_CAP = 600;
let turn = 0;

function prompt(ws, sid, text) {
  turn += 1;
  const r = spawnSync(process.execPath, [join(HOOKS, 'user-prompt-submit.mjs')], {
    input: JSON.stringify({ prompt: text, session_id: sid, turn_id: `t${turn}`, cwd: ws }),
    cwd: ws, encoding: 'utf8', env: { ...process.env, XDG_STATE_HOME: STATE_HOME },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
}

const workspace = () => mkdtempSync(join(tmpdir(), 'litmuse-ignition-'));
const countOf = (text, needle) => text.split(needle).length - 1;

// The banner is on the line right after the one instruction that introduces it, and both lead the context.
function assertLeads(ctx, banner) {
  const lines = ctx.split('\n');
  assert.match(lines[0], /^Your very first output, before any tool call, remark or other text, is this exact line on its own line, once:$/);
  assert.equal(lines[1], banner);
  assert.equal(countOf(ctx, banner), 1, 'the exact line appears once');
}

test('activation: the exact ignition line leads the context for a bare lit and a lit with a task or a route word', () => {
  for (const [text, route] of [['lit', 'lit-loop'], ['lit fix the cache bug', 'lit-loop'], ['lit plan a todo app', 'lit-plan']]) {
    const ctx = prompt(workspace(), `a-${route}-${text.length}`, text);
    assertLeads(ctx, `🔥 **LIT IGNITED · ${route}** 🔥`);
    assert.match(ctx, new RegExp(`read_skill id \`plugin:litmuse:${route}\``), `${text}: the skill still loads, after the line`);
    assert.ok(ctx.indexOf('read_skill') > ctx.indexOf('🔥'), `${text}: the line comes before the skill load`);
  }
});

test('re-entry: a repeated lit leads with the exact continue line and stays within the byte cap', () => {
  const ws = workspace();
  prompt(ws, 'r1', 'lit fix the bug');
  const again = prompt(ws, 'r1', 'lit add a test');
  assertLeads(again, '🔥 **LIT CONTINUES · lit-loop** 🔥');
  assert.ok(Buffer.byteLength(again) <= CONTINUE_CAP, `${Buffer.byteLength(again)} B`);
  assert.doesNotMatch(again, /LIT IGNITED/);
});

test('resume: a bare lit with a started plan leads with the continue line for start-work', () => {
  const ws = workspace();
  mkdirSync(join(ws, 'plans'), { recursive: true });
  writeFileSync(join(ws, 'plans', 'cache.md'), '# Plan\n- [x] 1. Done\n- [ ] 2. Wire the cache\n');
  prompt(ws, 'u1', 'lit start plans/cache.md');
  prompt(ws, 'u1', 'ok, go on');
  const resumed = prompt(ws, 'u1', 'lit');
  assertLeads(resumed, '🔥 **LIT CONTINUES · start-work** 🔥');
  assert.ok(Buffer.byteLength(resumed) <= CONTINUE_CAP, `${Buffer.byteLength(resumed)} B`);
});

test('a standalone lit as the last word ignites lit-loop with the exact line first and a soft-confirm', () => {
  const ctx = prompt(workspace(), 't1', 'Hello! lit');
  assertLeads(ctx, '🔥 **LIT IGNITED · lit-loop** 🔥');
  assert.match(ctx, /read_skill id `plugin:litmuse:lit-loop`/);
  assert.match(ctx, /ends with the lit keyword/);
  assert.match(ctx, /The task is the rest of the prompt before the closing `lit`\./);
  assert.match(ctx, /Soft-confirm: `lit` came last/);
  assert.doesNotMatch(ctx, /no task text/);
});

test('a trailing lit while a route is active continues it in a short note and never switches the route', () => {
  const ws = workspace();
  prompt(ws, 't2', 'lit plan a cache layer');
  const again = prompt(ws, 't2', 'one more thing lit');
  assertLeads(again, '🔥 **LIT CONTINUES · lit-plan** 🔥');
  assert.ok(Buffer.byteLength(again) <= CONTINUE_CAP, `${Buffer.byteLength(again)} B`);
});

test('a lit inside a word, a path or code gets no hook note', () => {
  for (const text of ['what is a literal', 'see lit-plan.md', 'run `lit`']) assert.equal(prompt(workspace(), 'n1', text), '', text);
});
