import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRoute, SKILL_ROUTES, KEYWORD_ROUTES } from '../plugin/hooks/lib/routes.mjs';

test('bare lit at the start routes to lit-loop', () => {
  assert.equal(detectRoute('lit add a --shout flag with a test')?.route, 'lit-loop');
  assert.equal(detectRoute('  lit')?.route, 'lit-loop');
  assert.equal(detectRoute('LIT fix the parser')?.route, 'lit-loop');
  assert.equal(detectRoute('lit: tidy the readme')?.route, 'lit-loop');
  assert.equal(detectRoute('lit 이 함수 테스트 먼저 써 줘')?.route, 'lit-loop');
});

test('a keyword after lit picks the named route', () => {
  assert.equal(detectRoute('lit plan a tiny todo app')?.route, 'lit-plan');
  assert.equal(detectRoute('lit research how others cache embeddings')?.route, 'litresearch');
  assert.equal(detectRoute('lit review this branch')?.route, 'review-work');
  assert.equal(detectRoute('lit handoff')?.route, 'lit-handoff');
  assert.equal(detectRoute('lit korean 이 문단 다듬어 줘')?.route, 'lit-humanizer');
});

test('a leading skill id routes straight to that skill', () => {
  assert.equal(detectRoute('lit-plan a cache layer')?.route, 'lit-plan');
  assert.equal(detectRoute('litwork ship the flag')?.route, 'litwork');
  assert.equal(detectRoute('litgoal close auth-refactor')?.route, 'litgoal');
});

test('ordinary prose stays unrouted', () => {
  for (const prompt of [
    'literature review on hydrates',
    'Lit candles look nice in photos',
    'please run lit later',
    'split the file',
    '```\nlit\n```',
    '',
  ]) {
    assert.equal(detectRoute(prompt), null, prompt);
  }
});

test('every keyword route targets a known skill', () => {
  const ids = new Set(SKILL_ROUTES.map((r) => r.id));
  for (const target of Object.values(KEYWORD_ROUTES)) assert.ok(ids.has(target), target);
  assert.equal(SKILL_ROUTES.length, 39);
  for (const r of SKILL_ROUTES) assert.ok(r.when.length > 10, r.id);
});

// Review M4: the /lit command form and the expanded command template both activate a route.
test('slash command forms route like bare lit', () => {
  assert.equal(detectRoute('/lit plan x')?.route, 'lit-plan');
  assert.equal(detectRoute('/litmuse:lit review the branch')?.route, 'review-work');
  assert.equal(detectRoute('/lit')?.route, 'lit-loop');
  assert.equal(detectRoute('LitMuse route request: plan a cache')?.route, 'lit-plan');
  assert.equal(detectRoute('/literature x'), null);
  assert.equal(detectRoute('/lit-status'), null, 'other LitMuse commands are not routes');
});

// M8 D2 + parity port: the new skills are reachable by keyword and by their own id.
test('brainstorm words, team, conference, rules, lsp and burnoff-file route to the new skills', () => {
  for (const w of ['brainstorm', 'brainstorming', 'ideation', 'ideate', 'idea', 'ideas']) {
    assert.equal(detectRoute(`lit ${w} a name for my app`)?.route, 'lit-brainstorm', w);
  }
  assert.equal(detectRoute('lit-brainstorm onboarding ideas')?.route, 'lit-brainstorm');
  assert.equal(detectRoute('lit team split the migration')?.route, 'lit-team');
  assert.equal(detectRoute('lit conference survey vector stores')?.route, 'autoconference');
  assert.equal(detectRoute('lit rules why is this skill shadowed')?.route, 'rules');
  assert.equal(detectRoute('lit lsp src/app.ts')?.route, 'lsp');
  assert.equal(detectRoute('lit diagnostics src/app.ts')?.route, 'lsp');
  assert.equal(detectRoute('lit lsp-setup for this go repo')?.route, 'lsp-setup');
  assert.equal(detectRoute('lit burnoff-file src/util.ts')?.route, 'lit-burnoff-file');
  assert.equal(detectRoute('lit burnoff src/')?.route, 'lit-burnoff');
});

// M8 found in another product: "document" plus a trailing lit picked a .docx deliverable. A trailing lit now activates, as
// in the sibling products, and always lands on lit-loop, never on a document skill.
test('a trailing lit after prose about documents activates lit-loop only', () => {
  const hit = detectRoute('Extensive port is required for litmuse. Do NOT just write brief description in each document ... ultrathink lit');
  assert.equal(hit?.route, 'lit-loop');
  assert.equal(hit?.trailing, true);
});

test('a standalone lit as the last word activates lit-loop', () => {
  for (const prompt of ['Hello! lit', 'fix the flaky test lit', 'fix the flaky test  LIT', 'line one\nlit', 'run it `npm test` lit', '이 함수 테스트 먼저 lit']) {
    const hit = detectRoute(prompt);
    assert.equal(hit?.route, 'lit-loop', prompt);
    assert.equal(hit?.trailing, true, prompt);
  }
});

test('a lit that is not a word of its own, or sits in code, quotes, a path or a URL, stays unrouted', () => {
  for (const prompt of [
    'what is a literal', 'please split', 'see lit-plan.md', 'open /x/lit/y', 'read src/lit', 'https://example.com/lit',
    'say "lit"', "say 'lit'", 'run `lit`', 'the room was Lit', 'x.lit', 'a-lit', 'lit_',
    '```\nfix it lit\n```', '```\nunclosed fence lit', 'please run lit later', 'Lit candles look nice',
  ]) {
    assert.equal(detectRoute(prompt), null, prompt);
  }
});

test('a leading lit keeps its route words; the trailing form never overrides them', () => {
  assert.equal(detectRoute('lit plan a cache lit')?.route, 'lit-plan');
  assert.equal(detectRoute('lit plan a cache lit')?.trailing, undefined);
});
