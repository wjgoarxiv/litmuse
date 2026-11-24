import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { cardsFor, createCards, wrap } from '../lib/install-cards.mjs';
import { install } from '../lib/install.mjs';
import { uninstall } from '../lib/uninstall.mjs';
import { readAgentFileSetting } from '../lib/agent-file.mjs';
import { expectedApprovals } from '../lib/approvals.mjs';
import { displayWidth } from '../plugin/lib/rewind/gauge.mjs';
import { FAKE_MUSE, ROOT, collect, museCalls, sandbox, setMuseState } from './helpers.mjs';

const TERM = { TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: 'en_US.UTF-8' };
const CARD = { tag: 'LIT 1/2', title: 'Approvals', note: 'Approves them; No leaves them off.', yes: 'approve them', no: 'not now' };
const KEY = { left: '\x1b[D', right: '\x1b[C', tab: '\t', enter: '\r', esc: '\x1b', ctrlC: '\x03', ctrlD: '\x04', ctrlZ: '\x1a' };
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');

// A window whose keyboard and screen are both in this process.
function window_({ columns = 90, rows = 40, env = TERM, clock } = {}) {
  const stdin = Object.assign(new PassThrough(), { isTTY: true, rawModes: [], setRawMode(on) { this.rawModes.push(on); } });
  const stdout = Object.assign(new EventEmitter(), { isTTY: true, columns, rows, wrote: [], write(s) { this.wrote.push(s); return true; } });
  const proc = Object.assign(new EventEmitter(), { pid: 77, platform: 'linux', signals: [], kill(...a) { this.signals.push(a); } });
  const cards = createCards({ env, stdin, stdout, proc, settleMs: 1, ...(clock ? { now: clock } : {}) });
  return {
    stdin, stdout, proc, cards,
    screen: () => strip(stdout.wrote.join('')),
    raw: () => stdout.wrote.join(''),
    lastCard: () => strip(stdout.wrote.filter((s) => s.includes('Ctrl+C')).at(-1) ?? '').split('\n').filter(Boolean),
  };
}

async function press(w, keys, opts = {}) {
  const asked = w.cards.ask('', { card: CARD, ...opts }).then((answer) => ({ answer }), (error) => ({ error }));
  await wait(15);
  for (const k of keys) {
    if (typeof k === 'function') k();
    else w.stdin.write(k);
    await wait(4);
  }
  return { ...(await Promise.race([asked, wait(700, { waiting: true })])), asked };
}

test('y and n answer at once; the arrows and Tab move the highlight; Enter takes it, starting at the default', async () => {
  for (const [keys, opts, answer] of [
    [['y'], {}, true], [['N'], { defaultYes: true }, false], [[KEY.enter], {}, false], [[KEY.enter], { defaultYes: true }, true],
    [[KEY.left, KEY.enter], {}, true], [[KEY.right, KEY.enter], {}, true], [[KEY.tab, KEY.tab, KEY.enter], {}, false], [['q', ' ', KEY.enter], {}, false],
  ]) {
    const w = window_();
    assert.equal((await press(w, keys, opts)).answer, answer, JSON.stringify(keys));
    assert.deepEqual(w.stdin.rawModes, [true, false]);
    assert.equal(w.stdin.isPaused(), true);
    assert.match(w.raw(), /\x1b\[\?25l[^]*\x1b\[\?25h/);
    assert.match(w.screen().split('\n').at(-2), answer ? /^ ✓ Approvals +approve them$/ : /^ ✓ Approvals +not now$/);
  }
});

test('the card shows its step, title, one sentence, the marked default and the keys', async () => {
  const w = window_();
  await press(w, ['x', KEY.left, KEY.enter]);
  const card = w.lastCard().join('\n');
  for (const part of ['LIT 1/2', 'Approvals [y/N]', CARD.note, '❯ Yes', 'No (default)', 'y / n answer', '← → switch', 'Enter = Yes', 'Ctrl+C stop']) assert.ok(card.includes(part), part);
});

test('Esc and keys typed before the card is drawn answer nothing', async () => {
  const w = window_();
  w.stdin.write('y\r');
  const { waiting, asked } = await press(w, [KEY.esc]);
  assert.equal(waiting, true);
  await wait(600);
  w.stdin.write('n');
  assert.equal((await asked).answer, false);
});

test('the Enter typed after a letter answer is not taken by the next card, and a later one is', async () => {
  let t = 1000;
  const w = window_({ clock: () => t });
  assert.equal((await press(w, ['y'])).answer, true);
  t += 200;
  const next = await press(w, [KEY.enter], { defaultYes: true });
  assert.equal(next.waiting, true);
  t += 300;
  w.stdin.write(KEY.enter);
  assert.equal((await next.asked).answer, true);
});

test('Ctrl+C, Ctrl+D and a closed terminal stop with the plain prompt\'s words, and the terminal is given back', async () => {
  for (const [key, words] of [[KEY.ctrlC, 'Aborted with Ctrl+C'], [KEY.ctrlD, 'Aborted with Ctrl+D']]) {
    const w = window_();
    const { error } = await press(w, [key]);
    assert.equal(error.message, words);
    assert.deepEqual(w.stdin.rawModes, [true, false]);
    assert.match(w.screen(), /✗ Approvals +stopped/);
    for (const name of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP']) assert.equal(w.proc.listenerCount(name), 0, name);
    assert.equal(w.stdin.listenerCount('keypress'), 0);
  }
  const w = window_();
  const { error } = await press(w, [() => w.stdin.end()]);
  assert.match(error.message, /terminal closed/);
});

test('a signal gives the terminal back and is passed on; Ctrl+Z suspends and SIGCONT draws the card again', async () => {
  const w = window_();
  await press(w, [() => w.proc.emit('SIGTERM')]);
  assert.deepEqual(w.proc.signals, [[77, 'SIGTERM']]);
  assert.deepEqual(w.stdin.rawModes, [true, false]);

  const z = window_();
  const drawn = [];
  const { answer } = await press(z, [KEY.ctrlZ, () => drawn.push(z.stdout.wrote.length), () => z.proc.emit('SIGCONT'), () => drawn.push(z.stdout.wrote.length), 'y']);
  assert.deepEqual(z.proc.signals, [[0, 'SIGTSTP']]);
  assert.ok(drawn[1] > drawn[0]);
  assert.equal(answer, true);
  assert.deepEqual(z.stdin.rawModes, [true, false, true, false]);
});

test('every card and panel row fits its window and keeps the sentence, both buttons and the way out', async () => {
  const long = { ...CARD, note: 'Approves the 21 LitMuse hooks and agents listed above in Muse now; No leaves them off and prints the commands to approve them later.' };
  for (const columns of [40, 60, 80, 120]) {
    for (const rows of [12, 16, 24, 40]) {
      const w = window_({ columns, rows });
      await press(w, ['y'], { card: long });
      const card = w.lastCard();
      assert.ok(card.length < rows, `${columns}x${rows}: ${card.length} rows`);
      for (const line of card) assert.ok(displayWidth(line) < columns, `${columns}x${rows}: ${line}`);
      const words = card.join(' ').replace(/[│╭╮╰╯─]/g, ' ').replace(/ +/g, ' ');
      for (const part of [long.note, 'Yes', 'No', 'Ctrl+C']) assert.ok(words.includes(part), `${columns}x${rows}: ${part}`);
    }
    const w = window_({ columns });
    const path = `/home/someone/${'folder/'.repeat(20)}receipt.json`;
    w.cards.panel({ title: 'LitMuse is ready', sections: [{ head: 'WRITTEN', rows: [{ label: 'receipt', value: path }, { mark: 'warn', value: '한글 경로도 들어갑니다 '.repeat(6) }] }] });
    for (const line of w.screen().split('\n')) assert.ok(displayWidth(line) < columns, line);
    assert.ok(w.screen().replace(/[^!-~]/g, '').includes(path), 'the path is whole');
  }
});

test('a resize while the card is open draws it for the new window', async () => {
  const w = window_({ columns: 100 });
  await press(w, [() => { w.stdout.columns = 50; w.stdout.emit('resize'); }, 'y']);
  for (const line of w.lastCard()) assert.ok(displayWidth(line) < 50, line);
});

test('colour follows the terminal, and a locale without UTF-8 gets ASCII', async () => {
  const shown = async (env) => {
    const w = window_({ env });
    await press(w, [KEY.left, 'y']);
    return w.raw();
  };
  assert.match(await shown(TERM), /\x1b\[[0-9;]*38;2;255;45;149m/);
  const c256 = await shown({ ...TERM, COLORTERM: '' });
  assert.match(c256, /38;5;/);
  assert.doesNotMatch(c256, /38;2;/);
  const c16 = await shown({ ...TERM, COLORTERM: '', TERM: 'xterm' });
  assert.match(c16, /\x1b\[95m/);
  assert.doesNotMatch(c16, /[34]8;[25];/);
  const none = await shown({ ...TERM, NO_COLOR: '1' });
  assert.doesNotMatch(none, /\x1b\[[0-9;]*m/);
  assert.match(none, /╭─\[LIT 1\/2\][^]*╔/);
  const ascii = await shown({ ...TERM, LANG: 'C', NO_COLOR: '1' });
  assert.doesNotMatch(ascii, /[^\x00-\x7f]/);
  assert.match(ascii, /> Yes/);
});

test('cards need a person at a terminal with room; everything else keeps the plain lines', () => {
  const w = window_();
  const on = (over = {}) => cardsFor({ env: TERM, flags: {}, stdin: w.stdin, stdout: w.stdout, ...over });
  assert.ok(on());
  assert.ok(on({ env: { ...TERM, NO_COLOR: '1' } }));
  for (const [name, over] of Object.entries({
    yes: { flags: { yes: true } }, dryRun: { flags: { dryRun: true } }, ci: { env: { ...TERM, CI: '1' } }, dumb: { env: { ...TERM, TERM: 'dumb' } },
    preset: { env: { ...TERM, LITMUSE_AGENT_FILE: 'on' } }, stdinPipe: { stdin: new PassThrough() }, stdoutPipe: { stdout: new PassThrough() },
    narrow: { stdout: { ...w.stdout, columns: 39 } }, short: { stdout: { ...w.stdout, rows: 11 } }, noRaw: { stdin: { isTTY: true } },
  })) assert.equal(on(over), null, name);
});

test('wrap keeps the indent, counts wide characters and drops nothing', () => {
  assert.deepEqual(wrap('  one two three', 9), ['  one two', '  three']);
  assert.deepEqual(wrap('가나다라', 4), ['가나', '다라']);
  assert.equal(wrap('/a/very/long/path', 5).join(''), '/a/very/long/path');
});

// Answers each card as it is drawn.
function installer(answers, size) {
  const w = window_(size);
  const asked = [];
  const cards = { ...w.cards, ask: async (q, o) => { asked.push({ q, ...o }); return answers.shift(); } };
  return { w, cards, asked };
}

test('a card install asks the same two questions in the same order and stores the same answers', async () => {
  const total = expectedApprovals().length;
  const { env } = sandbox();
  const { w, cards, asked } = installer([false, false]);
  const printed = collect();
  assert.equal(await install({ env, flags: {}, interactive: true, ask: cards.ask, print: printed.print, cards }), 0);
  assert.deepEqual(asked.map((a) => [a.card.tag, a.card.title, a.defaultYes ?? false]), [['LIT 1/2', 'Approvals', false], ['LIT 2/2', 'Rules file', true]]);
  assert.match(asked[0].card.note, new RegExp(`the ${total} LitMuse hooks and agents`));
  assert.match(asked[1].card.note, /Your own text stays as it is/);
  assert.equal(readAgentFileSetting(env).stored, 'off');
  assert.equal(museCalls(env).filter((c) => c.includes('approve')).length, 0);
  const screen = w.screen();
  for (const a of expectedApprovals()) {
    assert.ok(screen.includes(a.id), a.id);
    assert.ok(screen.split('\n').includes(`    muse plugins approve ${a.id}`), `${a.id} command on one line`);
  }
  assert.match(screen, /Muse runs plugin hooks and agents only after you approve them/);
  assert.match(screen, new RegExp(`! installed, approval needed for ${total} capabilities`));
  assert.equal(printed.text(), '');
});

test('Yes approves exactly what was listed, and a reinstall asks only what is left', async () => {
  const { env } = sandbox();
  const first = installer([true, true]);
  await install({ env, flags: {}, interactive: true, ask: first.cards.ask, print: () => {}, cards: first.cards });
  assert.match(first.w.screen(), /✓ Approved +\d+ LitMuse capabilities/);
  assert.match(first.w.screen(), /LitMuse [\d.]+ is ready/);
  assert.match(first.w.screen(), /✓ Rules file +created\s/);

  // An update re-arms approvals; the block is already there, so only one question is left.
  const again = installer([true]);
  await install({ env, flags: {}, interactive: true, ask: again.cards.ask, print: () => {}, cards: again.cards });
  assert.deepEqual(again.asked.map((a) => [a.card.tag, a.card.title]), [['LIT 1/1', 'Approvals']]);
});

test('an approval Muse refuses is shown as failed, and the panel says what is still waiting', async () => {
  const { env, home } = sandbox();
  const bin = join(home, 'muse-refusing.mjs');
  writeFileSync(bin, `#!/usr/bin/env node
if (process.argv[3] === 'approve' && process.argv[4].endsWith(':stop')) { console.error('refused for the test'); process.exit(1); }
await import(${JSON.stringify(pathToFileURL(FAKE_MUSE).href)});
`, { mode: 0o755 });
  const { w, cards } = installer([true, false]);
  await install({ env: { ...env, LITMUSE_MUSE_BIN: bin }, flags: {}, interactive: true, ask: cards.ask, print: () => {}, cards });
  assert.match(w.screen(), /✗ Approve +litmuse:hook:stop: refused for the test/);
  assert.match(w.screen(), /1 are still waiting:\n +litmuse:hook:stop/);
  assert.match(w.screen(), /! installed, approval needed for 1 capabilities/);
});

test('with one question left out, the other counts 1/1', async () => {
  const only = sandbox();
  const one = installer([false]);
  await install({ env: only.env, flags: { noAgentFile: true }, interactive: true, ask: one.cards.ask, print: () => {}, cards: one.cards });
  assert.deepEqual(one.asked.map((a) => a.card.tag), ['LIT 1/1']);
});

test('a refused install closes with a failure panel, and its remedy stays copyable', async () => {
  const { env, home } = sandbox();
  const { w, cards } = installer([]);
  const printed = collect();
  assert.equal(await install({ env: { ...env, LITMUSE_MUSE_BIN: join(home, 'no-muse'), PATH: home }, flags: {}, interactive: true, print: printed.print, cards }), 1);
  assert.match(w.screen(), /install stopped/);
  assert.match(w.screen(), /✗ muse was not found on PATH/);

  setMuseState(env, { installed: true, source: join(ROOT, 'plugin') });
  const other = installer([]);
  const notes = collect();
  assert.equal(await install({ env, flags: {}, interactive: true, print: notes.print, cards: other.cards }), 1);
  assert.match(other.w.screen(), /✗ Muse already has LitMuse/);
  assert.match(notes.text(), /muse plugins remove litmuse[^]*No files written\./);
});

test('uninstall shows its plan and its result as panels and asks nothing, as before', async () => {
  const { env } = sandbox();
  await install({ env, flags: { yes: true, approve: true }, print: () => {} });
  const { w, cards, asked } = installer([]);
  assert.equal(await uninstall({ env, flags: {}, interactive: true, print: () => assert.fail('plain line'), cards }), 0);
  assert.equal(asked.length, 0);
  for (const part of [/LitMuse uninstall/, /also clears its approvals/, /✓ Muse plugin +removed from Muse/, /✓ Bundle +removed/, /Rules file +removed/, /stay in each project/]) assert.match(w.screen().replace(/ +│\n +│ +/g, ' '), part);
});

const noTmux = process.platform === 'win32' || spawnSync('tmux', ['-V']).status !== 0;

test('the real installer takes keys in a real terminal, then ends', { skip: noTmux && 'tmux is not installed', timeout: 90_000 }, async () => {
  const { env, home } = sandbox();
  const socket = `litmuse-cards-${process.pid}`;
  const tmux = (...args) => spawnSync('tmux', ['-L', socket, ...args], { encoding: 'utf8' }).stdout ?? '';
  const q = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
  const vars = Object.entries({ ...env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' }).map(([k, v]) => `${k}=${q(v)}`).join(' ');
  const script = join(home, 'go.sh');
  const done = join(home, 'exit-code');
  writeFileSync(script, `cd ${q(home)}\nenv -i ${vars} ${q(process.execPath)} ${q(join(ROOT, 'bin', 'litmuse.mjs'))} install\necho $? > ${q(done)}\nsleep 60\n`);
  const until = async (check, what) => {
    for (let i = 0; i < 200; i += 1) {
      if (check()) return;
      await wait(150);
    }
    assert.fail(`${what}\n${tmux('capture-pane', '-p')}`);
  };
  try {
    tmux('-f', '/dev/null', 'new-session', '-d', '-x', '90', '-y', '30', `sh ${q(script)}`);
    await until(() => /LIT 1\/2[^]*Enter = No/.test(tmux('capture-pane', '-p')), 'the first card');
    tmux('send-keys', 'Right');
    await until(() => /Enter = Yes/.test(tmux('capture-pane', '-p')), 'the highlight');
    tmux('send-keys', 'n');
    await until(() => /LIT 2\/2/.test(tmux('capture-pane', '-p')), 'the second card');
    await wait(500);
    tmux('send-keys', 'n');
    await until(() => existsSync(done) && readFileSync(done, 'utf8') !== '', 'the end');
    assert.equal(readFileSync(done, 'utf8').trim(), '0');
    assert.equal(readAgentFileSetting(env).stored, 'off');
  } finally {
    tmux('kill-server');
  }
});
