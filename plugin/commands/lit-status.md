---
description: "Read-only LIT card for this workspace: route, plan n/m, lanes, threads, goal, last handoff"
argument-hint: "[slug]"
---
Print the LitMuse status card for this workspace. Scope: $ARGUMENTS (empty means everything). Write nothing.

1. Run `npx @litfamily/litmuse status --card` with bash (add `--json` when a machine-readable form is wanted) and print its output unchanged. The hooks keep the record it renders at `$XDG_STATE_HOME/litmuse/stage/<session>.json` (default `~/.local/state/litmuse/stage/`), with `latest.json` naming the newest session for each workspace.
2. If the CLI is unavailable or fails, build the same card yourself with read_file and search:
   - Route and time active: the newest record from `latest.json` (route, activatedAt, kind), or else the `route` on the last line of the newest `.litmuse/ledger/*.jsonl`.
   - Plan: the plan named in the record, or else the newest `plans/*.md`. Count `- [x] N.` against all `- [ ] N.` and `- [x] N.` rows, and name the first open row.
   - Lanes: the record's `lanes` entries with `status` running, done or failed, and their elapsed time (`endedAt` or now, minus `startedAt`).
   - Threads: `.litmuse/workflow-stack/<session>.json` frames (paused spines above running sides) plus other sessions' fresh paused tops: a real gauge when the count is known, the `… N steps` fact line otherwise — never a placeholder. Six rows at most, then `+N more`; an idle card offers `lit adhd` instead.
   - Goal: each `.litmuse/goals/*.json` whose status is `active`, with its objective and the criteria that are not `pass`.
3. Add the first lines of `.litmuse/handoff/latest.md` if present, and the count of tool events and failures in the newest ledger.

Answer with the card, then one line naming the next action. If the record is missing or older than the ledger, say the card may be stale rather than guessing. For a fuller recap, load `plugin:litmuse:lit-recap`.
