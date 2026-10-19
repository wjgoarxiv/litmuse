# LitMuse fidelity checklist

Run this list before and after every rewrite. A smoother sentence that changes what the writer meant is a defect, however good it sounds. The same list backs the `litmuse/meaning-preservation-auditor` lane of the Korean deep sequence.

## Before editing

- Write down the tone, audience and destination the user asked for. If the destination is a file type with its own conventions (README, commit body, slide), note it.
- Mark every unit that must survive byte for byte: numbers, dates, names, titles, citations, quoted text, formulas, product labels, policy wording.
- Grade each claim by strength: fact, interpretation, possibility, recommendation, warning, preference, speculation. The grade travels with the claim.
- Mark dependencies between sentences: cause, contrast, condition, exception, sequence, comparison.
- Decide the depth of change: rewrite, light correction, or leave mostly alone.

## Fact preservation

Compare each edited sentence with its original.

- Numbers and units are identical unless the user asked for a conversion or a correction.
- Names and titles keep spelling, spacing, capitalization and order.
- Dates, deadlines, versions and ranges keep the same scope.
- Citations, footnotes, reference markers and source labels stay attached to the claim they supported.
- Quoted text is untouched unless the user explicitly asks for a paraphrase.
- An example stays an example; it must not read as evidence for a broader claim.

## Claim strength

The force of a sentence is part of its meaning.

- "may" stays "may", never "does".
- "some" stays "some", never "all".
- "can help" never becomes "solves".
- "observed in this case" never becomes "generally true".
- "recommended" never becomes "required".
- "concern" never becomes "confirmed problem".
- "not shown" never becomes "false".

## Tone and register

- Keep the requested politeness level and the speech level the draft already uses.
- Keep the stance the writer chose: neutral, warm, firm, cautious, persuasive, apologetic, critical.
- Remove inflated grandness only when it is not part of the voice the writer wants.
- A careful warning must not turn casual; a personal note must not turn into a corporate notice.
- Add no praise, blame, urgency or certainty the original lacked.

## Korean naturalness pass

After the meaning pass, read the revision as Korean, sentence by sentence.

- The main predicate arrives without the reader carrying a long run of modifiers.
- Particles match the relation between the words they join.
- Endings are consistent without repeating mechanically.
- Each connector names a real logical step.
- Paragraphs move from known context to new information instead of restarting at every sentence.
- Technical terms stay stable; repeated terms thin out only when the reference stays clear.

## Low-change decision

Prefer a low-change result when any of these holds.

- The original already reads naturally in its context.
- The passage is a quotation, policy line, citation, form field or regulated wording.
- The user asked for proofreading, not rewriting.
- The text is dense with facts, so every style edit adds risk.
- The voice depends on the writer's own phrasing.

Say in one short line why nothing or little changed. Leaving good writing alone needs no apology.

## Final gate

Answer each question before returning the text.

- Did any fact, number, name, citation, quote or claim move or change?
- Did any hedge, limit, exception or uncertainty marker disappear?
- Does the tone still match the instruction?
- Is every added word supported by the source or by an explicit user instruction?
- Would a reader take away the same obligations, risks and conclusions?
- If the safest answer is no edit, is that stated plainly?

If one answer shows risk, redo that sentence with a smaller change, or ask the user.
