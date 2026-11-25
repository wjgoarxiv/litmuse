import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cardFacts, gitBranch } from '../lib/card-facts.mjs';
import { cardText, watchView } from '../lib/card-view.mjs';
import { STAGES, cardLines, cardState, composeCard, say } from '../lib/framed-card.mjs';
import { normalizeStage } from '../plugin/hooks/lib/workflow-stack.mjs';
import { ROOT } from './helpers.mjs';

const NOW = Date.UTC(2026, 10, 25);
const at = new Date(NOW).toISOString();
const CAPS = /[]/u;
const frame = (over = {}) => ({ skill: 'start-work', family: 'main', stage: 'work', role: 'spine', status: 'active', n: 1, total: 3, at, ...over });
const thread = (over = {}) => ({ session: 's', skill: 'start-work', stage: 'work', status: 'active', gauge: '[▉░░] 1/3', ...over });
const lane = (type, status = 'running', elapsedMs = 5000) => ({ id: type, type: `litmuse/${type}`, status, elapsedMs });
const card = (over = {}) => ({
  active: true, route: 'start-work', session: 's', activeMs: 192_000, updated: NOW, now: NOW, noColor: false,
  plan: { file: 'plans/todo.md', total: 3, done: 1, next: { row: 2, text: 'Add the flag' }, mtimeMs: NOW },
  lanes: [], goal: null, threads: { rows: [thread()], omitted: 0 }, ...over,
});
const facts = (over = {}) => ({ frames: [frame()], skills: ['start-work', 'lit-code'], tool: { name: 'bash', ms: 12_000, ok: true }, ctx: { used: 120_000, percent: 12 }, branch: 'main', ...over });
const goal = { slug: 'g', met: 1, total: 3, objective: 'Ship it', open: [{ id: 'C2', text: 'keeps the date line' }], mtimeMs: NOW };
const STATES = {
  working: [card(), facts()],
  loop: [card({ route: 'lit-loop', plan: null, goal, threads: { rows: [thread({ skill: 'lit-loop', stage: 'RED' })], omitted: 0 } }), facts({ frames: [frame({ skill: 'lit-loop', family: 'loop', stage: 'RED', unit: 'criterion' })] })],
  lanes: [card({ lanes: [lane('lit-executor'), lane('lit-verifier', 'done'), lane('lit-researcher')], threads: { rows: [thread(), thread({ session: 's2', skill: 'review-work', stage: 'review', status: 'running', pane: 'w2:p3', sibling: true, gauge: '[▉▉░░░] 2/5' })], omitted: 2 } }), facts()],
  turn: [card({ threads: { rows: [thread({ status: 'paused' })], omitted: 0 } }), facts({ frames: [frame({ status: 'paused', stage: 'plan' })] })],
  review: [card({ route: 'review-work' }), facts({ frames: [frame({ skill: 'review-work', stage: 'review', verdicts: { goal: 'pass', quality: 'fail', security: 'running' } })] })],
  done: [card({ plan: { file: 'plans/todo.md', total: 3, done: 3, next: null, mtimeMs: NOW } }), facts({ frames: [frame({ stage: 'done', n: 3 })] })],
  rewind: [card({ route: 'lit-adhd', plan: null, threads: { rows: [], omitted: 0 } }), facts({ frames: [], skills: ['lit-adhd'] })],
  warning: [card(), facts({ ctx: { used: 900_000, percent: 90 } })],
  error: [card({ lanes: [lane('lit-executor', 'failed')] }), facts()],
  idle: [card({ active: false, route: null, idle: true, activeMs: null }), facts({ skills: [], tool: null })],
  ready: [card({ active: false, route: null, idle: false, activeMs: null, plan: null, session: null, threads: { rows: [], omitted: 0 } }), facts({ frames: [], skills: [], tool: null, ctx: null, branch: null })],
};
const compose = ([c, f], { width = 99, round = true, t = null, working = true } = {}) => {
  const view = composeCard(c, f, { width, round, working, version: '1.2.3' });
  return { ...view, rows: view.grid(t) };
};
const words = (rows) => rows.map((row) => row.map((cell) => cell?.ch ?? ' ').join(''));

test('every state names itself on the top edge', () => {
  const said = { working: 'WORK ●', loop: 'RED ●', lanes: 'WORK ●', turn: 'YOUR TURN ●', review: 'REVIEW 2/5 ●', done: 'DONE ✓', rewind: 'REWIND <<', warning: 'CONTEXT ●', error: 'LANE FAILED ✗', idle: 'idle', ready: 'READY ○' };
  for (const [name, state] of Object.entries(STATES)) {
    const top = words(compose(state).rows)[0];
    assert.ok(top.startsWith('╭─ ') && top.trimEnd().endsWith('─╮'), top);
    assert.ok(top.includes('🔥 LIT') && top.includes(said[name]), `${name}: ${top}`);
  }
  assert.equal(cardState(...STATES.working, false).id, 'rest');
  assert.match(words(compose(STATES.working, { working: false }).rows)[0], /WORK ○/u);
});

test('the full card: stage map, task, tool, lanes, skills, and the context on the bottom edge', () => {
  const text = words(compose(STATES.lanes).rows).join('\n');
  for (const part of [/interview ✓ ━━ plan ✓ ━━ .work. ━━ review · ── done ·/u, /└ task 1\/3 .* next ▸ 2\. Add the flag/u, /✓ bash · 0:12 ago/u, /●● 2 lanes 0:05/u, /┬ 2 lanes in parallel/u, /├─ ● lit-executor .*━{7} .* running 0:05/u, /└─ ✓ lit-verifier .* done 0:05/u, /● review-work · w2:p3 +review .*2\/5 running/u, /\+2 more/u, /skills .⚡ start-work. .· lit-code./u, /╰─ ctx ~12% .* ⎇ main · todo\.md ─+ active 3:12 · v1\.2\.3 ─╯/u]) assert.match(text, part);
  assert.doesNotMatch(text, /threads:|litmuse\//u, 'no prose labels, no plugin prefix');
  assert.match(words(compose(STATES.loop).rows).join('\n'), /PIN ✓ ━━ .RED. ━━ GREEN · .*\n.*└ criterion 1\/3 .* next ▸ C2 keeps the date line/u);
  assert.match(words(compose(STATES.review).rows).join('\n'), /scope ✓ {2}package ✗ {2}security ● {2}tests\+evidence · {2}surface ·/u);
  assert.match(words(compose(STATES.ready).rows).join('\n'), /no active route in this workspace · type lit and what you want/u);
  assert.match(words(compose(STATES.idle).rows).join('\n'), /back\? type lit adhd to catch up/u);
});

test('a part with no record is left out', () => {
  const none = [card({ plan: null, threads: { rows: [], omitted: 0 }, activeMs: null }), facts({ frames: [], skills: [], tool: null, ctx: null, branch: null })];
  const text = words(compose(none).rows).join('\n');
  assert.doesNotMatch(text, /ctx|⎇|skills|task|next|lane|active|ago|interview/u);
  assert.match(words(compose([card(), facts({ ctx: { used: 120_400, percent: null } })]).rows).at(-1), /ctx ~120k · ⎇ main/u, 'no window size: tokens, no gauge');
});

test('the context at 85% turns the card amber, and the gauge red', () => {
  assert.equal(cardState(card(), facts({ ctx: { used: 1, percent: 84 } }), true).id, 'working');
  assert.equal(cardState(card(), facts({ ctx: { used: 1, percent: 85 } }), true).id, 'warning');
  const red = (percent) => compose([card(), facts({ ctx: { used: 1, percent } })]).rows.at(-1).some((cell) => cell?.bg === '#ff5f6b' || cell?.fg === '#ff5f6b');
  assert.deepEqual([84, 85].map(red), [false, true]);
});

const HOSTILE = [
  '가나다 한글 계획 ✅ '.repeat(12), 'é'.repeat(60), '\u{1f468}‍\u{1f469}‍\u{1f467} family '.repeat(8), 'warn ⚠️ and \u{1f1f0}\u{1f1f7} flag', 'tab\there \u001b]0;title\u0007\u001b[31mred',
  '‮right to left‬', '​'.repeat(40), 'x'.repeat(300), '', '[▉░░] 9/9', ' private',
];

test('frame edges stay in column at every width, whatever the records say', () => {
  for (const text of HOSTILE) {
    const bad = [
      card({
        route: text || 'x', plan: { file: `plans/${text}.md`, total: 3, done: 1, next: { row: 2, text }, mtimeMs: NOW }, goal: { ...goal, open: [{ id: text, text }] },
        lanes: [lane(text), lane('b')], threads: { rows: [thread({ skill: text, stage: text }), thread({ session: text, sibling: true, pane: text })], omitted: 1 }, restartTo: text,
      }),
      facts({ frames: [frame({ skill: text })], skills: [text, text], tool: { name: text, ms: 1, ok: false }, branch: text }),
    ];
    for (let width = 63; width <= 120; width += 3) {
      for (const round of [true, false]) {
        for (const t of [null, 1.3]) {
          const { rows } = compose(bad, { width, round, t });
          rows.forEach((row, r) => {
            assert.equal(row.length, width, `${width} row ${r}`);
            assert.ok(row.every((cell) => !cell || !/\p{Cc}|\p{Cf}|\p{Cs}|\p{Regional_Indicator}|️/u.test(cell.ch)), 'no control or joining character');
            const [first, last] = [row[0].ch, row.at(-1).ch];
            assert.equal(first + last, r === 0 ? '╭╮' : r === rows.length - 1 ? '╰╯' : '││');
          });
        }
      }
    }
  }
});

test('a wide character is never split, and the printed row places its right edge by column', () => {
  for (let width = 63; width <= 120; width += 1) {
    const { rows } = compose([card({ plan: { file: 'plans/a.md', total: 3, done: 1, next: { row: 2, text: '한글 계획 '.repeat(20) }, mtimeMs: NOW } }), facts()], { width });
    for (const row of rows) {
      row.forEach((cell, x) => {
        if (cell?.ch === '') assert.ok(say(row[x - 1].ch).length === 2, 'a second half follows its first');
        else if (cell && say(cell.ch).length === 2) assert.equal(row[x + 1]?.ch, '');
      });
    }
    for (const line of cardLines(rows, width)) assert.match(line, new RegExp(`\\u001b\\[${width}G`, 'u'));
  }
});

test('round: every fill has both ends; square: none has; nothing else differs', () => {
  for (const [name, state] of Object.entries(STATES)) {
    for (const width of [79, 99]) {
      const [round, square] = [true, false].map((on) => compose(state, { width, round: on, t: name === 'idle' ? null : 2 }).rows);
      assert.equal(CAPS.test(words(square).join('')), false, name);
      assert.ok(CAPS.test(words(round).join('')), name);
      assert.deepEqual(words(round).map((row) => row.replace(/[]/gu, ' ')), words(square));
      for (const row of round) {
        row.forEach((cell, x) => {
          if (!cell?.bg || cell.bg === '#1a1030') return;
          let [l, r] = [x, x];
          while (row[l]?.bg) l -= 1;
          while (row[r]?.bg) r += 1;
          assert.equal(row[l]?.ch, '', `${name} ${width}`);
          assert.equal(row[r]?.ch, '', `${name} ${width}`);
        });
      }
      assert.doesNotMatch(words(round).join(''), /[▯░▒▓▉▌▐]|\[[^\]]*\]/u, 'one smooth gauge, no brackets');
    }
  }
});

test('motion changes colours and the scene only: every word keeps its cells', () => {
  for (const [name, state] of Object.entries(STATES)) {
    const still = compose(state);
    const held = still.rows.map((row) => row.map((cell) => (cell && !/^[~.+*\-▁-█]$/u.test(cell.ch) ? cell.ch : null)));
    for (let t = 0; t < 12; t += 0.375) {
      still.grid(t).forEach((row, r) => row.forEach((cell, x) => {
        if (held[r][x] !== null && held[r][x] !== ' ') assert.equal(cell?.ch, held[r][x], `${name} ${t}`);
      }));
    }
  }
});

test('no star or wave lands between the columns of a thread row', () => {
  const c = card({ plan: null, lanes: [lane('lit-executor', 'done'), lane('lit-verifier', 'done'), lane('x', 'done'), lane('y', 'done'), lane('z', 'done')] });
  for (let width = 79; width <= 119; width += 1) {
    for (const row of words(compose([c, facts({ skills: [] })], { width }).rows).filter((r) => /─ ✓ /u.test(r))) {
      assert.match(row, /─ ✓ \S+ +done 0:05/u, `${width}`);
    }
  }
});

test('the sun has room in every state, and never covers a word', () => {
  for (const [name, state] of Object.entries(STATES)) {
    for (const width of [79, 99, 119]) assert.match(words(compose(state, { width }).rows).join('\n'), /▆{18}/u, `${name} ${width}`);
  }
});

test('the stage lists are the ones the workflow stack records', () => {
  for (const [family, stages] of Object.entries(STAGES)) for (const stage of stages) assert.equal(normalizeStage(family, stage), stage);
});

const SESSION = '0193a1b2-c3d4-7abc-8def-0123456789ab';
function store() {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-facts-'));
  const cwd = join(home, 'work');
  const env = { HOME: home, XDG_DATA_HOME: join(home, 'data'), XDG_STATE_HOME: join(home, 'state') };
  const made = new Date(Number.parseInt('0193a1b2c3d4', 16)).toISOString().slice(0, 10).split('-');
  const log = join(env.XDG_DATA_HOME, 'muse', 'sessions', ...made, SESSION);
  const catalog = join(env.XDG_DATA_HOME, 'muse', 'model-catalog');
  for (const dir of [log, catalog, join(cwd, '.litmuse', 'ledger'), join(cwd, '.git')]) mkdirSync(dir, { recursive: true });
  const lines = (path, rows) => writeFileSync(path, rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n'));
  const call = (tokens, kind = 'run') => ({ payload_type: 'runtime.session', payload: { kind, event: { kind: 'model_completed', usage: { input_tokens: 5, cached_tokens: 900 }, estimated_prompt_tokens: tokens } } });
  return {
    cwd, env, call, catalog,
    log: (...rows) => lines(join(log, 'session.jsonl'), rows),
    ledger: (...rows) => lines(join(cwd, '.litmuse', 'ledger', `${SESSION}.jsonl`), rows),
    models: (rows) => writeFileSync(join(catalog, 'p.json'), JSON.stringify({ rows })),
    facts: (over = {}) => cardFacts({ cwd, env, now: NOW, card: card({ session: SESSION, ...over }) }),
  };
}

test('context comes from the host\'s own estimate and one agreed window, or stays a plain count, or is left out', () => {
  const s = store();
  assert.equal(s.facts().ctx, null, 'no log');
  s.log('not json', s.call(1000), s.call(250_000), { payload_type: 'x' });
  assert.deepEqual(s.facts().ctx, { used: 250_000, percent: null }, 'no catalog');
  copyFileSync(join(ROOT, 'test', 'fixtures', 'model-catalog.json'), join(s.catalog, 'p.json'));
  assert.deepEqual(s.facts().ctx, { used: 250_000, percent: 25 });
  s.models([{ visibility: 'visible', context_limit: 100 }, { visibility: 'visible', context_limit: 200 }]);
  assert.equal(s.facts().ctx.percent, null, 'models disagree');
  s.log(s.call(0));
  assert.equal(s.facts().ctx, null);
  assert.equal(cardFacts({ cwd: s.cwd, env: s.env, now: NOW, card: card({ session: '../../etc' }) }).ctx, null, 'not a session id');
});

test('the tool is the last one the ledger holds, for a quarter hour, and a link is not read', () => {
  const s = store();
  const entry = (over = {}) => ({ ts: new Date(NOW - 4000).toISOString(), event: 'PostToolUse', tool: 'bash', ok: true, ...over });
  assert.equal(s.facts().tool, null);
  s.ledger(entry({ tool: 'read_file' }), entry({ event: 'PostToolUseFailure', tool: 'edit_file', ok: false }), entry({ event: 'SubagentStop', tool: undefined }));
  assert.deepEqual(s.facts().tool, { name: 'edit_file', ms: 4000, ok: false });
  assert.equal(s.facts({ active: false }).tool, null);
  s.ledger(entry({ ts: new Date(NOW - 16 * 60_000).toISOString() }));
  assert.equal(s.facts().tool, null);
  if (process.platform !== 'win32') {
    const other = store();
    s.ledger(entry());
    symlinkSync(join(s.cwd, '.litmuse', 'ledger', `${SESSION}.jsonl`), join(other.cwd, '.litmuse', 'ledger', `${SESSION}.jsonl`));
    assert.equal(other.facts().tool, null);
  }
});

test('the branch is read from .git, a worktree file or a detached head', () => {
  const s = store();
  assert.equal(gitBranch(s.cwd), null);
  writeFileSync(join(s.cwd, '.git', 'HEAD'), 'ref: refs/heads/feat/one\n');
  mkdirSync(join(s.cwd, 'deep'));
  assert.equal(gitBranch(join(s.cwd, 'deep')), 'feat/one');
  writeFileSync(join(s.cwd, '.git', 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');
  assert.equal(gitBranch(s.cwd), '0123456');
  const tree = join(s.cwd, 'tree');
  mkdirSync(join(s.cwd, '.git', 'worktrees', 'tree'), { recursive: true });
  mkdirSync(tree);
  writeFileSync(join(tree, '.git'), 'gitdir: ../.git/worktrees/tree\n');
  writeFileSync(join(s.cwd, '.git', 'worktrees', 'tree', 'HEAD'), 'ref: refs/heads/side\n');
  assert.equal(gitBranch(tree), 'side');
});

test('the still and the watched card are the same frame, and the still is no wider than the window', () => {
  const s = store();
  const env = { ...s.env, COLORTERM: 'truecolor', TERM: 'xterm-256color', LITMUSE_GLYPHS: 'round' };
  const c = card({ session: SESSION });
  for (const columns of [64, 80, 100, 160]) {
    const stream = { isTTY: true, columns, rows: 60 };
    const still = cardText(c, { env, stream, cwd: s.cwd, version: '1.2.3', now: NOW }).split('\n');
    const frame4 = watchView(c, { env, stream, cwd: s.cwd, version: '1.2.3', now: NOW }).frame(4);
    assert.deepEqual(still.slice(-frame4.length), frame4);
    assert.match(frame4[0], new RegExp(`\\u001b\\[${Math.min(120, columns - 1)}G`, 'u'));
  }
});
