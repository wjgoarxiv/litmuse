// Route table shared by the hooks (activation and session steering) and by the installer's
// enrollment checks. Every shipped skill appears in SKILL_ROUTES exactly once.

export const SKILL_ROUTES = [
  { id: 'lit-loop', when: 'bare `lit`, or any multi-step task that needs criteria, tests and proof' },
  { id: 'litgoal', when: 'create, check or close a goal that must outlive this session' },
  { id: 'litwork', when: 'ship one change with proof: implement, fix, finish' },
  { id: 'lit-plan', when: 'plan before code; writes plans/<slug>.md only' },
  { id: 'lit-brainstorm', when: 'open ideation: diverge on options, then score a shortlist and hand off' },
  { id: 'deep-interview', when: 'the request is vague or broad and needs questions first' },
  { id: 'lit-crucible', when: 'pressure-test a brief for risks before planning' },
  { id: 'start-work', when: 'execute an approved plan row by row' },
  { id: 'lit-code', when: 'writing or changing code' },
  { id: 'debugging', when: 'a bug, failing test or unexpected behavior' },
  { id: 'refactor', when: 'restructure code while keeping behavior' },
  { id: 'lit-commit', when: 'commits, staging, rebase, blame, bisect, history questions' },
  { id: 'review-work', when: 'is this diff or branch correct, risky, safe to merge' },
  { id: 'visual-qa', when: 'check a built interface in a browser at several widths' },
  { id: 'comment-checker', when: 'audit code comments on a diff or files' },
  { id: 'lit-burnoff', when: 'strip AI-generated bloat across a scope of files' },
  { id: 'lit-burnoff-file', when: 'strip AI-generated residue from exactly one file' },
  { id: 'litresearch', when: 'research across sources, prior art, landscape questions' },
  { id: 'wikify', when: 'save or query findings in the task wiki under .litmuse/wiki' },
  { id: 'lit-comprehend', when: 'explain agent-written work to a person' },
  { id: 'lit-humanizer', when: 'polish Korean or English prose into the writer\'s voice' },
  { id: 'lit-recap', when: 'where does the work stand (read-only)' },
  { id: 'lit-handoff', when: 'before stopping or switching sessions' },
  { id: 'lit-init', when: 'orient in an unfamiliar repository; leaves AGENTS.md' },
  { id: 'frontend-ui-ux', when: 'build or restyle a user interface' },
  { id: 'readme-studio', when: 'write or refresh a README from repo facts' },
  { id: 'lit-docx', when: 'a Word document or DOCX/PDF to Markdown (needs Python)' },
  { id: 'lit-pptx', when: 'a slide deck (needs Python)' },
  { id: 'lit-scientific-visualization', when: 'a publication-ready figure from data' },
  { id: 'lit-diagram-drawer', when: 'an architecture, workflow or timeline diagram' },
  { id: 'lit-typographic-motion', when: 'make a short film, kinetic type or lyric video, or a seamless README cover loop' },
  { id: 'autoresearch', when: 'a budgeted experiment loop against a metric' },
  { id: 'structural-search', when: 'find or rewrite code by syntax shape (ast-grep)' },
  { id: 'browser-drive', when: 'the answer only exists in a running web page' },
  { id: 'lit-team', when: 'coordinate two or more child agents behind one durable team packet' },
  { id: 'autoconference', when: 'a budgeted research conference: parallel researchers, review, synthesis' },
  { id: 'rules', when: 'which rules, AGENTS.md and skills Muse loads, and in what order' },
  { id: 'lsp', when: 'language diagnostics, definitions and references through checker CLIs' },
  { id: 'lsp-setup', when: 'set up and verify a language checker for this project' },
];

// The word after a leading `lit` picks a route; anything else falls back to lit-loop.
export const KEYWORD_ROUTES = {
  loop: 'lit-loop',
  plan: 'lit-plan',
  work: 'litwork',
  goal: 'litgoal',
  research: 'litresearch',
  review: 'review-work',
  start: 'start-work',
  recap: 'lit-recap',
  status: 'lit-recap',
  handoff: 'lit-handoff',
  init: 'lit-init',
  debug: 'debugging',
  interview: 'deep-interview',
  crucible: 'lit-crucible',
  commit: 'lit-commit',
  refactor: 'refactor',
  burnoff: 'lit-burnoff',
  'burnoff-file': 'lit-burnoff-file',
  brainstorm: 'lit-brainstorm',
  brainstorming: 'lit-brainstorm',
  ideation: 'lit-brainstorm',
  ideate: 'lit-brainstorm',
  idea: 'lit-brainstorm',
  ideas: 'lit-brainstorm',
  team: 'lit-team',
  conference: 'autoconference',
  rules: 'rules',
  lsp: 'lsp',
  diagnostics: 'lsp',
  'lsp-setup': 'lsp-setup',
  motion: 'lit-typographic-motion',
  film: 'lit-typographic-motion',
  video: 'lit-typographic-motion',
  '영상': 'lit-typographic-motion',
  explain: 'lit-comprehend',
  humanize: 'lit-humanizer',
  korean: 'lit-humanizer',
  '다듬어': 'lit-humanizer',
  '윤문': 'lit-humanizer',
};

const SKILL_IDS = new Set(SKILL_ROUTES.map((r) => r.id));

// `lit <task>` whose task asks to make a film goes to the motion skill: a film compound alone, or a bare video noun
// with a making verb. Editing or captioning footage, a video inside a page or deck, a thumbnail, a script, UI motion
// and video as a software feature stay where they were.
const FILM_COMPOUND = /모션\s?그래픽|타이포\s?모션|키네틱\s?타이포|가사\s?영상|오프닝\s?타이틀|타이틀\s?시퀀스|motion[- ]graphics?\b|kinetic[- ]typ(?:e|ography)\b|lyric video|title sequence|opening titles?\b|(?:motion|readme)[- ]cover|cover loop|커버\s?루프|모션\s?커버/i;
const VIDEO_NOUN = /영상|비디오|\bvideos?\b|\bclips?\b/i;
const MAKE_VERB = /만들|제작|뽑아|렌더|\b(?:make|create|produce|render|build|animate)\b/i;
const NOT_A_FILM = /자막|잘라|편집|썸네일|대본|요약|업로드|배경\s?영상|넣어|호버|안건|\b(?:trim|cut|captions?|subtitles?|embed|insert|thumbnail|script|summary|summari[sz]e|upload|background video|hover|motion tokens?|clip[- ]path|transcribe)\b/i;

export function motionIntent(task) {
  const text = String(task ?? '');
  if (NOT_A_FILM.test(text)) return false;
  return FILM_COMPOUND.test(text) || (VIDEO_NOUN.test(text) && MAKE_VERB.test(text));
}

// `lit new …` and `lit restart …` start over; `lit continue` and `lit resume` pick the work up where it stands.
const RESTART_WORDS = new Set(['new', 'restart']);
const CONTINUE_WORDS = new Set(['continue', 'resume']);
const SEPARATORS = /^[\s:,.!?]+/;
const firstWord = (s) => (/^([^\s:,.!?]+)/.exec(s)?.[1] ?? '').toLowerCase();

// Activation is case-sensitive on purpose: `lit` or `LIT` activates, a sentence-initial "Lit" stays prose.
// The result also says how the prompt re-enters: `bare` (no task text), `resume` (continue word) and `restart`.
export function detectRoute(prompt) {
  if (typeof prompt !== 'string') return null;
  return detectLeading(prompt) ?? detectTrailing(prompt);
}

// A standalone `lit` or `LIT` as the last word of the prompt ("Hello! lit") activates lit-loop with the earlier text as
// the task, as it does in the sibling products. Only a word of its own counts: a `lit` inside a word (literal, split),
// after a path or URL character (lit-plan.md, /x/lit/y), in quotes, in a code span or fence, or followed by more text
// does not.
const TRAILING_LIT = /(?:^|\s)(?:lit|LIT)\s*$/;
function detectTrailing(prompt) {
  const withoutFences = prompt.replace(/```[\s\S]*?```/g, ' ');
  if (withoutFences.includes('```')) return null;
  const text = withoutFences.replace(/`[^`\n]*`/g, ' ');
  if (!TRAILING_LIT.test(text)) return null;
  return { route: 'lit-loop', keyword: null, bare: false, resume: false, restart: false, trailing: true };
}

function detectLeading(prompt) {
  let text = prompt.trimStart();
  if (text.startsWith('```')) return null;
  // `/lit <route> <task>` arrives as typed in headless runs; the expanded /lit template starts with a marker line.
  const slash = /^\/(?:litmuse:)?lit(?=$|\s)/.exec(text);
  const marker = slash ? null : /^LitMuse route request:/.exec(text);
  if (slash) text = `lit ${text.slice(slash[0].length).trimStart()}`;
  else if (marker) text = `lit ${text.slice(marker[0].length).split('\n')[0].trim()}`;
  const m = /^([A-Za-z][A-Za-z-]*)(?=$|[\s:,.!?])/.exec(text);
  if (!m) return null;
  const token = m[1];
  const lower = token.toLowerCase();
  if (token !== lower && token !== token.toUpperCase()) return null;
  if (lower === 'lit') {
    let rest = text.slice(token.length).replace(SEPARATORS, '');
    let word = firstWord(rest);
    const restart = RESTART_WORDS.has(word);
    if (restart) {
      rest = rest.slice(word.length).replace(SEPARATORS, '');
      word = firstWord(rest);
    }
    const resume = !restart && CONTINUE_WORDS.has(word);
    const bare = !restart && (word === '' || (resume && rest.slice(word.length).trim() === ''));
    const route = KEYWORD_ROUTES[word];
    if (!route && !bare && !resume && motionIntent(rest)) return { route: 'lit-typographic-motion', keyword: null, bare, resume, restart };
    return { route: route ?? 'lit-loop', keyword: route ? word : null, bare, resume, restart };
  }
  if (lower.startsWith('lit') && SKILL_IDS.has(lower)) return { route: lower, keyword: null, bare: false, resume: false, restart: false };
  return null;
}
