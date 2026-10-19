# Behavior-preserving cleanup

The goal is a smaller, clearer implementation with the same authorized behavior. "Looks generated" is not
evidence. Every removal needs an existence proof, a behavior pin and a post-change falsification attempt. This file
backs `lit-burnoff` (whole scope) and `lit-burnoff-file` (one file).

## Scope and baseline

Resolve the comparison base the user named. If none was named, identify the branch point or the changed-file set and
state the assumption before editing. Record dirty paths (`git status --short`) so unrelated user work is not swept
into the cleanup.

For every candidate capture at least one existence signal:

- the exact diff hunk or symbol;
- a structural or text search result;
- a reference or call-site result;
- a diagnostic from the repository's configured tool;
- a runtime or test observation;
- a generated-file manifest or reflection registry entry.

Classify the candidate as comment noise, redundant defense, accidental complexity, needless abstraction, boundary
leakage, dead code, duplication, hidden cost, missing behavior coverage, or oversized responsibility. If it fits no
category, leave it alone.

## Pin behavior before edits

Choose the narrowest proof that would fail if the candidate's required behavior changed:

- an existing focused test;
- a new characterization test, when the task permits tests;
- a type or lint assertion for a static contract;
- a CLI invocation with success and failure inputs;
- an HTTP, browser or desktop scenario for a user-facing path;
- a reproducible output snapshot or a parsed artifact for generated data.

Run the pin on the unchanged code and keep its decisive observable. A test added after the cleanup does not prove the
old behavior. A mock-call assertion that mirrors implementation structure is weaker than a public result. If behavior
cannot be pinned, mark the candidate `needs-context` and do not remove it.

## Removal rules

- **Comments.** Remove obvious comments only after confirming they are not tooling markers. Preserve explanations of
  intent, external contracts, security boundaries, compatibility constraints and surprising algorithms.
- **Defensive code.** Reduce it only when the guarantee is real and enforced at a closer boundary. Preserve validation
  for user input, network responses, persistence, filesystem operations, process output and other uncertain systems.
- **Complexity.** Flatten with guard clauses, clearer names or data-driven dispatch only when evaluation order and
  error behavior stay the same. Do not "simplify" concurrency, retry, transaction or cleanup semantics without a
  direct runtime proof.
- **Wrappers.** Inline only when they add no policy, isolation, instrumentation, compatibility or test seam. Preserve
  architecture boundaries even when a direct call is shorter.
- **Deletion.** Delete only after checking static references, dynamic registration, string lookup, reflection,
  configuration, package exports, command routing and generated manifests that apply. Absence from a text search is
  not enough for dynamically discovered code.
- **Duplication.** Deduplicate only when the repeated blocks represent the same concept and should evolve together.
  Incidental similarity is not a shared abstraction.
- **Performance.** Apply only when equivalence is straightforward and observable. Avoid micro-optimizations without a
  benchmark, and avoid changing ordering, laziness, exception timing, numeric precision or allocation lifetime.
- **Oversized files.** Split by responsibility, not by arbitrary line ranges. Name modules after owned concepts,
  preserve public exports deliberately, and run import and package-surface probes afterwards.

## Bounded execution

Work in small groups that share one verification command. After each group:

1. inspect the diff for scope creep;
2. rerun the behavior pin;
3. run changed-file diagnostics (the repo's typecheck and lint);
4. search for dangling imports, routes, exports, docs and configuration;
5. keep the group only if every decisive observable is still correct.

If verification fails, diagnose the smallest cause. Revert only the cleanup group you own, or edit it forward with a
proven fix. Never discard unrelated work to get back to green.

## Falsification pass

Try to disprove the cleanup:

- exercise empty, malformed, boundary and repeated inputs where they apply;
- bypass caches or regenerate artifacts to rule out stale success;
- inspect the actual output or state, not only a successful summary line;
- run one clean process when behavior can depend on module cache or environment;
- check packaging or installation when a removed file could still be listed in a manifest;
- verify that the dirty worktree contains only the intended cleanup plus the pre-existing work.

A critical review asks what information the removed code or prose carried and where it lives now. If the answer is
"nowhere", the removal is suspect.

## Completion receipt

Report the candidates inspected, categories changed, skipped candidates with reasons, baseline pins, exact
verification commands, the real-surface probe, the final diff scope and the cleanup. State whether any tests, public
APIs, generated artifacts, packages, versions, commits or remote refs changed. Do not claim that all residue is gone
outside the bounded scope.
