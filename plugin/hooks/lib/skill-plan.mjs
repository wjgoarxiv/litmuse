// The skill plan of a `lit <task>` prompt. The route cascade in routes.mjs still picks ONE primary skill, first match
// wins; this module lists the other content skills the same task matched, in the cascade's order, without repeats and
// at most three in all, and adds lit-crucible when the task is a large or risky design ask. The model confirms or drops
// each companion and states the final plan before it works. `lit +viz +ui <task>` names the plan outright.
//
// A moved skill (one of the nine whose bodies live in wjgoarxiv-skills) is offered by its own id only when its Muse
// edition is installed as a user skill; otherwise the plan names it once with its install line. A read-only primary
// never gains a companion that can write. Pure apart from `installedCopy`, which checks Muse's user skills folder.
import { MOVED, movedSkill, installedCopy, installLine } from './moved.mjs';

export const PLAN_CAP = 3;

// `lit +<alias>` words: short names a user can type without looking anything up.
export const SKILL_ALIASES = Object.freeze({
  viz: 'lit-scientific-visualization',
  plot: 'lit-scientific-visualization',
  figure: 'lit-scientific-visualization',
  ui: 'frontend-ui-ux',
  design: 'frontend-ui-ux',
  qa: 'visual-qa',
  crucible: 'lit-crucible',
  plan: 'lit-plan',
  research: 'litresearch',
  review: 'review-work',
  debug: 'debugging',
  deck: 'lit-pptx',
  slides: 'lit-pptx',
  doc: 'lit-docx',
  docx: 'lit-docx',
  diagram: 'lit-diagram-drawer',
  schematic: 'lit-schematic',
  motion: 'lit-typographic-motion',
  video: 'lit-typographic-motion',
  readme: 'readme-studio',
  ast: 'structural-search',
  refactor: 'refactor',
  brainstorm: 'lit-brainstorm',
  ultra: 'ultra-brainstorm',
  humanize: 'lit-humanizer',
  commit: 'lit-commit',
  browser: 'browser-drive',
});

// Skills that only read. A plan led by one of these keeps only companions from this set.
export const READ_ONLY_SKILLS = Object.freeze(new Set(['lit-adhd', 'review-work', 'litresearch', 'lit-brainstorm', 'ultra-brainstorm', 'lit-crucible', 'lit-comprehend']));
const READ_ONLY_PRIMARIES = new Set(['lit-adhd', 'review-work', 'litresearch', 'lit-brainstorm', 'ultra-brainstorm', 'lit-comprehend', 'lit-handoff']);

// One "use when" line per skill the catalog may offer. A moved skill appears only when its copy is installed.
export const CATALOG = Object.freeze({
  'lit-plan': 'a decision-complete plan before code',
  'lit-crucible': 'pressure-test a large or risky design before planning',
  'lit-brainstorm': 'options for an open question, scored to a short list',
  'ultra-brainstorm': 'hundreds of cheap idea agents, then a judged top list',
  litresearch: 'prior work and primary sources, with references',
  'review-work': 'findings-first review of a diff or branch',
  debugging: 'reproduce, localize and fix a failure',
  refactor: 'behaviour-preserving restructure',
  'structural-search': 'syntax-shaped search or codemod',
  'lit-humanizer': 'rewrite prose in the writer\'s own voice',
  'lit-commit': 'commits and git history work',
  'browser-drive': 'act in a real browser page',
  'lit-pptx': 'a finished .pptx deck',
  'lit-docx': 'a finished .docx document',
  'lit-diagram-drawer': 'a conceptual diagram (architecture, flow, timeline)',
  'lit-schematic': 'a physical schematic (P&ID, PFD, apparatus, cutaway)',
  'lit-scientific-visualization': 'a publication figure of measured data',
  'frontend-ui-ux': 'build or restyle an interface',
  'visual-qa': 'check a built interface at several widths',
  'lit-typographic-motion': 'a short kinetic-type film or README cover loop',
  'readme-studio': 'a factual README with an inspected cover',
});

// `lit +viz +ui <task>`: the named skills in the user's order, the names nobody knows, and the prompt without them.
const HATCH = /^(\s*\/?(?:litmuse:)?lit)((?:\s+\+[A-Za-z][A-Za-z-]{0,30})+)(?=\s|$)/u;
export function parseSkillHatch(prompt) {
  const match = HATCH.exec(typeof prompt === 'string' ? prompt : '');
  if (!match) return null;
  const skills = [];
  const unknown = [];
  for (const token of match[2].trim().split(/\s+/u)) {
    const name = token.slice(1).toLowerCase();
    const id = SKILL_ALIASES[name] ?? (Object.hasOwn(CATALOG, name) ? name : null);
    if (!id) unknown.push(name);
    else if (!skills.includes(id)) skills.push(id);
  }
  return { skills: skills.slice(0, PLAN_CAP), extra: skills.slice(PLAN_CAP), unknown, rest: `${match[1]}${prompt.slice(match[0].length)}` };
}

// Companion-only detectors. Neither ever becomes the primary: a chart or diagram word alone must not pull loop work away.
const VIZ_NOUN = /\b(?:plots?(?!\s+plans?\b)|charts?|graphs?|figures?|histograms?|heat\s?maps?|scatter\s?plots?)\b|그래프|차트|플롯|히스토그램|산점도|시각화/iu;
const VIZ_CUE = /\b(?:data|dataset|csv|xlsx|measured|measurements?|results?|experiments?|publication|paper|journal|plot|visuali[sz]e)\b|데이터|측정|실험|결과|논문|저널/iu;
const DIAGRAM_NOUN = /\b(?:diagrams?|flow\s?charts?|sequence\s+diagrams?|architecture\s+(?:diagram|map)|system\s+map)\b|다이어그램|도식|흐름도|구성도|순서도/iu;
const DRAW_VERB = /\b(?:draw|sketch|make|create|build|render|design|add)\b|그려|그리|만들|작성|넣어/iu;
const RESEARCH_CUE = /\b(?:prior\s+art|prior\s+work|literature|survey|landscape|state\s+of\s+the\s+art|sources?)\b|선행\s?연구|문헌|조사해|리서치/iu;
const AST_CUE = /\b(?:ast-grep|codemod|syntax[- ]aware|structural\s+search)\b/iu;

// Large or risky design asks: lit-crucible joins as the first companion. A request to explain or describe stays out.
const RISKY_DESIGN = /\b(?:redesign(?:ing)?|re-?architect(?:ure|ing)?|architecture|migrat(?:e|ion|ing)|overhaul(?:ing)?)\b|설계|아키텍처|마이그레이션|전면\s?개편/iu;
const EXPLAIN = /\b(?:explain|describe|summari[sz]e|what\s+is)\b|설명|요약/iu;
const DELIVERABLES = new Set(['lit-pptx', 'lit-docx', 'frontend-ui-ux', 'lit-scientific-visualization', 'lit-diagram-drawer', 'lit-schematic', 'lit-typographic-motion', 'readme-studio']);

export function wantsCrucible(task, ids) {
  if (EXPLAIN.test(task)) return false;
  return RISKY_DESIGN.test(task) || ids.filter((id) => DELIVERABLES.has(id)).length >= 3;
}

// Quoted text, code spans and fences are material to work on, never a request: they match nothing.
export const inertless = (text) => String(text ?? '')
  .replace(/```[\s\S]*?(?:```|$)/gu, ' ')
  .replace(/`[^`\n]*`/gu, ' ')
  .replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]{3,}'/gu, ' ');

/**
 * Every content skill a task matches, in the cascade's order (schematic, deck, film, interface), then the companion-only
 * detectors. `intents` carries the route detectors from routes.mjs so the two files never disagree.
 */
export function matchedSkills(task, intents) {
  const text = inertless(task);
  const ids = [];
  if (intents.schematic(text)) ids.push('lit-schematic');
  if (intents.deck(text)) ids.push('lit-pptx');
  if (intents.motion(text)) ids.push('lit-typographic-motion');
  if (intents.ui(text)) ids.push('frontend-ui-ux');
  if (VIZ_NOUN.test(text) && VIZ_CUE.test(text)) ids.push('lit-scientific-visualization');
  if (DIAGRAM_NOUN.test(text) && DRAW_VERB.test(text)) ids.push('lit-diagram-drawer');
  if (RESEARCH_CUE.test(text)) ids.push('litresearch');
  if (AST_CUE.test(text)) ids.push('structural-search');
  return [...new Set(ids)];
}

/**
 * The ordered plan: the primary, then companions (or the forced list from `lit +…`). Returns null when the plan is the
 * primary alone, so an ordinary prompt's context stays exactly as it was.
 */
export function buildSkillPlan({ primary, companions = [], forced = null, task = '', env = process.env }) {
  if (typeof primary !== 'string' || !primary) return null;
  const readOnly = READ_ONLY_PRIMARIES.has(primary);
  const dropped = [];
  let picked = forced ? forced.skills.filter((id) => id !== primary) : companions.filter((id) => id !== primary);
  if (!forced && !readOnly && primary !== 'lit-crucible' && !picked.includes('lit-crucible') && wantsCrucible(inertless(task), [primary, ...picked])) picked.unshift('lit-crucible');
  picked = [...new Set(picked)].filter((id) => {
    if (readOnly && !READ_ONLY_SKILLS.has(id)) {
      dropped.push({ id, why: `${primary} is read-only` });
      return false;
    }
    return true;
  });
  const cap = forced ? PLAN_CAP : PLAN_CAP - 1;
  for (const id of picked.slice(cap)) dropped.push({ id, why: 'over the cap' });
  picked = picked.slice(0, cap);
  if (!picked.length && !forced) return null;
  const entries = [primary, ...picked].map((id) => {
    const moved = movedSkill(id);
    return { id, moved, installed: moved ? installedCopy(moved, env) : true };
  });
  return { entries, dropped, forced: Boolean(forced), unknown: forced?.unknown ?? [], readOnly };
}

function entryLabel(entry, named, first) {
  const lead = first ? ' (primary)' : '';
  if (!entry.moved || entry.installed) return `${entry.id}${lead}`;
  if (named.has(entry.moved.family)) return `${entry.id}${lead} (not installed)`;
  named.add(entry.moved.family);
  return `${entry.id}${lead} (not installed: ${installLine(entry.moved)})`;
}

/** `Skill plan: 1 lit-loop (primary) → 2 lit-scientific-visualization → 3 frontend-ui-ux`. */
export function skillPlanLine(plan) {
  const named = new Set();
  return `Skill plan: ${plan.entries.map((entry, index) => `${index + 1} ${entryLabel(entry, named, index === 0)}`).join(' → ')}`;
}

/** The skill ids of a plan, bare, for the stage record and the LIT card. */
export const skillPlanIds = (plan) => (plan ? plan.entries.map(({ id }) => id) : []);

function catalogLines(plan, env) {
  const inPlan = new Set(plan.entries.map(({ id }) => id));
  return Object.entries(CATALOG)
    .filter(([id]) => !inPlan.has(id))
    .filter(([id]) => !plan.readOnly || READ_ONLY_SKILLS.has(id))
    .filter(([id]) => !MOVED[id] || installedCopy(movedSkill(id), env))
    .map(([id, use]) => `${id} — ${use}`);
}

/** The model-facing block. Fixed text around the plan; nothing from the prompt is echoed. */
export function skillPlanContext(plan, env = process.env) {
  const lines = [skillPlanLine(plan)];
  if (plan.forced) {
    lines.push('The user named this plan with `lit +…`: keep it exactly, add nothing and drop nothing.');
    if (plan.unknown.length) lines.push(`Ignored unknown plan names: ${plan.unknown.map((name) => `+${name}`).join(' ')}.`);
  } else {
    lines.push('The companions after the primary are candidates the hook matched, not orders: confirm or drop each one for this request, and add at most one skill from the catalog below when the work clearly needs it.');
  }
  for (const { id, why } of plan.dropped) lines.push(`Left out: ${id} (${why}).`);
  lines.push('State the final plan on the line right after the LIT line, in the same `Skill plan: 1 … → 2 …` form. The primary loads now; load each companion with read_skill when its part of the work starts, never all up front: a LitMuse skill as `plugin:litmuse:<id>`, an installed extension by its bare id. A skill marked not installed is not loaded: give its install line once and carry on without it.');
  const catalog = plan.forced ? [] : catalogLines(plan, env);
  if (catalog.length) lines.push(`Catalog (installed here): ${catalog.join('; ')}.`);
  return `<litmuse-skill-plan>\n${lines.join('\n')}\n</litmuse-skill-plan>`;
}
