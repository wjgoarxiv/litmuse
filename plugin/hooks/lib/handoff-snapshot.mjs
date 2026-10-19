import { readFileSync, writeFileSync, readdirSync, lstatSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { activeRoute, workspaceOf, safeId } from './common.mjs';
import { clip } from './redact.mjs';

const KEEP = 5;
const LEDGER_TAIL = 8;
const READ_LIMIT = 256 * 1024;
const FRESH_MS = 24 * 3600 * 1000;

function kind(p) {
  try {
    const st = lstatSync(p);
    return st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other';
  } catch {
    return null;
  }
}

// A `.litmuse` or subdirectory that is a link would send reads or writes elsewhere, so it counts as absent.
function realDir(cwd, ...parts) {
  let cur = cwd;
  for (const part of ['.litmuse', ...parts]) {
    cur = join(cur, part);
    if (kind(cur) !== 'dir') return null;
  }
  return cur;
}

function readSmall(file) {
  if (kind(file) !== 'file' || statSync(file).size > READ_LIMIT) return null;
  return readFileSync(file, 'utf8');
}

function newestFiles(dir, ext) {
  if (!dir || kind(dir) !== 'dir') return [];
  return readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => join(dir, f)).filter((f) => kind(f) === 'file')
    .map((f) => ({ f, m: statSync(f).mtimeMs })).sort((a, b) => b.m - a.m).slice(0, 50).map((x) => x.f);
}

// Rows at column zero outside code fences, as start-work counts them.
function planRows(text) {
  let fenced = false;
  const open = [];
  let ticked = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (/^- \[ \] /.test(line)) open.push(line);
    else if (/^- \[[xX]\] /.test(line)) ticked += 1;
  }
  return { open, ticked };
}

function planSection(cwd) {
  const dir = join(cwd, 'plans');
  if (kind(dir) !== 'dir') return null;
  for (const file of newestFiles(dir, '.md')) {
    const text = readSmall(file);
    if (text === null) continue;
    const { open, ticked } = planRows(text);
    if (!open.length) continue;
    return [`plan: plans/${file.split('/').pop()} (${ticked} ticked, ${open.length} open)`, `next open row: ${clip(open[0], 200)}`];
  }
  return null;
}

function goalSection(cwd, sessionId) {
  const goals = [];
  for (const file of newestFiles(realDir(cwd, 'goals'), '.json')) {
    try {
      const text = readSmall(file);
      if (text === null) continue;
      const g = JSON.parse(text);
      if (g && typeof g === 'object' && g.status === 'active') goals.push({ g, slug: file.split('/').pop().replace(/\.json$/, '') });
    } catch {
      // an unreadable record is skipped
    }
  }
  const pick = goals.find((x) => x.g.session_id === sessionId) ?? goals[0];
  if (!pick) return null;
  const open = (Array.isArray(pick.g.criteria) ? pick.g.criteria : []).filter((c) => c && c.status !== 'pass');
  const lines = [`goal: ${pick.slug}: ${clip(pick.g.objective, 200)}`];
  for (const c of open.slice(0, 8)) lines.push(`open criterion ${clip(c.id, 20)} [${clip(c.status, 20)}]: ${clip(c.text, 200)}`);
  if (open.length > 8) lines.push(`(${open.length - 8} more open criteria)`);
  return lines;
}

function ledgerSection(cwd, sessionId) {
  const id = safeId(sessionId);
  const dir = realDir(cwd, 'ledger');
  if (!id || !dir) return null;
  const text = readSmall(join(dir, `${id}.jsonl`));
  if (text === null) return null;
  const out = [];
  for (const line of text.trim().split('\n').slice(-LEDGER_TAIL)) {
    try {
      const e = JSON.parse(line);
      const bits = [e.ts, e.kind ?? e.event, e.route, e.tool, e.path, e.text].filter((v) => v !== undefined && v !== null && v !== '');
      out.push(`- ${bits.map((b) => clip(b, 200)).join(' | ')}`);
    } catch {
      // a torn line is skipped
    }
  }
  return out.length ? ['recent ledger lines:', ...out] : null;
}

export function buildSnapshot(payload) {
  const cwd = workspaceOf(payload);
  const state = activeRoute(payload);
  const lines = [
    '# LitMuse compaction snapshot',
    '',
    `saved: ${new Date().toISOString()}`,
    `trigger: ${clip(payload.trigger ?? 'unknown', 40)}`,
    `session: ${safeId(payload.session_id) ?? 'unknown'}`,
    `route: ${state ? clip(state.route, 60) : 'none'}${state?.turnId ? ` (turn ${clip(state.turnId, 60)})` : ''}`,
  ];
  for (const section of [planSection(cwd), goalSection(cwd, payload.session_id), ledgerSection(cwd, payload.session_id)]) {
    if (section) lines.push('', ...section);
  }
  lines.push('', 'Built from hook-visible state only. Verify against the repository before acting.');
  return `${lines.join('\n')}\n`;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('.', '');

// Returns the written path, or null when the workspace state directory is unsafe.
export function writeSnapshot(payload) {
  const cwd = workspaceOf(payload);
  const top = join(cwd, '.litmuse');
  const dir = join(top, 'handoff');
  for (const p of [top, dir]) if (kind(p) && kind(p) !== 'dir') return null;
  mkdirSync(dir, { recursive: true });
  if (kind(top) !== 'dir' || kind(dir) !== 'dir') return null;
  const text = buildSnapshot(payload);
  const put = (name) => {
    const target = join(dir, name);
    if (kind(target) && kind(target) !== 'file') return false;
    const tmp = join(dir, `.${name}.tmp-${process.pid}`);
    writeFileSync(tmp, text, { flag: 'w' });
    renameSync(tmp, target);
    return true;
  };
  put(`${stamp()}.md`);
  if (!put('latest.md')) return null;
  const copies = readdirSync(dir).filter((f) => /^\d{8}T\d{9}Z\.md$/.test(f)).sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - KEEP))) rmSync(join(dir, old), { force: true });
  return join(dir, 'latest.md');
}

// The snapshot for SessionStart: a real file no older than 24 hours, else null.
export function readFreshSnapshot(cwd, now = Date.now()) {
  const dir = realDir(cwd, 'handoff');
  if (!dir) return null;
  const file = join(dir, 'latest.md');
  if (kind(file) !== 'file') return null;
  const st = statSync(file);
  if (now - st.mtimeMs > FRESH_MS) return null;
  return { text: readFileSync(file, 'utf8'), mtimeMs: st.mtimeMs };
}
