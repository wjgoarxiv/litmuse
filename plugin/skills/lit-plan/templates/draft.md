---
slug: {{slug}}
status: exploring            # exploring | interviewing | awaiting-approval | approved | plan-written
tier: Standard               # Trivial | Standard | Architecture
intent_route: stable         # stable | unresolved
review_required: false       # true when a high-accuracy modifier appeared in any turn
plan_path: plans/{{slug}}.md
updated: <UTC ISO-8601>
---

# Draft state for {{slug}}

## Request
<the user's words, trimmed>

## Grounding summary (internal)
- Test runner:
- Registration / extension point:
- Prior attempt:
- External API:
- Dirty worktree paths (leave alone):
- Open ambiguities exploration cannot resolve:

## Questions and answers
| id | question | recommended default | answer | source (user | default | repo fact) |
| --- | --- | --- | --- | --- |

## Approval
- Gate asked: <yes | no | skipped, with the reason>
- Result: <proceed | steer | stop | unanswered>
- Revision bound to: <objective / test-strategy snapshot in one line>

## Review lanes
| lane | agent | verdict | note |
| --- | --- | --- | --- |
| pass A gap analysis | litmuse/lit-planner | pending | |
| pass B plan review | litmuse/quality-reviewer | pending | |
| high-accuracy quality | litmuse/quality-reviewer | n/a | |
| high-accuracy conformance | litmuse/lit-verifier | n/a | |

An inconclusive lane (nothing returned, acknowledgement only, `BLOCKED:`) counts as pending.
