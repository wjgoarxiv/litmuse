import { readFileSync, writeFileSync, renameSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { MOVED, installLine } from './moved.mjs';

// The file-making skills that left LitMuse are LitFamily extensions on this shelf. The installer prints the notice
// below, and arms a one-time copy for the first Muse session after an install or update: Muse logs a hook
// systemMessage without showing it, so that copy rides in the SessionStart context and the model relays it.
export const SHELF = 'https://github.com/wjgoarxiv/wjgoarxiv-skills';
export const NOTICE_FILE = 'first-session-notice.json';
export const GENERIC_LINE = installLine({ folder: 'variants/litmuse/<skill>' });

// LitMuse 0.1.11 and earlier set up the engines of those skills here. The extensions keep their own engines under
// wjgoarxiv-skills/runtime, so nothing reads this folder any more.
export const leftoverRuntime = (data) => join(data, 'runtime');

const ids = () => Object.keys(MOVED).join(', ');

// The install and update notice: plain lines, no colour, about eight of them.
export function extensionsNotice({ leftovers = [] } = {}) {
  const lines = [
    'LitFamily extensions',
    "  LitMuse's core is complete and works on its own.",
    '  Nine skills that make files (decks, documents, figures, design and video covers) are now LitFamily extensions,',
    `  kept on the extension shelf ${SHELF}.`,
    '  Install the ones you use, alongside LitMuse, to get the full LitFamily experience:',
    `    git clone ${SHELF}`,
    `    ${GENERIC_LINE}`,
    '  Muse refuses a folder that is already there: to replace one, move the old copy aside first (each stub and the README give the lines).',
    `  The nine: ${ids()}.`,
  ];
  for (const dir of leftovers) {
    lines.push(`  An earlier LitMuse set up engines for them in ${dir}.`);
    lines.push('  Nothing reads that folder now (an extension you install sets up its own engines), so delete it to free the space.');
  }
  return lines;
}

// The model-facing copy for the first session.
export function firstSessionContext({ version, leftovers = [] }) {
  const left = leftovers.length
    ? ` Also say that an earlier LitMuse set up engines for those skills in ${leftovers.map((d) => `\`${d}\``).join(' and ')}; nothing reads that folder now (an extension they install sets up its own engines), so they can delete it to free the space.`
    : '';
  return `This is the first session after LitMuse ${version} was installed or updated. In your first reply, before anything else, tell the user once, in their language and in a few short lines: LitMuse's core is complete and works on its own; nine skills that make files (decks, documents, figures, design and video covers: ${ids()}) are now LitFamily extensions, kept on the extension shelf ${SHELF}; installing the ones they use alongside LitMuse gives the full LitFamily experience, with \`git clone ${SHELF}\` and then \`${GENERIC_LINE}\`; Muse refuses a folder that is already there, so to replace an older copy they move the old copy aside first, with the lines in that skill's LitMuse stub or the README.${left} Do not repeat it later in the session.`;
}

export function noticePath(env = process.env) {
  const dataHome = env.XDG_DATA_HOME || join(env.HOME || homedir(), '.local', 'share');
  return join(dataHome, 'litmuse', NOTICE_FILE);
}

function readNotice(file) {
  try {
    if (lstatSync(file).isSymbolicLink()) return null;
    const n = JSON.parse(readFileSync(file, 'utf8'));
    return n && typeof n === 'object' ? n : null;
  } catch {
    return null;
  }
}

// SessionStart: the notice text for this session, or null. The first session to start claims a pending notice; that
// same session gets the same text back on every resume and compaction, so its context stays byte-identical.
export function takeFirstSessionNotice(sessionId, env = process.env) {
  if (!sessionId) return null;
  const file = noticePath(env);
  const n = readNotice(file);
  if (!n) return null;
  if (n.shownIn === sessionId && typeof n.text === 'string') return n.text;
  if (n.pending !== true || typeof n.version !== 'string') return null;
  const leftovers = (Array.isArray(n.leftovers) ? n.leftovers : []).filter((d) => typeof d === 'string' && existsSync(d));
  const text = firstSessionContext({ version: n.version, leftovers });
  try {
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify({ version: n.version, pending: false, shownIn: sessionId, text })}\n`);
    renameSync(tmp, file);
  } catch {
    return null;
  }
  return text;
}
