import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, sep, basename } from 'node:path';
import { run, block, readSession, unreadPayload, toolName, toolInput, workspaceOf } from './lib/common.mjs';
import { addedHedgeCluster, HEDGE_MESSAGE } from './lib/hedge.mjs';
import { LIT_PLAN_READ_ONLY_TOOLS, FILE_TOOLS, SHELL_TOOLS, READ_ONLY_AGENTS, shellReadOnly } from './lib/policy.mjs';
import { LIT_TAG, objectiveOf, readGoalRecord } from './lib/goal.mjs';
import { resolveProjectStateRoot } from './lib/workflow-stack.mjs';
import { PLUGIN_ROOT } from './lib/common.mjs';
import { GOAL_SELF_END, guardShell, guardWrite, park, runOwner } from './lib/autopilot.mjs';
import { classifyCommand, protectedBelow, protectedReason } from './lib/shell-verdict.mjs';

const PROSE_FILE = /\.(md|mdx|markdown|txt)$/i;
const EN_PLEDGE = /\b(never|do not|don't|does not|doesn't|cannot|can't|will not|won't|must not|should not|shouldn't)\b/i;
const KO_PLEDGE = /(않습니다|않는다|않아요|않음|하지 마세요|하지 마십시오|하지 말 것|금지합니다|금지한다)\s*[.!]?$/;
const READ_ONLY_TOOLS = new Set(LIT_PLAN_READ_ONLY_TOOLS);

// Every string in the call, however the host names the field, so a patch in an unexpected key is still read.
function patchText(input) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(input);
  return out.join('\n');
}

// Every path a call can write: the explicit path field plus the targets named inside a patch.
function targetPaths(tool, input) {
  const out = [];
  for (const key of ['path', 'file_path', 'target_path', 'file']) {
    if (typeof input[key] === 'string') out.push(input[key]);
  }
  if (tool === 'apply_patch') {
    for (const m of patchText(input).matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/gm)) out.push(m[1]);
    for (const m of patchText(input).matchAll(/^\+\+\+ (?:b\/)?(.+?)\s*$/gm)) if (m[1] !== '/dev/null') out.push(m[1]);
  }
  return out;
}

// Resolves the real location a write would land on, following any symlink in the existing part of the path.
function realTarget(cwd, p) {
  let abs = resolve(cwd, p);
  const rest = [];
  while (!existsSync(abs) && dirname(abs) !== abs) {
    rest.unshift(basename(abs));
    abs = dirname(abs);
  }
  let real;
  try { real = realpathSync(abs); } catch { real = abs; }
  return resolve(real, ...rest);
}

function inside(cwd, p, dirs) {
  let root;
  try { root = realpathSync(cwd); } catch { root = resolve(cwd); }
  const target = realTarget(cwd, p);
  // Case-folded on every OS, so `.LitMuse/Sessions` is the same folder as `.litmuse/sessions` on a case-folding disk
  // and is refused as a precaution on a case-sensitive one.
  const fold = (x) => x.toLowerCase();
  return dirs.some((d) => {
    const base = fold(resolve(root, d));
    const t = fold(target);
    return t === base || t.startsWith(base + sep);
  });
}

function paragraphs(text) {
  let inFence = false;
  const out = [];
  let current = [];
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence || /^\s*>/.test(line)) continue;
    if (!line.trim()) { if (current.length) out.push(current.join(' ')); current = []; continue; }
    current.push(line);
  }
  if (current.length) out.push(current.join(' '));
  return out;
}

const sentences = (p) => p.split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);

// Counts pledge-style negations the write adds: sentences already in the file (or in the replaced text) are the
// user's and are not counted. Three in one paragraph, or two Korean ones, is a cluster.
function addedCluster(newText, existingText) {
  const existing = new Set(paragraphs(existingText).flatMap(sentences));
  for (const p of paragraphs(newText)) {
    const fresh = sentences(p).filter((s) => !existing.has(s));
    const en = fresh.filter((s) => EN_PLEDGE.test(s)).length;
    const ko = fresh.filter((s) => KO_PLEDGE.test(s)).length;
    if (en + ko >= 3 || ko >= 2) return { snippet: p.slice(0, 160), ko };
  }
  return null;
}

function proseWrites(tool, input, cwd) {
  if (tool === 'write_file') {
    const file = targetPaths(tool, input)[0];
    if (!file || !PROSE_FILE.test(file)) return [];
    const abs = resolve(cwd, file);
    let current = '';
    try { current = existsSync(abs) ? readFileSync(abs, 'utf8') : ''; } catch { current = ''; }
    return [{ file, added: String(input.content ?? input.text ?? ''), existing: current }];
  }
  if (tool === 'edit_file') {
    const file = targetPaths(tool, input)[0];
    if (!file || !PROSE_FILE.test(file)) return [];
    return [{ file, added: String(input.new_string ?? input.new_text ?? ''), existing: String(input.old_string ?? input.old_text ?? '') }];
  }
  if (tool === 'apply_patch') {
    const text = patchText(input);
    const files = targetPaths(tool, input).filter((f) => PROSE_FILE.test(f));
    if (!files.length) return [];
    const added = text.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
    const removed = text.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)).join('\n');
    return [{ file: files[0], added, existing: removed }];
  }
  return [];
}

const PLAN_HINT = 'Write the plan under plans/ with write_file; implementation waits for /start-work.';

const READ_PATH_TOOLS = new Set(['read_file', 'search']);
// Tools a run may call without parking: reads, the run's own goal and todo bookkeeping, and child agents (a child
// is bound to the run's guard at SubagentStart).
const RUN_KNOWN_TOOLS = new Set([...READ_ONLY_TOOLS, 'subagent_spawn', 'update_goal', 'write_todos', 'write_memory']);

// During a start-work run (a child lane uses its parent's run): steps that need the user's word are parked for the
// one wrap-up answer, secrets and host homes are refused, and a native goal is armed only on a `goal: native` plan.
// Why a read tool may not read where it points, or null. `search` walks its folder, so a folder that holds a protected
// place (the home folder, `/`) is refused as a recursive reader would be.
function readPathReason(tool, input, cwd) {
  for (const key of ['path', 'file_path', 'directory']) {
    if (typeof input[key] !== 'string') continue;
    const abs = resolve(cwd, input[key]);
    const reason = protectedReason(abs) ?? (tool === 'search' ? protectedBelow(abs, process.env) : null);
    if (reason) return reason;
  }
  return null;
}

function startWorkGuard(payload, state, tool, input, cwd) {
  const owner = runOwner(payload, state);
  if (!owner) return;
  if (tool === 'bash_input') {
    block(park(owner.payload, owner.state, { command: `bash_input: ${String(input.input ?? input.text ?? input.chars ?? '')}`, cwd, tier: 'X', held: 'input to a running shell cannot be checked', reason: 'input to a running shell' }));
  } else if (SHELL_TOOLS.has(tool)) {
    let command = input.command ?? input.cmd ?? input.script;
    if (Array.isArray(command)) command = command.join(' ');
    const dir = [input.workdir, input.cwd, input.working_directory].find((d) => typeof d === 'string' && d);
    const verdict = guardShell(owner.payload, owner.state, typeof command === 'string' ? command : JSON.stringify(command ?? null), dir);
    if (verdict) block(verdict.message);
  } else if (FILE_TOOLS.has(tool)) {
    for (const t of targetPaths(tool, input)) {
      const verdict = guardWrite(owner.payload, owner.state, resolve(cwd, t));
      if (verdict) block(verdict.message);
    }
  } else if (READ_PATH_TOOLS.has(tool)) {
    const reason = readPathReason(tool, input, cwd);
    if (reason) block(`LitMuse start-work refused this read and did not store it: ${reason}. Leave it out and continue with the next row.`);
  } else if (tool === 'subagent_spawn' && !READ_ONLY_AGENTS.has(input.subagent_type)) {
    // BLOCKED host fact: Muse is not known to name the child session in SubagentStart, so a working child could act
    // outside the run guard. Only read-only litmuse/* agents start during a run.
    block(park(owner.payload, owner.state, { command: `subagent_spawn: ${JSON.stringify(input ?? {}).slice(0, 1500)}`, cwd, tier: 'X', held: 'a working child agent runs outside the run guard', reason: `a ${input.subagent_type ?? 'general-purpose'} child agent` }));
  } else if (!RUN_KNOWN_TOOLS.has(tool) && tool !== 'create_goal') {
    // Any other tool (cron, MCP servers, tools a later Muse adds) may run code or reach outside where the guard cannot
    // look, so it is held for the user's own decision and never replayed.
    block(park(owner.payload, owner.state, { command: `${tool}: ${JSON.stringify(input ?? {}).slice(0, 1500)}`, cwd, tier: 'X', held: `the ${tool} tool may run code the run guard cannot check`, reason: `the ${tool} tool` }));
  } else if (tool === 'create_goal') {
    if (!owner.state.run.goalNative) block('LitMuse start-work: this plan has no `goal: native` line, so the start-work hooks drive the run and no native goal is armed. Carry on with the next row.');
    if (!objectiveOf(input).replace(LIT_TAG, '').trimEnd().endsWith(GOAL_SELF_END.slice(2))) {
      block(`LitMuse start-work: a native goal always ends itself. End the objective with "${GOAL_SELF_END}", then create it again.`);
    }
  }
}

// A state file that does not parse may have held a run: the planning limits apply, and reads of protected places
// (secrets, real-home key folders, run state) stay refused, as the run guard would refuse them.
function damagedReadGuard(tool, input, cwd) {
  const refuse = (reason) => block(`LitMuse could not read this session's state, so it keeps the run guard's refusals: ${reason}. Leave it out and continue.`);
  if (READ_PATH_TOOLS.has(tool)) {
    const reason = readPathReason(tool, input, cwd);
    if (reason) refuse(reason);
  } else if (SHELL_TOOLS.has(tool)) {
    let command = input.command ?? input.cmd ?? input.script;
    if (Array.isArray(command)) command = command.join(' ');
    const dir = [input.workdir, input.cwd, input.working_directory].find((d) => typeof d === 'string' && d);
    const here = dir ? resolve(cwd, dir) : cwd;
    const v = classifyCommand(typeof command === 'string' ? command : '', { cwd: here, root: cwd, roots: [], grants: [], charter: [], check: null, denied: { commands: [], paths: [] }, env: process.env });
    if (v.action === 'refuse') refuse(v.reason);
  }
}

// The one non-read-only command a planning turn may run: this plugin's own goal-propose script on a plan under plans/.
const GOAL_PROPOSE = resolve(PLUGIN_ROOT, 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs');
function isGoalPropose(command) {
  const match = /^node\s+(\S+)\s+(plans\/[A-Za-z0-9._-]+\.md)$/u.exec(String(command ?? '').trim());
  if (!match || /[;&|<>`$\\\n\r(){}'"]/u.test(command)) return false;
  try {
    return realpathSync(match[1]) === realpathSync(GOAL_PROPOSE);
  } catch {
    return false;
  }
}

// A goal tagged `[lit:<id>]` exists only after the user's exact yes at plan approval or at a lit-loop's goal question: its
// objective must equal the armed intent of this session. An untagged goal is the user's own business and passes.
function litGoalRefusal(payload, input) {
  const objective = objectiveOf(input);
  if (!LIT_TAG.test(objective)) return null;
  let intent = null;
  try {
    intent = readGoalRecord(resolveProjectStateRoot(workspaceOf(payload)), 'intent');
  } catch { /* unreadable reads as no intent */ }
  if (intent && !intent.consumedAt && intent.condition === objective && (!intent.sessionId || intent.sessionId === payload.session_id)) return null;
  return 'LitMuse sets a [lit:…] goal only after the user typed yes to a LitMuse goal question (plan approval or a lit-loop), with that exact objective. Ask the question again (run goal-propose) instead of creating it.';
}

// The run guard fails closed: a call it could not read or check during an active run is denied. Outside a run a
// broken hook still lets the call through, as every LitMuse hook does.
function runActive(payload) {
  try {
    const s = readSession(payload);
    return Boolean(s && (s.run?.status === 'active' || s.parentSession));
  } catch {
    return true;
  }
}

run((payload) => {
  const unread = !Object.keys(payload).length && unreadPayload();
  if (unread) {
    if (runActive(unread)) block('LitMuse start-work could not read this call (too large or malformed), so it is refused during the run and nothing was stored. Make the call smaller and continue with the next row.');
    return;
  }
  try {
    guardCall(payload);
  } catch (err) {
    if (runActive(payload)) block(`LitMuse start-work could not check this call (${String(err?.message ?? err).slice(0, 200)}), so it is refused during the run. Continue with the next row.`);
  }
});

function guardCall(payload) {
  const tool = toolName(payload);
  const input = toolInput(payload);
  const cwd = workspaceOf(payload);

  // Hook-owned state is never a model write target, on any route.
  if (FILE_TOOLS.has(tool)) {
    const hit = targetPaths(tool, input).find((t) => inside(cwd, t, ['.litmuse/sessions']));
    if (hit) block(`LitMuse keeps route state for its hooks; ${hit} is not writable by tools.`);
  }

  if (tool === 'create_goal') {
    const refusal = litGoalRefusal(payload, input);
    if (refusal) block(refusal);
  }

  // The run guard follows an active run, whatever route a later plain prompt left behind.
  const session = readSession(payload);
  if (session?.corrupt) damagedReadGuard(tool, input, cwd);
  if (session && (session.route === 'start-work' || session.run?.status === 'active')) startWorkGuard(payload, session, tool, input, cwd);

  const state = session?.route ? session : null;
  if (!state) return;

  if (state.route === 'lit-plan') {
    if (READ_ONLY_TOOLS.has(tool)) {
      // read-only: allowed
    } else if (SHELL_TOOLS.has(tool)) {
      const command = input.command ?? input.cmd ?? input.script;
      if (tool === 'bash_input' || (!shellReadOnly(command) && !isGoalPropose(command))) {
        block(`LitMuse lit-plan is a planning turn: shell is limited to one plain read-only command (ls, cat, head, tail, wc, rg, git log/status/diff/show) with listed flags and no ; & | < > \` $ or line breaks. Refused: ${tool}. ${PLAN_HINT}`);
      }
    } else if (tool === 'subagent_spawn') {
      if (!READ_ONLY_AGENTS.has(input.subagent_type)) {
        block(`LitMuse lit-plan is a planning turn: a child agent must be a read-only litmuse/* agent (${[...READ_ONLY_AGENTS].join(', ')}). Refused: ${input.subagent_type ?? 'general-purpose'}.`);
      }
    } else if (FILE_TOOLS.has(tool)) {
      const targets = targetPaths(tool, input);
      if (!targets.length) block(`LitMuse lit-plan could not see where ${tool} writes, so it is held. ${PLAN_HINT}`);
      const outside = targets.find((t) => !inside(cwd, t, ['plans', '.litmuse']));
      if (outside) block(`LitMuse lit-plan is a planning turn: write the plan under plans/ (or notes under .litmuse/) and leave ${outside} for start-work.`);
    } else {
      block(`LitMuse lit-plan is a planning turn: ${tool} is outside the planning allowlist (read-only tools, plans/ writes, read-only shell, read-only litmuse/* agents). ${PLAN_HINT}`);
    }
  }

  if (state.route === 'lit-humanizer' || !FILE_TOOLS.has(tool)) return;
  for (const w of proseWrites(tool, input, cwd)) {
    if (inside(cwd, w.file, ['.litmuse'])) continue;
    const hit = addedCluster(w.added, w.existing);
    if (hit) {
      block(`LitMuse write guard: this write adds a paragraph with stacked negations ("${hit.snippet}..."). The limit is under three pledge-style negations per paragraph in any language, and under two Korean ones. Restate the rule in positive form (say what to do), then write again. If the user dictated this wording, run the edit on the lit-humanizer route (lit korean / lit humanize), which keeps the writer's claims as given.`);
    }
    const hedge = inside(cwd, w.file, ['plans', 'evidence']) ? null : addedHedgeCluster(w.added, w.existing);
    if (hedge) {
      block(`LitMuse write guard: this write adds stacked hedges to a deliverable ("${hedge.snippet}..."). The limit is one hedge per sentence and under four per paragraph. ${HEDGE_MESSAGE} If the user dictated this wording, run the edit on the lit-humanizer route (lit korean / lit humanize), which keeps the writer's claims as given.`);
    }
  }
}
