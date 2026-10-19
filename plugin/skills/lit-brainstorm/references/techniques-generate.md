# Generative techniques

## SCAMPER

Seven mutation prompts for something that exists. One idea per prompt at minimum, three when the prompt fits well.

| Letter | Prompt | Example |
| --- | --- | --- |
| Substitute | What can be replaced (material, rule, person, step)? | replace nightly batch with on-change trigger |
| Combine | What can be merged with another thing? | merge the report and the alert |
| Adapt | What else is like this? What can be borrowed? | borrow queue discipline from a kitchen |
| Modify (magnify, minify) | What if it were 10x bigger or 10x smaller, more or less frequent? | do it once a year instead of daily |
| Put to other use | Who else could use it? | give it to support, not engineering |
| Eliminate | What can be removed entirely? | drop the approval step |
| Reverse (rearrange) | What if the order or the roles flip? | user writes the check, system writes the feature |

Label as `[SCAMPER:substitute]` and so on.

## Analogy

1. State the shape of the problem abstractly: "many small requests compete for a scarce slot".
2. Name three to five fields that share the shape (airport gates, restaurant seating, TCP congestion, ant foraging).
3. For each field, write the mechanism it uses and transplant it into the frame as an idea.
4. Keep the source in the label: `[analogy:airport-gates]`.

## Constraint flips

Change one constraint to an extreme and solve again:
- Budget 0, budget 100x.
- Time one day, time one year.
- Team of one, team of fifty.
- Must work offline, must work for a million users.
- Must be invisible to the user, must be the whole product.

The extreme solutions often contain a portable piece. Extract it as a separate idea.

## Worst-idea inversion

1. Write the worst ideas: the most harmful, expensive, annoying or embarrassing ways to handle the problem. Aim for 8 to 10, and make them vivid.
2. Invert each: what is the opposite, or what part of it is secretly good?
3. Add the inversions as ideas `[worst:inverted]`. Keep the original bad ideas on the board in a collapsed list so the reasoning is visible.

## Random stimulus

Pick a random concrete noun from outside the domain (use a fixed list, not the model's favourite: lighthouse, ledger, hinge, tide, orchestra, spice rack, bridge, compass). Force three connections between the noun and the problem. Keep any that produce a real mechanism. Do not score these on plausibility during the round.

## Crazy eights

Eight ideas in eight short bursts, one line each, each deliberately different from the previous. For Quick shapes, run two sets of eight with different frames.
