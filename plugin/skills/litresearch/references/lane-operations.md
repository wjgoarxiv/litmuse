# Lane operations

Queue ownership, recovery and cleanup around the journal protocol in `SKILL.md`. It does not change the
convergence rule, the access boundaries or the read-only rule for children.

## Ownership

The parent session owns every write in `.litmuse/evidence/<slug>/research/` and every claim decision. A child lane
is read-only, owns one question, and returns content in its final message. Never start two writers for one journal
file.

## Lane lifecycle

1. Assign the lane a stable id and the axis or lead it serves; add the row to the lane table in `manifest.md`.
2. Spawn with `subagent_spawn {command_id, objective, role, subagent_type: "litmuse/librarian-researcher"}`. The
   objective is the TASK / DELIVERABLE / SCOPE / VERIFY / SOURCES / FORMAT block plus the `## EXPAND` requirement.
3. Collect with `subagent_wait` (short waits while you do independent parent research) and `subagent_read_result`.
   A wait timeout does not change lane status; call `subagent_status` before retrying.
4. A correction to a running lane goes through `subagent_send_message`. A bounded follow-up to an idle lane that
   missed one deliverable goes the same way. `subagent_cancel` a lane that is unsafe, obsolete or out of scope.
5. Journal the return, update the row (status, sources returned, digest), then triage the leads.

Lane status values: `queued`, `running`, `returned`, `failed`, `timed_out`, `cancelled`, `unavailable`. A batch is
complete only when every lane is in one of the last five or `returned`.

## When delegation is unavailable

Run the same queue sequentially in the parent. Preserve axes, lead ids, expansion requirements, verification
candidates and convergence thresholds. Record `executionMode: sequential-fallback` and the reason.

## Recovery after compaction or restart

Re-read, in order: `manifest.md`, `expansion-log.md`, the `wave-*.md` files, `claim-graph.md`, `verify-*.md`.
Reconcile live children with `subagent_status` before spawning anything. Recheck drift-prone claims (web pages,
package versions, branches). Never infer convergence from memory.

## Queue and convergence audit (before synthesis)

- every initial axis has a completed lane or an explicit blocker;
- every lead is closed or visibly `blocked` or `deferred`;
- duplicate detection used stable lead ids and source ancestry;
- the minimum number of expansion waves happened;
- no active lane can still add evidence;
- every contested claim has a verification verdict or an explicit unresolved status.

Worker volume is not saturation. Saturation is a closed lead graph with documented boundaries.

## Cleanup receipt

Track what you create: temporary clones, downloaded pages, archives, probe files, servers, child processes, children.
At close: keep only the journal artifacts needed for reproducibility; remove task-created temporary resources by
explicit resolved path; stop processes and verify they are gone; cancel obsolete children and confirm none runs;
record what was kept and why. If cleanup is incomplete, mark the session blocked or incomplete and do not publish
the synthesis.
