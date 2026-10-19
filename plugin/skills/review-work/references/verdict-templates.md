# Verdict and write-up templates

Load this when assembling the final write-up (`report.md` in the review directory). The chat reply is the short
reader form from `SKILL.md`; the write-up is the protected audit artifact and keeps its full structure whatever the
chat reply shows.

## Work review: report.md

```markdown
# Review Work - Final Report

Mode: work review (auto: <reason> | forced)
Subject: <diff range or branch>, head <short hash>, base <short hash>
## Overall verdict: REVIEW PASSED | REVIEW FAILED | REVIEW BLOCKED

## Findings
<highest severity first; each with path:line, trigger, expected vs actual, why it matters, fix direction, retest>

## Open questions and limitations
<one methodology paragraph: scope, methods, uninspected surfaces, unavailable evidence, stale or blocked probes>

## Lane table
| # | Lane | Verdict | Confidence | Evidence | Key risk |
| --- | --- | --- | --- | --- | --- |
| 1 | goal | PASS/FAIL/BLOCKED | HIGH/MED/LOW | lane-1-goal.md | one line |
| 2 | qa | ... | ... | lane-2-qa.md | ... |
| 3 | quality | ... | ... | lane-3-quality.md | ... |
| 4 | security | ... | ... | lane-4-security.md | ... |
| 5 | context | ... | ... | lane-5-context.md | ... |

## Commands and observed output
<exact commands with working directory, exit status, decisive lines>

## Changed files by surface
<grouped: source, tests, docs, manifests, scripts>

## Objective-to-evidence map
<each requirement or criterion id -> artifact path and verdict>

## Recommendations
FAILED: what to fix, in priority order, with file and fix. PASSED: short non-blocking suggestions only.

## Cleanup and release-neutral receipt
<processes, ports, worktrees, temp paths removed, with how absence was checked; no commit, push, tag, version
bump or publish happened unless the user approved it>
```

Order inside the artifact: findings, open questions and limitations, lane table, commands, cleanup, then the
concise scope summary and the final status line: `PASS`, `FAIL` or `BLOCKED:` followed by the next decision.

Limitations live in one place. A finding is a demonstrated defect; a limitation is evidence that could not be
obtained. Repeating the same caveat under every finding hides the real ones.

## Plan review: report.md

```markdown
# Plan Review - <slug>

Mode: plan review (auto: <reason> | forced)
Plan: plans/<slug>.md (<size> bytes, <ticked>/<total> rows ticked)
## Verdict: PASS | ITERATE | NEEDS-CONTEXT

## Findings
<ordered by impact on achievability; each with the row or section, the defect, the smallest repair>

## Dimension table
| Dimension | Result | Evidence |
| --- | --- | --- |
| Scope | PASS/FAIL | ... |
| Achievability | ... | ... |
| Decision completeness | ... | ... |
| Row atomicity | ... | ... |
| Acceptance and evidence | ... | ... |
| Guardrails | ... | ... |
| QA scenarios | ... | ... |
| Order, failure, cleanup | ... | ... |

## Row map
<Row | Title | Startable | Missing trigger or precondition | Smallest repair>

## Suggested edit (ITERATE only)
<patch-shaped change to the affected rows or sections; the rest of the plan stays as written>

## Receipt
The plan was read, the product tree is untouched, every row keeps its state, and no release action ran.
```

## Finding templates

Behavior finding:

```text
BLOCKER BEHAVIOR - src/install.mjs:88
Trigger: `tool install ../x` with a relative target outside the root.
Expected: refusal with exit 2.
Actual: the path is joined without normalization and files land outside the root (transcript lane-2-qa.md#14).
Impact: install can overwrite files outside the authorized directory.
Fix direction: resolve the real path and refuse targets outside the root before any write.
Retest: the same command exits 2 and writes nothing.
```

Coverage finding (evidence is missing):

```text
MAJOR COVERAGE - lane 2 / test/hooks.test.mjs
Missing proof: the empty-prompt branch added in src/hooks/prompt.mjs:41 is exercised by no test.
Why it matters: the branch can change the verdict and nobody has observed it.
Smallest next probe: one case in test/hooks.test.mjs feeding {"prompt":""} and asserting empty stdout.
```

Scope finding:

```text
MAJOR SCOPE - package.json:4
The version moved from 1.2.3 to 1.2.4; the request approved no release work.
Fix direction: restore the version; bump with approval and the lockstep check.
```

Limitation (goes in the methodology paragraph, outside the findings list):

```text
Lane 4 could not run `npm audit` because the sandbox network is proxy-only and approval was refused. The
dependency review used the lockfile diff and registry metadata the author supplied.
```

## Evidence ledger rows

For every claim in the write-up keep a row (in `lane-N` files or `report.md`): claim, source, command or
observation, result, status.

| Status | Meaning | Wording |
| --- | --- | --- |
| observed | read or measured now | "The file contains ..." |
| reproduced | the named command produced it now | "The command returned ..." |
| derived | calculated from observed inputs | "The count is ..." |
| inferred | plausible and untested | "This suggests ..." |
| blocked | the probe could not run | "The limitation is ..." |

Inferred and historical evidence keeps its own status. A receipt that names a path that no longer exists is
stale: rerun the smallest probe.

## review.json packet (optional, for the checker)

```json
{
  "mode": "work",
  "objective": "one sentence",
  "scope": ["src/", "test/"],
  "lanes": {
    "goal": {"verdict": "PASS", "confidence": "HIGH", "summary": "...", "evidence": ["lane-1-goal.md"], "findings": [], "limitations": []},
    "qa": {"verdict": "FAIL", "confidence": "HIGH", "summary": "...", "evidence": ["lane-2-qa.md"],
           "findings": [{"severity": "BLOCKER", "path": "src/install.mjs", "line": 88, "text": "..."}], "limitations": []},
    "quality": {"verdict": "PASS", "confidence": "MEDIUM", "summary": "...", "evidence": ["lane-3-quality.md"], "findings": [], "limitations": []},
    "security": {"verdict": "PASS", "confidence": "MEDIUM", "summary": "...", "evidence": ["lane-4-security.md"], "findings": [], "limitations": []},
    "context": {"verdict": "PASS", "confidence": "LOW", "summary": "...", "evidence": ["lane-5-context.md"], "findings": [], "limitations": ["gh unavailable"]}
  }
}
```

For a plan review the packet is `{"mode": "plan", "plan": "plans/x.md", "verdict": "ITERATE", "dimensions": {...},
"findings": [...]}`; the header of `scripts/check-lanes.mjs` lists the dimension keys.
