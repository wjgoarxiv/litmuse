import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideVerdict, renderVerdict, nextCursor, RULES, VERDICT_RULES_VERSION } from '../plugin/lib/rewind/verdict.mjs';
import { adhdCursorPath, runRewindCli } from '../plugin/lib/rewind/collect.mjs';

// A collected record with every source read and nothing going on; each snapshot changes only what it is about.
const base = (patch = {}) => ({
  generatedAt: '2026-11-18T09:00:00.000Z',
  sources: { transcripts: 'ok', git: 'ok' },
  coverage: { notRead: { budget: 0, limit: 0, unreadable: 0 } },
  sessions: [],
  startWork: [],
  roadmap: { plans: [] },
  commits: [],
  lanes: { count: 0, waiting: 0, items: [] },
  worktreeState: [{ worktree: '/w/app', uncommitted: 0, unpushed: 0 }],
  next: { kind: 'none', target: null },
  ...patch,
});
const asking = (id8, worktree = '/w/other') => ({ id8, worktree, status: 'waiting-on-user', waitingReason: 'asked the user', last: '2026-11-18T08:00:00.000Z', self: false });
const plan = (name, done, total, current, local = true) => ({ plan: `plans/${name}.md`, worktree: '/w/app', local, current, progress: { done, total } });

// Hand-labelled snapshots, shaped after real `litmuse rewind --json` records: the rule a person would pick first.
const SNAPSHOTS = [
  ['a parked boundary beats everything', base({ next: { kind: 'approve-boundary', target: { plan: 'plans/2026-11-18-auth.md' } }, sessions: [asking('aaaa1111')] }), 'approve-boundary'],
  ['another session asked the user', base({ sessions: [asking('bbbb2222')] }), 'answer-session'],
  ['own paused spine frame', base({ next: { kind: 'resume-frame', target: { skill: 'lit-loop', stage: 'verify' } } }), 'resume-own-frame'],
  ['own start-work running', base({ next: { kind: 'continue-work', target: { plan: 'plans/cache.md' } } }), 'continue-own-work'],
  ['other lanes at work, nothing of mine', base({ lanes: { count: 2, waiting: 0, items: [] } }), 'other-lanes-at-work'],
  ['one open plan and nothing running', base({ next: { kind: 'start-plan', target: { plan: 'plans/flag.md' } }, roadmap: { plans: [plan('flag', 1, 4, 'add the flag')] } }), 'start-single-plan'],
  ['dirty tree, no plan', base({ worktreeState: [{ worktree: '/w/app', uncommitted: 3, unpushed: 0 }] }), 'uncommitted-work'],
  ['two open plans: next row of the local one', base({ roadmap: { plans: [plan('a', 1, 3, 'write the test'), plan('b', 0, 2, 'draft', false)] } }), 'next-plan-row'],
  ['all quiet, full coverage', base({ commits: [{ hash: 'abc1234' }], roadmap: { plans: [plan('done', 3, 3, null)] } }), null],
  ['a session that only claims done is not an action', base({ sessions: [{ id8: 'cccc3333', worktree: '/w/x', status: 'done', last: 'x', self: false }] }), null],
  ['self asking is not "answer a session"', base({ sessions: [{ ...asking('dddd4444'), self: true }] }), null],
  ['paused workflow of another session is not a question', base({ sessions: [{ ...asking('eeee5555'), waitingReason: 'paused workflow' }] }), null],
];

test('hand-labelled snapshots: at least 8 of 10 verdicts match (all are expected to)', () => {
  let hits = 0;
  for (const [name, data, rule] of SNAPSHOTS) {
    const got = decideVerdict(data).rule;
    if (got === rule) hits += 1;
    else console.log(`snapshot miss: ${name}: want ${rule}, got ${got}`);
  }
  assert.ok(hits / SNAPSHOTS.length >= 0.8, `${hits}/${SNAPSHOTS.length}`);
  assert.equal(hits, SNAPSHOTS.length);
});

test('the card is about six lines, Korean by default, English on request, with one action', () => {
  const data = base({ next: { kind: 'start-plan', target: { plan: 'plans/2026-11-18-flag.md' } }, sessions: [asking('bbbb2222')], worktreeState: [{ worktree: '/w/app', uncommitted: 0, unpushed: 2 }] });
  const cursor = { at: '2026-11-18T08:02:00.000Z', seen: [] };
  const ko = renderVerdict(data, { cursor }).text.trimEnd().split('\n');
  assert.ok(ko.length >= 5 && ko.length <= 6, ko.join('\n'));
  assert.match(ko[0], /^\d\d:\d\d 이후: 0개 끝남, 1개가 너를 기다림$/);
  assert.match(ko[1], /^지금 할 일: other 에서 그 세션의 질문에 답하기 #[0-9a-f]{6}$/);
  assert.equal(ko[2], '입력: 없음 — other에서 직접 답하기');
  assert.match(ko[3], /^이유: .+ · 안 하면: .+$/);
  assert.equal(ko[4], '다음 대기: 네 확인 필요: app의 커밋 2개를 push 할까?');
  assert.equal(ko[5], '읽음 1/1 세션');
  const en = renderVerdict(data, { lang: 'en', cursor }).text;
  assert.match(en, /^Since \d\d:\d\d: 0 finished, 1 waiting on you\nDo now: in other: answer/);
});

test('a push is only ever a question, never the action', () => {
  const { verdict, text } = renderVerdict(base({ worktreeState: [{ worktree: '/w/app', uncommitted: 0, unpushed: 5 }] }));
  assert.equal(verdict.action, null);
  assert.doesNotMatch(text, /지금 할 일: [^\n]*push/);
  assert.match(text, /네 확인 필요: app의 커밋 5개를 push 할까\?/);
});

test('nothing to do is said only with full coverage; a gap gives no verdict', () => {
  assert.match(renderVerdict(base()).text, /지금 할 일 없음 — 확인한 기록 1개/);
  const gap = renderVerdict(base({ coverage: { notRead: { budget: 2, limit: 0, unreadable: 0 } } }));
  assert.equal(gap.verdict.code, 'UNKNOWN');
  assert.match(gap.text, /판단 보류/);
  assert.match(gap.text, /읽음 0\/2 세션 — 못 읽음: 읽기 예산 초과 2/);
  assert.match(renderVerdict(base({ sources: { transcripts: 'unknown', git: 'ok' } })).text, /못 읽음: Muse 세션 기록 없음/);
});

test('canary: a claimed-done session never counts as finished; only proven records move the delta', () => {
  const cursor = { at: '2026-11-18T08:00:00.000Z', seen: ['commit:old0001'] };
  const claimed = base({ sessions: [{ id8: 'ffff6666', worktree: '/w/x', status: 'done', last: 'x', self: false }], commits: [{ hash: 'old0001' }] });
  assert.equal(decideVerdict(claimed, { cursor }).newlyDone, 0);
  const proven = base({ commits: [{ hash: 'old0001' }, { hash: 'new0002' }], startWork: [{ status: 'complete', plan: 'plans/x.md', id8: 'aaaa' }] });
  assert.equal(decideVerdict(proven, { cursor }).newlyDone, 2);
});

test('an action rests on a fingerprint; when the state moves the next card withdraws it', () => {
  const first = renderVerdict(base({ worktreeState: [{ worktree: '/w/app', uncommitted: 3, unpushed: 0 }] }));
  const cursor = nextCursor(first.verdict, Date.parse('2026-11-18T09:00:00.000Z'));
  assert.equal(cursor.fp, first.verdict.action.fp);
  const same = renderVerdict(base({ worktreeState: [{ worktree: '/w/app', uncommitted: 3, unpushed: 0 }] }), { cursor });
  assert.doesNotMatch(same.text, /철회/);
  const moved = renderVerdict(base({ worktreeState: [{ worktree: '/w/app', uncommitted: 4, unpushed: 0 }] }), { cursor });
  assert.match(moved.text, new RegExp(`지난 할 일 #${cursor.fp} 철회 — 상태가 바뀜`));
});

test('mutation: reordering the rule table changes a golden verdict, so the table is versioned', () => {
  assert.equal(VERDICT_RULES_VERSION, 'litmuse-adhd-verdict.v1');
  assert.deepEqual(RULES.map(([name]) => name), ['approve-boundary', 'answer-session', 'resume-own-frame', 'continue-own-work', 'other-lanes-at-work', 'start-single-plan', 'uncommitted-work', 'next-plan-row']);
  const data = SNAPSHOTS[0][1];
  const swapped = [RULES[1], RULES[0], ...RULES.slice(2)];
  const first = swapped.map(([, rule]) => rule(data)).find(Boolean);
  assert.notEqual(first.kind, decideVerdict(data).action.kind);
});

test('the CLI prints the card by default, keeps the board under --detail, and moves the cursor only after a card', () => {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-verdict-ws-'));
  const env = { HOME: mkdtempSync(join(tmpdir(), 'litmuse-verdict-home-')), XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'litmuse-verdict-state-')) };
  const exec = () => { throw new Error('no git here'); };
  const out = (args) => {
    let text = '';
    const code = runRewindCli(args, ws, { env, exec, stdout: { write: (chunk) => { text += chunk; } }, stderr: { write: () => {} } });
    return { code, text };
  };
  const detail = out(['--detail']);
  assert.equal(detail.code, 0);
  assert.equal(existsSync(adhdCursorPath(env, ws)), false, 'the board view leaves the cursor alone');
  const card = out([]);
  assert.match(card.text, /^처음 봄/);
  assert.match(card.text, /못 읽음: [^\n]*git 상태/, 'git that cannot answer is named, never guessed');
  const cursor = JSON.parse(readFileSync(adhdCursorPath(env, ws), 'utf8'));
  assert.equal(cursor.rules, VERDICT_RULES_VERSION);
  assert.match(out(['--en']).text, /^Since \d\d:\d\d: nothing changed/);
  assert.equal(out(['--recap']).code, 0);
});
