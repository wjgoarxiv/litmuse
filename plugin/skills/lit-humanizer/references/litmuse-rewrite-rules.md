# LitMuse Korean rewrite rules

A restrained rewrite is the goal. Every sentence does not need to become stylish; the passage needs to sound like careful Korean written for this situation, with the original meaning intact. The `litmuse/korean-prose-editor` lane works from these rules.

## Order of work

1. Lock meaning first. Facts, numbers, names, claims, citations, quotes and the requested tone are constraints, not material.
2. Repair unclear logic before touching rhythm.
3. Swap generic wording for concrete wording only when the source already supports the concrete version.
4. Cut accidental repetition.
5. Stop once the passage is natural enough for its context.

## Meaning-safe editing

- Keep numbers, units, dates, ranges, percentages, grades, model names, organization names and person names unchanged unless the user asks for a correction.
- Do not promote a possibility to a fact, a correlation to a cause, or a limited result to a universal claim.
- Keep evidential hedges such as `가능성이 있다`, `추정된다`, `일부`, `대체로`, `현재로서는`.
- Citations, footnote markers, document titles, quoted strings and bracketed references stay where they are.
- An ambiguous sentence gets clarified without inventing the missing information.
- A tone the user required counts as part of the meaning.

## Sentence moves

- Turn passive or noun-heavy phrasing into a direct predicate when the actor is known.
- Split a sentence that carries two claims, or a claim plus a caveat.
- Merge short sentences that only restate the topic.
- Bring the point forward when setup language hides it.
- Replace a filler opening with the real subject or action.
- Keep a connector only when it names a real relation: addition, contrast, cause, condition, sequence, summary.
- Choose word order that lets the reader reach the predicate without holding many modifiers in mind.

## Paragraph moves

- One job per paragraph: context, claim, evidence, implication, limitation or next step.
- Put the strongest sentence where it steers the rest.
- Drop framing that the previous paragraph already set up.
- Keep lists parallel only when the items are really comparable.
- A warning or limit stays visible; do not smooth it into the surrounding prose.

## Tone controls

| Genre | Target |
|---|---|
| Formal report | Concise, evidence-aware, low drama, stable endings |
| Work email | Clear action, respectful phrasing, no inflated praise |
| Academic or technical note | Terms intact, hedges only where evidence needs them, no promotional adjectives |
| Public explanation | Shorter sentences, concrete nouns, gentle transitions |
| Personal voice | Idiosyncratic but clear phrasing kept; do not over-standardize |

## Common machine-prose habits

- A repeated `중요합니다` becomes the reason it matters.
- A repeated `도움이 됩니다` becomes the actual benefit or action.
- A vague `부분` becomes the named object, step, issue or condition.
- `다양한` stays only if the source names the variety; otherwise drop it.
- `효율적` needs time, cost, effort, accuracy or reliability behind it.
- `전반적으로` stays only for a real whole-picture summary.
- `따라서` stays only when the previous sentence proves the next.

## No-op and minimal edit

Choose no change, or a minimal one, when a rewrite would only shift taste.

- If the text is already natural, say so and return it unchanged or lightly corrected.
- If one sentence is awkward, edit that sentence and leave the rest.
- If the user wants strict preservation, make smaller changes and note what was left alone.
- If a quote, citation, legal phrase or named label sounds awkward but must stay exact, leave it and polish around it.

## Output

For each completed pass, return the revised Korean text; a short account of what changed; fidelity notes on preserved facts, names, numbers, citations, quotes and tone when they matter; and open questions only when the text cannot be improved safely without the user.
