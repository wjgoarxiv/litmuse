// lit-adhd v2: the KPI board. The collector computes buckets, counts, bars, percentages and
// reminders and prints the board itself, so the model only shows it. Fixture: two plans (one
// fully ticked, one half), a session waiting on the user, uncommitted changes, one stale plan.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { collectRewind, runRewindCli } from '../plugin/lib/rewind/collect.mjs';
import { bar10, renderBoard } from '../plugin/lib/rewind/board.mjs';

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();
const cleanups = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop(), { recursive: true, force: true });
});

const line = (payloadType, payload, minutesAgo) => ({ stream: 's', sequence: 1, recorded_at: iso(minutesAgo), payload_type: payloadType, payload });
const intentLine = (text, minutesAgo) => line('runtime.user_intent.accepted', { kind: 'session', record: { kind: 'accepted', refill_blocks: [{ kind: 'text', text }] } }, minutesAgo);
const nameLine = (title, minutesAgo) => line('session.name.changed', { session_id: 'x', previous_name: '', new_name: title, source: 'ai' }, minutesAgo);
const routeLine = (cwd, minutesAgo) => line('runtime.session.route_facts', { kind: 'route_facts', record: { cwd } }, minutesAgo);
const writeLog = (storeDir, sessionId, lines) => {
  const dir = join(storeDir, '2026', '11', '10', sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'session.jsonl'), `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
};
const touch = (path, minutesAgo) => {
  const at = new Date(NOW - minutesAgo * 60_000);
  utimesSync(path, at, at);
};

const WAITER = '7f3a9c21-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';

const fixture = ({ dirty = 3, unpushed = 2, plans = true, waiting = true } = {}) => {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-board-'));
  cleanups.push(home);
  const repo = join(home, 'repo');
  const storeDir = join(home, 'store', 'sessions');
  mkdirSync(join(repo, 'plans'), { recursive: true });
  if (plans) {
    writeFileSync(join(repo, 'plans', '2026-11-09-login.md'), '# Login page\n- [x] 1. Draw the form\n- [x] 2. Wire the submit button\n- [x] 3. Show the error text\n');
    writeFileSync(join(repo, 'plans', '2026-11-10-search.md'), '# Search box\n- [x] 1. Add the input\n- [x] 2. Debounce typing\n- [ ] 3. Show the results list\n- [ ] 4. Highlight the match\n');
    writeFileSync(join(repo, 'plans', '2026-10-20-export.md'), '# CSV export\n- [x] 1. Pick the columns\n- [ ] 2. Write the file\n');
    touch(join(repo, 'plans', '2026-11-09-login.md'), 300);
    touch(join(repo, 'plans', '2026-11-10-search.md'), 10);
    touch(join(repo, 'plans', '2026-10-20-export.md'), 10 * 24 * 60);
  }
  if (waiting) writeLog(storeDir, WAITER, [routeLine(repo, 30), intentLine('fix the search page', 30), nameLine('Search page lane', 29), intentLine('Done. Should I push this branch now?', 4)]);
  const calls = [];
  const exec = (file, args) => {
    calls.push(args.join(' '));
    assert.equal(file, 'git');
    if (args[0] === 'worktree') return `worktree ${repo}\nHEAD abc\nbranch refs/heads/main\n`;
    if (args[0] === 'rev-parse') return 'main\n';
    if (args.includes('status')) return [' M src/search.js', '?? src/new.js', ' D old.txt'].slice(0, dirty).join('\n') + (dirty ? '\n' : '');
    if (args[0] === 'rev-list') return `${unpushed}\n`;
    return `${COMMIT}\t${iso(20)}\tfeat: debounce the search box\n`;
  };
  return { home, repo, env: { HOME: home, LITMUSE_SESSION_STORE: storeDir }, exec, calls };
};

const board = (opts = {}, collectOpts = {}) => {
  const fx = fixture(opts);
  const data = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'ko', record: false, ...collectOpts });
  return { ...fx, data, text: data.board.text };
};

test('bars are ten cells of █ and ░ with k/n and a percentage', () => {
  assert.equal(bar10(12, 24), '█████░░░░░  12/24 (50%)');
  assert.equal(bar10(0, 4), '░░░░░░░░░░  0/4 (0%)');
  assert.equal(bar10(4, 4), '██████████  4/4 (100%)');
  assert.equal(bar10(1, 40), '█░░░░░░░░░  1/40 (3%)', 'a started item never shows an empty bar');
  assert.equal(bar10(39, 40), '█████████░  39/40 (98%)', 'an unfinished item never shows a full bar');
  assert.equal(bar10(3, 10, { percent: false }), '███░░░░░░░ 3/10');
  assert.equal(bar10(2, null), null, 'no bar without a real total');
});

test('the board keeps its section order in Korean and English', () => {
  const { text } = board();
  const ko = ['## 🎯 지금 할 일', '## 📊 한눈에 보기', '## 🏁 마일스톤', '## ✅ 최근 끝낸 일', '## ⬜ 남은 일', '## 🔔 잊지 말 것'];
  const at = ko.map((heading) => text.indexOf(heading));
  assert.ok(at.every((index) => index >= 0), `every section is there:\n${text}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'fixed order');
  assert.match(text, /👉 입력: /u);
  const fx = fixture();
  const en = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'en', record: false }).board.text;
  const headings = ['## 🎯 Do this now', '## 📊 At a glance', '## 🏁 Milestones', '## ✅ Done lately', '## ⬜ Still to do', "## 🔔 Don't forget"];
  const enAt = headings.map((heading) => en.indexOf(heading));
  assert.ok(enAt.every((index) => index >= 0), en);
  assert.deepEqual([...enAt].sort((a, b) => a - b), enAt);
  assert.match(en, /👉 Type: /u);
});

test('bucket counts, the overall bar and the milestone rows come from the records', () => {
  const { data, text } = board();
  const { glance, milestones } = data.board;
  // Milestones in the window only: login 3 + search 2 ticked rows. The search plan is in progress,
  // so its first open row is the one in progress; one session waits on the user; one row is left.
  // The stale export plan is a reminder, not part of the count.
  assert.deepEqual({ done: glance.done, doing: glance.doing, waiting: glance.waiting, left: glance.left }, { done: 5, doing: 1, waiting: 1, left: 1 });
  assert.equal(glance.total, 8);
  assert.equal(glance.percent, 63);
  assert.match(text, /\| ✅ 끝남 \| 🔄 진행 중 \| ⏳ 나를 기다림 \| ⬜ 남음 \|\n\|:--:\|:--:\|:--:\|:--:\|\n\| 5 \| 1 \| 1 \| 1 \|/u);
  assert.match(text, /전체 진행 {2}██████░░░░ {2}5\/8 \(63%\)/u);
  assert.deepEqual(milestones.map((row) => [row.name, row.bucket, row.done, row.total]), [
    ['Search box', 'doing', 2, 4],
    ['Login page', 'done', 3, 3],
  ], 'the window keeps the stale plan out of the milestones; the current plan leads');
  assert.match(text, /\| Search box \| 🔄 진행 중 \| █████░░░░░ 2\/4 \| 10분 전 \|/u);
  assert.match(text, /\| Login page \| ✅ 끝남 \| ██████████ 3\/3 \| 5시간 전 \|/u);
});

test('done lately and still to do read as plain sentences in order', () => {
  const { data, text } = board();
  assert.deepEqual(data.board.doneItems.slice(0, 2), ['Add the input', 'Debounce typing'].reverse(), 'newest plan first, last tick first');
  assert.match(text, /## ⬜ 남은 일\n1\. Show the results list\n2\. Highlight the match\n/u, 'current plan first, numbering stripped');
});

test('done is capped at five and still to do at seven with a count of the rest', () => {
  const fx = fixture({ plans: false, waiting: false });
  const rows = Array.from({ length: 6 }, (_, i) => `- [x] ${i + 1}. Finished step ${i + 1}`)
    .concat(Array.from({ length: 10 }, (_, i) => `- [ ] ${i + 7}. Open step ${i + 7}`));
  writeFileSync(join(fx.repo, 'plans', 'big.md'), `# Big plan\n${rows.join('\n')}\n`);
  const ko = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'ko', record: false }).board;
  assert.equal(ko.doneItems.length, 5);
  assert.equal(ko.remaining.length, 7);
  assert.match(ko.text, /7\. Open step 13\n…외 3개/u);
  const en = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'en', record: false }).board;
  assert.match(en.text, /…and 3 more/u);
});

test('reminders are action-shaped, most urgent first, and capped at five', () => {
  const { data, text } = board();
  const kinds = data.board.reminders.map((item) => item.kind);
  assert.deepEqual(kinds, ['waiting', 'uncommitted', 'unpushed', 'stale']);
  for (const item of data.board.reminders) assert.match(item.text, / → /u, `action-shaped: ${item.text}`);
  assert.match(text, /- ⏳ .*Search page lane.* → /u);
  assert.match(text, /- 💾 커밋 안 된 변경 3개 \(repo\) → /u);
  assert.match(text, /- 🕰️ 10일째 멈춘 계획: CSV export → 이어 할지, 접을지 정하기/u);
  assert.ok(data.board.reminders.length <= 5);
});

test('the board never shows a session id, a commit hash, a raw status code or an internal path', () => {
  const { text } = board();
  assert.ok(!text.includes(WAITER) && !text.includes(WAITER.slice(0, 8)), 'no session id');
  assert.ok(!text.includes(COMMIT.slice(0, 7)), 'no commit hash');
  for (const code of ['waiting-on-user', 'idle', 'ended', 'resume-frame', 'start-plan', 'none']) {
    assert.ok(!new RegExp(`\\b${code}\\b`, 'u').test(text), `no raw code ${code}`);
  }
  assert.ok(!/plans\/[^\s`]+\.md/u.test(text.replace(/`[^`]*`/gu, '')), 'a plan path appears only inside the text to type');
  assert.ok(!text.includes('.litmuse'), 'no state path');
});

test('empty sections print one plain line', () => {
  const { text, data } = board({ plans: false, waiting: false, dirty: 0, unpushed: 0 });
  for (const lineText of ['마일스톤이 없어요', '최근 끝낸 일이 없어요', '남은 일이 없어요', '잊을 게 없어요']) {
    assert.match(text, new RegExp(lineText, 'u'), lineText);
  }
  assert.equal(data.board.glance.total, 0);
  assert.match(text, /전체 진행 {2}기록된 일이 없어요/u);
  const fx = fixture({ plans: false, waiting: false, dirty: 0, unpushed: 0 });
  const en = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'en', record: false }).board.text;
  for (const lineText of ['No milestones in this window', 'Nothing finished lately', 'Nothing left', 'Nothing to remember']) assert.match(en, new RegExp(lineText, 'u'));
});

test('the board stays near forty lines even when every list overflows', () => {
  const fx = fixture();
  for (let index = 0; index < 8; index += 1) {
    writeFileSync(join(fx.repo, 'plans', `m${index}.md`), `# Milestone ${index}\n${Array.from({ length: 9 }, (_, i) => `- [${i < 4 ? 'x' : ' '}] step ${index}.${i}`).join('\n')}\n`);
    writeFileSync(join(fx.repo, 'plans', `old${index}.md`), `# Old ${index}\n- [ ] forgotten ${index}\n`);
    touch(join(fx.repo, 'plans', `old${index}.md`), (8 + index) * 24 * 60);
  }
  const data = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'ko', record: false });
  const lines = data.board.text.trimEnd().split('\n');
  assert.ok(lines.length <= 43, `${lines.length} lines`);
  assert.equal(data.board.reminders.length, 5);
  assert.match(data.board.text, /…외 \d+개/u);
});

test('do this now keeps the next-step priority and only changes the words', () => {
  // One open local plan and nothing else: the single-plan step, which `go` runs.
  const fx = fixture({ plans: false, waiting: false });
  writeFileSync(join(fx.repo, 'plans', 'only.md'), '# Only plan\n- [ ] 1. First thing\n');
  const data = collectRewind({ cwd: fx.repo, env: fx.env, now: NOW, exec: fx.exec, lang: 'ko', record: false });
  assert.equal(data.next.kind, 'start-plan');
  assert.equal(data.board.now.type, 'go');
  assert.match(data.board.text, /## 🎯 지금 할 일\n\*\*Only plan 시작하기\*\* — .+\n👉 입력: `go`/u);
  // Another session waits on the user: nothing runs on go; answer it instead.
  const { data: waiting } = board();
  assert.equal(waiting.next.kind, 'none');
  assert.equal(waiting.board.now.type, null);
  assert.match(waiting.board.text, /\*\*.*Search page lane.*\*\*/u);
  assert.doesNotMatch(waiting.board.text, /👉 입력: `go`/u, 'go is offered only for a step go runs');
});

test('the CLI prints the board by default and the detail list only on request', () => {
  const fx = fixture();
  const run = (args) => {
    const out = [];
    const sink = { write: (chunk) => out.push(chunk), columns: 100 };
    const code = runRewindCli(args, fx.repo, { env: fx.env, stdout: sink, stderr: sink, exec: fx.exec, now: NOW });
    return { code, text: out.join('') };
  };
  const plain = run(['--lang', 'ko']);
  assert.equal(plain.code, 0);
  assert.match(plain.text, /^## 🎯 지금 할 일/u);
  assert.doesNotMatch(plain.text, /RECOMMENDED NEXT STEP/u, 'no detail list by default');
  const detail = run(['--lang', 'ko', '--detail']);
  assert.match(detail.text, /^## 🎯 지금 할 일/u);
  assert.match(detail.text, /RECOMMENDED NEXT STEP/u, 'the detail list sits under the board');
  assert.ok(detail.text.indexOf('## 🔔') < detail.text.indexOf('RECOMMENDED NEXT STEP'));
  const json = JSON.parse(run(['--json', '--lang', 'en']).text);
  assert.equal(json.board.lang, 'en');
  assert.equal(typeof json.board.text, 'string');
  assert.equal(run(['--lang', 'fr']).code, 64, 'an unknown language is refused');
});

test('renderBoard is pure: the same fields give the same text', () => {
  const { data } = board();
  assert.equal(renderBoard(data.board), data.board.text);
});
