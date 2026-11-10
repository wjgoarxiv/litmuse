// The lit-adhd KPI board: one screen that says the one thing to do now and what to type, what is
// done, what is left and what not to forget. Code computes every bucket, count, bar, percentage
// and reminder from the collected records, then prints the board, so the model shows it as given.
// The board names no session id, commit hash, raw status code or internal path; a path appears
// only inside the exact text the user types.
import { basename } from 'node:path';

import { clipToWidth } from './gauge.mjs';

const DAY_MS = 86_400_000;
const STALE_DAYS = 7;
const MILESTONE_ROWS = 4;
const DONE_ROWS = 5;
const LEFT_ROWS = 7;
const REMINDERS = 5;
const ITEM_WIDTH = 80;

const known = (value) => Number.isInteger(value) && value >= 0;

/**
 * Ten cells of `█` and `░`, then `k/n (p%)`; null without a real total. A started item never shows
 * an empty bar and an unfinished one never a full bar, so the bar cannot claim more or less than k/n.
 */
export const bar10 = (done, total, { percent = true } = {}) => {
  if (!known(total) || total === 0) return null;
  const k = known(done) ? Math.min(done, total) : 0;
  const filled = k === total ? 10 : k === 0 ? 0 : Math.min(9, Math.max(1, Math.round((k * 10) / total)));
  const cells = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
  return percent ? `${cells}  ${k}/${total} (${Math.round((k * 100) / total)}%)` : `${cells} ${k}/${total}`;
};

const WORDS = {
  ko: {
    now: '## 🎯 지금 할 일', glance: '## 📊 한눈에 보기', milestones: '## 🏁 마일스톤', doneLately: '## ✅ 최근 끝낸 일', left: '## ⬜ 남은 일', remember: '## 🔔 잊지 말 것',
    type: '👉 입력:', head: '| ✅ 끝남 | 🔄 진행 중 | ⏳ 나를 기다림 | ⬜ 남음 |', overall: '전체 진행', nothingCounted: '기록된 일이 없어요',
    table: '| 마일스톤 | 상태 | 진행 | 최근 |',
    bucket: { done: '✅ 끝남', doing: '🔄 진행 중', waiting: '⏳ 나를 기다림', todo: '⬜ 시작 전' },
    noMilestones: '마일스톤이 없어요', noDone: '최근 끝낸 일이 없어요', noLeft: '남은 일이 없어요', noReminders: '잊을 게 없어요',
    more: (n) => `…외 ${n}개`,
    ago: (ms) => (ms < 60_000 ? '방금' : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}분 전` : ms < DAY_MS ? `${Math.floor(ms / 3_600_000)}시간 전` : ms < 2 * DAY_MS ? '어제' : `${Math.floor(ms / DAY_MS)}일 전`),
    steps: (n) => `${n}단계 끝남`,
    ranToEnd: (name) => `${name}: start-work로 끝까지 실행함`,
    goalMet: (name) => `목표 달성: ${name}`,
    unread: '오래된 기록 일부는 읽지 못했어요 (읽기 한도).',
  },
  en: {
    now: '## 🎯 Do this now', glance: '## 📊 At a glance', milestones: '## 🏁 Milestones', doneLately: '## ✅ Done lately', left: '## ⬜ Still to do', remember: "## 🔔 Don't forget",
    type: '👉 Type:', head: '| ✅ Done | 🔄 In progress | ⏳ Waiting on you | ⬜ Left |', overall: 'Overall', nothingCounted: 'nothing recorded yet',
    table: '| Milestone | Status | Progress | Last |',
    bucket: { done: '✅ Done', doing: '🔄 In progress', waiting: '⏳ Waiting on you', todo: '⬜ Not started' },
    noMilestones: 'No milestones in this window', noDone: 'Nothing finished lately', noLeft: 'Nothing left', noReminders: 'Nothing to remember',
    more: (n) => `…and ${n} more`,
    ago: (ms) => (ms < 60_000 ? 'just now' : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}m ago` : ms < DAY_MS ? `${Math.floor(ms / 3_600_000)}h ago` : ms < 2 * DAY_MS ? 'yesterday' : `${Math.floor(ms / DAY_MS)}d ago`),
    steps: (n) => `${n} step${n === 1 ? '' : 's'} done`,
    ranToEnd: (name) => `${name}: start-work ran it to the end`,
    goalMet: (name) => `Goal met: ${name}`,
    unread: 'Some older records were not read (read budget used up).',
  },
};

// A plan row as a plain sentence: its list number and bold marks dropped, clipped to one line.
const plain = (text) => clipToWidth(String(text).replace(/^\s*(?:\d+[.)]|[A-Za-z]{1,3}\d+[.:)])\s+/u, '').replace(/\*\*/gu, '').trim(), ITEM_WIDTH);
const cell = (text) => String(text).replace(/\|/gu, '\\|');
const place = (worktree) => (worktree && worktree !== 'unknown' ? basename(String(worktree)) : null);
/** A plan's name: its `# heading`, else the file name without date prefix, extension or dashes. */
export const planName = (plan) => {
  if (plan.title) return clipToWidth(plan.title, 60);
  const stem = basename(String(plan.plan ?? plan)).replace(/\.md$/u, '').replace(/^\d{4}-\d{2}-\d{2}-?/u, '').replace(/[-_]+/gu, ' ').trim();
  return clipToWidth(stem || 'plan', 60);
};
const named = (plan) => `${planName(plan)}${plan.local === false && place(plan.worktree) ? ` (${place(plan.worktree)})` : ''}`;
const sessionName = (session) => clipToWidth(String(session?.title && session.title !== 'unknown' ? session.title : session?.asked?.[0] ?? ''), 40);

/**
 * Milestones: the window's plans, its goals, and a running start-work run whose plan is not listed.
 * Each carries a bucket (done, doing, waiting, todo), done/total, its open rows and its last change.
 */
const milestonesOf = (input) => {
  const runs = input.startWork ?? [];
  const runFor = (plan) => runs.find((run) => run.plan === plan.plan && run.worktree === plan.worktree);
  const list = (input.plans ?? []).map((plan) => {
    const { done, total } = plan.progress;
    const run = runFor(plan);
    const bucket = known(total) && done >= total ? 'done' : run?.status === 'paused' ? 'waiting' : done > 0 || run?.status === 'active' ? 'doing' : 'todo';
    return {
      key: `${plan.worktree}:${plan.plan}`, name: named(plan), bucket, done, total, local: plan.local, changedMs: plan.changedMs, plan: plan.plan, worktree: plan.worktree,
      ticked: (plan.rows ?? []).filter((row) => row.checked).map((row) => plain(row.title)),
      open: (plan.rows ?? []).filter((row) => !row.checked).map((row) => plain(row.title)),
    };
  });
  for (const run of runs.filter((item) => item.status === 'active' && item.plan !== 'unknown')) {
    if (list.some((item) => item.plan === run.plan && item.worktree === run.worktree)) continue;
    const { done, total } = run.progress;
    list.push({ key: `${run.worktree}:${run.plan}`, name: planName(run.plan), bucket: 'doing', done: known(done) ? done : 0, total, local: true, changedMs: null, plan: run.plan, worktree: run.worktree, ticked: [], open: (run.progress.remaining ?? []).filter((name) => name !== 'unknown').map(plain) });
  }
  for (const goal of input.goals ?? []) {
    const { done, total } = goal.progress;
    const bucket = goal.status === 'complete' || (total > 0 && done >= total) ? 'done' : ['paused', 'blocked', 'waiting'].includes(goal.status) ? 'waiting' : done > 0 ? 'doing' : 'todo';
    list.push({ key: `goal:${goal.worktree}:${goal.file}`, name: clipToWidth(goal.objective, 60), bucket, done, total, local: goal.local, changedMs: goal.changedMs ?? null, goal: true, ticked: [], open: (goal.progress.remaining ?? []).filter((name) => name !== 'unknown').map(plain) });
  }
  // The current milestone leads: this session's own run, else the newest local one in progress,
  // else the newest local one not started. Then open ones (local first, newest first), then done.
  const own = input.ownRun ? list.find((item) => item.plan === input.ownRun.plan && item.worktree === input.ownRun.worktree) : null;
  const newest = (a, b) => (b.changedMs ?? 0) - (a.changedMs ?? 0);
  const current = own ?? list.filter((item) => item.local && item.bucket === 'doing').sort(newest)[0] ?? list.filter((item) => item.local && item.bucket !== 'done').sort(newest)[0] ?? null;
  const rest = list.filter((item) => item !== current);
  const open = rest.filter((item) => item.bucket !== 'done').sort((a, b) => Number(b.local) - Number(a.local) || newest(a, b));
  const done = rest.filter((item) => item.bucket === 'done').sort(newest);
  return [...(current ? [current] : []), ...open, ...done];
};

// The one thing to do now. The step itself comes from the collector's next-step priority; only the
// words are new: one action, one reason, and the exact text to type (or what to wait for).
const nowOf = (input, lang, milestones) => {
  const ko = lang === 'ko';
  const next = input.next ?? { kind: 'none' };
  const target = next.target ?? {};
  const milestoneName = (plan) => milestones.find((item) => item.plan === plan)?.name ?? planName(plan);
  if (next.kind === 'resume-frame') {
    return ko
      ? { action: `멈춘 ${target.skill} 이어 하기`, why: target.stage && target.stage !== 'unknown' ? `${target.stage} 단계에서 멈춰 있어요` : '중간에 멈춰 있어요', type: 'lit continue' }
      : { action: `Resume the paused ${target.skill}`, why: target.stage && target.stage !== 'unknown' ? `it stopped at ${target.stage}` : 'it stopped part way', type: 'lit continue' };
  }
  if (next.kind === 'approve-boundary') {
    return ko
      ? { action: 'start-work 허락 요청에 답하기', why: `${milestoneName(target.plan)} 실행이 허락을 기다려요`, type: 'lit approve', alt: 'lit deny' }
      : { action: 'Answer the start-work permission request', why: `${milestoneName(target.plan)} is waiting for your say`, type: 'lit approve', alt: 'lit deny' };
  }
  if (next.kind === 'continue-work') {
    return ko
      ? { action: `${milestoneName(target.plan)} 이어서 실행하기`, why: '이 세션의 start-work가 아직 남았어요', type: 'go' }
      : { action: `Keep running ${milestoneName(target.plan)}`, why: "this session's start-work is not finished", type: 'go' };
  }
  if (next.kind === 'start-plan') {
    // `go` runs start-work on the plan either way; a plan with ticked rows reads as carrying on.
    const begun = (milestones.find((item) => item.plan === target.plan)?.done ?? 0) > 0;
    return ko
      ? { action: `${milestoneName(target.plan)} ${begun ? '이어서 하기' : '시작하기'}`, why: '열린 계획이 이것 하나예요', type: 'go' }
      : { action: `${begun ? 'Continue' : 'Start'} ${milestoneName(target.plan)}`, why: 'it is the only open plan', type: 'go' };
  }
  const step = input.step ?? { kind: 'nothing' };
  const session = step.id8 ? (input.sessions ?? []).find((item) => item.id8 === step.id8) : null;
  const who = session && sessionName(session) ? `'${sessionName(session)}'` : null;
  const where = step.worktree && place(step.worktree) ? place(step.worktree) : null;
  switch (step.kind) {
    case 'lane-waiting':
      return ko
        ? { action: who ? `${who} 세션에 답하기` : '답을 기다리는 에이전트 창에 답하기', why: `내 대답을 기다리고 있어요${step.others ? ` (다른 레인 ${step.others}개는 아직 일하는 중)` : ''}`, waitLine: `그 ${who ? '세션' : '에이전트'} 창에서 답하기` }
        : { action: who ? `Answer the ${who} session` : 'Answer the agent pane that is waiting', why: `it is waiting for your answer${step.others ? ` (${step.others} other lane${step.others === 1 ? '' : 's'} still working)` : ''}`, waitLine: `reply in that ${who ? 'session' : 'agent'} window` };
    case 'lanes-working':
      return ko
        ? { action: `다른 레인 ${step.count}개가 끝날 때까지 기다리기`, why: '일하는 중에 이어 가면 작업이 겹쳐요', waitLine: `기다리기: 레인 ${step.count}개 끝날 때까지` }
        : { action: `Wait for ${step.count} other lane${step.count === 1 ? '' : 's'} to finish`, why: 'continuing now would overlap their work', waitLine: `wait: until ${step.count} lane${step.count === 1 ? '' : 's'} finish` };
    case 'handoff':
      return ko
        ? { action: clipToWidth(step.text, 70), why: '핸드오프에 적힌 다음 일이에요', waitLine: '`lit` 뒤에 이 일을 적어 시작하기' }
        : { action: clipToWidth(step.text, 70), why: 'it is the next item in the handoff', waitLine: 'start it: type `lit` and then this task' };
    case 'waiting-session':
      return ko
        ? { action: `${who ?? '기다리는'} 세션에 답하기`, why: '내 대답을 기다리고 있어요', waitLine: '그 세션 창에서 답하기' }
        : { action: `Answer the ${who ?? 'waiting'} session`, why: 'it is waiting for your answer', waitLine: 'reply in that session window' };
    case 'paused-frame':
      return ko
        ? { action: `멈춘 ${step.skill} 이어 하기`, why: `${step.stage} 단계에서 멈춰 있어요`, ...(step.say ? { type: step.say } : { waitLine: '그 세션 창에서 `lit continue`' }) }
        : { action: `Resume the paused ${step.skill}`, why: `it stopped at ${step.stage}`, ...(step.say ? { type: step.say } : { waitLine: 'in that session window: `lit continue`' }) };
    case 'open-plan': {
      const command = `lit start ${step.plan}`;
      const there = step.local ? '' : where;
      return ko
        ? { action: `${milestoneName(step.plan)}: ${plain(step.current)}`, why: '열린 계획이 여러 개라 `go`가 하나를 고를 수 없어요', waitLine: there ? `\`${there}\` 폴더에서 \`${command}\`` : `\`${command}\`` }
        : { action: `${milestoneName(step.plan)}: ${plain(step.current)}`, why: 'several plans are open, so `go` cannot pick one', waitLine: there ? `in the \`${there}\` folder: \`${command}\`` : `\`${command}\`` };
    }
    case 'active-session':
      return ko
        ? { action: `${who ?? '다른'} 세션이 끝날 때까지 기다리기`, why: '아직 일하고 있어요', waitLine: '기다리기: 그 세션이 끝날 때까지' }
        : { action: `Wait for the ${who ?? 'other'} session`, why: 'it is still working', waitLine: 'wait: until that session finishes' };
    case 'review-done':
      return ko
        ? { action: `${who ?? '끝난'} 세션이 끝낸 일 검토하기`, why: 'start-work가 계획을 끝까지 실행했어요', waitLine: `${where ? `\`${where}\` 폴더에서 ` : ''}결과 확인하기` }
        : { action: `Review what the ${who ?? 'finished'} session finished`, why: 'start-work ran its plan to the end', waitLine: `check the result${where ? ` in the \`${where}\` folder` : ''}` };
    case 'pick-up':
      return ko
        ? { action: `${who ?? '가장 최근'} 세션 이어 하기`, why: '가장 최근에 멈춘 세션이에요', waitLine: '그 세션 창을 열고 이어서 말하기' }
        : { action: `Pick up the ${who ?? 'latest'} session`, why: 'it is the most recent one that stopped', waitLine: 'open that session and carry on' };
    default:
      return ko
        ? { action: '새로 시작할 일 정하기', why: '이 기간에는 세션도 계획도 없어요', waitLine: '`lit <할 일>`' }
        : { action: 'Decide what to start', why: 'no session or plan is on record in this window', waitLine: '`lit <task>`' };
  }
};

// Reminders: action-shaped (`thing → what to do`), most urgent first, at most five, and only from
// facts the collector read: sessions waiting on the user, uncommitted and unpushed work, lanes still
// working, plans untouched for a week or more, and the handoff's Next item.
const remindersOf = (input, lang, now) => {
  const ko = lang === 'ko';
  const out = [];
  for (const session of (input.sessions ?? []).filter((item) => item.status === 'waiting-on-user')) {
    const name = sessionName(session) ? `'${sessionName(session)}'` : (ko ? '이름 없는' : 'an unnamed');
    const self = session.self;
    const action = session.waitingReason === 'start-work boundary'
      ? (ko ? '`lit approve` 또는 `lit deny` 입력' : 'type `lit approve` or `lit deny`')
      : session.waitingReason === 'paused workflow'
        ? (self ? (ko ? '`lit continue` 입력' : 'type `lit continue`') : (ko ? '그 세션 창에서 `lit continue` 입력' : 'type `lit continue` in that session'))
        : (ko ? '그 세션 창에서 질문에 답하기' : 'answer its question in that session');
    out.push({ kind: 'waiting', icon: '⏳', text: ko ? `${name} 세션이 나를 기다려요 → ${action}` : `${name} session is waiting on you → ${action}` });
  }
  const agents = (input.lanes?.items ?? []).filter((lane) => lane.waiting && !(input.sessions ?? []).some((session) => session.id8 === lane.id8)).length;
  if (agents) out.push({ kind: 'waiting', icon: '⏳', text: ko ? `답을 기다리는 에이전트 창 ${agents}개 → 그 창에서 답하기` : `${agents} agent pane${agents === 1 ? '' : 's'} waiting for an answer → reply in that pane` });
  for (const tree of input.worktreeState ?? []) {
    const name = place(tree.worktree) ?? '.';
    if (tree.uncommitted > 0) out.push({ kind: 'uncommitted', icon: '💾', text: ko ? `커밋 안 된 변경 ${tree.uncommitted}개 (${name}) → 검토하고 커밋하거나 되돌리기` : `${tree.uncommitted} uncommitted change${tree.uncommitted === 1 ? '' : 's'} (${name}) → review, then commit or discard` });
  }
  for (const tree of input.worktreeState ?? []) {
    const name = place(tree.worktree) ?? '.';
    if (tree.unpushed > 0) out.push({ kind: 'unpushed', icon: '📤', text: ko ? `푸시 안 된 커밋 ${tree.unpushed}개 (${name}) → 확인하고 push하기` : `${tree.unpushed} unpushed commit${tree.unpushed === 1 ? '' : 's'} (${name}) → check them, then push` });
  }
  const working = (input.lanes?.count ?? 0) - (input.lanes?.waiting ?? 0);
  if (working > 0) out.push({ kind: 'lanes', icon: '🏃', text: ko ? `아직 일하는 레인 ${working}개 → 끝날 때까지 \`go\` 치지 않기` : `${working} lane${working === 1 ? '' : 's'} still working → do not type \`go\` until they finish` });
  const stale = (input.allPlans ?? [])
    .filter((plan) => plan.current !== null && plan.changedMs !== null && now - plan.changedMs >= STALE_DAYS * DAY_MS)
    .sort((a, b) => a.changedMs - b.changedMs);
  for (const plan of stale) {
    const days = Math.floor((now - plan.changedMs) / DAY_MS);
    out.push({ kind: 'stale', icon: '🕰️', text: ko ? `${days}일째 멈춘 계획: ${named(plan)} → 이어 할지, 접을지 정하기` : `plan untouched for ${days} days: ${named(plan)} → decide: pick it up or drop it` });
  }
  if (input.handoffNext && input.step?.kind !== 'handoff') {
    const item = clipToWidth(input.handoffNext, 60);
    out.push({ kind: 'handoff', icon: '📌', text: ko ? `핸드오프의 다음 일: ${item} → 시작할 때 \`lit\` 뒤에 적기` : `handoff next item: ${item} → to start it, type \`lit\` and then the task` });
  }
  return out.slice(0, REMINDERS);
};

/** Builds the board fields from the collected records, then its text. */
export const buildBoard = (input, lang = 'en') => {
  const words = lang === 'ko' ? 'ko' : 'en';
  const now = input.now;
  const milestones = milestonesOf(input);
  const sum = (pick) => milestones.reduce((total, item) => total + pick(item), 0);
  const done = sum((item) => (known(item.done) ? item.done : 0));
  const openRows = sum((item) => (known(item.total) && known(item.done) ? Math.max(item.total - item.done, 0) : item.open.length));
  const doing = milestones.filter((item) => item.bucket === 'doing' && item.open.length > 0).length;
  const self = (input.sessions ?? []).some((session) => session.self && session.status === 'waiting-on-user');
  const waiting = (self ? 1 : 0) + (input.lanes?.waiting ?? 0);
  const left = Math.max(openRows - doing, 0);
  const total = done + doing + waiting + left;

  const doneItems = [];
  for (const run of (input.startWork ?? []).filter((item) => item.status === 'complete').sort((a, b) => (b.completedMs ?? 0) - (a.completedMs ?? 0))) {
    doneItems.push(WORDS[words].ranToEnd(milestones.find((item) => item.plan === run.plan)?.name ?? planName(run.plan)));
  }
  for (const item of [...milestones].sort((a, b) => (b.changedMs ?? 0) - (a.changedMs ?? 0))) {
    if (item.goal && item.bucket === 'done') doneItems.push(WORDS[words].goalMet(item.name));
    doneItems.push(...[...item.ticked].reverse());
  }
  const remaining = milestones.filter((item) => item.bucket !== 'done').flatMap((item) => item.open);

  const fields = {
    lang: words,
    now: nowOf(input, words, milestones),
    glance: { done, doing, waiting, left, total, percent: total ? Math.round((done * 100) / total) : null, bar: bar10(done, total) },
    milestones: milestones.slice(0, MILESTONE_ROWS).map((item) => ({
      name: item.name, bucket: item.bucket, done: item.done, total: item.total,
      bar: bar10(item.done, item.total, { percent: false }),
      last: item.changedMs !== null && item.changedMs !== undefined ? WORDS[words].ago(Math.max(0, now - item.changedMs)) : '·',
    })),
    milestonesOmitted: Math.max(milestones.length - MILESTONE_ROWS, 0),
    doneItems: doneItems.slice(0, DONE_ROWS),
    remaining: remaining.slice(0, LEFT_ROWS),
    remainingOmitted: Math.max(remaining.length - LEFT_ROWS, 0),
    reminders: remindersOf(input, words, now),
    unread: Boolean(input.unread),
  };
  fields.now.type = fields.now.type ?? null;
  return { ...fields, text: renderBoard(fields) };
};

/** The board as Markdown, from its fields alone; the same fields always give the same text. */
export const renderBoard = (board) => {
  const w = WORDS[board.lang] ?? WORDS.en;
  const out = [];
  const { now, glance } = board;
  out.push(w.now, `**${now.action}** — ${now.why}`);
  out.push(`${w.type} ${now.type ? `\`${now.type}\`${now.alt ? (board.lang === 'ko' ? ` (거절은 \`${now.alt}\`)` : ` (or \`${now.alt}\` to refuse)`) : ''}` : now.waitLine}`, '');
  out.push(w.glance, w.head, '|:--:|:--:|:--:|:--:|', `| ${glance.done} | ${glance.doing} | ${glance.waiting} | ${glance.left} |`, '');
  out.push(`${w.overall}  ${glance.bar ?? w.nothingCounted}`, '');
  out.push(w.milestones);
  if (board.milestones.length) {
    out.push(w.table, '|---|---|---|---|');
    for (const row of board.milestones) {
      const progress = row.bar ?? (known(row.done) ? w.steps(row.done) : '·');
      out.push(`| ${cell(row.name)} | ${w.bucket[row.bucket]} | ${progress} | ${row.last} |`);
    }
    if (board.milestonesOmitted) out.push(`| ${w.more(board.milestonesOmitted)} | | | |`);
  } else out.push(w.noMilestones);
  out.push('', w.doneLately);
  if (board.doneItems.length) out.push(...board.doneItems.map((item) => `- ${item}`));
  else out.push(w.noDone);
  out.push('', w.left);
  if (board.remaining.length) {
    out.push(...board.remaining.map((item, index) => `${index + 1}. ${item}`));
    if (board.remainingOmitted) out.push(w.more(board.remainingOmitted));
  } else out.push(w.noLeft);
  out.push('', w.remember);
  if (board.reminders.length) out.push(...board.reminders.map((item) => `- ${item.icon} ${item.text}`));
  else out.push(w.noReminders);
  if (board.unread) out.push('', w.unread);
  return `${out.join('\n')}\n`;
};
