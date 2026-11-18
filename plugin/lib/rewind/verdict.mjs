// The lit-adhd verdict card: about six lines that answer "what do I do now?" from the collected records alone. A
// versioned rule table picks ONE verdict, top rule first; the model only shows what this prints.
//
//   1 what changed since the user last looked   `18:02 이후: 2개 끝남, 1개가 너를 기다림`
//   2 the one action and where                  `지금 할 일: <where> 에서 <action> #<fp>`
//   3 the exact text to type                    `입력: \`lit approve\``
//   4 why, and the cost of not doing it          `이유: … · 안 하면: …`
//   5 what else waits on the user, two at most   `다음 대기: …`
//   6 what was read                              `읽음 6/7 세션 — 못 읽음: …`
//
// Inputs are evidence-gated. A start-work run whose plan is fully ticked, a ticked plan and a commit are proven done; a
// session that only says it finished is a claim and never counts. Every action carries a fingerprint of the records it
// rests on and the condition that must still hold; the next card withdraws it by that fingerprint when the records
// moved. A push, publish or release is never an action, only a `네 확인 필요` question. `지금 할 일 없음` needs every
// source read. Pure: the CLI reads and writes the cursor file.
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { clipToWidth } from './gauge.mjs';

export const VERDICT_RULES_VERSION = 'litmuse-adhd-verdict.v1';
const TEXT_MAX = 64;

const LABELS = {
  ko: {
    since: (hhmm) => `${hhmm} 이후`,
    firstLook: '처음 봄 — 비교할 기준 없음',
    delta: (done, waiting) => `${done}개 끝남, ${waiting}개가 너를 기다림`,
    nothingChanged: '바뀐 것 없음',
    withdrawn: (fp) => `지난 할 일 #${fp} 철회 — 상태가 바뀜`,
    doNow: '지금 할 일',
    at: (where, action) => (where ? `${where} 에서 ${action}` : action),
    type: '입력',
    noType: (where) => `없음 — ${where ?? '그 세션'}에서 직접 답하기`,
    waitType: '없음 — 끝날 때까지 기다리기',
    why: '이유',
    ifNot: '안 하면',
    queue: '다음 대기',
    confirm: '네 확인 필요',
    read: (read, found) => `읽음 ${read}/${found} 세션`,
    missing: '못 읽음',
    nothing: (count) => `지금 할 일 없음 — 확인한 기록 ${count}개`,
    unknown: '판단 보류 — 못 읽은 기록이 있음',
    reasons: { budget: '읽기 예산 초과', limit: '최대 개수 초과', unreadable: '읽을 수 없음', transcripts: 'Muse 세션 기록 없음', git: 'git 상태' },
    actions: {
      approve: (plan) => `${plan}의 멈춘 단계 승인 또는 거절`,
      answer: () => '그 세션의 질문에 답하기',
      resume: (skill) => `멈춘 ${skill} 이어가기`,
      continue: (plan) => `${plan} 이어서 진행`,
      startPlan: (plan) => `${plan} 실행 시작`,
      planItem: (item) => `다음 항목: ${item}`,
      dirty: (count) => `커밋 안 된 파일 ${count}개 확인`,
      wait: (lanes) => `기다리기 — 다른 세션 ${lanes}개 작업 중`,
    },
    whyOf: {
      approve: '작업이 네 승인을 기다림',
      answer: '그 세션이 네 답을 기다림',
      resume: '이 세션의 작업이 멈춰 있음',
      continue: '이 세션의 start-work가 진행 중',
      startPlan: '열린 계획이 하나뿐이고 아무것도 안 돌고 있음',
      planItem: '계획에 체크 안 된 항목이 남음',
      dirty: '커밋 안 된 변경이 있음',
      wait: '다른 세션이 같은 곳에서 일하는 중',
    },
    ifNotOf: {
      approve: '그 작업이 계속 멈춰 있음, 잃는 것은 없음',
      answer: '그 세션이 계속 기다림',
      resume: '멈춘 그대로 남음',
      continue: '남은 항목이 그대로 남음',
      startPlan: '계획이 그대로 남음',
      planItem: '계획이 그대로 남음',
      dirty: '변경이 커밋 안 된 채 남음',
      wait: '없음',
    },
    push: (where, count) => `${where}의 커밋 ${count}개를 push 할까?`,
    waitingAt: (where) => `${where} 세션이 답을 기다림`,
    more: (n) => `(+${n})`,
  },
  en: {
    since: (hhmm) => `Since ${hhmm}`,
    firstLook: 'First look — no baseline yet',
    delta: (done, waiting) => `${done} finished, ${waiting} waiting on you`,
    nothingChanged: 'nothing changed',
    withdrawn: (fp) => `last action #${fp} withdrawn — the state moved`,
    doNow: 'Do now',
    at: (where, action) => (where ? `in ${where}: ${action}` : action),
    type: 'Type',
    noType: (where) => `nothing — answer in ${where ?? 'that session'}`,
    waitType: 'nothing — wait for them to finish',
    why: 'Why',
    ifNot: 'If not',
    queue: 'Next waiting',
    confirm: 'Your call',
    read: (read, found) => `Read ${read}/${found} sessions`,
    missing: 'not read',
    nothing: (count) => `Nothing to do now — ${count} records checked`,
    unknown: 'No verdict — some records were not read',
    reasons: { budget: 'read budget spent', limit: 'over the session cap', unreadable: 'unreadable', transcripts: 'no Muse session log', git: 'git state' },
    actions: {
      approve: (plan) => `approve or deny the parked step of ${plan}`,
      answer: () => 'answer that session\'s question',
      resume: (skill) => `resume the paused ${skill}`,
      continue: (plan) => `continue ${plan}`,
      startPlan: (plan) => `start ${plan}`,
      planItem: (item) => `next item: ${item}`,
      dirty: (count) => `review ${count} uncommitted file(s)`,
      wait: (lanes) => `wait — ${lanes} other session(s) at work`,
    },
    whyOf: {
      approve: 'the run waits for your approval',
      answer: 'that session waits for your answer',
      resume: 'this session\'s work is paused',
      continue: 'this session\'s start-work is running',
      startPlan: 'one open plan and nothing running',
      planItem: 'the plan has unticked rows',
      dirty: 'uncommitted changes',
      wait: 'another session works here',
    },
    ifNotOf: {
      approve: 'the run stays parked, nothing lost',
      answer: 'that session keeps waiting',
      resume: 'it stays paused',
      continue: 'the open rows stay open',
      startPlan: 'the plan stays as it is',
      planItem: 'the plan stays as it is',
      dirty: 'the changes stay uncommitted',
      wait: 'nothing',
    },
    push: (where, count) => `push ${count} commit(s) in ${where}?`,
    waitingAt: (where) => `the session in ${where} waits for an answer`,
    more: (n) => `(+${n})`,
  },
};

const placeOf = (worktree) => (worktree && worktree !== 'unknown' ? basename(String(worktree)) : null);
const short = (text) => clipToWidth(String(text ?? '').replace(/[`*_]/gu, '').replace(/\s+/gu, ' ').trim(), TEXT_MAX);
const planLabel = (path) => short(basename(String(path ?? 'plan')).replace(/\.md$/u, '').replace(/^\d{4}-\d{2}-\d{2}-/u, ''));
export const fingerprint = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 6);

const complete = (progress) => Number.isInteger(progress?.total) && progress.total > 0 && progress.done === progress.total;

/** Proven finished items: a start-work run or plan with every row ticked, and commits. A transcript's own word is not. */
export const provenDone = (data) => [
  ...(data.startWork ?? []).filter((run) => run.status === 'complete').map((run) => `run:${run.plan}:${run.id8}`),
  ...(data.roadmap?.plans ?? []).filter((plan) => complete(plan.progress)).map((plan) => `plan:${plan.worktree}:${plan.plan}`),
  ...(data.commits ?? []).map((commit) => `commit:${commit.hash}`),
];

const waitingSessions = (data) => (data.sessions ?? []).filter((session) => !session.self && session.status === 'waiting-on-user' && session.waitingReason === 'asked the user');

/** Who could not be read: transcripts past the cap or the budget, unreadable ones, and missing sources. */
export const coverageOf = (data) => {
  const notRead = data.coverage?.notRead ?? {};
  const missing = [];
  for (const reason of ['budget', 'limit', 'unreadable']) if (notRead[reason] > 0) missing.push({ reason, count: notRead[reason] });
  if (data.sources?.transcripts !== 'ok') missing.push({ reason: 'transcripts', count: null });
  if ((data.worktreeState ?? []).some((tree) => tree.uncommitted === null)) missing.push({ reason: 'git', count: null });
  const read = (data.sessions ?? []).length;
  const skipped = missing.reduce((sum, item) => sum + (item.count ?? 0), 0);
  return { read, found: read + skipped, missing, full: missing.length === 0 };
};

/**
 * The rule table, top first. Each rule returns null or `{ code, kind, where, arg, type, fp, pre }`. Versioned: a change of
 * order or meaning bumps VERDICT_RULES_VERSION and the golden snapshots in test/adhd-verdict.test.mjs.
 */
export const RULES = Object.freeze([
  ['approve-boundary', (data) => (data.next?.kind === 'approve-boundary'
    ? { code: 'NEEDS_YOU', kind: 'approve', where: null, arg: planLabel(data.next.target?.plan), type: 'lit approve', fp: fingerprint(['approve', data.next.target]), pre: 'a parked start-work step is open' } : null)],
  ['answer-session', (data) => {
    const session = waitingSessions(data)[0];
    return session ? { code: 'NEEDS_YOU', kind: 'answer', where: placeOf(session.worktree) ?? session.id8, arg: null, type: null, fp: fingerprint(['answer', session.id8, session.last]), pre: 'that session\'s last turn asked the user' } : null;
  }],
  ['resume-own-frame', (data) => (data.next?.kind === 'resume-frame'
    ? { code: 'ONE_ACTION', kind: 'resume', where: null, arg: data.next.target?.skill ?? 'work', type: 'lit continue', fp: fingerprint(['resume', data.next.target]), pre: 'this session\'s spine frame is paused' } : null)],
  ['continue-own-work', (data) => (data.next?.kind === 'continue-work'
    ? { code: 'ONE_ACTION', kind: 'continue', where: null, arg: planLabel(data.next.target?.plan), type: 'go', fp: fingerprint(['continue', data.next.target]), pre: 'this session\'s start-work is live' } : null)],
  ['other-lanes-at-work', (data) => (data.lanes?.count > 0
    ? { code: 'WAIT', kind: 'wait', where: null, arg: data.lanes.count, type: null, fp: fingerprint(['wait', data.lanes.count]), pre: 'another session is active here' } : null)],
  ['start-single-plan', (data) => (data.next?.kind === 'start-plan'
    ? { code: 'ONE_ACTION', kind: 'startPlan', where: null, arg: planLabel(data.next.target?.plan), type: 'go', fp: fingerprint(['start', data.next.target]), pre: 'one open plan, nothing running' } : null)],
  ['uncommitted-work', (data) => {
    const tree = (data.worktreeState ?? []).find((item) => item.uncommitted > 0);
    return tree ? { code: 'ONE_ACTION', kind: 'dirty', where: placeOf(tree.worktree), arg: tree.uncommitted, type: 'git status', fp: fingerprint(['dirty', tree.worktree, tree.uncommitted]), pre: 'the worktree has uncommitted changes' } : null;
  }],
  ['next-plan-row', (data) => {
    const plans = data.roadmap?.plans ?? [];
    const plan = plans.find((item) => item.local && item.current) ?? plans.find((item) => item.current);
    return plan ? { code: 'ONE_ACTION', kind: 'planItem', where: plan.local ? null : placeOf(plan.worktree), arg: short(plan.current), type: plan.local ? `lit start ${plan.plan}` : null, fp: fingerprint(['row', plan.plan, plan.current]), pre: 'that row is still unticked' } : null;
  }],
]);

// The decision queue: what else waits on the user. A push is a question, never an action.
const queueOf = (data, chosen, labels) => {
  const items = [];
  for (const session of waitingSessions(data)) {
    if (chosen?.kind === 'answer' && chosen.fp === fingerprint(['answer', session.id8, session.last])) continue;
    items.push(labels.waitingAt(placeOf(session.worktree) ?? session.id8));
  }
  for (const tree of data.worktreeState ?? []) if (tree.unpushed > 0) items.push(`${labels.confirm}: ${labels.push(placeOf(tree.worktree) ?? 'here', tree.unpushed)}`);
  return items;
};

/** The structured verdict: delta, the one action (or nothing, or no verdict), queue and coverage. */
export const decideVerdict = (data, { cursor = null } = {}) => {
  const done = provenDone(data);
  const since = cursor && Number.isFinite(Date.parse(cursor.at)) ? Date.parse(cursor.at) : null;
  const seen = new Set(Array.isArray(cursor?.seen) ? cursor.seen : []);
  const newlyDone = since === null ? null : done.filter((id) => !seen.has(id)).length;
  const waiting = waitingSessions(data).length + (data.next?.kind === 'approve-boundary' ? 1 : 0);
  let action = null;
  let rule = null;
  for (const [name, test] of RULES) {
    action = test(data);
    if (action) {
      rule = name;
      break;
    }
  }
  const coverage = coverageOf(data);
  const code = action?.code ?? (coverage.full ? 'ALL_CLEAR' : 'UNKNOWN');
  const checked = done.length + (data.sessions ?? []).length + (data.roadmap?.plans ?? []).length + (data.worktreeState ?? []).length;
  return { version: VERDICT_RULES_VERSION, code, rule, action, since, newlyDone, waiting, coverage, checked, done };
};

const hhmm = (ms) => {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** The card as text. `lang` is ko (default) or en. */
export const renderVerdict = (data, { lang = 'ko', cursor = null } = {}) => {
  const labels = LABELS[lang] ?? LABELS.ko;
  const verdict = decideVerdict(data, { cursor });
  const { action } = verdict;
  const lines = [];
  if (verdict.since === null) lines.push(labels.firstLook);
  else {
    // The last card's action rested on records that changed: say it is withdrawn, never repeat it silently.
    const withdrawn = typeof cursor?.fp === 'string' && /^[0-9a-f]{6}$/u.test(cursor.fp) && cursor.fp !== (action?.fp ?? null) ? ` · ${labels.withdrawn(cursor.fp)}` : '';
    const quiet = verdict.newlyDone === 0 && verdict.waiting === 0;
    lines.push(`${labels.since(hhmm(verdict.since))}: ${quiet ? labels.nothingChanged : labels.delta(verdict.newlyDone, verdict.waiting)}${withdrawn}`);
  }
  if (action) {
    lines.push(`${labels.doNow}: ${labels.at(action.where, labels.actions[action.kind](action.arg))} #${action.fp}`);
    lines.push(`${labels.type}: ${action.type ? `\`${action.type}\`` : action.kind === 'wait' ? labels.waitType : labels.noType(action.where)}`);
    lines.push(`${labels.why}: ${labels.whyOf[action.kind]} · ${labels.ifNot}: ${labels.ifNotOf[action.kind]}`);
  } else {
    lines.push(verdict.code === 'ALL_CLEAR' ? labels.nothing(verdict.checked) : labels.unknown);
  }
  const queue = queueOf(data, action, labels);
  if (queue.length) lines.push(`${labels.queue}: ${queue.slice(0, 2).join(' · ')}${queue.length > 2 ? ` ${labels.more(queue.length - 2)}` : ''}`);
  const { read, found, missing } = verdict.coverage;
  lines.push(`${labels.read(read, found)}${missing.length ? ` — ${labels.missing}: ${missing.map((item) => `${labels.reasons[item.reason]}${item.count ? ` ${item.count}` : ''}`).join(', ')}` : ''}`);
  return { text: `${lines.join('\n')}\n`, verdict };
};

/** The next cursor: when the user looked, which proven items they have now seen, and the action shown. */
export const nextCursor = (verdict, now) => ({ version: 1, rules: VERDICT_RULES_VERSION, at: new Date(now).toISOString(), seen: verdict.done.slice(0, 500), fp: verdict.action?.fp ?? null });
