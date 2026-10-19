import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sessionPath } from './common.mjs';

// The route a `lit` prompt finds already active in this session. A damaged, journal-only or odd-shaped state counts
// as nothing active, so the prompt gets the full activation and rewrites the state.
export function liveRoute(state) {
  if (!state || state.corrupt || state.fromJournal) return null;
  return typeof state.route === 'string' && state.route && Number.isFinite(state.activatedAt) ? state.route : null;
}

// A plan whose Status header still waits for the user's okay is a draft, not work to resume.
const UNAPPROVED = /^Status:\s*(awaiting approval|assumptions unconfirmed)/im;

// Work a bare `lit` can pick up: an approved plan under plans/ that still has an open row and was already started
// with start-work in some session of this workspace (the hooks journal every route change).
export function resumablePlan(cwd) {
  const journals = sessionPath(cwd, 'probe');
  if (!journals) return null;
  const dir = dirname(journals);
  try {
    const started = readdirSync(dir).some((f) => f.endsWith('.journal') && readFileSync(join(dir, f), 'utf8').includes('"route":"start-work"'));
    if (!started) return null;
  } catch {
    return null;
  }
  const plans = join(cwd, 'plans');
  if (!existsSync(plans)) return null;
  let best = null;
  for (const name of readdirSync(plans).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(plans, name), 'utf8');
    if (UNAPPROVED.test(text)) continue;
    const row = /^- \[ \] (\d+|F\d+)\./m.exec(text);
    const mtime = statSync(join(plans, name)).mtimeMs;
    if (row && (!best || mtime > best.mtime)) best = { file: `plans/${name}`, row: row[1], mtime };
  }
  return best;
}
