import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectRoute, SKILL_ROUTES } from '../plugin/hooks/lib/routes.mjs';
import { readManifest, PLUGIN_DIR } from '../lib/bundle.mjs';
import { expectedSkillIds } from '../lib/doctor.mjs';
import {
  buildImplementerBrief,
  checkRun,
  decideLicence,
  detectLicence,
  fetchBytes,
  findOverlap,
  fxtwitterToMarkdown,
  parseXStatusUrl,
  repoSubpath,
} from '../plugin/skills/lit-hijack/scripts/hijack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(PLUGIN_DIR, 'hooks');
const SKILL = join(PLUGIN_DIR, 'skills', 'lit-hijack');
const CLI = join(SKILL, 'scripts', 'hijack.mjs');

const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-hijack-state-'));
const hookEnv = (extra = {}) => ({ ...process.env, XDG_STATE_HOME: STATE_HOME, ...extra });

function ignite(prompt) {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-hijack-ws-'));
  const r = spawnSync(process.execPath, [join(HOOKS, 'user-prompt-submit.mjs')], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt, session_id: 'sess-hijack', turn_id: 't1', cwd: ws }),
    cwd: ws,
    encoding: 'utf8',
    env: hookEnv(),
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

test('lit-hijack is enrolled on every surface', () => {
  const manifestIds = readManifest().capabilities.skills.map((s) => s.id);
  assert.ok(manifestIds.includes('lit-hijack'), 'manifest');
  assert.ok(SKILL_ROUTES.some((r) => r.id === 'lit-hijack'), 'route table');
  assert.ok([...expectedSkillIds()].includes('plugin:litmuse:lit-hijack'), 'doctor listing');
  for (const path of [
    'skills/lit-hijack/SKILL.md',
    'skills/lit-hijack/scripts/hijack.mjs',
    'skills/lit-hijack/references/capture-and-provenance.md',
    'skills/lit-hijack/references/distil-and-licence.md',
    'skills/lit-hijack/references/gap-and-port-design.md',
    'skills/lit-hijack/references/clean-room-build.md',
    'skills/lit-hijack/references/parity-and-report.md',
  ]) {
    assert.ok(existsSync(join(PLUGIN_DIR, path)), `${path} ships`);
  }
});

test('the hijack words route to lit-hijack ahead of plan, review, research and schematic', () => {
  for (const prompt of [
    'lit hijack https://x.com/someone/status/1 into my motion skill',
    'lit hijacking the review lanes from this repo into my plan skill',
    'lit hijack this repo\u2019s research method into a new skill',
    'lit 하이재킹 이 글의 기법을 내 스킬에',
    'lit 하이잭 이 PDF 두 개',
    'lit-hijack these five posts',
  ]) {
    assert.equal(detectRoute(prompt)?.route, 'lit-hijack', prompt);
  }
});

test('hijack keeps its precedence over drawing and film intents', () => {
  assert.equal(detectRoute('lit hijack the P&ID drawing technique from this post into my skill')?.route, 'lit-hijack');
  assert.equal(detectRoute('lit hijack this cutaway motion video technique into my skill')?.route, 'lit-hijack');
  assert.equal(detectRoute('lit draw a P&ID of the hijack test rig')?.route, 'lit-schematic');
});

test('the neighbouring routes stay where they were', () => {
  for (const [prompt, expected] of [
    ['lit plan the hijack report layout', 'lit-plan'],
    ['lit review the hijack ledger', 'review-work'],
    ['lit research session hijack defences', 'litresearch'],
    ['lit debug the session hijack in the login flow', 'debugging'],
    ['lit fix the session hijack bug', 'lit-loop'],
  ]) {
    assert.equal(detectRoute(prompt)?.route, expected, prompt);
  }
});

test('hijack-shaped prose without the route stays unrouted', () => {
  assert.equal(detectRoute('`lit hijack these posts`'), null);
  assert.equal(detectRoute('how do attackers hijack a session cookie?'), null);
});

test('the hook ignition names the installed skill entrypoint', () => {
  const ctx = ignite('lit hijack the brief technique from this post into my skill');
  assert.match(ctx, /LIT IGNITED \u00b7 lit-hijack/);
  assert.match(ctx, /plugin:litmuse:lit-hijack/);
});

test('the skill offers a lit goal line for the long run, not a /goal line', () => {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(text, /`lit goal \u2026`/);
  assert.doesNotMatch(text, /`\/goal\b/);
});

test('the skill hands work to its neighbours and documents every hijack.mjs command', () => {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const neighbour of ['litresearch', 'lit-plan', 'start-work', 'review-work']) {
    assert.match(text, new RegExp(`\`${neighbour}\``, 'u'), `hands work to ${neighbour}`);
  }
  for (const command of ['capture', 'licence', 'overlap', 'brief', 'check']) {
    assert.match(text, new RegExp(`hijack\\.mjs ${command}\\b`, 'u'), `documents hijack.mjs ${command}`);
  }
  assert.match(text, /api\.fxtwitter\.com/);
  assert.match(text, /TASK:[\s\S]*DELIVERABLE[\s\S]*SCOPE[\s\S]*VERIFY/);
  assert.match(text, /\/litmuse:lit-hijack/);
  for (const heading of [
    '## When this applies',
    '## Inputs and state',
    '## Procedure',
    '## Phase 0: Frame',
    '## Phase 1: Capture',
    '## Phase 2: Distil',
    '## Phase 3: Licence gate',
    '## Phase 4: Gap analysis',
    '## Phase 5: Port design and spec',
    '## Phase 6: Build',
    '## Phase 7: Parity proof',
    '## Phase 8: Report',
    '## Muse tools and approvals',
    '## Evidence',
    '## Stop and report',
    '## Pitfalls',
    '## Worked example',
    '## Final checklist',
  ]) {
    assert.ok(text.includes(heading), `missing ${heading}`);
  }
});

test('every references/ path the skill names exists, with no orphans', () => {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const named = [...new Set([...text.matchAll(/references\/([a-z0-9-]+\.md)/gu)].map((match) => match[1]))];
  assert.ok(named.length >= 5, 'names its reference files');
  for (const file of named) assert.ok(existsSync(join(SKILL, 'references', file)), `references/${file}`);
  assert.deepEqual(readdirSync(join(SKILL, 'references')).sort(), [...named].sort(), 'no orphaned reference file');
  for (const file of named) {
    assert.ok(readFileSync(join(SKILL, 'references', file), 'utf8').length >= 3_000, `references/${file} has content`);
  }
});

const temp = mkdtempSync(join(tmpdir(), 'litmuse-hijack-'));
const cliEnv = { PATH: process.env.PATH, HOME: join(temp, 'home'), NO_COLOR: '1' };
mkdirSync(cliEnv.HOME, { recursive: true });
let counter = 0;

const freshDir = (name) => {
  const dir = join(temp, `${name}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const cli = (args, cwd = temp) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: cliEnv });

// Own-written sample prose. Nothing here is taken from a real post.
const SOURCE_PROSE = [
  'A careful studio writes the brief before any frame exists, so the model cannot fill gaps with its favourite defaults.',
  'The brief names the one thing a viewer must remember and the outcome that would make the film unacceptable to ship.',
].join(' ');
const PARAPHRASE = 'Pin the takeaway and the rejection condition in a short production note first; only then may rendering start.';

test('hijack.mjs parses X status URLs and nothing else', () => {
  assert.equal(parseXStatusUrl('https://x.com/someone/status/2105643919119696297'), '2105643919119696297');
  assert.equal(parseXStatusUrl('https://twitter.com/a_b/status/42?s=20'), '42');
  assert.equal(parseXStatusUrl('https://x.com/i/article/42'), null);
  assert.equal(parseXStatusUrl('https://example.com/status/42'), null);
});

test('hijack.mjs turns an fxtwitter post with a long article into Markdown and provenance', () => {
  const json = {
    code: 200,
    tweet: {
      url: 'https://x.com/writer/status/77',
      id: '77',
      text: 'Short teaser',
      created_at: 'Thu Oct 01 13:00:05 +0000 2026',
      author: { screen_name: 'writer', name: 'A Writer' },
      article: {
        title: 'Studio notes',
        content: {
          blocks: [
            { key: 'a', type: 'header-one', text: 'First part', entityRanges: [] },
            { key: 'b', type: 'unstyled', text: 'Plain paragraph.', entityRanges: [] },
            { key: 'c', type: 'unordered-list-item', text: 'one item', entityRanges: [] },
            { key: 'd', type: 'atomic', text: ' ', entityRanges: [{ key: 0, offset: 0, length: 1 }] },
            { key: 'e', type: 'atomic', text: ' ', entityRanges: [{ key: 1, offset: 0, length: 1 }] },
            { key: 'f', type: 'blockquote', text: 'quoted line', entityRanges: [] },
          ],
          entityMap: [
            { key: '0', value: { type: 'MARKDOWN', data: { markdown: '```\nlayout/\n```' } } },
            { key: '1', value: { type: 'MEDIA', data: {} } },
          ],
        },
      },
    },
  };
  const { markdown, meta } = fxtwitterToMarkdown(json);
  assert.equal(meta.author, 'A Writer (@writer)');
  assert.equal(meta.published, '2026-10-01T13:00:05.000Z');
  assert.equal(meta.kind, 'x-article');
  assert.equal(meta.title, 'Studio notes');
  assert.match(markdown, /^# Studio notes$/mu);
  assert.match(markdown, /^## First part$/mu);
  assert.match(markdown, /^- one item$/mu);
  assert.match(markdown, /^```\nlayout\/\n```$/mu);
  assert.match(markdown, /^\[media\]$/mu);
  assert.match(markdown, /^> quoted line$/mu);
  const plain = fxtwitterToMarkdown({ code: 200, tweet: { ...json.tweet, article: null } });
  assert.equal(plain.meta.kind, 'x-post');
  assert.match(plain.markdown, /Short teaser/u);
});

test('hijack.mjs detects common licences and maps every class to a take decision', () => {
  assert.equal(detectLicence('MIT License\n\nPermission is hereby granted, free of charge, to any person').spdx, 'MIT');
  assert.equal(detectLicence('Apache License\nVersion 2.0, January 2004').spdx, 'Apache-2.0');
  assert.equal(detectLicence('GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007').spdx, 'GPL-3.0');
  assert.equal(detectLicence('GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3').spdx, 'AGPL-3.0');
  assert.equal(detectLicence('// SPDX-License-Identifier: MPL-2.0\n').spdx, 'MPL-2.0');
  assert.equal(detectLicence('This is free and unencumbered software released into the public domain.').spdx, 'Unlicense');
  assert.equal(detectLicence('Licensed under Creative Commons Attribution-NonCommercial 4.0').spdx, 'CC-BY-NC-4.0');
  assert.equal(detectLicence('Just a readme with no terms').spdx, 'NOASSERTION');
  assert.equal(decideLicence('MIT').decision, 'ideas-credit');
  assert.equal(decideLicence('Apache-2.0').decision, 'ideas-credit');
  assert.equal(decideLicence('CC-BY-4.0').decision, 'ideas-credit');
  assert.equal(decideLicence('GPL-3.0').decision, 'ideas-only');
  assert.equal(decideLicence('CC-BY-SA-4.0').decision, 'ideas-only');
  assert.equal(decideLicence('CC-BY-NC-4.0').decision, 'ideas-only');
  assert.equal(decideLicence('NOASSERTION').decision, 'ideas-only');
  assert.equal(decideLicence('NOASSERTION', { text: 'Do not copy, adapt or redistribute any part of this guide.' }).decision, 'needs-review');
  const article = '## Reference analysis\n\n- KEEP: the pacing of the reveal\n- DO NOT COPY: the exact layout of the hero shot\n';
  assert.equal(decideLicence('NOASSERTION', { text: article }).decision, 'ideas-only');
  assert.equal(decideLicence('MIT', { text: `${article}\nSPDX-License-Identifier: MIT` }).decision, 'ideas-credit');
});

test('hijack.mjs flags a verbatim run and passes a paraphrase, in English and Hangul', () => {
  const sources = [{ id: 'S1', text: SOURCE_PROSE }];
  const copied = 'Intro line.\nAs one note says, a careful studio writes the brief before any frame exists, so the model cannot fill gaps.\n';
  const runs = findOverlap({ sources, targets: [{ path: 'SKILL.md', text: copied }], minWords: 12 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].source, 'S1');
  assert.equal(runs[0].path, 'SKILL.md');
  assert.equal(runs[0].line, 2);
  assert.ok(runs[0].words >= 12);
  assert.deepEqual(findOverlap({ sources, targets: [{ path: 'SKILL.md', text: PARAPHRASE }], minWords: 12 }), []);
  const ko = '먼저 브리프를 쓰고 그다음에 장면을 그린다 그래야 모델이 빈칸을 자기 취향으로 채우지 않는다 정말로';
  const koTarget = '**먼저** 브리프를 쓰고, 그다음에 장면을 그린다. 그래야 모델이 빈칸을 자기 취향으로 채우지 않는다!';
  assert.equal(findOverlap({ sources: [{ id: 'S2', text: ko }], targets: [{ path: 'a.md', text: koTarget }], minWords: 12 }).length, 1);
  assert.equal(findOverlap({ sources: [{ id: 'S2', text: ko }], targets: [{ path: 'a.md', text: koTarget }], minWords: 20 }).length, 0);
});

// A complete small run on disk: one captured source, one mechanism, a spec, a build, parity and a report.
const writeRun = () => {
  const target = freshDir('target');
  mkdirSync(join(target, 'skills', 'toy'), { recursive: true });
  writeFileSync(join(target, 'skills', 'toy', 'SKILL.md'), '# Toy\n\nLine two.\nWrite the promo brief.\n');
  const run = join(target, '.litmuse', 'hijack', 'studio-brief');
  const init = cli(['init', run, '--target', target, '--base-ref', 'abc1234']);
  assert.equal(init.status, 0, init.stderr);
  const sourceFile = join(target, 'post.md');
  writeFileSync(sourceFile, `${SOURCE_PROSE}\n`);
  const capture = cli(['capture', run, sourceFile, '--kind', 'file', '--url', 'https://x.com/writer/status/77', '--author', 'A Writer', '--date', '2026-10-01']);
  assert.equal(capture.status, 0, capture.stderr);
  const licence = cli(['licence', run]);
  assert.equal(licence.status, 0, licence.stderr);
  const ledgerPath = join(run, 'ledger.json');
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  ledger.mechanisms = [{
    id: 'M1',
    title: 'Brief before render',
    sources: ['S1'],
    locator: 'S1 paragraph 1',
    what: 'A production note fixes the takeaway and the rejection condition before any rendering.',
    why: 'Unfilled decisions are filled by model defaults, which is where look-alike output comes from.',
    evidence: 'anecdotal',
    evidence_note: 'Practitioner report, no measurement.',
    gap: { status: 'weak', refs: ['skills/toy/SKILL.md:4'], note: 'asks for a brief with no required fields' },
    port: { decision: 'adapt', reason: 'The toy skill already writes a brief; it lacks the two required fields.' },
    parity: {
      criterion: 'A brief from the toy skill names the takeaway and the rejection condition.',
      red: 'baseline brief has neither field',
      green: 'treatment brief has both fields',
      surface: 'muse exec in a throwaway workspace',
      artifact: 'parity/treatment.md',
    },
  }];
  ledger.build = { plan: 'plans/toy-brief.md', changed: ['skills/toy/SKILL.md'] };
  ledger.parity = { baseline_outputs: ['parity/baseline.md'], treatment_outputs: ['parity/treatment.md'], markers: ['Rejection condition'] };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(join(run, 'SPEC.md'), '# Spec\n\n## M1 Brief before render\n\nThe toy skill\u2019s brief gains two required fields: Takeaway and Rejection condition.\n');
  mkdirSync(join(target, 'plans'), { recursive: true });
  writeFileSync(join(target, 'plans', 'toy-brief.md'), '# Toy brief\n\n- [ ] 1. Add the two fields (SPEC M1)\n');
  writeFileSync(join(target, 'skills', 'toy', 'SKILL.md'), '# Toy\n\nLine two.\nWrite the promo brief with a Takeaway and a Rejection condition field.\n');
  mkdirSync(join(run, 'parity'), { recursive: true });
  writeFileSync(join(run, 'parity', 'baseline.md'), 'Brief: a fun launch video.\n');
  writeFileSync(join(run, 'parity', 'treatment.md'), 'Takeaway: one tap. Rejection condition: any invented screen.\n');
  writeFileSync(join(run, 'REPORT.md'), '# Report\n\n## Taken\n\nM1 adapted.\n\n## Left\n\nNothing else.\n\n## Provenance\n\nS1 https://x.com/writer/status/77 (A Writer, 2026-10-01), ideas-only.\n');
  return { target, run, ledgerPath };
};

const editLedger = (ledgerPath, change) => {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  change(ledger);
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
};

test('hijack.mjs passes a complete run through every phase, from the CLI too', () => {
  const { run } = writeRun();
  const result = checkRun(run, { phase: 'report' });
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
  const ledger = JSON.parse(readFileSync(join(run, 'ledger.json'), 'utf8'));
  assert.equal(ledger.sources[0].licence.decision, 'ideas-only', 'an X post with no licence is ideas-only');
  assert.match(ledger.sources[0].retrieved_at, /^\d{4}-\d{2}-\d{2}T/u);
  assert.match(ledger.sources[0].files[0].sha256, /^[0-9a-f]{64}$/u);
  const cliCheck = cli(['check', run, '--phase', 'report']);
  assert.equal(cliCheck.status, 0, cliCheck.stdout + cliCheck.stderr);
});

test('hijack.mjs fails a source with missing provenance or a tampered capture', () => {
  const { run, ledgerPath } = writeRun();
  editLedger(ledgerPath, (ledger) => { delete ledger.sources[0].retrieved_at; });
  assert.match(checkRun(run, { phase: 'capture' }).issues.join('\n'), /S1: retrieved_at/u);
  const second = writeRun();
  const captured = JSON.parse(readFileSync(second.ledgerPath, 'utf8')).sources[0].files[0].path;
  writeFileSync(join(second.run, captured), 'changed after capture\n');
  assert.match(checkRun(second.run, { phase: 'capture' }).issues.join('\n'), /S1: .*sha256 mismatch/u);
});

test('hijack.mjs fails a gap claim whose file:line does not resolve', () => {
  const { run, ledgerPath } = writeRun();
  editLedger(ledgerPath, (ledger) => { ledger.mechanisms[0].gap.refs = ['skills/toy/SKILL.md:400']; });
  assert.match(checkRun(run, { phase: 'gap' }).issues.join('\n'), /M1: gap ref skills\/toy\/SKILL\.md:400/u);
});

test('hijack.mjs fails a taken mechanism that rests only on a no-go source', () => {
  const { run, ledgerPath } = writeRun();
  editLedger(ledgerPath, (ledger) => { ledger.sources[0].licence.decision = 'no-go'; });
  assert.match(checkRun(run, { phase: 'gap' }).issues.join('\n'), /M1: .*no-go/u);
});

test('hijack.mjs fails a spec that points at the sources or copies them', () => {
  const { run } = writeRun();
  writeFileSync(join(run, 'SPEC.md'), '# Spec\n\n## M1\n\nRead sources/S1/content.md for details.\n');
  assert.match(checkRun(run, { phase: 'spec' }).issues.join('\n'), /SPEC\.md names the captured sources/u);
  writeFileSync(join(run, 'SPEC.md'), `# Spec\n\n## M1\n\n${SOURCE_PROSE}\n`);
  assert.match(checkRun(run, { phase: 'spec' }).issues.join('\n'), /SPEC\.md:5 copies \d+ words from S1/u);
});

test('hijack.mjs fails a build without a lit-plan row grammar plan that covers every taken mechanism', () => {
  const { run, target, ledgerPath } = writeRun();
  writeFileSync(join(target, 'plans', 'toy-brief.md'), '# Toy brief\n\n1. Add the two fields (SPEC M1)\n');
  assert.match(checkRun(run, { phase: 'build' }).issues.join('\n'), /build\.plan plans\/toy-brief\.md has no column-zero task row/u);
  writeFileSync(join(target, 'plans', 'toy-brief.md'), '# Toy brief\n\n- [ ] 1. Add the two fields\n');
  assert.match(checkRun(run, { phase: 'build' }).issues.join('\n'), /build\.plan plans\/toy-brief\.md never cites M1/u);
  editLedger(ledgerPath, (ledger) => { delete ledger.build.plan; });
  assert.match(checkRun(run, { phase: 'build' }).issues.join('\n'), /build\.plan is missing/u);
});

test('hijack.mjs fails a build that copied source wording into the target', () => {
  const { run, target } = writeRun();
  writeFileSync(join(target, 'skills', 'toy', 'SKILL.md'), `# Toy\n\n${SOURCE_PROSE}\n`);
  assert.match(checkRun(run, { phase: 'build' }).issues.join('\n'), /skills\/toy\/SKILL\.md:3 copies \d+ words from S1/u);
});

test('hijack.mjs fails parity when the behaviour never appeared, or the baseline saw the treatment', () => {
  const { run } = writeRun();
  writeFileSync(join(run, 'parity', 'treatment.md'), 'A fun launch video.\n');
  assert.match(checkRun(run, { phase: 'parity' }).issues.join('\n'), /marker "Rejection condition" never appears in a treatment output/u);
  const second = writeRun();
  writeFileSync(join(second.run, 'parity', 'baseline.md'), 'Rejection condition: none.\n');
  assert.match(checkRun(second.run, { phase: 'parity' }).issues.join('\n'), /baseline output parity\/baseline\.md shows marker "Rejection condition"/u);
});

test('hijack.mjs fails a report that skips a mechanism or a needed credit', () => {
  const { run } = writeRun();
  writeFileSync(join(run, 'REPORT.md'), '# Report\n\n## Taken\n\n## Left\n\n## Provenance\n');
  assert.match(checkRun(run, { phase: 'report' }).issues.join('\n'), /REPORT\.md does not account for M1/u);
  const second = writeRun();
  editLedger(second.ledgerPath, (ledger) => { ledger.sources[0].licence.decision = 'ideas-credit'; });
  assert.match(checkRun(second.run, { phase: 'report' }).issues.join('\n'), /S1 needs credit/u);
});

test('hijack.mjs builds an implementer brief from the spec alone', () => {
  const { run } = writeRun();
  const brief = buildImplementerBrief(run);
  assert.match(brief, /^TASK:/mu);
  assert.match(brief, /DELIVERABLE/u);
  assert.match(brief, /SCOPE/u);
  assert.match(brief, /VERIFY/u);
  assert.match(brief, /Rejection condition/u, 'carries the spec text');
  assert.doesNotMatch(brief, /x\.com\/writer|sources\/S1/u, 'names no captured source');
});

test('hijack.mjs refuses a PDF capture whose bytes are not a PDF', () => {
  const { run, target } = writeRun();
  writeFileSync(join(target, 'fake.pdf'), 'not a pdf\n');
  const result = cli(['capture', run, join(target, 'fake.pdf'), '--kind', 'pdf']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /%PDF-/);
});

test('repoSubpath refuses a subpath that escapes the clone', () => {
  assert.equal(repoSubpath('/run/repo', 'skills/a'), join('/run/repo', 'skills', 'a'));
  assert.throws(() => repoSubpath('/run/repo', '../../etc'), /escapes the clone/);
  assert.throws(() => repoSubpath('/run/repo', 'a/../../b'), /escapes the clone/);
  assert.equal(repoSubpath('/run/repo', null), null);
});

test('fetchBytes aborts a streaming body past the capture limit', async () => {
  const seen = { count: 0, cancelled: false };
  const total = 25;
  const body = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => {
          if (i >= total) return { done: true, value: undefined };
          i += 1;
          seen.count += 1;
          return { done: false, value: Buffer.alloc(1024 * 1024, 7) };
        },
      };
    },
    cancel: async () => {
      seen.cancelled = true;
    },
  };
  const fetchImpl = async () => ({ status: 200, ok: true, headers: { get: () => 'text/html' }, body });
  await assert.rejects(fetchBytes('https://src.example/big', { fetchImpl }), /larger than/);
  assert.ok(seen.count < total, `read ${seen.count} of ${total} chunks before stopping`);
  assert.equal(seen.cancelled, true, 'the stream is cancelled on abort');
});


test('fetchBytes connects to the checked address, not a rebinding answer', async () => {
  const approved = '93.184.216.34';
  const lookup = async () => [{ address: approved, family: 4 }];
  let connected = null;
  const request = (href, options, callback) => {
    options.lookup('example.com', { all: true }, (err, addrs) => { connected = addrs[0].address; });
    const res = Readable.from([Buffer.from('<html>hi</html>')]);
    res.statusCode = 200;
    res.headers = { 'content-type': 'text/html' };
    const req = new EventEmitter();
    req.end = () => { process.nextTick(() => callback(res)); };
    return req;
  };
  const { buffer, finalUrl } = await fetchBytes('https://example.com/page', { request, lookup });
  assert.equal(connected, approved, 'the connection goes to the approved address');
  assert.equal(buffer.toString('utf8'), '<html>hi</html>');
  assert.equal(finalUrl, 'https://example.com/page');
});

test('fetchBytes follows public hops and refuses a private redirect', async () => {
  const calls = [];
  const page = (status, location, text) => ({ status, ok: status === 200,
    headers: { get: (name) => (name === 'location' ? location : 'text/html') },
    body: null, arrayBuffer: async () => Buffer.from(text) });
  const fetchImpl = async (href) => { calls.push(href);
    return href.endsWith('/a') ? page(302, 'https://example.com/b', '') : page(200, null, 'done'); };
  const { buffer, finalUrl } = await fetchBytes('https://example.com/a', { fetchImpl });
  assert.deepEqual(calls, ['https://example.com/a', 'https://example.com/b']);
  assert.equal(buffer.toString(), 'done');
  assert.equal(finalUrl, 'https://example.com/b');
  const evil = async (href) => (href.endsWith('/a2')
    ? { status: 302, ok: false, headers: { get: (name) => (name === 'location' ? 'https://10.0.0.1/x' : null) }, body: null }
    : page(200, null, 'x'));
  await assert.rejects(fetchBytes('https://example.com/a2', { fetchImpl: evil }), /private/);
});
