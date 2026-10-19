# LitMuse Korean style patterns

Notes for spotting Korean prose that reads as assembled instead of written. A pattern is a question, never a verdict: mark it only when it weakens clarity, texture or trust. The `litmuse/korean-style-analyzer` lane reads this file first; the full catalog is in `ko-patterns.md` and its A-D / E-J shards.

## First reading

Read once for intent before touching style.

- Identify the audience, situation and expected register.
- Mark claims with factual weight: dates, quantities, causes, comparisons, names, cited material.
- Separate meaning problems from sound problems. A meaning problem needs a question or a conservative rewrite; a sound problem can usually be polished directly.
- Plain sentences that fit the context survive.

## Common surface patterns

These shapes matter when they repeat across a paragraph.

- **Long setup**: the sentence announces that a point matters before saying it.
- **Symmetric enumeration**: every paragraph walks "first, second, third" regardless of how much each idea weighs.
- **Abstract noun stacking**: action hides behind `가능성`, `측면`, `부분`, `과정`, `방향` where a concrete verb would do.
- **Softened conclusions**: every claim ends in `볼 수 있습니다` or `의미가 있습니다`.
- **Repeated courtesy endings**: grammatical, yet identical closings make the text feel stamped.
- **Translation order**: modifiers pile up before the noun, or cause and result sit in an order Korean readers do not expect.
- **Empty bridging**: `또한`, `따라서`, `이러한` with no logical step behind them.
- **Inflated scope**: one narrow observation becomes `모든`, `항상`, `전반적으로`, `근본적으로`.
- **Generic benefit language**: effective, efficient, innovative, meaningful, valuable, with no visible effect named.
- **False neutrality**: promotional or emotional content dressed in bland analysis language instead of being made precise.

## Korean texture checks

- **Topic flow**: the topic must stay recoverable. If every sentence restarts with a broad noun phrase, merge sentences or use a lighter subject.
- **Verb energy**: prefer verbs that show the action. `검토가 이루어졌다` becomes an actor and an action when the actor is known.
- **Ending variety**: vary endings where the writing explains, and choose each ending to match how the sentences relate. Variety for decoration is a defect.
- **Particle fit**: odd particles expose translation residue. Check `은/는`, `이/가`, `을/를`, `에/에서`, `으로` against the relation they express.
- **Honorific consistency**: hold the requested politeness level; never slide from report register to casual speech unless asked.
- **Term density**: technical terms are fine when they work. Thin repeated labels with a pronoun, an omission or an example when that reads better.

## Signals to leave the text alone

- The sentences already sound like a person in the requested setting.
- The repetition is deliberate (legal, safety, teaching, ritual emphasis).
- A quotation, citation title, product name, policy phrase or user-specified wording would be bent by polishing.
- The only complaint is personal taste, not readability, accuracy or tone fit.
- The passage is short and clear, and rewriting would swap the writer's voice for the editor's.

## Annotation labels

When annotating a draft, use these plain labels:

- `meaning-risk`: a possible change to facts, claims, scope or attribution.
- `sound-risk`: unnatural rhythm, repeated ending, empty connector or translation order.
- `tone-risk`: register, politeness, emphasis or emotional temperature does not match the request.
- `no-op`: natural enough; say why and do not edit.
