# Lane 5: context

Question: is there something the author should have known and did not?

Agent: `litmuse/qa-runner` for read-only shell commands (`git log`, `git blame`, `rg`, `gh` when allowed), or the
main session. The lane mines local sources first and reaches outside the repo only when the request depends on
current external state. It also owns documentation and readiness.

## Sources, in order

1. **Git history (always).**
   - `git log --oneline -20 -- <file>` for each changed file: recent changes and their reasons.
   - `git blame <file>` around critical hunks: who wrote what, and the commit message that explains why.
   - `git log --all --grep=<keyword>` with keywords from the goal: related commits, reverts, abandoned attempts.
   - TODO, FIXME and HACK comments and their history.
2. **Codebase cross-references (always).**
   - Files that import or reference the changed modules, commands or flags (`rg`).
   - Tests that need an update because behavior changed.
   - Docs (README, help text, changelog, route lists, listings) that describe the changed behavior.
   - Config files, manifests and installers that need a matching edit.
   - Related features in the same domain that should stay parallel in wording and behavior.
3. **Project records (always, locally).** Plans, handoffs, release checklists, ADRs, evidence directories, the
   ledger. A handoff is history until live repo state confirms it; paths and versions quoted there drift.
4. **External connectors (opt-in).** GitHub issues and pull request threads (`gh issue list --search`,
   `gh pr list --search ... --state all`, review comments on past pull requests touching these files), web
   search, team wikis. Use them when the request needs current external state or the project already approves a
   connector. Record what was queried and why, and mark skipped sources as skipped with the reason.

## What to look for

- Requirements in issues or pull requests that the implementation misses.
- Past decisions that explain why code looks the way it does, and whether the change respects those reasons.
- Related systems affected by the change.
- Warnings from earlier reviewers, inline notes and commit messages.
- Migration or deprecation notes that touch the changed code.
- Design decisions recorded outside the repo.
- A caller, doc or config that the change quietly broke.

## Readiness checks (docs and real surface)

- Every operational claim in a README or skill corresponds to a command, file or route that exists.
- A claimed route works: the command file, the hook route, the manifest entry and the listing agree.
- One live probe when relevant: a hook payload on stdin, a CLI call, a packed install, a manifest parse.
- Changelog and version notes match what changed, and no version moved without approval.
- Localized copies (for example Korean and English READMEs) agree on the changed facts.

## Staleness rule

Evidence older than the current repo state cannot produce PASS. Refresh it against the live tree: re-run the
search, re-read the file, compare hashes.

## Return shape

```text
verdict: PASS | FAIL | BLOCKED
confidence: HIGH | MEDIUM | LOW
sources_searched:
  - [SEARCHED|SKIPPED] source - what was searched, or why it was unavailable
discovered_context:
  - source - finding - relevance - impact [BLOCKING|IMPORTANT|FYI]
missed_requirements: requirements the implementation should address; empty when none
findings:
  - [BLOCKER|MAJOR|MINOR|NOTE] category - path:line - expected vs actual - fix direction
blocking_issues: BLOCKING items only
```

BLOCKING context maps to BLOCKER or MAJOR in the assembled report; IMPORTANT maps to MINOR; FYI to NOTE.

## Sample brief

```text
TASK: Review lane 5 (context). Find context the author missed for the change in diff.patch.
SCOPE: read-only git and search commands; write output only to .litmuse/evidence/<slug>/review/context-mining.txt.
DELIVERABLE: the return shape, with every skipped source named.
VERIFY: each discovery cites a commit hash, file:line or URL.
STOP WHEN: git history and codebase cross-references are done and external sources are marked searched or skipped.
```
