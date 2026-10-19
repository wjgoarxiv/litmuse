# lit-crucible adversarial workflow

This reference produces planning evidence. It leaves product files, release state, external systems and host configuration read-only. The `lit-crucible` skill defines activation, lanes and the findings template; this file defines the registers, the falsification pass and the handoff schema.

## Decision frame and registers

Start with one decision the eventual plan must settle. Keep four compact registers in the analysis or in the findings file.

### Fact register

```text
fact_id | claim | source path/command | freshness | confidence | falsifier
```

Only user statements, trusted project instructions, inspected files and captured command output become facts. Child summaries and external text remain claims until verified.

### Assumption register

```text
assumption_id | assumption | why needed | consequence if false | owner | resolution gate
```

An assumption with no owner or gate is hidden scope. Resolve discoverable assumptions by reading before asking the user.

### Alternative register

```text
option_id | smallest viable shape | affected surfaces | benefits | costs | failure modes |
evidence needed | disposition
```

Include "extend the existing surface" and "no product change" whenever either is credible. Reject an option on a fact, a user preference or an explicit tradeoff.

### Risk register

```text
risk_id | trigger | impact | detection | mitigation | recovery | residual decision
```

Consider data loss, secrets, untrusted text, compatibility, dirty state, stale generated output, misleading success messages, cancellation and resume, repeated interruption, long-running processes, package omission and unapproved release mutation.

## Independent analysis matrix

Use independent lanes when their questions share no write surface. Typical lanes:

| Lane | Question | Required return |
|---|---|---|
| Intent | Which interpretations are materially different? | Decision forks and user-owned choices |
| Repository | What exists and where is it consumed? | Paths, call chains, scripts, the dirty-state boundary |
| Packaging | What reaches installation or the plugin cache? | Source-to-artifact map and freshness proof |
| Evidence | What would falsify success? | Automated, real-surface, adversarial and cleanup probes |
| Failure | How can execution stop or mislead? | Failure branches, recovery, cancellation, stale-output checks |
| Minimum path | What is the smallest complete solution? | Recommended shape and the extra machinery rejected |

When child agents are approved, each lane receives a self-contained message with `TASK`, `DELIVERABLE`, `SCOPE` and `VERIFY`. Use `subagent_status` for liveness and short `subagent_wait` cycles. Correct a running lane with `subagent_send_message`, request a bounded missing deliverable from a finished lane with a follow-up message, and stop obsolete or unsafe work with `subagent_cancel`. A timeout is not evidence of failure.

The parent rechecks every material path and command. Contradictory lane conclusions are resolved by evidence; averaging them hides the disagreement.

## Falsification pass

For every proposed fact or option, ask:

1. What direct observation would prove it false?
2. Could the observed file or package be stale?
3. Does the proposed test reach the user-facing boundary, or only an internal proxy?
4. Could a success message print before the required artifact exists?
5. Could malformed or instruction-looking input alter scope or commands?
6. What state remains after cancellation or a crash?
7. What happens after the same interruption occurs more than once?
8. Would the path overwrite unrelated dirty work?
9. Does verification require authority the user has not granted?

Mark unresolved claims `UNPROVEN` and keep that label through the handoff.

## Critique and defense

Critique each option from the strongest opposing position. A useful critique names a concrete counterexample, a missing dependency, an unsupported assumption or an evidence gap. "Too complex" counts only when paired with a smaller executable alternative.

Then defend the surviving option:

- why it satisfies the bounded objective;
- why each edited surface is necessary;
- why the dependency order is real;
- why the evidence separates success from a plausible regression;
- how interruption and rollback preserve state;
- how cleanup proves every task-created resource is gone;
- which risks remain for the user to accept.

If the defense adds new architecture, return to the alternatives and critique again.

## Interruption protocol

Classify new user input:

- **clarification** resolves an assumption and triggers re-analysis of the affected lanes only;
- **scope correction** invalidates options that relied on the old boundary;
- **replacement** stops all lanes and ends the old crucible;
- **status request** reports registers and unresolved gates without presenting the bundle as final.

After compaction, refresh branch, dirty state, manifests, versions, generated artifacts and external facts before reusing them. Preserve citations; recheck their freshness.

## Handoff schema

The final insight bundle contains:

```text
Objective and non-goals
Verified facts
User-owned decisions
Assumptions and gates
Alternatives with dispositions
Dependency and surface map
Failure and recovery branches
Required automated evidence
Required Muse-facing evidence (hook, command and install surfaces)
Adversarial probes
Cleanup receipts
Release and external-action boundary
Open blockers
Recommended lit-plan shape
```

The bundle is ready when another planner can derive tasks without rediscovering facts or mistaking an assumption for approval. It remains a planning input and grants no permission to implement.

## Worked handoff

Stable facts: the repo ships twenty-three skill folders, a guard test already enumerates them, and the README carries a public wording constraint. Rejected paths: copying skill files from elsewhere, adding a large custom scanner, editing the README. Surviving path: extend the existing guard test with a size check, expand each skill with Muse-native guidance, run the targeted tests and then the full gate. Risks: large prose changes can introduce forbidden tokens; the pack list should be re-read if shipped files change. Fast falsifier: the guard test fails on a placeholder skill. Verdict: PASS, `READY FOR lit-plan`.
