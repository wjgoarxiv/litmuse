// What the framed card shows beyond the status record: the planned skills, the git branch, the tool that ran last
// and how full the context is. All of it is read from records that already exist (LitMuse's own stage record
// and ledger, Muse's session log and model catalog, .git/HEAD); anything missing stays null and is left out.
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { loadStage } from './stage-card.mjs';
import { paths } from './paths.mjs';
import { STACK_DROP_MS, readStack } from '../plugin/hooks/lib/workflow-stack.mjs';

const TAIL_BYTES = 256 * 1024;
const RAN_LATELY_MS = 15 * 60 * 1000;

// The parsed lines at the end of a JSON-lines file; a link, a missing file or a cut line reads as nothing.
function tailLines(path, bytes) {
  let fd;
  try {
    if (!lstatSync(path).isFile()) return [];
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    const buffer = Buffer.alloc(Math.min(size, bytes));
    readSync(fd, buffer, 0, buffer.length, size - buffer.length);
    return buffer.toString('utf8').split('\n').flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === 'object' ? [parsed] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Muse files a session under the day its id was made; the id's first 48 bits are that time.
function sessionLog(session, env) {
  const hex = /^([0-9a-f]{8})-([0-9a-f]{4})-7/i.exec(session ?? '');
  if (!hex) return null;
  const made = Number.parseInt(hex[1] + hex[2], 16);
  const store = env.LITMUSE_SESSION_STORE || join(env.XDG_DATA_HOME || join(env.HOME || homedir(), '.local', 'share'), 'muse', 'sessions');
  for (const days of [0, -1, 1]) {
    const day = new Date(made + days * 86_400_000).toISOString().slice(0, 10).split('-');
    const path = join(store, ...day, session, 'session.jsonl');
    if (existsSync(path)) return path;
  }
  return null;
}

// The session log does not name its model, so the window is known only when every listed chat model has the same one.
function contextWindow(env) {
  try {
    const dir = paths(env).museCatalogDir;
    const rows = readdirSync(dir).filter((file) => file.endsWith('.json')).flatMap((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')).rows ?? []);
    const sizes = new Set(rows.filter((row) => row.visibility === 'visible' && row.context_limit).map((row) => row.context_limit));
    return sizes.size === 1 ? [...sizes][0] : null;
  } catch {
    return null;
  }
}

// How full the context is: Muse's own estimate of the prompt of its last model call. The call's raw counters are not
// used, because providers differ on whether cached tokens are inside them.
function contextNow(lines, env) {
  const used = lines.findLast((line) => line.payload?.kind === 'run' && line.payload.event?.kind === 'model_completed')?.payload.event.estimated_prompt_tokens;
  if (!Number.isInteger(used) || used <= 0) return null;
  const limit = contextWindow(env);
  return { used, percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : null };
}

// The last tool call that ended. The ledger is written after each call, so a call still running is not in it.
function lastTool(ledger, now) {
  const last = ledger.findLast((entry) => /^PostToolUse/.test(entry.event ?? '') && typeof entry.tool === 'string');
  const ms = last ? now - Date.parse(last.ts) : NaN;
  return ms <= RAN_LATELY_MS ? { name: last.tool, ms, ok: last.ok !== false } : null;
}

export function gitBranch(cwd) {
  try {
    for (let dir = resolve(cwd); ; dir = dirname(dir)) {
      const git = join(dir, '.git');
      if (existsSync(git)) {
        const link = statSync(git).isFile() ? /^gitdir: (.+)$/m.exec(readFileSync(git, 'utf8'))?.[1].trim() : git;
        const head = readFileSync(join(isAbsolute(link) ? link : resolve(dir, link), 'HEAD'), 'utf8').slice(0, 300).trim();
        return /^ref: refs\/heads\/(.+)$/.exec(head)?.[1] ?? (/^[0-9a-f]{7,}$/i.test(head) ? head.slice(0, 7) : null);
      }
      if (dir === dirname(dir)) return null;
    }
  } catch {
    return null;
  }
}

export function cardFacts({ cwd = process.cwd(), card, env = process.env, now = Date.now() }) {
  const rec = loadStage({ cwd, session: card.session ?? undefined, env });
  const log = card.session ? sessionLog(card.session, env) : null;
  const id = String(card.session ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
  const ledger = id ? tailLines(join(rec?.cwd ?? cwd, '.litmuse', 'ledger', `${id}.jsonl`), 16 * 1024) : [];
  const planned = Array.isArray(rec?.skills) ? rec.skills.map(String) : [];
  return {
    frames: card.session ? readStack(cwd, card.session).frames.filter((f) => f.stage && now - Date.parse(f.at) <= STACK_DROP_MS) : [],
    skills: card.active ? [...new Set([card.route, ...planned])] : [],
    tool: card.active ? lastTool(ledger, now) : null,
    ctx: log ? contextNow(tailLines(log, TAIL_BYTES), env) : null,
    branch: gitBranch(cwd),
  };
}
