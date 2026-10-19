# Scoring rubric

Score only after the user confirmed criteria and weights. Scale 1 to 5 for every criterion, where 5 is best for the user. Note the evidence beside each score.

## Default criteria

| Criterion | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Impact | barely moves the goal | a visible gain for some | transforms the goal for most |
| Effort (low is good, so invert) | months, many people | weeks, a small team | hours or days, one person |
| Risk | likely to fail or harm | known risks with mitigations | well understood, little downside |
| Reversibility | permanent or costly to undo | undoable with real work | undoable cheaply and quickly |
| Time to first value | after the whole build | after a major milestone | in the first step |
| Fit with constraints | breaks one soft constraint | meets all with trade-offs | meets all with margin |
| Novelty | already common | a fresh angle on a known path | not seen before in this context |

## Weights

Must-have gate (pass or fail), high 3, normal 2, low 1. The weighted total is the sum of weight x score, divided by the sum of weights times five, shown as a percentage. Show the unweighted average next to it. If the ranking differs between the two, report the flip.

## Evidence notes

Each score gets one of: `data` (a measured number or source), `prior` (a cited prior case), `repo` (read from the code), `judgement` (the model's or the user's estimate). A shortlist entry resting only on judgement is labelled so.

## Ties and close calls

Within 5 percentage points the order is not reliable. Break ties by: (1) higher reversibility, (2) faster time to first value, (3) the user's stated lean. Say that a tie-break was used.

## Provisional scores

Mark every score "provisional: criteria not confirmed" in headless runs or when the user did not answer. A provisional ranking never overrides the user's lean.
