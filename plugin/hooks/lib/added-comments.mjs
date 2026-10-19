import { extname } from 'node:path';

// Extracts the WHOLE-LINE comments a write or edit added, so comment-checker reviews real text. This is an extractor,
// not a judge: trailing comments (`x = 1  # note`) are never reported, because finding them without a parser means
// guessing about strings and regex literals. Callers say so rather than implying the list is complete.

const SLASH = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.h', '.cc', '.cpp', '.cs', '.dart', '.zig', '.scala', '.php', '.vue', '.svelte'];
const HASH = ['.py', '.rb', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml', '.ex', '.exs', '.jl', '.r', '.pl', '.tf'];
const DASH = ['.sql', '.lua', '.hs', '.elm', '.adb', '.ads'];
const CSS = ['.css', '.scss', '.less'];
const MARKUP = ['.html', '.xml'];

// Per extension: line-comment markers and block openers.
function syntaxFor(file) {
  const ext = extname(file).toLowerCase();
  const line = [];
  const block = [];
  if (SLASH.includes(ext)) { line.push('//'); block.push('/*'); }
  if (HASH.includes(ext)) line.push('#');
  if (DASH.includes(ext)) line.push('--');
  if (CSS.includes(ext)) block.push('/*');
  if (MARKUP.includes(ext) || ['.vue', '.svelte'].includes(ext)) block.push('<!--');
  if (ext === '.py') block.push('"""');
  if (ext === '.php') line.push('#');
  return line.length || block.length ? { line, block, docblock: block.includes('/*') } : null;
}

function isCommentLine(raw, syntax) {
  const t = raw.trim();
  if (!t) return false;
  if (syntax.line.some((m) => t.startsWith(m))) return !(t.startsWith('#!') || t.startsWith('#['));
  if (syntax.block.some((m) => t.startsWith(m))) return true;
  return syntax.docblock && (/^\*\s/.test(t) || t === '*/');
}

export const MAX_FILES = 3;
export const MAX_LINES_PER_FILE = 20;
export const MAX_TEXT = 200;
const MAX_SCANNED = 200_000;

const split = (text) => String(text ?? '').split(/\r?\n/);

// Lines of `next` beyond those of `previous`, as a multiset by trimmed text; each keeps its index in `next`.
function addedLines(previous, next) {
  const budget = new Map();
  for (const l of split(previous)) budget.set(l.trim(), (budget.get(l.trim()) ?? 0) + 1);
  const out = [];
  split(next).forEach((text, index) => {
    const key = text.trim();
    const left = budget.get(key) ?? 0;
    if (left > 0) budget.set(key, left - 1);
    else out.push({ text, index });
  });
  return out;
}

function patchFiles(input) {
  const strings = [];
  const walk = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(input);
  const files = [];
  let current = null;
  for (const line of strings.join('\n').split(/\r?\n/)) {
    const head = line.match(/^\*\*\* (?:Add File|Update File):\s*(.+?)\s*$/) ?? line.match(/^\+\+\+ (?:b\/)?(.+?)\s*$/);
    if (head) {
      current = head[1] === '/dev/null' ? null : { path: head[1], added: [] };
      if (current) files.push(current);
    } else if (current && line.startsWith('+') && !line.startsWith('+++')) {
      current.added.push({ text: line.slice(1), index: null });
    }
  }
  return files;
}

// {path, text, startLine} candidates for one call; startLine is the 1-based line of the first candidate, or null.
function candidates(tool, input, readFile) {
  const path = ['path', 'file_path', 'target_path', 'file'].map((k) => input[k]).find((v) => typeof v === 'string' && v);
  if (tool === 'write_file') {
    if (!path) return [];
    return [{ path, lines: split(input.content ?? input.text).map((text, index) => ({ text, index })), base: 1 }];
  }
  if (tool === 'edit_file') {
    if (!path) return [];
    const next = String(input.new_string ?? input.new_text ?? '');
    const lines = addedLines(input.old_string ?? input.old_text ?? '', next);
    let base = null;
    const file = readFile ? readFile(path) : null;
    if (typeof file === 'string' && next) {
      const at = file.indexOf(next);
      if (at !== -1) base = file.slice(0, at).split('\n').length;
    }
    return [{ path, lines, base }];
  }
  if (tool === 'apply_patch') return patchFiles(input).map((f) => ({ path: f.path, lines: f.added, base: null }));
  return [];
}

// Returns [{path, lines: [{line?, text}], truncated}] for files with added whole-line comments, [] when none.
export function extractAddedComments(tool, input, readFile) {
  const out = [];
  let scanned = 0;
  for (const c of candidates(tool, input, readFile)) {
    const syntax = syntaxFor(c.path);
    if (!syntax) continue;
    const lines = [];
    let truncated = false;
    for (const l of c.lines) {
      scanned += l.text.length;
      if (scanned > MAX_SCANNED) { truncated = true; break; }
      if (!isCommentLine(l.text, syntax)) continue;
      if (lines.length >= MAX_LINES_PER_FILE) { truncated = true; break; }
      const entry = { text: l.text.trim().slice(0, MAX_TEXT) };
      if (c.base !== null && l.index !== null) entry.line = c.base + l.index;
      lines.push(entry);
    }
    if (lines.length) out.push({ path: c.path, lines, truncated });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}
