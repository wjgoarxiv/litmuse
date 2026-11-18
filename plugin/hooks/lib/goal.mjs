// The native-goal pipeline. A plan's `## Done when` block becomes one checkable Muse goal objective, asked for once at
// plan approval together with starting the work; the user's exact `yes` starts start-work on the plan and arms the goal
// in one step (a plan that cannot carry a goal is asked "start work?" alone). Muse 1.4.23 has a native goal: the model's `create_goal`
// tool sets the session's one goal (it fails while another goal is unfinished) and `update_goal` marks it `complete`
// or `blocked`; the user's `/goal clear` ends it by hand. Hooks cannot call tools and run under a 5 s timeout, so the
// hooks steer, guard and record, and the model makes the two tool calls. The records live in
// `<project state root>/.litmuse/goal/`:
//
//   consent.json  written by goal-propose.mjs: the objective (or none), its hash and the plan  (asked)
//   intent.json   written by the prompt hook when `yes` started the work and a goal is due    (armed)
//   owner.json    written by PostToolUse after `create_goal` set that exact objective        (set by LitMuse)
//
// PreToolUse refuses a `create_goal` whose objective carries a `[lit:<id>]` tag without a matching armed intent, so
// no LitMuse-tagged goal exists without the user's yes. LitMuse only ever closes a goal it owns; a goal the user set
// by hand is reported and left alone.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const GOAL_DIR = join('.litmuse', 'goal');
export const GOAL_MAX_CHARS = 500;
export const CONSENT_TTL_MS = 30 * 60 * 1000;
export const FALSIFY_TIMEOUT_MS = 120_000;
export const LIT_TAG = /\[lit:([0-9a-f]{8})\]\s*$/u;

// Fixed status lines, one per outcome. Hooks and the propose script print these and nothing else.
export const GOAL_STATUS = Object.freeze({
  asked: (cond) => `Approve plan, start work and set goal: /goal ${cond}? (yes / edit / no)`,
  askedStart: 'Approve plan and start work? (yes / no)',
  declined: 'Nothing started and no goal set: you said no',
  notStarted: (why) => `Work not started and no goal set: ${why}`,
  notRecorded: (plan) => `Approval not recorded for this session. Run: lit start ${plan}`,
  skipped: (reason) => `No goal set: ${reason}`,
  set: (id) => `LitMuse goal set [lit:${id}]`,
  yours: 'Your own goal is active; LitMuse left it alone.',
  notConfirmed: (cond) => `Goal not confirmed. Paste: /goal ${cond}`,
  met: (id) => `Goal met and closed [lit:${id}]`,
  cleared: (id, why) => `LitMuse goal closed (${why}) [lit:${id}]`,
});

const JUDGMENT_WORDS = [
  /\bworks?\b/iu, /\bworking\b/iu, /\blooks? (?:good|fine|right|nice|great)\b/iu, /\bseems?\b/iu, /\bproperly\b/iu,
  /\bcorrectly\b/iu, /\bclean(?:ly)?\b/iu, /\bnicely\b/iu, /\bshould (?:work|pass)\b/iu, /\bas expected\b/iu, /\bgood enough\b/iu,
  /잘\s*(?:동작|작동|돌아|돼|된다|되면)/u, /괜찮/u, /깔끔/u, /제대로/u, /문제\s*없/u, /완벽/u,
];
// A success that is only an outward action proves nothing about the work and cannot be undone.
const OUTWARD_ONLY = /^\s*(?:git\s+push|npm\s+publish|pnpm\s+publish|yarn\s+publish|gh\s+(?:release|pr\s+merge)|git\s+tag)\b/iu;
// Check commands the dry run may run. Anything else is refused before it runs.
const CHECK_ALLOWLIST = [
  /^npm (?:test|run [\w:.-]+)(?: --[\w-]+)*$/u,
  /^node --test(?: [\w./*-]+)*$/u,
  /^node [\w./-]+\.m?js(?: [\w./=-]+)*$/u,
  /^(?:pnpm|yarn) (?:test|run [\w:.-]+)$/u,
  /^(?:pytest|python3? -m pytest)(?: [\w./:-]+)*$/u,
  /^cargo test(?: [\w-]+)*$/u,
  /^go test(?: [\w./-]+)*$/u,
  /^make (?:test|check|verify)$/u,
  /^(?:bash|sh) scripts\/[\w./-]+\.sh$/u,
];

export const conditionHash = (condition) => createHash('sha256').update(String(condition)).digest('hex').slice(0, 16);
export const goalId = (plan, check) => createHash('sha256').update(`${plan}\u0000${check}`).digest('hex').slice(0, 8);

/** The `## Done when` block: one `check: \`<command>\`` line. A plan marked `goal: never` has none on purpose. */
export function parseDoneWhen(planText) {
  const lines = String(planText ?? '').split(/\r?\n/u);
  const start = lines.findIndex((line) => /^##\s+Done when\s*$/iu.test(line));
  if (start === -1) return { ok: false, reason: 'the plan has no `## Done when` block' };
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/u.test(line)) break;
    const match = /^\s*(?:[-*]\s+)?check:\s*`([^`\n]+)`\s*$/u.exec(line);
    if (match) return { ok: true, check: match[1].trim() };
  }
  return { ok: false, reason: 'the `## Done when` block names no `check:` command' };
}

/** `Every row in plans/<f>.md is ticked and \`<cmd>\` exits 0 [lit:<id>]`, or why it cannot be built. */
export function compileCondition({ plan, check }) {
  const id = goalId(plan, check);
  const condition = `Every row in ${plan} is ticked and \`${check}\` exits 0 [lit:${id}]`;
  if (condition.length > GOAL_MAX_CHARS) return { ok: false, reason: `the condition is over ${GOAL_MAX_CHARS} characters; point the check at one script` };
  return { ok: true, condition, id };
}

/** Rejects judgment words, outward-only success, unlisted commands and conditions over the cap. */
export function lintCondition(condition, check) {
  const reasons = [];
  if (String(condition).length > GOAL_MAX_CHARS) reasons.push(`over ${GOAL_MAX_CHARS} characters`);
  const words = JUDGMENT_WORDS.filter((pattern) => pattern.test(String(check))).map((pattern) => String(check).match(pattern)[0]);
  if (words.length) reasons.push(`judgment words cannot be checked (${words.join(', ')})`);
  if (OUTWARD_ONLY.test(String(check))) reasons.push('a push, publish or release is not a check of the work');
  if (!CHECK_ALLOWLIST.some((pattern) => pattern.test(String(check)))) reasons.push(`\`${check}\` is not an allowlisted test command`);
  return { ok: reasons.length === 0, reasons };
}

const openRows = (planText) => String(planText ?? '').split('\n').filter((line) => /^- \[ \] (?:\d+|F\d+)\. /u.test(line)).length;

/**
 * The dry run: the condition must be false now, or the goal would be met at once. Runs the allowlisted check once,
 * time-boxed, without a shell. Open rows already make it false, but the check still runs so an unrunnable or hanging
 * command is caught before it becomes a goal.
 */
export function falsify({ cwd, plan, planText, check, timeoutMs = FALSIFY_TIMEOUT_MS, run = spawnSync }) {
  const open = openRows(planText);
  const [cmd, ...args] = check.split(/\s+/u);
  const result = run(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'ignore', 'ignore'], shell: false });
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') return { ok: false, reason: `\`${check}\` did not finish within ${Math.round(timeoutMs / 1000)} s` };
  // A check script the plan itself creates is missing until the work runs: that is false now, not broken.
  const plannedScript = ['bash', 'sh', 'node'].includes(cmd) && args.length >= 1 && String(planText).includes(args[0]);
  if (result.error || (result.status === 127 && !plannedScript)) return { ok: false, reason: `\`${check}\` cannot run here` };
  if (result.status === 0 && open === 0) return { ok: false, reason: `the goal is already true (${plan} is all ticked and \`${check}\` exits 0)` };
  return { ok: true, open, exit: result.status };
}

/** `yes` (exactly, any case) arms; `edit` and `no` are answers too; anything else is no answer. */
export function consentAnswer(prompt) {
  const text = String(prompt ?? '').trim().toLowerCase();
  return ['yes', 'edit', 'no'].includes(text) ? text : null;
}

/** What the consent hash covers: the objective, or the plan path for a start-only question. */
export const consentKey = (consent) => (typeof consent?.condition === 'string' ? consent.condition : `start:${consent?.plan ?? ''}`);

/** The consent record is fresh, unanswered and the one the user is answering. */
export const consentIsLive = (consent, now = Date.now()) => Boolean(consent && typeof consent === 'object'
  && (typeof consent.condition === 'string' || (consent.goal === false && typeof consent.plan === 'string'))
  && consent.hash === conditionHash(consentKey(consent)) && !consent.answeredAt && Number.isFinite(Date.parse(consent.askedAt))
  && now - Date.parse(consent.askedAt) <= CONSENT_TTL_MS);

export const goalFile = (root, name) => join(root, GOAL_DIR, `${name}.json`);

/** A goal record, or null when it is missing, unreadable, a link or not an object. */
export function readGoalRecord(root, name) {
  const file = goalFile(root, name);
  try {
    if (lstatSync(file).isSymbolicLink()) return null;
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Whole-file write through a temporary file. */
export function writeGoalRecord(root, name, value) {
  const file = goalFile(root, name);
  mkdirSync(join(root, GOAL_DIR), { recursive: true });
  const staging = `${file}.${process.pid}.tmp`;
  writeFileSync(staging, `${JSON.stringify(value)}\n`);
  renameSync(staging, file);
}

export const dropGoalRecord = (root, name) => rmSync(goalFile(root, name), { force: true });

/** The objective string of a `create_goal` / `update_goal` call, however the host names the field. */
export const objectiveOf = (input) => String(input?.objective ?? input?.goal ?? input?.text ?? '');

/** SessionStart sweep: an unanswered consent or an unused intent past its time is a leftover, never a live question. */
export function sweepGoalState(root, now = Date.now()) {
  const consent = readGoalRecord(root, 'consent');
  if (consent && !consentIsLive(consent, now) && !consent.answeredAt) dropGoalRecord(root, 'consent');
  const intent = readGoalRecord(root, 'intent');
  if (intent && !intent.consumedAt && now - Date.parse(intent.armedAt ?? 0) > CONSENT_TTL_MS) dropGoalRecord(root, 'intent');
}
