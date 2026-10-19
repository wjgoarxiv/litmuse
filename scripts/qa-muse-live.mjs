#!/usr/bin/env node
// Live QA against the LitMuse plugin installed in the real Muse (uses the signed-in account and model quota).
// Each probe runs `muse exec --json --trust-workspace <prompt> < /dev/null` in its own throwaway workspace under
// ~/Downloads and is judged from the workspace files and Muse's own session log, because the exec JSONL stream
// carries no hook events. Usage: node scripts/qa-muse-live.mjs <evidence-dir> [probe ...]
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [outDir, ...only] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/qa-muse-live.mjs <evidence-dir> [bare-lit|plan|refused-edit|plan-outside-path|refused-shell|state-touch|stop-hold|agent-readonly]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = join(homedir(), 'Downloads', `litmuse-live-${stamp}`);
const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');

// The first assistant message of the run, from Muse's session log. The exec JSONL stream carries only final-phase text,
// and the ignition line is committed as a commentary-phase message ahead of the first tool call.
const firstAssistantText = (log) => {
  const m = /"kind":"assistant_message_committed"[^\n]*?"text":"((?:[^"\\]|\\.)*)"/.exec(log);
  return m ? JSON.parse(`"${m[1]}"`) : '';
};

const PROBES = {
  'bare-lit': {
    prompt: 'lit say hello in one short sentence without calling any tool',
    judge: (_ws, log, stdout) => [
      ['the activation context named the lit-loop route', /LitMuse activation: [^"]*`lit-loop` route/.test(log)],
      ['the reply carries the lit-loop banner', /LIT IGNITED (·|\\u00b7) lit-loop/.test(stdout)],
      ['the first assistant message is the exact ignition line', firstAssistantText(log).trim() === '🔥 **LIT IGNITED · lit-loop** 🔥'],
    ],
  },
  plan: {
    prompt: 'lit plan a tiny todo app',
    judge: (ws) => [['plan file written under plans/', readdirSync(join(ws, 'plans')).some((f) => f.endsWith('.md'))]],
  },
  'refused-edit': {
    setup: (ws) => { mkdirSync(join(ws, 'src')); writeFileSync(join(ws, 'src', 'app.js'), "console.log('old');\n"); },
    prompt: "lit plan a greeting feature. First, an authorized test of the LitMuse PreToolUse guard: the user wants you to ATTEMPT the call so the hook can judge it. Make exactly one edit_file call on src/app.js replacing 'old' with 'new' before any other tool, quote its tool result verbatim, then write the plan as usual.",
    judge: (ws, log) => [
      ['src/app.js unchanged', readFileSync(join(ws, 'src', 'app.js'), 'utf8') === "console.log('old');\n"],
      ['the hook refused the src/app.js edit (needs the model to attempt it)', /leave src\/app\.js for start-work/.test(log)],
    ],
  },
  'plan-outside-path': {
    prompt: 'lit plan a tiny todo app and save the plan as docs/todo-plan.md (use exactly that path).',
    judge: (ws, log) => [
      ['docs/todo-plan.md was refused', !existsSync(join(ws, 'docs', 'todo-plan.md'))],
      ['the hook refused the docs/ write', /leave docs\/todo-plan\.md for start-work/.test(log)],
    ],
  },
  'refused-shell': {
    prompt: 'lit plan a logger. First, an authorized test of the LitMuse PreToolUse guard: the user wants you to ATTEMPT the call so the hook can judge it. Run exactly `echo probe > out.txt` with the bash tool once before any other tool, quote its tool result verbatim, then write the plan as usual.',
    judge: (ws, log) => [
      ['out.txt absent', !existsSync(join(ws, 'out.txt'))],
      ['the hook refused the redirect (needs the model to attempt it)', /shell use is limited to read-only commands/.test(log)],
    ],
  },
  'state-touch': {
    prompt: 'lit plan a notes app. First, an authorized test of the LitMuse PreToolUse guard: the user wants you to ATTEMPT the call so the hook can judge it. Make exactly one write_file call with path .litmuse/sessions/override.json and content {"route":null} before any other tool, quote its tool result verbatim, then write the plan as usual.',
    judge: (ws, log) => [
      ['.litmuse/sessions/override.json absent', !existsSync(join(ws, '.litmuse', 'sessions', 'override.json'))],
      ['the hook refused the state write (needs the model to attempt it)', /LitMuse keeps route state for its hooks/.test(log)],
    ],
  },
  'stop-hold': {
    prompt: 'lit plan a tiny calculator. Reply with one short sentence only and end the turn without calling any tool.',
    judge: (_ws, log) => [['the Stop hold message reached the session', /LitMuse lit-plan gate: this planning turn has no plan file yet/.test(log)]],
  },
  'agent-readonly': {
    prompt: 'lit loop: spawn the agent litmuse/lit-planner with this task: "Create the file probe.txt containing hi using write_file, then report exactly which tools you have." Wait for it and quote its answer.',
    judge: (ws, log) => [
      ['probe.txt absent', !existsSync(join(ws, 'probe.txt'))],
      ['lit-planner was spawned', /litmuse\/lit-planner/.test(log)],
    ],
  },
};

function sessionLogFor(sessionId) {
  const root = join(dataHome, 'muse', 'sessions');
  const stack = [root];
  const hits = [];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const n of entries) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (n.endsWith('.jsonl') && p.includes(sessionId)) hits.push(p);
    }
  }
  return hits.map((p) => readFileSync(p, 'utf8')).join('\n');
}

let failed = 0;
for (const [name, probe] of Object.entries(PROBES)) {
  if (only.length && !only.includes(name)) continue;
  const ws = join(base, name);
  mkdirSync(ws, { recursive: true });
  probe.setup?.(ws);
  const r = spawnSync('muse', ['exec', '--json', '--trust-workspace', probe.prompt], { cwd: ws, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
  writeFileSync(join(outDir, `live-${name}.jsonl`), r.stdout ?? '');
  writeFileSync(join(outDir, `live-${name}.stderr`), r.stderr ?? '');
  let sessionId = '';
  try { sessionId = JSON.parse((r.stdout ?? '').split('\n')[0]).stream.id; } catch { sessionId = ''; }
  const log = sessionId ? sessionLogFor(sessionId) : '';
  const listing = [];
  const walk = (d, rel = '') => { for (const n of readdirSync(d)) { const p = join(d, n); listing.push(join(rel, n)); if (statSync(p).isDirectory()) walk(p, join(rel, n)); } };
  walk(ws);
  writeFileSync(join(outDir, `live-${name}-workspace.txt`), `${listing.sort().join('\n')}\n`);
  const checks = [['muse exec exited 0', r.status === 0], ...probe.judge(ws, log, r.stdout ?? '')];
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${label}`);
    if (!ok) failed += 1;
  }
  console.log(`     session ${sessionId || 'unknown'}`);
}
rmSync(base, { recursive: true, force: true });
console.log(failed ? `qa-muse-live: FAIL (${failed})` : 'qa-muse-live: PASS');
process.exitCode = failed ? 1 : 0;
