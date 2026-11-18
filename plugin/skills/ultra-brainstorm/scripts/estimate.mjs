#!/usr/bin/env node
// `node estimate.mjs <agents>`: the one cost line the launch question quotes, as a low-high token range.
// `node estimate.mjs --answer` reads the user's launch answer from stdin only and prints `{kind, agents?}` as JSON; the
// reply is never taken as an argument, so `--answer <text>` and any other flag are refused. A planning
// figure, never a bill: Muse's model catalog carries no price, so the line counts agents and tokens only.
//
// Calibrated on Muse Code 1.4.23 session records: every child's first model call carries about 33k tokens of host
// system and tool prompt before the task text, and a Workflow child makes at least two calls (its answer, then
// submit_result). So an idea agent costs 35k-80k, a reducer (30 agents' ideas) 60k-270k and the judge 60k-150k.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const IDEA = [35_000, 80_000];
const REDUCER = [60_000, 270_000];
const JUDGE = [60_000, 150_000];
export const MAX_AGENTS = 900;

const millions = (tokens) => `${(tokens / 1e6).toFixed(1)}M`;

const STOP = new Set(['no', 'stop', 'cancel', '아니', '아니요']);

// The answer may be typed ("300") or come back from request_user_input as the picked option's whole label, with or
// without a host tag ("(Recommended) 100 (recommended minimum)", "300명 (Recommended)"). Exactly one number is a count;
// two different numbers ("100 or 300?") or none is no answer, so the skill asks again.
export function readLaunchAnswer(text) {
  const plain = String(text ?? '').trim();
  if (STOP.has(plain.toLowerCase().replace(/[.!。]+$/u, ''))) return { kind: 'stop' };
  const numbers = [...new Set((plain.match(/\d[\d,]*/gu) ?? []).map((n) => Number(n.replaceAll(',', ''))))];
  if (numbers.length !== 1) return { kind: 'ask-again' };
  const [agents] = numbers;
  if (agents > MAX_AGENTS) return { kind: 'too-many', agents };
  return agents >= 10 ? { kind: 'go', agents } : { kind: 'ask-again' };
}

export function estimate(count) {
  const agents = Number(count);
  if (!Number.isInteger(agents) || agents < 10 || agents > MAX_AGENTS) return null;
  const reducers = Math.ceil(agents / 30);
  const [low, high] = [0, 1].map((i) => agents * IDEA[i] + reducers * REDUCER[i] + JUDGE[i]);
  return { agents, reducers, low, high, line: `${agents} idea agents (effort minimal) + ${reducers} reducer${reducers === 1 ? '' : 's'} (effort low) + 1 judge (session effort) ≈ ${millions(low)}–${millions(high)} tokens` };
}

const MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const ARGS = process.argv.slice(2);
if (MAIN && (ARGS.length !== 1 || (ARGS[0].startsWith('-') && ARGS[0] !== '--answer'))) {
  process.stderr.write('Usage: estimate.mjs <agents>, or estimate.mjs --answer with the reply on stdin.\n');
  process.exit(64);
} else if (MAIN && ARGS[0] === '--answer') {
  process.stdout.write(`${JSON.stringify(readLaunchAnswer(readFileSync(0, 'utf8')))}\n`);
} else if (MAIN) {
  const result = estimate(process.argv[2]);
  if (!result) {
    process.stderr.write(`Give a whole number of idea agents from 10 to ${MAX_AGENTS}.\n`);
    process.exit(64);
  }
  process.stdout.write(`${result.line}\n`);
}
