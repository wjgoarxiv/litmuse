// Muse session transcripts for the lit-adhd collector. Muse stores one JSONL file per session
// under `<data>/muse/sessions/YYYY/MM/DD/<session-id>/session.jsonl`, with subagent turns in a
// `subagent/` child folder. Files reach tens of thousands of lines, so each is read as its head
// and tail only, under a budget shared by the whole run, through a descriptor opened without
// following links. Subagent transcripts are not sessions of their own and are skipped. Anything
// a log cannot answer reads `unknown`.

import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const HEAD_BYTES = 64 * 1024;
export const TAIL_BYTES = 256 * 1024;
export const TOTAL_BUDGET_BYTES = 8 * 1024 * 1024;
const ACTIVE_MS = 15 * 60 * 1000;

/** A byte budget shared by every read of one collector run. */
export const makeBudget = (limit = TOTAL_BUDGET_BYTES) => ({ limit, used: 0, exhausted: false });

const readSlice = (fd, position, length, budget) => {
  // An empty slice (a head-only peek) reads nothing; it must not mark the budget used up.
  if (length <= 0) return '';
  const allowed = Math.min(length, budget.limit - budget.used);
  if (allowed <= 0) {
    budget.exhausted = true;
    return '';
  }
  const buffer = Buffer.alloc(allowed);
  const read = readSync(fd, buffer, 0, allowed, position);
  budget.used += read;
  if (allowed < length) budget.exhausted = true;
  return buffer.subarray(0, read).toString('utf8');
};

/** The parsed lines of a transcript's head and tail; a link or a non-file reads as null. */
export const readTranscriptLines = (path, budget, { head = HEAD_BYTES, tail = TAIL_BYTES } = {}) => {
  let fd;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    const chunks = size <= head + tail
      ? [readSlice(fd, 0, size, budget)]
      : [readSlice(fd, 0, head, budget), readSlice(fd, size - tail, tail, budget)];
    const lines = [];
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object') lines.push(parsed);
        } catch {
          // A line cut at a slice edge, or a malformed one, is skipped.
        }
      }
    }
    return lines;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

// Newest session logs first, capped, so a huge store stays cheap. `subagent/` children are lanes
// of their parent session, not sessions.
const newestLogs = (storeDir, cap = 400) => {
  const found = [];
  const walk = (dir, depth) => {
    if (found.length >= cap || depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= cap) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'subagent') continue;
        walk(path, depth + 1);
      } else if (entry.isFile() && entry.name === 'session.jsonl') {
        try {
          found.push({ path, mtimeMs: lstatSync(path).mtimeMs });
        } catch { /* a vanishing log is skipped */ }
      }
    }
  };
  walk(storeDir, 0);
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs).map(({ path }) => path);
};

// The session id is its directory name; the workspace root comes from the route facts record.
const peekMeta = (path, budget) => {
  const lines = readTranscriptLines(path, budget, { head: 16 * 1024, tail: 0 });
  if (!lines) return null;
  let cwd = null;
  let ended = false;
  for (const line of lines) {
    const payload = line.payload;
    if (payload?.kind === 'route_facts' && typeof payload.record?.cwd === 'string') cwd ??= payload.record.cwd;
    if (payload?.kind === 'session_end') ended = true;
  }
  const tail = readTranscriptLines(path, budget, { head: 0, tail: 32 * 1024 });
  if (tail) {
    for (const line of tail) {
      const payload = line.payload;
      if (payload?.kind === 'route_facts' && typeof payload.record?.cwd === 'string') cwd ??= payload.record.cwd;
      if (payload?.kind === 'session_end') ended = true;
    }
  }
  return { cwd, ended };
};

/**
 * The transcript files of every given worktree path, newest first, and whether the session store
 * was there at all. A session belongs to a worktree when the cwd its log records sits inside it.
 */
export const findTranscripts = (storeDir, paths) => {
  let isDir = false;
  try {
    isDir = lstatSync(storeDir).isDirectory();
  } catch { /* missing store */ }
  if (!isDir) return { status: 'unknown', files: [] };
  const roots = paths.map((path) => resolve(path));
  const budget = makeBudget(512 * 1024);
  const files = [];
  for (const path of newestLogs(storeDir)) {
    const meta = peekMeta(path, budget);
    if (!meta?.cwd) continue;
    const cwd = resolve(meta.cwd);
    if (!roots.some((root) => cwd === root || cwd.startsWith(`${root}/`))) continue;
    files.push({ path, sessionId: path.split('/').slice(-2, -1)[0] ?? null, ended: meta.ended });
    if (budget.exhausted) break;
  }
  return { status: 'ok', files };
};

const textOf = (blocks) => {
  if (typeof blocks === 'string') return blocks;
  if (!Array.isArray(blocks)) return '';
  return blocks.filter((part) => part?.kind === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
};
const clip = (text, max) => {
  const flat = String(text).replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
// This host stamps log lines in microseconds; ISO strings and milliseconds pass through.
const stampOf = (value) => {
  if (typeof value === 'string') {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 1e14 ? Math.floor(value / 1000) : value;
  return null;
};
const WAITING_TEXT = /[?？]\s*$|`?lit approve`?|`?lit deny`?|승인해\s*주|확인해\s*주|괜찮을까요|할까요/iu;

/**
 * One session's record from its transcript lines: what it was asked, what it did, what it said
 * last, and where it stands. `redact` runs over every text field it returns. Assistant text and
 * changed files are not in this host's log records, so they read `unknown` and `[]`; the brief
 * shows the commits instead.
 */
export const sessionRecord = (sessionId, lines, { redact = (text) => text, now = Date.now(), title = null } = {}) => {
  if (!sessionId || !Array.isArray(lines)) return null;
  let started = null;
  let last = null;
  let cwd = null;
  let ended = false;
  let loggedTitle = null;
  const prompts = [];
  const tools = {};
  // The host log records a tool call's name only: no input, no description, no command line.
  // The last call is named, never quoted.
  let lastAction = null;
  let lastEntry = null;
  for (const line of lines) {
    const payload = line?.payload;
    if (!payload || typeof payload !== 'object') continue;
    if (payload.kind === 'route_facts' && typeof payload.record?.cwd === 'string') cwd ??= payload.record.cwd;
    if (payload.kind === 'session_end') ended = true;
    if (line.payload_type === 'session.name.changed' && typeof payload.new_name === 'string' && payload.new_name) {
      loggedTitle = payload.new_name;
    }
    const at = stampOf(line.recorded_at);
    if (at !== null) {
      started = started === null ? at : Math.min(started, at);
      last = last === null ? at : Math.max(last, at);
    }
    if (line.payload_type === 'runtime.user_intent.accepted') {
      const blocks = payload.refill_blocks ?? payload.record?.refill_blocks;
      const text = textOf(blocks).trim();
      if (text && !/^(?:<command-|<local-command|<system-reminder|<task-notification)/u.test(text)) {
        prompts.push(text);
        lastEntry = { role: 'user', text };
      }
    }
    if (line.payload_type === 'tool_batch.effect.started') {
      const name = payload.record?.tool_name;
      if (typeof name === 'string' && name) {
        tools[name] = (tools[name] ?? 0) + 1;
        lastAction = { tool: name };
        lastEntry = { role: 'tool' };
      }
    }
  }
  const changed = [];
  const asked = [...new Set([prompts[0], prompts.at(-1)].filter(Boolean))].slice(0, 2).map((text) => clip(redact(text), 160));
  const waiting = lastEntry?.role === 'user' && WAITING_TEXT.test(lastEntry.text.slice(-400));
  const status = last === null ? 'unknown' : ended ? 'ended' : waiting ? 'waiting-on-user' : now - last <= ACTIVE_MS ? 'active' : 'ended';
  return {
    sessionId,
    id8: sessionId.slice(0, 8),
    worktree: cwd ? redact(cwd) : 'unknown',
    cwd,
    branch: 'unknown',
    started: started === null ? 'unknown' : new Date(started).toISOString(),
    last: last === null ? 'unknown' : new Date(last).toISOString(),
    lastMs: last,
    title: clip(redact(title ?? loggedTitle ?? prompts[0] ?? 'unknown'), 80),
    asked: asked.length ? asked : ['unknown'],
    done: { tools, files: changed, commits: [] },
    lastAction,
    result: 'unknown',
    status,
    ...(waiting ? { waitingReason: 'asked the user' } : {}),
  };
};
