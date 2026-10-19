# Source and claim verdict checklist

Use this page while filling `evidence-graph.md`, `claim-graph.md` and the sources section of `SYNTHESIS.md`. The tier
table and the verdict values live in `SKILL.md`; this page is the per-claim checklist.

## Per source-claim pair

1. Write the exact proposition the source must support: actor, action, object, conditions, magnitude, unit, time.
2. Open the source and find the passage. A snippet, status code, filename, MIME header, worker summary or generated
   abstract is a lead, not proof.
3. Assign the tier (T1 primary-direct or primary-measured, T2 official-derived or implementation-current, T3
   secondary-independent, T4 secondary-repeating or implementation-historical) and any flag (conflicting, partial,
   stale, inaccessible, unsupported).
4. Record the date the source describes and the date you retrieved it. Record the version or commit.
5. Trace independence upstream: quotations, figures, press releases, dataset ids. Count evidence chains, not domains.
6. Note whether full content or only metadata was available, and any access boundary hit.
7. Write the consequence for the answer: supports, narrows, contradicts, or leaves a gap.

## Verdict receipt (one line per load-bearing claim)

```text
claim_id | verdict (VERIFIED|CONTESTED|UNSUPPORTED|OUTDATED|BLOCKED) | source_id | inspected (date) | location (section, path:line) | independence chain | temporal boundary | consequence
```

## Gate for high-risk non-code claims

Clears only with: 2 independent source domains, 2 independent observation groups (or a recorded primary-only
exception), one counter-search that found nothing stronger, a primary source, and explicit `observed_at` plus
`valid_at` or `claim_valid_at`. Otherwise the claim goes to the Unresolved or Refuted annex.

## Conflict preference when the tier table does not decide

- legal or policy question: the controlling text;
- software behavior: the current implementation, observed by a probe;
- reported scientific result: the original measurement and its method.

Name the one observation or source that could decide, and keep both sides visible until it is found.
