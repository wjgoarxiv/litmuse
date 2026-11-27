// Suggestions for a prompt without `lit`: gated rules offer the skills that may fit plus "none", and the model
// decides. A rule ships only after it passes the gate on the sealed held-out half of test/fixtures/routing-eval
// (recall >= 0.85, near-miss false positives <= 0.10); scripts/routing-eval.mjs scores it. Nothing loads by itself.

const KNOWLEDGE = /^\s*(?:what(?:'s| is| are| does)|explain|why (?:is|are|do|does)|how does|define|difference between|tell me about)\b|(?:뭐야|뭔가요|무엇인가요|설명해|란\s?무엇|차이(?:가|점)|알려\s?줘\s*$)/i;

// Each rule: every `all` pattern must match and no `none` pattern may. Korean stems are bare substrings.
export const SUGGEST_RULES = [
  {
    id: 'lit-scientific-visualization',
    all: [
      /\b(?:plot|plots|chart|charts|graph|graphs|histogram|scatter ?plot|heat ?map|box ?plot|bar chart|line chart|error bars?|figure)\b|그래프|플롯|차트|시각화|히스토그램|산점도|히트맵/i,
      /\b(?:plot|draw|make|create|render|visuali[sz]e|generate|produce|turn|show)\b|\.csv\b|\bcsv\b|\bdata(?:set)?\b|\bresults?\b|\bmeasurements?\b|그려|만들|시각화|보여|데이터|결과|측정/i,
    ],
    none: [/\b(?:dashboard|web ?page|website|landing|html|react|component|diagram|flowchart|architecture|sequence diagram)\b|다이어그램|도식|순서도|웹페이지|대시보드/i,
      /\bplot (?:twist|hole|line)s?\b|\b(?:story|novel|movie|film|book)\b|줄거리|스토리/i,
      /\b(?:graph ?ql|graph database|knowledge graph|dependency graph|call graph|graph algorithm|graph theory|shortest path)\b|\bchart (?:a|the|our) (?:course|path|roadmap)\b/i],
  },
  {
    id: 'lit-diagram-drawer',
    all: [
      /\b(?:diagram|flowchart|flow chart|sequence diagram|architecture (?:diagram|drawing|overview picture)|swimlane|timeline graphic|mind ?map|org chart|block diagram)\b|다이어그램|도식|개념도|개요도|순서도|흐름도|구성도|아키텍처\s?그림/i,
      /\b(?:draw|make|create|sketch|design|render|produce|build|generate|need|want)\b|그려|만들|작성|그림으로|필요/i,
    ],
    none: [/\b(?:p&id|pid diagram|piping and instrumentation|apparatus|isometric cutaway|process flow diagram|pfd)\b|계장도|공정도|장치도/i],
  },
  {
    id: 'lit-pptx',
    all: [
      /\b(?:slides?|slide deck|deck|presentation|pptx|power ?point|keynote)\b|발표\s?자료|슬라이드|피피티|\bppt\b/i,
      /\b(?:make|create|build|prepare|turn|draft|design|put together|generate|need)\b|만들|만들어|준비|작성|정리/i,
    ],
    none: [/\bpresentation (?:layer|logic|component)s?\b|\bdeck(?:ing)? (?:of cards|builder)\b|\bslide(?:r| out| in| animation)\b|\b(?:google slides api|reveal\.js plugin)\b/i],
  },
  {
    id: 'lit-docx',
    all: [
      /\b(?:docx|word (?:document|doc|file|report)|ms word|\.docx)\b|워드\s?(?:문서|파일)?|보고서|기획서|제안서|\bhwp\b/i,
      /\b(?:make|create|write|draft|build|produce|export|convert|turn|prepare|generate)\b|만들|작성|써\s?줘|정리|변환|뽑아/i,
    ],
    none: [/\bword (?:count|cloud|wrap|list|boundary|embedding|frequency)\b|\bin (?:a|one|other) word\b/i],
  },
  {
    id: 'debugging',
    all: [
      /\b(?:bug|bugs|failing|fails|failed|failure|error|errors|exception|crash(?:es|ed|ing)?|stack ?trace|traceback|segfault|hangs?|hanging|broken|regression|flaky)\b|에러|오류|버그|실패|안\s?돼|안\s?됨|멈춰|죽어|튕겨/i,
      /\b(?:fix|debug|why|investigate|figure out|track down|diagnose|repro(?:duce)?|keeps|after|since|when i)\b|고쳐|왜|원인|해결|디버그|나요|나는데|납니다/i,
    ],
    none: [/\b(?:add|write|implement|improve) (?:error|exception) handling\b|\berror (?:message|messages) (?:copy|text|wording)\b|\b(?:bug report template|bug bounty)\b|에러\s?처리\s?(?:추가|코드)/i],
  },
  {
    id: 'review-work',
    all: [
      /\b(?:review|audit|look over|check)\b|리뷰|검토/i,
      /\b(?:diff|pr|pull request|branch|patch|changes|changeset|commit|commits|merge request|mr)\b|변경(?:사항|점)?|브랜치|커밋|패치|\bPR\b/i,
    ],
    none: [/\b(?:literature|paper|book|movie|film|restaurant|product|performance) review\b|\breview (?:the |this )?(?:paper|literature|book|essay|article|manuscript)\b|\bcode review (?:checklist|guidelines|best practices)\b|논문\s?리뷰|문헌/i,
      /\b(?:write|draft|create|make|squash|amend|revert|cherry-pick|rebase)\b[^.?!]*\bcommit/i],
  },
  {
    id: 'lit-commit',
    all: [
      /\b(?:commit|commits|rebase|squash|fixup|cherry-pick|bisect|git blame|reflog|amend|interactive rebase|split (?:this|the) commit)\b|커밋|리베이스|스쿼시|체리픽/i,
      /^\s*(?:please\s+)?(?:commit|squash|rebase)\b|\b(?:make|create|write|split|squash|rebase|fix|find|which|who|when|undo|clean up|reword|stage|amend)\b|만들|나눠|정리|찾아|누가|언제|되돌|해\s?줘/i,
    ],
    none: [/\bcommit (?:to|ourselves|myself)\b|\bcommitted to\b|\bcommitment\b|\bcommit message (?:format|convention) (?:docs|documentation)\b/i,
      /\breview\b|리뷰|검토/i],
  },
];

// The compact line a plain prompt carries when no rule fires: about fifteen common skills, cheap on every turn.
export const CATALOG_SKILLS = ['lit-loop', 'lit-plan', 'start-work', 'deep-interview', 'lit-brainstorm', 'debugging', 'review-work',
  'lit-commit', 'litresearch', 'frontend-ui-ux', 'lit-docx', 'lit-pptx', 'lit-scientific-visualization', 'lit-diagram-drawer',
  'lit-humanizer'];

/** The user's own request: code fences, inline code and host notification blocks are stripped first. */
export function requestText(prompt) {
  return String(prompt ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<(system-reminder|task-notification|notification|system-notification)>[\s\S]*?<\/\1>/gi, ' ');
}

/** The ids of every rule a prompt fires, in table order. A knowledge question fires none. */
export function firedRules(prompt) {
  const text = requestText(prompt);
  if (!text.trim() || KNOWLEDGE.test(text)) return [];
  return SUGGEST_RULES.filter((r) => r.all.every((re) => re.test(text)) && !r.none.some((re) => re.test(text))).map((r) => r.id);
}

export function catalogLine() {
  return `LitMuse skills, if one fits (read_skill \`plugin:litmuse:<id>\`; none is fine): ${CATALOG_SKILLS.join(', ')}.`;
}

/** A slash command anywhere in the prompt is the user's own route: no suggestion rides on it. */
export const hasSlash = (prompt) => /(?:^|\s)\/[A-Za-z][\w:-]*(?=\s|$)/.test(requestText(prompt));

/** The context a plain prompt gets: the fired rules with their route lines and "none", else the catalog line. */
export function suggestionNote(prompt, routes) {
  const fired = firedRules(prompt);
  if (!fired.length) return catalogLine();
  const when = new Map(routes.map((r) => [r.id, r.when]));
  return [
    'LitMuse suggestion, not an instruction: this prompt may fit',
    ...fired.map((id) => `- ${id}: ${when.get(id) ?? ''}`),
    '- none of these',
    'Decide yes or no for each from the request itself. Load only the ones that fit with read_skill `plugin:litmuse:<id>`; otherwise carry on without one.',
  ].join('\n');
}
