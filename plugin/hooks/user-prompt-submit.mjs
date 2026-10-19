import { run, emitContext, readSession, writeSession, safeId, workspaceOf } from './lib/common.mjs';
import { detectRoute } from './lib/routes.mjs';
import { liveRoute, resumablePlan } from './lib/reentry.mjs';
import { recordRoute } from './lib/stage.mjs';
import { MOTION_ROUTE, armMotionTurn } from './lib/motion.mjs';

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

run((payload) => {
  const pauseRequested = PAUSE.test(String(payload.prompt ?? ''));
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
    writeSession(payload, { ...previous, turnId, pauseRequested });
    if (active === MOTION_ROUTE) armMotionTurn(payload);
    recordRoute(payload, { route: active, keyword: hit.keyword ?? null, kind: 'continue' });
    emitContext('UserPromptSubmit', active === 'start-work'
      ? resumeNote(resumablePlan(workspaceOf(payload)), true, payload)
      : continueNote(active));
    return;
  }
  const plan = !hit.restart && (hit.bare || hit.resume) ? resumablePlan(workspaceOf(payload)) : null;
  if (plan) {
    writeSession(payload, { route: 'start-work', turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
    recordRoute(payload, { route: 'start-work', keyword: hit.keyword ?? null, kind: 'resume', plan: plan.file, activatedAt: Date.now() });
    emitContext('UserPromptSubmit', resumeNote(plan, false, payload));
    return;
  }
  writeSession(payload, { route: hit.route, turnId, activatedAt: Date.now(), stopHeldFor: null, pauseRequested });
  if (hit.route === MOTION_ROUTE) armMotionTurn(payload);
  recordRoute(payload, { route: hit.route, keyword: hit.keyword ?? null, kind: 'ignite', activatedAt: Date.now() });
  emitContext('UserPromptSubmit', activation(hit, payload));
});
