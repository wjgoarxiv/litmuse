# Team orchestration: the leader's runbook

Team mode coordinates two or more Muse child agents through a local durable packet. Use it when work needs shared
acceptance criteria, coordinated ownership, or evidence that survives a compaction. For an isolated one-shot task a
plain `subagent_spawn` is cheaper. For an unclear objective, get an approved plan (`lit-plan`) before building a
team. Run every `node` command below with `bash` from the project root; `<skill-dir>` is the directory of the lit-team
SKILL.md that `read_skill` returned.

## 1. Choose composition and isolation

Compose members by:

- **area**: independent product areas with separate outputs;
- **ownership**: non-overlapping files or modules, one owner each;
- **perspective**: read-only reviews of the same artifact from different risk lenses.

Each member needs a concrete focus, a deliverable, in-scope paths (if it may write), forbidden actions, a verification
command, real-surface evidence and a cleanup receipt.

| Situation | Isolation |
|---|---|
| read-only analysis | shared checkout |
| disjoint file ownership | shared checkout with explicit `--paths` |
| overlapping implementation | separate worktrees, each authorized by the user |
| release, secrets or remote settings | keep in the leader lane unless explicitly delegated |

The packet records worktree intent and paths. It does not grant permission to create, merge, delete or push a worktree
or branch; apply Git authority separately and ask with `request_user_input`.

## 2. Initialize the packet

```
node <skill-dir>/scripts/team.mjs init --name "<team>" [--objective "<text>"] [--worktree] [--base-branch <branch>]
```

The command creates `.litmuse/team/<team-id>/` with `team.json`, `guide.md` and `artifacts/`, and prints the team
id (`<slug>-NN`). Treat the id as opaque and reuse it exactly. Never hand-write or patch `team.json`: every mutation
holds an owner lock across the whole read-modify-write, so concurrent commands cannot overwrite one another with stale
snapshots, a dead owner is recovered through a fenced takeover, and live or malformed ownership fails closed.

Add at least two members before any child is bound:

```
node <skill-dir>/scripts/team.mjs add-member --team <id> --id <member> --focus "<bounded focus>" \
     --deliverable "<artifact>" [--lens area|ownership|perspective] [--agent <subagent_type>] \
     [--paths "src/a,src/b"] [--branch <branch>] [--cwd <dir>]
```

Member ids match `[A-Za-z0-9][A-Za-z0-9_-]{0,31}`. Focus values must be unique after trimming and lower-casing; owned
paths are workspace-relative and must not overlap between members (`src/a` and `src/a/x` overlap). A write-capable
agent (`litmuse/lit-executor`, or `general-purpose`) must declare `--paths`; a read-only agent must not. The default
agent is `litmuse/lit-executor`, or `litmuse/quality-reviewer` for the `perspective` lens. An overlap is a planning
defect: refine ownership before continuing.

## 3. Spawn and bind children

Generate the durable brief and spawn arguments:

```
node <skill-dir>/scripts/team.mjs prompt --team <id> --id <member> [--return-mode reader|technical|audit]
```

Augment `message` with current repository facts, the exact scope, protected dirty state and the expected receipt. Call
`subagent_spawn` with the returned `spawn_args` (`command_id`, `role`, `objective`, and `subagent_type` unless the
member is the recorded `general-purpose` exception). Then record the id the host returned:

```
node <skill-dir>/scripts/team.mjs bind-agent --team <id> --id <member> --agent-id <child id> [--cwd <absolute-path>]
```

`bind-agent` refuses until the team has two members and marks the member `active`. In worktree mode `--cwd` is the
member's real checkout: confirm it exists, is canonical and matches authorized ownership before work begins. If
`subagent_spawn` is unavailable or an agent is unapproved, no packet command can create a child: stop at that explicit
boundary, or run a user-approved direct-execution fallback and say so. Never mark members active with fabricated ids.

## 4. Communication cadence

The leader owns the objective and the global verdict. Members send:

- `WORKING:` before a long phase;
- `BLOCKED:` with one concrete missing fact or capability;
- `DONECLAIM:` with changed files or findings, exact commands, surface evidence, risks and a cleanup receipt.

Change durable status only after observing the matching host state:

```
node <skill-dir>/scripts/team.mjs set-status --team <id> --id <member> --status pending|active [--note "<bounded note>"]
```

`set-status` moves only between `pending` and `active`; a member settles through `report` or `block`. Notes must not
contain secrets, raw logs, credentials, personal data or prompt-like text copied from untrusted material; summarize
with safe paths, hashes, counts and verdicts.

Use `subagent_wait` for short windows while doing independent leader work. A timeout is "no new message", not member
failure. Follow up for a missing structured deliverable with `subagent_send_message`; an acknowledgement alone does not
satisfy a lane. Inspect the durable view whenever ownership or progress changes:

```
node <skill-dir>/scripts/team.mjs status --team <id>
```

Cross-check it against `subagent_status`. Neither surface alone proves the work is complete.

## 5. Accepting member work

Read the child's result with `subagent_read_result`, then check it yourself.

- Implementation members: inspect the actual diff in the member's owned paths or worktree, confirm nothing changed
  outside them (`git status --porcelain`, `git diff --stat`), rerun the decisive commands from the correct checkout,
  and probe the assembled product surface.
- Analysis members: verify the cited paths and reproduce the key searches.
- Perspective members: keep each independent verdict; do not merge them into an average.

Reject a DoneClaim that lacks exact evidence, crosses ownership, modifies unrelated dirty work, leaves resources
running, relies on a stale artifact, or implies an unauthorized commit, push or release. Send the narrow failure back
to the same member or assign an explicitly bounded repair. Then settle the member:

```
node <skill-dir>/scripts/team.mjs report --team <id> --id <member> --evidence "<path inside the workspace>" [--note "<text>"]
node <skill-dir>/scripts/team.mjs block  --team <id> --id <member> --reason "<one concrete reason>"
```

`report` refuses an evidence path that does not exist, leaves the workspace, or is a symlink. Team completion requires
every required deliverable plus a leader-verified aggregate; a blocked or inconclusive member stays blocking unless
the approved plan removes that dependency.

## 6. Archive and delete

```
node <skill-dir>/scripts/team.mjs archive --team <id> [--note "<receipt note>"]
```

Archive refuses while any member is neither reported nor blocked, writes `archive-receipt.json`, and freezes the
packet (later mutations are refused). Cancel running children with `subagent_cancel`, stop processes, release ports,
remove temporary directories and handle worktrees only under explicit Git authority; then compare the durable status
with live resources.

```
node <skill-dir>/scripts/team.mjs delete --team <id>
```

Delete removes the whole packet directory, including the receipt, and only for an archived team. `--force` bypasses
the archive check and needs explicit user authority plus a separate decision about the artifacts. Prefer keeping the
archived packet when continuation or audit value remains.

## 7. Leader receipt

Report the team id, composition, member-to-child bindings, the ownership map, deliverables, verified commands and
surface artifacts, blocked or inconclusive lanes, cleanup, retained local state, and Git or release actions actually
performed (normally none). Do not claim a team was deleted, children were cancelled, or worktrees were removed until
those exact surfaces were rechecked.

## 8. Failure modes

| Symptom | Cause | Response |
|---|---|---|
| `focus overlaps member X` | Two members on one slice | Re-slice the work or drop a member |
| `owned path … overlaps` | Two writers can collide | Split paths or use authorized worktrees |
| `… can write; give member … explicit --paths` | Write-capable agent with no ownership | Declare paths, or choose a read-only agent |
| `cannot bind agents until the team has at least 2 distinct members` | Under-staffed team | Add the second member first |
| `evidence path does not exist` | Claim without an artifact | Have the member produce the artifact, then report |
| `cannot archive: A, B have not reported or blocked` | Outstanding lanes | Settle or cancel them, then archive |
| `team state lock timed out` | Another command holds the packet | Wait; a dead owner is taken over after 30 seconds |
| `corrupt team state` / `refused symlinked …` | Packet tampered with or replaced | Stop, inspect `.litmuse/team/`, do not repair by hand |
