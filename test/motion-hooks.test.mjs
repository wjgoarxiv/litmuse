import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRoute, motionIntent } from '../plugin/hooks/lib/routes.mjs';
import { parseMotionCommand, exitCodeOf } from '../plugin/hooks/lib/motion.mjs';
import { DIGEST_EXTRAS } from '../plugin/hooks/lib/digest.mjs';
import { sessionPath } from '../plugin/hooks/lib/common.mjs';
import { ENGINE, MOTION_CLI, fakeCoverRun, bumpStillsRound, coverAnswers, writeAnswers, temp } from './motion-helpers.mjs';

const { lookCommand } = await import(join(ENGINE, 'node', 'look.mjs'));
const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');
const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-motion-state-'));

function hook(name, payload) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], { input: JSON.stringify(payload), cwd: payload.cwd, encoding: 'utf8', env: { ...process.env, XDG_STATE_HOME: STATE_HOME } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// A motion session: activation, then the tool events the model would make, then Stop.
function session(sid, prompt = 'lit motion a README cover loop for LOOPTEST') {
  const ws = temp('litmuse-motion-ws-');
  const base = { session_id: sid, cwd: ws };
  const ignite = hook('user-prompt-submit', { ...base, hook_event_name: 'UserPromptSubmit', prompt, turn_id: 't1' });
  return {
    ws,
    ignite,
    bash: (command, stdout = '') => hook('post-tool-use', { ...base, hook_event_name: 'PostToolUse', tool_name: 'bash', tool_input: { command }, tool_response: { stdout } }),
    read: (path) => hook('post-tool-use', { ...base, hook_event_name: 'PostToolUse', tool_name: 'read_file', tool_input: { path } }),
    stop: () => hook('stop', { ...base, hook_event_name: 'Stop', turn_id: 't1' }),
  };
}

const POSITIVE = [
  'lit 이 시 구절로 키네틱 타이포 영상 만들어줘', 'lit 회사 창립 기념 오프닝 타이틀 시퀀스 제작해줘', 'lit 새 앨범 가사 영상 하나 뽑아줘',
  'lit 우리 동아리 소개 인트로 영상 만들어 줘', 'lit 이 문장으로 모션그래픽 짧게 제작해줘', 'lit make a kinetic type video out of this haiku',
  'lit produce a title sequence for the gallery opening', 'lit render a lyric video for the chorus', 'lit create an intro video for the weekly science club',
  'lit 연구 성과 발표를 영상으로 만들어줘', 'lit make a video version of our quarterly presentation', 'lit make a seamless cover loop for this repository',
  'lit motion a README hero banner', 'lit film a 15 second explainer about seed libraries', 'lit 영상 봄 축제 오프닝', 'lit-typographic-motion 봄 축제 오프닝',
];
const EXCLUDED = [
  'lit 이 영상 잘라서 자막 넣어줘', 'lit trim this clip and add captions', 'lit embed a background video in the landing page',
  'lit 발표자료에 이 영상 넣어서 만들어줘', 'lit insert the product video into the report document', 'lit 유튜브 영상 썸네일 만들어줘',
  'lit write a script for our tutorial video', 'lit 이 영상 대본 좀 작성해줘', 'lit 버튼 호버 모션 만들어줘', 'lit design motion tokens for the checkout screen',
  'lit 주주총회 안건 모션 초안 만들어줘', 'lit build a video upload page', 'lit make a clip path for the hero section', 'lit 신입 교육용 슬라이드 덱 만들어줘',
  'lit 보고서 제작해줘', 'lit render the dashboard component', 'lit 이 영상 편집본 제작해줘', 'make a lyric video', 'lit',
];

test('motion routing: film requests in Korean and English reach the skill; editing, pages, decks and UI motion do not', () => {
  for (const p of POSITIVE) assert.equal(detectRoute(p)?.route, 'lit-typographic-motion', p);
  for (const p of EXCLUDED) assert.notEqual(detectRoute(p)?.route, 'lit-typographic-motion', p);
  assert.equal(motionIntent('a quick explainer video about tide pools, please make it'), true);
  assert.equal(detectRoute('lit plan a lyric video pipeline')?.route, 'lit-plan', 'an explicit keyword still wins');
});

test('motion command parser: renders name their folder; cover-gate and window renders never do', () => {
  assert.deepEqual(parseMotionCommand(`node "${MOTION_CLI}" cover --out motion-x --round 2`, '/w'), { mode: 'cover', out: '/w/motion-x', round: 2, stillsOnly: false });
  assert.deepEqual(parseMotionCommand(`node "${MOTION_CLI}" stage --out /abs/m --round 1 --stills-only`, '/w'), { mode: 'stage', out: '/abs/m', round: 1, stillsOnly: true });
  assert.equal(parseMotionCommand(`node "${MOTION_CLI}" cover-gate motion-x/cover.webp --strict`, '/w').out, null);
  assert.equal(parseMotionCommand(`node "${MOTION_CLI}" cover --out m --round 1 --window 2,2.5`, '/w').out, null);
  assert.equal(parseMotionCommand('ls motion-x', '/w'), null);
  assert.equal(exitCodeOf('render ...\nexit 13 GATE_FAIL_QA\n'), 13);
  assert.equal(exitCodeOf('no exit line'), null);
});

test('the Stop hook loads the done-check, so every engine module it imports is part of the hook digest', () => {
  for (const f of ['done.mjs', 'look.mjs', 'stills.mjs', 'cover-treatment.mjs', 'cover-assets.mjs']) {
    assert.ok(DIGEST_EXTRAS.includes(`skills/lit-typographic-motion/engine/node/${f}`), f);
  }
});

test('motion turn: activation names the skill; with no render the Stop hook holds twice, then asks for a not-done reply', () => {
  const s = session('mo-1');
  assert.equal(s.ignite.code, 0);
  assert.match(JSON.parse(s.ignite.stdout).hookSpecificOutput.additionalContext, /plugin:litmuse:lit-typographic-motion/);
  const first = s.stop();
  assert.equal(first.code, 2);
  assert.match(first.stderr, /is not done: no render command ran under this route/);
  assert.equal(s.stop().code, 2);
  const notice = s.stop();
  assert.equal(notice.code, 2);
  assert.match(notice.stderr, /say plainly in the reply that it is not done/);
  assert.equal(s.stop().code, 0, 'after the notice the turn may end');
});

test('motion turn: an unfinished cover points at references/cover.md; a finished one ends only after read_file opened its frames', () => {
  const s = session('mo-2');
  const out = fakeCoverRun(join(s.ws, 'motion-looptest'));
  s.bash(`node "${MOTION_CLI}" cover --out motion-looptest --round 1`, 'COVER gate --strict: PASS+TARGET\nexit 0 OK\n');
  const held = s.stop();
  assert.equal(held.code, 2);
  assert.match(held.stderr, /\(cover mode\) is not done: .*references\/cover\.md/);
  const file = writeAnswers(out, coverAnswers());
  lookCommand({ out, round: 1, answersFile: file });
  bumpStillsRound(out, 2);
  lookCommand({ out, round: 2, answersFile: file });
  s.bash(`node "${MOTION_CLI}" cover --out motion-looptest --round 2`, 'exit 0 OK\n');
  const unopened = s.stop();
  assert.equal(unopened.code, 2);
  assert.match(unopened.stderr, /never opened with read_file/);
  for (const n of ['sheet', 'poster', 'seam']) s.read(join('motion-looptest', 'stills', `${n}.png`));
  s.read('README.md');
  const state = JSON.parse(readFileSync(sessionPath(s.ws, 'mo-2', { XDG_STATE_HOME: STATE_HOME }).replace(/\.json$/, '.motion.json'), 'utf8'));
  assert.equal(state.viewed.length, 3, 'only images count as viewed');
  const r = s.stop();
  assert.equal(r.code, 0, r.stderr);
});

test('motion turn: a BLOCKED exit goes straight to the not-done notice', () => {
  const s = session('mo-3');
  s.bash(`node "${MOTION_CLI}" cover --out motion-x --round 1`, 'BLOCKED_DEPS_NOT_PREWARMED: ...\nexit 14 BLOCKED_DEPS_NOT_PREWARMED\n');
  const r = s.stop();
  assert.equal(r.code, 2);
  assert.match(r.stderr, /BLOCKED \(exit 14\)/);
  assert.match(r.stderr, /say plainly in the reply/);
  assert.equal(s.stop().code, 0);
});

test('motion turn: a finished cover with a generated base art holds once so the reply carries the label', () => {
  const s = session('mo-4');
  const out = fakeCoverRun(join(s.ws, 'motion-gen'));
  writeFileSync(join(out, 'assets.json'), JSON.stringify({ assets: [{ path: 'cover/assets/base.png', role: 'base-art', source: 'generated', sha256: 'a'.repeat(64), box: [0.125, 0, 0.75, 1] }] }));
  const file = writeAnswers(out, coverAnswers());
  lookCommand({ out, round: 1, answersFile: file });
  bumpStillsRound(out, 2);
  lookCommand({ out, round: 2, answersFile: file });
  s.bash(`node "${MOTION_CLI}" cover --out ${out} --round 2`, 'exit 0 OK\n');
  for (const n of ['sheet', 'poster', 'seam']) s.read(join(out, 'stills', `${n}.png`));
  const r = s.stop();
  assert.equal(r.code, 2);
  assert.match(r.stderr, /is generated, not supplied: label it as generated in the reply/);
  assert.equal(s.stop().code, 0);
});

test('motion turn: another route or a plain prompt leaves the motion gate off', () => {
  const s = session('mo-5', 'lit plan a cover loop pipeline');
  const r = s.stop();
  assert.doesNotMatch(r.stderr, /lit-typographic-motion/);
});

