import { run, emitContext, readSession, writeSession, safeId, sessionPath, workspaceOf, PLUGIN_ROOT } from './lib/common.mjs';
import { detectRoute } from './lib/routes.mjs';
import { liveRoute, resumablePlan } from './lib/reentry.mjs';
import { readLiveness, readStage, recordRoute, stageFile, stageRoot, workspaceHash } from './lib/stage.mjs';
import { movedActivation } from './lib/moved.mjs';
import { applyStackEvent, readStack, writeStack, resolveProjectStateRoot, READ_ONLY_DISCIPLINES } from './lib/workflow-stack.mjs';
import { isGoPrompt, takeNextStep } from './lib/next-step.mjs';
import { ROUTE_INTENTS } from './lib/routes.mjs';
import { buildSkillPlan, matchedSkills, parseSkillHatch, skillPlanContext, skillPlanIds } from './lib/skill-plan.mjs';
import { GOAL_STATUS, buildLoopConsent, consentAnswer, consentIsLive, detectCheck, dropGoalRecord, normalizeLoopObjective, readGoalRecord, writeGoalRecord } from './lib/goal.mjs';
import { answerPrompt, startNote, startRun } from './lib/autopilot.mjs';
import { hasSlash, suggestionNote } from './lib/suggest.mjs';
import { SKILL_ROUTES } from './lib/routes.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

// The run record a start-work start carries. A start that names its plan (the user's `yes`, a typed plan path, `go`
// on a briefed plan) approves it as it stands; an active run on the same plan keeps its parked queue.
function runFor(payload, previous, plan, options = {}) {
  try {
    return startRun(payload, previous && !previous.corrupt ? previous : null, plan, options);
  } catch {
    return null;
  }
}
const withRun = (text, run, short = false) => [text, run ? startNote(run, short) : ''].filter(Boolean).join('\n');

// The banner leads every context this hook sends: Muse shows no hook message of its own, so the model's first line is
// the only place the user can see the route ignite, and a model that narrates first ("Loading the loop route") hides it.
const banner = (word, route) => [
  'Your very first output, before any tool call, remark or other text, is this exact line on its own line, once:',
  `🔥 **${word} · ${route}** 🔥`,
];

function continueNote(route) {
  const lines = [
    ...banner('LIT CONTINUES', route),
    `LitMuse: the \`${route}\` route is already active in this session, so this prompt continues it. Keep the criteria, plan and ledger you have; start no new run, plan or goal.`,
  ];
  if (route === 'lit-plan') lines.push('Still a planning turn: write only under plans/ or .litmuse/, and end after plans/<slug>.md exists.');
  return lines.join('\n');
}

function resumeNote(plan, loaded, payload) {
  const lines = [
    ...banner('LIT CONTINUES', 'start-work'),
    `LitMuse: resuming \`start-work\`${plan ? ` on ${plan.file}, next open row ${plan.row}` : ''}. Carry on from the first unticked row; write no new plan, run or goal.`,
  ];
  if (!loaded) {
    lines.push(`Before any other tool, load the skill with read_skill id \`plugin:litmuse:start-work\`.${safeId(payload.session_id) ? ` Ledger: .litmuse/ledger/${payload.session_id}.jsonl.` : ''}`);
  }
  return lines.join('\n');
}

// The workflow stack is best effort: a failure here must never change the hook's output or exit code.
function stackStart(payload, skill, ref, restart) {
  if (!safeId(payload?.session_id)) return;
  try {
    const cwd = workspaceOf(payload);
    writeStack(cwd, payload.session_id, applyStackEvent(readStack(cwd, payload.session_id), { type: 'start', skill, ref, restart }, new Date()).stack);
  } catch { /* the route activation already says what to do */ }
}

// Closes a side frame and resumes the paused spine. Returns the resumed frame or null.
function stackContinue(payload) {
  if (!safeId(payload?.session_id)) return null;
  try {
    const cwd = workspaceOf(payload);
    const { stack, transitions } = applyStackEvent(readStack(cwd, payload.session_id), { type: 'continue' }, new Date());
    writeStack(cwd, payload.session_id, stack);
    if (!transitions.some((t) => t.type === 'resumed')) return null;
    return stack.frames.at(-1) ?? null;
  } catch {
    return null;
  }
}

function stackCount(frame) {
  if (!frame || !Number.isInteger(frame.n) || !Number.isInteger(frame.total)) return '';
  return ` ${frame.n}/${frame.total}${frame.unit ? ` ${frame.unit}` : ''}`;
}

function activation(hit, payload) {
  const task = hit.trailing ? `The task is the rest of the prompt before the closing \`${hit.keyword ?? 'lit'}\`.` : `The task is the rest of the prompt after the keyword${hit.keyword ? ` "${hit.keyword}"` : ''}.`;
  const moved = movedActivation(hit.route);
  const lines = [
    ...banner('LIT IGNITED', hit.route),
    `LitMuse activation: the prompt ${hit.trailing ? 'ends with' : 'starts with'} the lit keyword, so this turn runs the \`${hit.route}\` route.`,
    moved ? `${moved} ${task}` : `After that line and before any other tool, load the skill with read_skill id \`plugin:litmuse:${hit.route}\` and follow it. ${task}`,
    safeId(payload.session_id)
      ? `Session ${payload.session_id}: hooks record tool events in .litmuse/ledger/${payload.session_id}.jsonl while the route is active; append your own note, evidence and decision lines there. Route state is kept by the hooks outside the workspace.`
      : 'Hooks record tool events in .litmuse/ledger/ while the route is active.',
  ];
  if (hit.route === 'lit-plan') {
    lines.push('This is a planning turn: write only under plans/ or .litmuse/, and end after plans/<slug>.md exists.');
  }
  if (hit.route === 'start-work' && (hit.keyword === 'approve' || hit.keyword === 'deny')) {
    lines.push(`The user answered a start-work boundary with \`lit ${hit.keyword}\`: treat it as the boundary's decision and carry on under the skill's pause/resume rules; start no other work.`);
  }
  if (READ_ONLY_DISCIPLINES.includes(hit.route)) {
    lines.push('This is a READ-ONLY route: report from what the skill reads; it starts, pauses, resumes and finishes nothing.');
  }
  // The collector shipped beside these hooks: a `litmuse` bin on PATH can be an older package that prints another view.
  const rewind = `node "${join(PLUGIN_ROOT, 'skills', 'lit-adhd', 'scripts', 'rewind.mjs')}"`;
  // The language is chosen here, never by the model: Korean unless the prompt asks for English in so many words.
  const lang = /(?:^|\s)--en\b|--lang\s+en\b|\bin english\b|영어로/iu.test(String(payload.prompt ?? '')) ? 'en' : 'ko';
  if (hit.route === 'lit-adhd' && hit.recap) {
    const flag = hit.movedFrom ? ' --moved' : '';
    lines.push(`This is the recap view: run \`${rewind} --recap${flag} [<session id or its first characters>] --lang ${lang}\` once, the session id only when the user named one, and show what it prints as given${flag ? ', starting with its first line, the note that lit-recap moved here' : ''}. Write nothing and start nothing.`);
  } else if (hit.route === 'lit-adhd') {
    lines.push('Run `' + rewind + ' --lang ' + lang + '` once, with exactly that language flag, with `--session` set to this session id, and show the verdict card it prints exactly as given: about six lines (since your last look, the one thing to do now, the exact text to type, why and what happens if not, what waits next, what was read). Never add a second action, reorder the lines or soften a `네 확인 필요` / `Your call` line into an action.');
    lines.push('Only when the user asks for detail (`lit adhd 자세히`, `lit adhd detail`) add `--detail`: it prints the KPI board (bars, milestones, done, left, reminders) with the per-session list under it. The collector draws every bar and count; never redraw, round or add to them. `' + rewind + ' --json` holds the same records, the board and the verdict.');
  }
  if (hit.trailing) {
    lines.push(`Soft-confirm: \`${hit.keyword ?? 'lit'}\` came last in the prompt. If the request reads like ordinary prose, say in one line that you are starting a ${hit.route} and carry on; a stray English \`lit\` is recoverable.`);
  }
  if (hit.bare && !hit.restart) {
    lines.push('The prompt has no task text after the keyword. After loading the skill, ask the user in one line what to run (a task for lit-loop, or a route such as plan or review) and wait for the answer before any other tool.');
  }
  return lines.join('\n');
}

// The skill plan of a full activation: the cascade's route stays the primary, the other skills the task matched become
// companions (or the `lit +…` list replaces them). A bare, resuming or recap prompt has no task to plan. Best effort:
// any failure leaves the single route alone.
function skillPlanFor(hit, hatch) {
  try {
    if (hit.bare || hit.resume || hit.recap || (!hatch && typeof hit.task !== 'string')) return null;
    const companions = hatch ? [] : matchedSkills(hit.task, ROUTE_INTENTS);
    return buildSkillPlan({ primary: hit.route, companions, forced: hatch, task: hit.task ?? '' });
  } catch {
    return null;
  }
}

// Re-entry: a `lit` while its route is active continues it (state kept, except start-work); a bare `lit` resumes started plan work;
// `lit new` / `lit restart`, a different route, a new session or unreadable state get the full activation.
const PAUSE = /(^|\s)(stop|pause|cancel|halt|wait)(\s|[.!,?]|$)|멈춰|중단|그만|잠깐|일시\s*정지|취소/i;

// A typed `lit start plans/<p>.md` names the plan, and that typed command is the approval:
// the work starts without a separate approval turn.
const TYPED_PLAN = /plans\/[A-Za-z0-9._-]+\.md/u;
// The stored plan a `go` reads back must be exactly a plan path: the unanchored
// extractor above would also match a `plans/a.md` prefix smuggled inside a longer
// string, and `$` alone still accepts one trailing newline, so both are closed here.
const TYPED_PLAN_FULL = /^plans\/[A-Za-z0-9._-]+\.md$/u;
const isTypedPlan = (text) => typeof text === 'string' && TYPED_PLAN_FULL.test(text) && !/[\r\n]/u.test(text);
function typedPlan(prompt) {
  const match = TYPED_PLAN.exec(String(prompt ?? ''));
  return match ? match[0] : null;
}

// Why a recorded step no longer holds, or null when it does. A paused frame must still be this
// session's paused spine; a start-work run must still be this session's live route, on the same
// plan, with an open row left. Unreadable state reads as not holding.
function staleReason(payload, step) {
  try {
    const cwd = workspaceOf(payload);
    if (step.kind === 'resume-frame') {
      const frames = readStack(cwd, payload.session_id)?.frames ?? [];
      return frames.some((frame) => frame.role === 'spine' && frame.status === 'paused') ? null : 'this session holds no paused workflow';
    }
    if (step.kind === 'continue-work') {
      const file = stageFile(cwd, payload.session_id);
      const record = file ? readStage(file) : null;
      if (!record || record.route !== 'start-work') return 'this session runs no start-work now';
      const plan = isTypedPlan(step.target?.plan) ? step.target.plan : null;
      if (plan && record.plan !== plan) return 'this session now runs another plan';
      if (isTypedPlan(record.plan) && !planHasOpenRows(cwd, record.plan)) return 'its plan has no open row';
    }
    return null;
  } catch {
    return 'its state could not be read';
  }
}

// After a break, the idle card's way back in: on a plain prompt while no route is live and fresh workflow stacks
// exist, suggest `lit adhd` once per day. It rides on this prompt rather than SessionStart because SessionStart
// context is rebuilt on every resume and sits ahead of the history, so a line that comes and goes there would discard
// the cached history; prompt context is appended to the history instead. A marker next to the route state remembers
// the day; anything unreadable means no suggestion, never a repeated one.
function suggestAdhdOnce(payload) {
  try {
    const cwd = workspaceOf(payload);
    const dir = join(resolveProjectStateRoot(cwd), '.litmuse', 'workflow-stack');
    const day = 24 * 60 * 60 * 1000;
    const fresh = readdirSync(dir).some((name) => name.endsWith('.json') && Date.now() - statSync(join(dir, name)).mtimeMs <= day);
    if (!fresh) return null;
    const marker = sessionPath(cwd, payload.session_id).replace(/\.json$/, '.adhd-suggested');
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (readFileSync(marker, 'utf8').trim() === today) return null;
    } catch { /* no marker yet */ }
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${today}\n`);
    return 'Recent sessions left paused work in this workspace and no route is live. Suggest `lit adhd` once for the cross-session brief; if the user declines, drop it for this session.';
  } catch {
    return null;
  }
}

function goHint(why) {
  return [
    ...banner('LIT CONTINUES', 'lit-loop'),
    `Nothing on record to continue (${why}), so nothing was started. Say \`lit adhd\` for a fresh brief; start no other work.`,
  ].join('\n');
}

// Why `yes` cannot start start-work on this plan now, or null. The same preconditions the typed start path relies on:
// the plan exists with an open row, and no other live session of this workspace already runs start-work on it.
function startRefusal(payload, plan) {
  const cwd = workspaceOf(payload);
  let text;
  try {
    text = readFileSync(resolve(cwd, plan), 'utf8');
  } catch {
    return `${plan} was not found`;
  }
  if (!text.split('\n').some((line) => /^- \[ \] (?:\d+|F\d+)\. /u.test(line))) return `${plan} has no open row`;
  const here = workspaceHash(cwd);
  const live = new Map(readLiveness().map((rec) => [rec.session, rec]));
  let names = [];
  try { names = readdirSync(stageRoot()).filter((n) => n.endsWith('.json') && n !== 'latest.json'); } catch { /* no stage records */ }
  for (const name of names) {
    const rec = readStage(join(stageRoot(), name));
    if (!rec || rec.session === payload.session_id || rec.workspace !== here || rec.route !== 'start-work' || rec.plan !== plan) continue;
    const beat = live.get(rec.session);
    if (beat && beat.state === 'alive' && Date.now() - Date.parse(beat.at) <= 15 * 60_000) return `another session is already running start-work on ${plan}`;
  }
  return null;
}

// The answer to the plan-approval question. Only an exact `yes`, `edit` or `no`, typed in the session that was asked,
// while the question is live counts;
// any other prompt leaves the question as it was, and a read-only skill holding the session leaves it for the planning
// session. `yes` approves the plan, starts start-work on it (the same start the typed `lit start plans/<f>.md` makes)
// and arms its goal; the model then sets the goal with create_goal, which PreToolUse admits only with this exact
// objective. When the start is refused, no goal is armed either.
function goalAnswer(payload) {
  const answer = consentAnswer(payload.prompt);
  const root = resolveProjectStateRoot(workspaceOf(payload));
  const consent = readGoalRecord(root, 'consent');
  if (consent?.kind === 'loop') return consentIsLive(consent) ? loopGoalAnswer(payload, root, consent, answer) : false;
  if (!answer) return false;
  if (!consentIsLive(consent)) return false;
  // Only the session that was asked can answer. A yes typed elsewhere (or on a question no session was stamped on)
  // starts nothing, but says why and how to start the plan instead of passing silently.
  if (!consent.sessionId || consent.sessionId !== (payload.session_id ?? null)) {
    if (answer !== 'yes') return false;
    emitContext('UserPromptSubmit', [
      ...banner('LIT CONTINUES', 'lit-plan'),
      `Show this line to the user as given: ${GOAL_STATUS.notRecorded(consent.plan)}. Start no work and set no goal.`,
    ].join('\n'));
    return true;
  }
  if (READ_ONLY_DISCIPLINES.includes(readSession(payload)?.route)) return false;
  const now = new Date().toISOString();
  writeGoalRecord(root, 'consent', { ...consent, answeredAt: now, answer });
  if (answer === 'edit') {
    writeGoalRecord(root, 'consent', consent);
    emitContext('UserPromptSubmit', [
      ...banner('LIT CONTINUES', 'lit-plan'),
      `The user wants to edit the plan before approving. Ask in one line what should change (for the goal, the plan's \`## Done when\` check in ${consent.plan}), rewrite the plan, run goal-propose on it again and ask the approval question again with what it prints. Start no work.`,
    ].join('\n'));
    return true;
  }
  if (answer === 'no') {
    emitContext('UserPromptSubmit', [
      ...banner('LIT CONTINUES', 'lit-plan'),
      `Show this line as given: ${GOAL_STATUS.declined}. The plan ${consent.plan} stays as written; \`lit start ${consent.plan}\` starts it later. Start no work now.`,
    ].join('\n'));
    return true;
  }
  const refused = startRefusal(payload, consent.plan);
  if (refused) {
    emitContext('UserPromptSubmit', [
      ...banner('LIT CONTINUES', 'lit-plan'),
      `Show this line as given: ${GOAL_STATUS.notStarted(refused)}. Start no work and set no goal.`,
    ].join('\n'));
    return true;
  }
  const withGoal = typeof consent.condition === 'string';
  if (withGoal) writeGoalRecord(root, 'intent', { version: 1, condition: consent.condition, hash: consent.hash, id: consent.id, plan: consent.plan, check: consent.check, sessionId: payload.session_id ?? null, armedAt: now });
  const turnId = payload.turn_id ?? null;
  const pauseRequested = false;
  const run = runFor(payload, readSession(payload), consent.plan, { approved: true, consentHash: consent.charterHash ?? null });
  writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested, ...(run ? { run } : {}) });
  stackStart(payload, 'start-work', { plan: consent.plan }, false);
  recordRoute(payload, { route: 'start-work', keyword: 'yes', kind: 'ignite', plan: consent.plan, activatedAt: Date.now() });
  const lines = [withRun(activation({ route: 'start-work', keyword: 'yes', bare: false, resume: false, restart: false, trailing: false }, payload), run)];
  if (withGoal) {
    lines.push(
      `Plan: ${consent.plan}. The user's yes approves the plan, starts the work and sets its goal: the work starts now; work through its open rows in order.`,
      `Before the first row, set the goal: call get_goal. With no unfinished goal, call create_goal with objective exactly \`${consent.condition}\` and nothing else. With an unfinished goal already there, leave it untouched and show: ${GOAL_STATUS.yours} If create_goal is refused, show: ${GOAL_STATUS.notConfirmed(consent.condition)}`,
      `When every row is ticked and \`${consent.check}\` exits 0, call update_goal with status complete and show: ${GOAL_STATUS.met(consent.id)}. On a BLOCKED stop, call update_goal with status blocked and show: ${GOAL_STATUS.cleared(consent.id, 'blocked')}.`,
    );
  } else {
    lines.push(`Plan: ${consent.plan}. The user's yes approves the plan and starts the work now; work through its open rows in order. Show this line once as given: ${GOAL_STATUS.skipped(consent.reason ?? 'no goal for this plan')}. Set no goal.`);
  }
  emitContext('UserPromptSubmit', lines.join('\n'));
  return true;
}

// The answer to a lit-loop's goal question. Only the session that was asked can answer, and the question lives for one
// prompt: an exact `yes` arms the goal and starts no start-work (the loop goes on as it was), `no` sets nothing, and any
// other prompt (`edit` is not an answer here) drops the question and is read as ordinary text.
function loopGoalAnswer(payload, root, consent, answer) {
  if (!consent.sessionId || consent.sessionId !== (payload.session_id ?? null)) return false;
  const route = readSession(payload)?.route;
  if (READ_ONLY_DISCIPLINES.includes(route)) return false;
  dropGoalRecord(root, 'consent');
  if (answer !== 'yes' && answer !== 'no') return false;
  const head = banner('LIT CONTINUES', route ?? 'lit-loop');
  if (answer === 'no') {
    emitContext('UserPromptSubmit', [...head, `The user answered no to the lit-loop goal question, so no goal is set. Show this line as given: ${GOAL_STATUS.skipped('you said no')}, then go on with the lit-loop work.`].join('\n'));
    return true;
  }
  writeGoalRecord(root, 'intent', { version: 1, condition: consent.condition, hash: consent.hash, id: consent.id, plan: null, check: consent.check, sessionId: payload.session_id ?? null, armedAt: new Date().toISOString() });
  emitContext('UserPromptSubmit', [
    ...head,
    'The user answered yes to the lit-loop goal question: the goal is approved and the loop work goes on as it was; no start-work run starts.',
    `Before the next step, set the goal: call get_goal. With no unfinished goal, call create_goal with objective exactly \`${consent.condition}\` and nothing else. With an unfinished goal already there, leave it untouched and show: ${GOAL_STATUS.yours} If create_goal is refused, show: ${GOAL_STATUS.notConfirmed(consent.condition)}`,
    `When \`${consent.check}\` exits 0 and the objective is done, call update_goal with status complete and show: ${GOAL_STATUS.met(consent.id)}. On a BLOCKED stop, call update_goal with status blocked and show: ${GOAL_STATUS.cleared(consent.id, 'blocked')}.`,
  ].join('\n'));
  return true;
}

// A run route's first activation asks one goal question when the prompt names an objective (the words before a closing
// activation word count as one), and no goal of this session is open and no question is pending. With a test command the hook records the question itself (no test run here) and tells the
// model to end its first reply with it: Muse shows no hook text, so this is advisory. Without one, the model asks it after
// its RED check through goal-propose --loop, which dry-runs and refuses a check that already passes.
const RUN_GOAL_ROUTES = new Set(['lit-loop', 'litwork']);
function loopGoalNote(hit, payload) {
  try {
    if (!RUN_GOAL_ROUTES.has(hit.route) || hit.bare || hit.resume || !safeId(payload.session_id)) return null;
    const task = typeof hit.task === 'string' ? hit.task : String(payload.prompt ?? '').replace(/^\s*\/?(?:litmuse:)?(?:lit-loop|litwork)\b[\s:,.!?]*/iu, '');
    const objective = normalizeLoopObjective(task);
    if (!objective) return null;
    const cwd = workspaceOf(payload);
    const root = resolveProjectStateRoot(cwd);
    const owner = readGoalRecord(root, 'owner');
    if ((owner && !owner.closed && owner.sessionId === payload.session_id) || consentIsLive(readGoalRecord(root, 'consent'))) return null;
    const check = detectCheck(cwd);
    if (!check) {
      const propose = join(PLUGIN_ROOT, 'skills', 'lit-plan', 'scripts', 'goal-propose.mjs');
      return `Native goal: LitMuse can set a goal for this run. Once one failing check proves the objective (after the RED test), run \`node ${propose} --loop --check "<check>" <objective>\` and end that reply with the line it prints, asked once. Only the user's exact \`yes\` on a later prompt arms it, and you then call create_goal with that exact objective; do not call create_goal for this run before that. When it prints \`No goal set: <reason>\`, or no single check proves the objective, go on without a goal and keep the ledger authoritative. Never type or send /goal yourself.`;
    }
    const offer = buildLoopConsent({ cwd, check, objective, falsifyNow: false, sessionId: payload.session_id });
    if (!offer.consent) return null;
    writeGoalRecord(root, 'consent', offer.consent);
    return `Native goal: LitMuse recorded one goal question for this run. End your first reply with exactly this line, asked once, and under it this answer guide as Markdown, its descriptions in the user's language and the answer words in English:\n${offer.line}\n\n${offer.guide}\nNever type or send /goal yourself. Do not call create_goal for this run before the user's exact \`yes\` on a later prompt; the hook then gives you the objective. Until then keep the ledger authoritative.`;
  } catch {
    return null;
  }
}

// `lit cancel` ends this session's start-work run, a damaged state file included: the run record is closed (or the
// unreadable file replaced), its parked steps are dropped, and the run guard stops.
const CANCEL = /^\s*\/?(?:litmuse:)?lit\s+(?:cancel|취소)\s*$/iu;
function cancelRun(payload, owned) {
  const run = owned.corrupt ? null : { ...owned.run, status: 'cancelled', parked: [], paths: [], snapshot: null };
  writeSession(payload, { route: null, turnId: payload.turn_id ?? null, activatedAt: Date.now(), stopHeldFor: null, pauseRequested: false, ...(run ? { run } : {}) });
  const goal = cancelOwnedGoal(payload);
  emitContext('UserPromptSubmit', [...banner('LIT CONTINUES', 'start-work'),
    `The user typed \`lit cancel\`. The run is cancelled${owned.corrupt ? ' (its state file could not be read and was replaced)' : ''}: its parked steps were dropped and the run guard is off.`,
    ...(goal ? [goal] : []),
    'Stop the run\'s work at the next safe point and say which rows are left.'].join('\n'));
}

// `lit cancel` while this session owns an open LitMuse goal: close that goal only, never a goal the user set.
function cancelOwnedGoal(payload) {
  if (!/^\s*\/?(?:litmuse:)?lit\s+cancel\s*$/iu.test(String(payload.prompt ?? ''))) return null;
  try {
    const owner = readGoalRecord(resolveProjectStateRoot(workspaceOf(payload)), 'owner');
    if (!owner || owner.closed || owner.sessionId !== (payload.session_id ?? null)) return null;
    return `This session holds the LitMuse goal [lit:${owner.id}]. Call get_goal: when its objective is exactly \`${owner.condition}\`, call update_goal with status blocked and show: ${GOAL_STATUS.cleared(owner.id, 'cancelled')}. When it is any other goal, leave it untouched and show: ${GOAL_STATUS.yours}`;
  } catch {
    return null;
  }
}

run((payload) => {
  try {
    if (goalAnswer(payload)) return;
  } catch { /* an unwritable goal record leaves the prompt as ordinary text */ }
  // Approval words count only here, from the prompt the user typed in the session that owns the run.
  const owned = readSession(payload);
  if (CANCEL.test(String(payload.prompt ?? '')) && (owned?.corrupt || owned?.run?.status === 'active')) {
    cancelRun(payload, owned);
    return;
  }
  if (owned?.run && !owned.corrupt) {
    const answer = answerPrompt(payload, { ...owned, route: 'start-work', turnId: payload.turn_id ?? null, pauseRequested: false });
    if (answer) {
      recordRoute(payload, { route: 'start-work', keyword: null, kind: 'continue' });
      emitContext('UserPromptSubmit', [...banner('LIT CONTINUES', 'start-work'), answer].join('\n'));
      return;
    }
  }
  const cancelNote = cancelOwnedGoal(payload);
  if (cancelNote) {
    emitContext('UserPromptSubmit', [...banner('LIT CONTINUES', 'litgoal'), cancelNote, 'Then stop the current work at the next safe point and say what is left.'].join('\n'));
    return;
  }
  const pauseRequested = PAUSE.test(String(payload.prompt ?? ''));
  // `go` after a lit-adhd brief continues the briefed step in this session within 30 minutes.
  // Without a record it is ordinary text that changes nothing.
  if (isGoPrompt(payload.prompt)) {
    const step = takeNextStep(payload);
    if (!step || step.kind === 'none') {
      emitContext('UserPromptSubmit', goHint(step ? 'the brief offered no next step' : 'no briefed next step'));
      return;
    }
    const turnId = payload.turn_id ?? null;
    if (step.kind === 'approve-boundary') {
      emitContext('UserPromptSubmit', [
        ...banner('LIT CONTINUES', 'start-work'),
        'The brief\u2019s next step is a start-work boundary waiting for the user\u2019s decision, and `go` approves nothing. Tell the user in one sentence to type `lit approve` to allow it or `lit deny` to refuse it; start no other work.',
      ].join('\n'));
      return;
    }
    // The record is up to 30 minutes old: the step it names must still hold before `go` acts on it.
    const stale = staleReason(payload, step);
    if (stale) {
      emitContext('UserPromptSubmit', [
        ...banner('LIT CONTINUES', 'lit-loop'),
        `The briefed step no longer holds (${stale}), so nothing was started. Tell the user in one sentence and suggest \`lit adhd\` for a fresh brief; start no other work.`,
      ].join('\n'));
      return;
    }
    if (step.kind === 'resume-frame') {
      const frame = stackContinue(payload);
      const skill = frame?.skill ?? step.target?.skill ?? 'lit-loop';
      writeSession(payload, { route: skill, turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested, ...(owned?.run && !owned.corrupt ? { run: owned.run } : {}) });
      recordRoute(payload, { route: skill, keyword: 'go', kind: 'continue', activatedAt: Date.now() });
      emitContext('UserPromptSubmit', [
        ...banner('LIT CONTINUES', skill),
        `LitMuse is resuming the paused ${skill}${frame?.stage ? ` at ${frame.stage}` : ''}${stackCount(frame)} under the contract loaded earlier, with the user's message as its next instruction; do not restart it.`,
      ].join('\n'));
      return;
    }
    if (step.kind === 'continue-work') {
      const plan = resumablePlan(workspaceOf(payload));
      const run = plan ? runFor(payload, owned, plan.file) : null;
      writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested, ...(run ? { run } : {}) });
      recordRoute(payload, { route: 'start-work', keyword: 'go', kind: 'resume', plan: plan?.file ?? null, activatedAt: Date.now() });
      emitContext('UserPromptSubmit', withRun(resumeNote(plan, true, payload), run, true));
      return;
    }
    if (step.kind === 'start-plan') {
      const plan = isTypedPlan(step.target?.plan) ? step.target.plan : null;
      if (!plan || !planHasOpenRows(workspaceOf(payload), plan)) {
        emitContext('UserPromptSubmit', goHint('its plan has no open row'));
        return;
      }
      const run = runFor(payload, owned, plan, { approved: true });
      writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested, ...(run ? { run } : {}) });
      stackStart(payload, 'start-work', { plan }, false);
      recordRoute(payload, { route: 'start-work', keyword: 'go', kind: 'ignite', plan, activatedAt: Date.now() });
      emitContext('UserPromptSubmit', withRun([
        activation({ route: 'start-work', keyword: 'go', bare: false, resume: false, restart: false, trailing: false }, payload),
        `Plan: ${plan}. The typed go is the approval: the work starts without a separate approval turn; work through its open rows in order.`,
      ].join('\n'), run));
      return;
    }
    emitContext('UserPromptSubmit', goHint('an unreadable next step'));
    return;
  }
  // `lit +viz +ui <task>` names the skill plan; the route is read from the prompt without the `+` words.
  const hatch = parseSkillHatch(payload.prompt);
  const hit = detectRoute(hatch ? hatch.rest : payload.prompt);
  const previous = readSession(payload);
  if (!hit) {
    // A prompt without `lit` carries one suggestion note (fired rules plus "none", else the compact catalog line);
    // a slash command is the user's own route and gets none.
    const text = String(payload.prompt ?? '');
    const suggestion = text.trim() && !hasSlash(text) ? suggestionNote(text, SKILL_ROUTES) : null;
    if (previous && previous.route) {
      writeSession(payload, { ...previous, route: null, turnId: payload.turn_id ?? null, pauseRequested });
      recordRoute(payload, { route: null, kind: 'clear' });
      if (suggestion) emitContext('UserPromptSubmit', suggestion);
      return;
    }
    const wayBackIn = suggestAdhdOnce(payload);
    const note = [wayBackIn, suggestion].filter(Boolean).join('\n');
    if (note) emitContext('UserPromptSubmit', note);
    return;
  }
  const turnId = payload.turn_id ?? null;
  const active = hit.restart ? null : liveRoute(previous);
  // start-work is always sent in full: its prompt carries the write grant and names the plan to run.
  const continues = active && (hit.bare || hit.resume || (hit.trailing && !hit.keyword) || (hit.route === active && active !== 'start-work'));
  if (continues) {
    // `lit continue` with a side frame on top closes the side and resumes the paused spine.
    const frame = hit.resume ? stackContinue(payload) : null;
    const route = frame?.skill ?? active;
    writeSession(payload, { ...previous, route, turnId, pauseRequested });
    recordRoute(payload, { route, keyword: hit.keyword ?? null, kind: 'continue' });
    emitContext('UserPromptSubmit', route === 'start-work'
      ? withRun(resumeNote(resumablePlan(workspaceOf(payload)), true, payload), previous?.run, true)
      : continueNote(route) + (frame && frame.skill !== active ? ` Resumed the paused ${frame.skill}${frame.stage ? ` at ${frame.stage}` : ''}${stackCount(frame)}; the interjected work is closed.` : ''));
    return;
  }
  const plan = !hit.restart && (hit.bare || hit.resume) ? resumablePlan(workspaceOf(payload)) : null;
  if (plan) {
    const run = runFor(payload, previous, plan.file);
    writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested, ...(run ? { run } : {}) });
    stackStart(payload, 'start-work', { plan: plan.file }, false);
    recordRoute(payload, { route: 'start-work', keyword: hit.keyword ?? null, kind: 'resume', plan: plan.file, activatedAt: Date.now() });
    emitContext('UserPromptSubmit', withRun(resumeNote(plan, false, payload), run, true));
    return;
  }
  const named = hit.route === 'start-work' ? typedPlan(payload.prompt) : null;
  // The run record always names its plan, so a reader can tell a finished run by that plan's rows: the typed one, else
  // the one open plan start-work would pick. The context's approval line stays for a typed plan only.
  const runPlan = hit.route === 'start-work' ? named ?? soleOpenPlan(workspaceOf(payload)) : null;
  const skillPlan = skillPlanFor(hit, hatch);
  // A start-work start gets a run record; any other route keeps a run this session already has, so a side route
  // (a review, a debug) does not drop the parked queue.
  const run = hit.route === 'start-work' && runPlan ? runFor(payload, previous, runPlan, { approved: Boolean(named) }) : null;
  const keepRun = run ? { run } : previous?.run && !previous.corrupt ? { run: previous.run } : {};
  writeSession(payload, { route: hit.route, turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested, ...keepRun });
  stackStart(payload, hit.route, runPlan ? { plan: runPlan } : undefined, hit.restart);
  recordRoute(payload, { route: hit.route, keyword: hit.keyword ?? null, kind: 'ignite', plan: runPlan, activatedAt: Date.now(), skills: skillPlanIds(skillPlan) });
  const loopGoal = loopGoalNote(hit, payload);
  emitContext('UserPromptSubmit', activation(hit, payload)
    + (loopGoal ? `\n${loopGoal}` : '')
    + (named ? `\nPlan: ${named}. The typed command is the approval: the work starts without a separate approval turn; work through its open rows in order.` : '')
    + (run ? `\n${startNote(run)}` : '')
    + (skillPlan ? `\n${skillPlanContext(skillPlan)}` : ''));
});

// The one plan under plans/ with an open row, or null when there are none or several.
function soleOpenPlan(cwd) {
  let names = [];
  try { names = readdirSync(join(cwd, 'plans')).filter((name) => /^[A-Za-z0-9._-]+\.md$/u.test(name)); } catch { return null; }
  const open = names.map((name) => `plans/${name}`).filter((plan) => planHasOpenRows(cwd, plan));
  return open.length === 1 ? open[0] : null;
}

// Column-zero task rows with an open box, the same grammar start-work ticks.
// Fail closed: an unreadable plan reads as having no open row.
function planHasOpenRows(cwd, plan) {
  try {
    const text = readFileSync(resolve(cwd, plan), 'utf8');
    return text.split('\n').some((line) => /^- \[ \] (?:\d+|F\d+)\. /u.test(line));
  } catch {
    return false;
  }
}
