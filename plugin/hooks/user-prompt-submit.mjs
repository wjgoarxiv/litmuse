import { run, emitContext, readSession, writeSession, safeId, workspaceOf } from './lib/common.mjs';
import { detectRoute } from './lib/routes.mjs';
import { liveRoute, resumablePlan } from './lib/reentry.mjs';
import { recordRoute } from './lib/stage.mjs';
import { MOTION_ROUTE, armMotionTurn } from './lib/motion.mjs';
import { applyStackEvent, readStack, writeStack, READ_ONLY_DISCIPLINES } from './lib/workflow-stack.mjs';
import { isGoPrompt, takeNextStep } from './lib/next-step.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const lines = [
    ...banner('LIT IGNITED', hit.route),
    `LitMuse activation: the prompt ${hit.trailing ? 'ends with' : 'starts with'} the lit keyword, so this turn runs the \`${hit.route}\` route.`,
    `After that line and before any other tool, load the skill with read_skill id \`plugin:litmuse:${hit.route}\` and follow it. ${hit.trailing ? 'The task is the rest of the prompt before the closing `lit`.' : `The task is the rest of the prompt after the keyword${hit.keyword ? ` "${hit.keyword}"` : ''}.`}`,
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
  if (hit.route === 'lit-adhd') {
    lines.push('Run `litmuse rewind --json` once for the brief records, then report from that JSON alone.');
    lines.push('Gauges follow D9 (`[▉▉▉░░] 3/5`, one cell per item up to ten, scaled above) with the remaining items under each gauge; an unknown total is never `?`: copy the `… N steps` fact line instead, never a guess.');
  }
  if (hit.trailing) {
    lines.push('Soft-confirm: `lit` came last in the prompt. If the request reads like ordinary prose, say in one line that you are starting a lit-loop and carry on; a stray English `lit` is recoverable.');
  }
  if (hit.bare && !hit.restart) {
    lines.push('The prompt has no task text after the keyword. After loading the skill, ask the user in one line what to run (a task for lit-loop, or a route such as plan or review) and wait for the answer before any other tool.');
  }
  return lines.join('\n');
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

function goHint(why) {
  return [
    ...banner('LIT CONTINUES', 'lit-loop'),
    `Nothing on record to continue (${why}), so nothing was started. Say \`lit adhd\` for a fresh brief; start no other work.`,
  ].join('\n');
}

run((payload) => {
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
    if (step.kind === 'resume-frame') {
      const frame = stackContinue(payload);
      const skill = frame?.skill ?? step.target?.skill ?? 'lit-loop';
      writeSession(payload, { route: skill, turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
      recordRoute(payload, { route: skill, keyword: 'go', kind: 'continue', activatedAt: Date.now() });
      emitContext('UserPromptSubmit', [
        ...banner('LIT CONTINUES', skill),
        `LitMuse is resuming the paused ${skill}${frame?.stage ? ` at ${frame.stage}` : ''}${stackCount(frame)} under the contract loaded earlier, with the user's message as its next instruction; do not restart it.`,
      ].join('\n'));
      return;
    }
    if (step.kind === 'continue-work') {
      const plan = resumablePlan(workspaceOf(payload));
      writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
      recordRoute(payload, { route: 'start-work', keyword: 'go', kind: 'resume', plan: plan?.file ?? null, activatedAt: Date.now() });
      emitContext('UserPromptSubmit', resumeNote(plan, true, payload));
      return;
    }
    if (step.kind === 'start-plan') {
      const plan = isTypedPlan(step.target?.plan) ? step.target.plan : null;
      if (!plan || !planHasOpenRows(workspaceOf(payload), plan)) {
        emitContext('UserPromptSubmit', goHint('its plan has no open row'));
        return;
      }
      writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
      stackStart(payload, 'start-work', { plan }, false);
      recordRoute(payload, { route: 'start-work', keyword: 'go', kind: 'ignite', plan, activatedAt: Date.now() });
      emitContext('UserPromptSubmit', [
        ...activation({ route: 'start-work', keyword: 'go', bare: false, resume: false, restart: false, trailing: false }, payload),
        `Plan: ${plan}. The typed go is the approval: the work starts without a separate approval turn; work through its open rows in order.`,
      ].join('\n'));
      return;
    }
    emitContext('UserPromptSubmit', goHint('an unreadable next step'));
    return;
  }
  const hit = detectRoute(payload.prompt);
  const previous = readSession(payload);
  if (!hit) {
    if (previous && previous.route) {
      writeSession(payload, { ...previous, route: null, turnId: payload.turn_id ?? null, pauseRequested });
      recordRoute(payload, { route: null, kind: 'clear' });
    }
    return;
  }
  const turnId = payload.turn_id ?? null;
  const active = hit.restart ? null : liveRoute(previous);
  // start-work is always sent in full: its prompt carries the write grant and names the plan to run.
  const continues = active && (hit.bare || hit.resume || hit.trailing || (hit.route === active && active !== 'start-work'));
  if (continues) {
    // `lit continue` with a side frame on top closes the side and resumes the paused spine.
    const frame = hit.resume ? stackContinue(payload) : null;
    const route = frame?.skill ?? active;
    writeSession(payload, { ...previous, route, turnId, pauseRequested });
    if (route === MOTION_ROUTE) armMotionTurn(payload);
    recordRoute(payload, { route, keyword: hit.keyword ?? null, kind: 'continue' });
    emitContext('UserPromptSubmit', route === 'start-work'
      ? resumeNote(resumablePlan(workspaceOf(payload)), true, payload)
      : continueNote(route) + (frame && frame.skill !== active ? ` Resumed the paused ${frame.skill}${frame.stage ? ` at ${frame.stage}` : ''}${stackCount(frame)}; the interjected work is closed.` : ''));
    return;
  }
  const plan = !hit.restart && (hit.bare || hit.resume) ? resumablePlan(workspaceOf(payload)) : null;
  if (plan) {
    writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
    stackStart(payload, 'start-work', { plan: plan.file }, false);
    recordRoute(payload, { route: 'start-work', keyword: hit.keyword ?? null, kind: 'resume', plan: plan.file, activatedAt: Date.now() });
    emitContext('UserPromptSubmit', resumeNote(plan, false, payload));
    return;
  }
  const named = hit.route === 'start-work' ? typedPlan(payload.prompt) : null;
  writeSession(payload, { route: hit.route, turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
  if (hit.route === MOTION_ROUTE) armMotionTurn(payload);
  stackStart(payload, hit.route, named ? { plan: named } : undefined, hit.restart);
  recordRoute(payload, { route: hit.route, keyword: hit.keyword ?? null, kind: 'ignite', plan: named, activatedAt: Date.now() });
  emitContext('UserPromptSubmit', activation(hit, payload) + (named ? `\nPlan: ${named}. The typed command is the approval: the work starts without a separate approval turn; work through its open rows in order.` : ''));
});

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
