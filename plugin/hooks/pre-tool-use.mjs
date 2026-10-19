import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, sep, basename } from 'node:path';
import { run, block, activeRoute, toolName, toolInput, workspaceOf } from './lib/common.mjs';
import { addedHedgeCluster, HEDGE_MESSAGE } from './lib/hedge.mjs';
import { LIT_PLAN_READ_ONLY_TOOLS, FILE_TOOLS, SHELL_TOOLS, READ_ONLY_AGENTS, shellReadOnly } from './lib/policy.mjs';

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
  return dirs.some((d) => {
    const base = resolve(root, d);
    return target === base || target.startsWith(base + sep);
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

run((payload) => {
  const tool = toolName(payload);
  const input = toolInput(payload);
  const cwd = workspaceOf(payload);

  // Hook-owned state is never a model write target, on any route.
  if (FILE_TOOLS.has(tool)) {
    const hit = targetPaths(tool, input).find((t) => inside(cwd, t, ['.litmuse/sessions']));
    if (hit) block(`LitMuse keeps route state for its hooks; ${hit} is not writable by tools.`);
  }

  const state = activeRoute(payload);
  if (!state) return;

  if (state.route === 'lit-plan') {
    if (READ_ONLY_TOOLS.has(tool)) {
      // read-only: allowed
    } else if (SHELL_TOOLS.has(tool)) {
      const command = input.command ?? input.cmd ?? input.script;
      if (tool === 'bash_input' || !shellReadOnly(command)) {
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
});
