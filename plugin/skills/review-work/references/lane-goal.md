# Lane 1: goal

Question: did the change achieve what was asked, inside the rules it was given, and nothing else?

Agent: `litmuse/lit-verifier` (tools `read_file`, `search`). It judges from files on disk, so the parent has saved
`files.txt`, `diff.patch`, `context.txt` and the full text of each changed file beforehand.

## What the lane reads

The goal and constraints from `context.txt`, the plan rows and Must have / Must not have lists, the goal record
`.litmuse/goals/<slug>.json`, the changed files in full (a hunk alone hides the surrounding code), the real
changed-file list from `git diff --name-only`, and the evidence paths the author reported.

## Checklist

1. **Goal completeness.** Split the goal into every sub-requirement, explicit and implied. Mark each ACHIEVED,
   PARTIAL or MISSED with a path, a symbol or a command. An implied requirement that a reasonable engineer would
   have addressed and the diff skips is PARTIAL at best.
2. **Constraint compliance.** List every constraint: stack limits, API contracts, compatibility, performance
   targets, ask-before-push and publish boundaries, protected files. Verify each with specific evidence. One
   violated constraint fails the lane.
3. **Requirement gaps.** Behavior the user clearly wanted but did not spell out, implied by the goal or
   background.
4. **Extras and scope creep.** Hunks that trace to no requirement: unrelated cleanup, broad formatting, new
   abstractions, speculative options, metadata churn, generated files nobody asked for, deleted code with live
   callers, ignored working folders committed.
5. **Minimum-first fit.** Could the change have been skipped, reused existing code, used the standard library, a
   native platform feature, an installed dependency or one clear line? A larger path is a MAJOR finding unless the
   diff explains why it was necessary.
6. **Release and approval boundaries.** No version bump, tag, publish, push or commit unless the request approved
   it. When a version field moved, the lockstep check must exist and pass.
7. **Edge cases.** Trace at least five inputs or states that would break the implementation, chosen from the goal
   and not from a generic list.
8. **Behavioral walk-through.** Follow the code for three representative scenarios end to end and state what each
   produces.
9. **Clean-room and provenance.** When the request names a wording or identity rule (no foreign product names, no
   source-trace markers, no copied prose), scan the added lines for it.
10. **Self-report versus reality.** Compare the author's list of changed files and claimed behavior with the diff.
    A claim without a hunk behind it is unproven.

## Pass criteria

- Every sub-requirement is ACHIEVED with evidence, or PARTIAL with a NOTE the user accepted.
- Every constraint holds.
- Every hunk traces to a requirement; extras are zero or justified.
- Release and approval boundaries stayed where the request put them.

## Fail criteria

- A requirement is MISSED, or a constraint is violated.
- The diff includes unrelated edits, a hidden version bump or an unapproved release action.
- A claimed behavior has no implementation path.
- The author's changed-file list disagrees with the real diff.

## Return shape

```text
verdict: PASS | FAIL | BLOCKED
confidence: HIGH | MEDIUM | LOW
summary: ...
goal_breakdown:
  - [ACHIEVED|PARTIAL|MISSED] requirement - evidence path:line
constraint_compliance:
  - [OK|VIOLATED] constraint - evidence
findings:
  - [BLOCKER|MAJOR|MINOR|NOTE] category - path:line - expected vs actual - fix direction
blocking_issues: BLOCKER and MAJOR items only
```

BLOCKED applies when the diff, goal or constraints are missing from the packet, or when the files named in
`files.txt` cannot be read. Name what is missing.

## Sample brief

```text
TASK: Review lane 1 (goal). Decide whether the diff achieves the goal inside its constraints.
GOAL: add the --json flag to `tool status`.
CONSTRAINTS: no new dependency; exit codes unchanged; no version bump.
SCOPE: read-only. Files: .litmuse/evidence/<slug>/review/{context.txt,files.txt,diff.patch} and the changed files.
VERIFY: cite path:line for every finding; list each sub-requirement and constraint.
STOP WHEN: the return shape is complete.
```
