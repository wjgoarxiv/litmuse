import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_LINE, COMMANDS, PILL, QUESTIONS, agentGuide } from '../lib/agent-guide.mjs';
import { FLAGS, parse } from '../lib/flags.mjs';
import { FONT_FILES } from '../lib/guard.mjs';
import { install } from '../lib/install.mjs';
import { paths } from '../lib/paths.mjs';
import { ROOT, collect, museCalls, sandbox, walk } from './helpers.mjs';

const BIN = join(ROOT, 'bin', 'litmuse.mjs');
const run = (env, ...args) => spawnSync(process.execPath, [BIN, ...args], { env, cwd: env.HOME, encoding: 'utf8', input: '' });
const READMES = ['README.md', 'README_ko-KR.md'];
// The fenced prompt a person pastes into a coding agent.
const promptOf = (file) => readFileSync(join(ROOT, file), 'utf8').match(/```text\n[^`]*@litfamily\/litmuse@latest[^]*?\n```/)?.[0] ?? '';
const flagsIn = (text) => [...new Set([...text.matchAll(/(?<=[\s"`(])--[a-z][a-z-]*/g)].map((m) => m[0]))];

test('install --agent and --agent print one text, write nothing, start nothing and need no host', () => {
  const { env, home } = sandbox();
  const bare = { HOME: home, PATH: home };
  const guide = run(bare, 'install', '--agent');
  assert.equal(guide.status, 0);
  assert.equal(guide.stdout, agentGuide());
  assert.doesNotMatch(guide.stdout, /\u001b/);
  for (const args of [['--agent'], ['update', '--agent'], ['install', '--yes', '--approve', '--round', '--agent'], ['install', '--agent', '--bogus'], ['install', '--scope', '--agent'], ['--version', '--agent']]) {
    for (const extra of [{}, { NO_COLOR: '1' }, { CI: '1' }, { TERM: 'dumb' }, { COLORTERM: 'truecolor', TERM: 'xterm-256color', LITMUSE_GLYPHS: 'square' }]) {
      const r = run({ ...bare, ...extra }, ...args);
      assert.deepEqual([r.status, r.stdout, r.stderr], [0, guide.stdout, ''], args.join(' '));
    }
  }
  run(env, 'install', '--agent');
  assert.deepEqual(walk(home), []);
  assert.deepEqual(museCalls(env), []);
});

test('the guide holds every step, in order, and nothing it must not say', () => {
  const text = agentGuide();
  const order = ['LitMuse install guide for coding agents', 'follow these steps. They are written for your user to read too.', COMMANDS.preview, 'Show your user what it would change.',
    'Keep every default?', ...QUESTIONS.map((q) => q.ask), FONT_FILES.font, FONT_FILES.license, COMMANDS.card, "Wait for your user's yes. Use only this package; add no other source, and do not approve hooks, trust or sign-in for your user.",
    COMMANDS.install, COMMANDS.update, 'ROUND_ENDS:', COMMANDS.doctor, 'LitMuse doctor: PASS', 'approvals needed', 'If a step fails, show your user the lines and stop.',
    `Show your user this and ask if both ends are round: ${PILL}`, COMMANDS.round, COMMANDS.square, 'Terminal.app has no fallback setting', COMMANDS.auto, 'muse plugins approve', 'quit Muse if it is open and start it again', 'sign in to Muse'];
  let at = -1;
  for (const part of order) {
    const next = text.indexOf(part, at + 1);
    assert.ok(next > at, part);
    at = next;
  }
  assert.equal(PILL, ' LIT ');
  assert.doesNotMatch(text, /--approve|star |do not ask|macOS finds/i);
  for (const command of [COMMANDS.install, COMMANDS.update]) assert.match(command, /@latest (install|update) --yes --round$/);
});

// The drift test: what the guide and both prompts name is what the parser takes and the installer asks.
test('guide, parser flags, questions and both README prompts agree', async () => {
  for (const command of Object.values(COMMANDS)) {
    const words = command.split(' ').slice(3);
    const { problem } = parse(words);
    assert.equal(problem, null, command);
  }
  const { env } = sandbox();
  const asked = [];
  await install({ env, flags: {}, interactive: true, print: () => {}, ask: async (_q, { card }) => { asked.push(card.title); return false; } });
  assert.deepEqual(asked.sort(), QUESTIONS.filter((q) => q.card).map((q) => q.card).sort(), 'every question the installer asks is in the guide');

  const texts = { guide: agentGuide(), ...Object.fromEntries(READMES.map((f) => [f, promptOf(f)])) };
  for (const [name, text] of Object.entries(texts)) {
    for (const flag of flagsIn(text)) assert.ok(FLAGS.includes(flag), `${name}: ${flag}`);
    for (const command of Object.values(COMMANDS)) assert.ok(text.includes(command), `${name}: ${command}`);
    for (const q of QUESTIONS) if (q.flag) assert.ok(text.includes(q.flag), `${name}: ${q.flag}`);
    for (const part of [FONT_FILES.font, '~/Library/Fonts', '.local/share}/fonts', PILL, 'muse plugins approve', 'ROUND_ENDS:', 'LitMuse doctor: PASS', 'approvals needed', 'Terminal.app']) assert.ok(text.includes(part), `${name}: ${part}`);
    assert.doesNotMatch(text, /--approve\b/, `${name}: approvals stay the user's`);
    assert.equal((text.match(/--yes --round/g) ?? []).length, 2, `${name}: --round in the install and update lines`);
  }
});

// --no-agent-file lasts one run, so a user who said no needs it on every command that can write the block.
test('a declined rules-file block stays out through every command of the guide', async () => {
  const { env } = sandbox();
  const declined = [COMMANDS.install, COMMANDS.update, COMMANDS.round, COMMANDS.square, COMMANDS.auto];
  for (const command of declined) {
    const { command: verb, flags, problem } = parse([...command.split(' ').slice(3), '--no-agent-file']);
    assert.deepEqual([problem, ['install', 'update'].includes(verb)], [null, true], command);
    await install({ env, flags: { ...flags, round: false }, interactive: false, print: () => {}, tty: false });
    assert.equal(existsSync(paths(env).museRules), false, command);
  }
  const { env: without } = sandbox();
  await install({ env: without, flags: parse(['install', '--yes', '--glyphs', 'round']).flags, interactive: false, print: () => {}, tty: false });
  assert.ok(existsSync(paths(without).museRules), 'one command without the flag adds the block');

  const everywhere = { 'README_ko-KR.md': '아래의 모든 install, update 명령에 --no-agent-file 추가' };
  for (const [name, text] of [['guide', agentGuide()], ...READMES.map((f) => [f, promptOf(f)])]) {
    const said = everywhere[name] ?? 'add --no-agent-file to every install and update command below';
    const at = text.indexOf(said);
    assert.ok(at > 0, `${name}: ${said}`);
    for (const command of declined) assert.ok(text.indexOf(command, at) > at, `${name}: ${command} comes after the instruction`);
  }
});

test('--help names the guide; without a person one line points to it; a person and --json get none', () => {
  const { env } = sandbox();
  assert.match(run(env, '--help').stdout, /^Are you an agent\? Run npx --yes @litfamily\/litmuse@latest install --agent$/m);
  for (const flag of ['--agent', '--round', '--glyphs']) assert.ok(run(env, '--help').stdout.includes(flag), flag);
  for (const args of [['install'], ['install', '--dry-run'], ['install', '--yes'], ['update', '--dry-run']]) {
    const lines = run(env, ...args).stdout.split('\n');
    assert.deepEqual(lines.slice(0, 2), ['LIT · muse code', AGENT_LINE], args.join(' '));
    assert.equal(lines.filter((l) => l.startsWith('Agent?')).length, 1);
  }
  assert.ok(!run(env, 'install', '--json').stdout.includes('Agent?'));
});

test('an unknown flag, a missing value and a wrong value are refused before anything runs', () => {
  const { env, home } = sandbox();
  for (const args of [['install', '--bogus'], ['install', '--yes', '--aprove'], ['--bogus'], ['doctor', '-x'], ['install', '--glyphs'], ['install', '--glyphs', 'oval'], ['install', '--glyphs', '--yes'], ['install', '--scope', 'world'], ['doctor', '--round'], ['extensions', 'list', '--nope']]) {
    const r = run(env, ...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stdout, /Unknown option|needs a value|takes |work with/, args.join(' '));
  }
  assert.deepEqual(walk(home), []);
  assert.equal(run(env, 'rewind', '--here', '--max', '2').status, 0, 'rewind reads its own flags');
});

test('a preview in a shell without a person offers no approval flag', async () => {
  const { env } = sandbox();
  const out = collect();
  await install({ env, flags: {}, interactive: false, print: out.print });
  assert.doesNotMatch(out.text(), /--approve\b/);
});

test('--yes never asks, at a terminal too, and grants no approval', async () => {
  const { env } = sandbox();
  const out = collect();
  const code = await install({ env, flags: { yes: true }, interactive: true, print: out.print, ask: () => assert.fail('asked') });
  assert.equal(code, 0);
  assert.equal(museCalls(env).filter((c) => c[1] === 'approve').length, 0);
  assert.equal((out.text().match(/^ {2}muse plugins approve litmuse:/gm) ?? []).length, 21);
  assert.doesNotMatch(out.text(), /--approve\b/);
  assert.match(out.text(), /^Restart: quit Muse if it is open, then start it again/m);
  assert.match(out.lines.at(-1), /^ROUND_ENDS: /);
});
