# Plan review checklist

Load this before issuing a plan verdict. A plan review reads `plans/<slug>.md` as the executor would, and the
only question is whether the executor must guess. A plan is a draft until execution starts. It carries no runtime
evidence, the five work-review lanes stay out of scope, and no lane may report PASS for a probe that has not run.

## Admission

Before judging content, confirm the review can start:

1. The plan file exists, is the version the user means (record its size and mtime in `context.txt`), and is
   unchanged by another session during the review (a changed hash mid-review restarts the review).
2. The intent is known: the user's request, a `.litmuse/interview/<slug>-spec.md` or crucible findings when they
   exist. A plan cannot be judged against an intent nobody can state.
3. The repo facts are readable: `AGENTS.md`, the manifest scripts, the test layout, CI configuration.

When any of the three is missing, the verdict is `NEEDS-CONTEXT` with the smallest question that unblocks it.

## Shape check (machine-read structure)

`start-work` reads the plan by shape, so shape defects are real defects:

| Check | Expected | Defect if |
| --- | --- | --- |
| Status header | `Status: approved`, `awaiting approval` or `assumptions unconfirmed` | missing or unknown value; a draft that claims `approved` with no recorded user okay |
| Sections, in order | TL;DR (for humans), Scope (Must have, Must NOT have), Bootstrap, Verification strategy, Execution strategy, Todos, Final verification wave, Commit strategy, Success criteria, DoneClaim | a section is absent or out of order |
| Task rows | `- [ ] N. <imperative title>` at column zero, numbers consecutive from 1 | indented rows, `1)` numbering, duplicate or skipped numbers |
| Row labels | What to do, Files, References, Tests, Acceptance, QA scenario, Depends on, Commit under each row | any label missing; Files lists a directory instead of files |
| Final verifier rows | `- [ ] F1.` to `- [ ] F4.` after the last implementation row | absent, out of order or indented |
| Placeholders | none | any `<fill` marker remains |
| Verification strategy | exact gate commands with working directory plus one real-surface probe and the Goal block | only "run the tests", or no real-surface line |
| Ticked rows | `- [x] N.` rows exist only for work that really happened | rows ticked in a fresh draft |

`node <skill-dir>/../lit-plan/scripts/check-plan.mjs --check plans/<slug>.md` automates the structural half of this
table (exit 0 and `PLAN_STRUCTURE_PASS`); it judges shape only, so the eight dimensions below still apply to a plan
that passes it. A `Status` other than `approved` is a finding for plan review only when the plan is about to be
executed; for a plan that is still in discussion it is the expected state.

Fenced examples and nested bullets are plain text. A checkbox inside a fenced block is example text.

## The eight dimensions

Score each dimension PASS or FAIL with one line of evidence. Apply pressure in proportion to risk: a reversible
one-file change gets a light pass; schema changes, security-sensitive work, irreversible state, migrations and
release work get the full matrix. Padding a small plan with ceremony is itself a finding.

### 1. Scope

- One bounded objective stated in the TL;DR; the plan finishes without silently absorbing a later phase.
- Scope Out lists the tempting adjacent work.
- Read-only versus edit boundaries are explicit. Paths the plan may touch are enumerated across the rows.

### 2. Achievability

- Completing every row and the Verification section establishes the stated objective. Discovery or qualification
  work stops short of claiming a production outcome.
- Material unknowns (an API's real behavior, a tool's availability, a data shape) are resolved in Context or gated
  by a first row whose acceptance resolves them.
- Host and environment fit: the commands exist, the permissions are available, the required network or credential
  is named as an approval point.

### 3. Decision completeness

- Each fork in the road has a Decisions entry with a reason: library choice, file placement, flag name, migration
  order, backwards compatibility.
- Residue words are gone: "TBD", "maybe", "as appropriate", "or alternatively", "if needed", "etc.".
- New dependencies, public contract changes and migrations are named in Decisions and mirrored in Must have or
  Must not have.
- A decision that belongs to the user is marked as an assumption to confirm, or the verdict is `NEEDS-CONTEXT`.

### 4. Row atomicity

- One row, one action, one named output, one binary acceptance check.
- A row finishes in a reviewable unit, and the repo is green after it.
- A row is split when its Files line spans unrelated modules, when it hides design work ("design and implement"),
  or when its acceptance is two checks joined by "and".
- Test-first order is possible: the Tests line names a test that fails before the change and the assertion it adds.
- Documentation or prose rows name a machine-consumed value (a parsed field, a scanned token, a validator) when a
  guard is wanted, or say honestly that review is the only gate.

### 5. Acceptance and evidence

- Every acceptance line is an observation, such as "`node --test test/x.test.mjs` passes and the new case `empty
  input` fails before the change". A restatement of the title ("feature works") is a defect.
- Every Must have maps to at least one row acceptance; unmapped Must haves are gaps.
- Evidence artifacts are named: log files under `.litmuse/evidence/<slug>/`, screenshots, transcripts.
- Negative controls exist where a wrong implementation could still pass (a mutation probe, a malformed input).
- The commands are replayable from the repo root, with the working directory stated when it differs.

### 6. Guardrails

- Must not have names the forbidden changes: dependency additions, public API changes, unrelated refactors,
  edits to protected files, local state committed.
- Commit, push, tag, version bump, publish and registry actions appear behind explicit approval, and the plan
  says who approves.
- Destructive probes run against scratch copies, with a before/after hash or status check that proves the live
  tree stayed intact.
- Untrusted text the work will read (issues, fetched pages, fixtures) is declared data in Must not have.

### 7. QA scenarios

For every scenario and the Verification probe, answer three questions. A NO needs one minimal repair.

1. Does it name a real tool that exists in this environment (`curl`, `node`, `muse exec`, a browser driver, a test
   runner)?
2. Does it give executable steps with literal inputs (the URL, payload, keystrokes, file names)?
3. Does it state a binary expected result (a status line, an exit code, a string in output, a file field)?

"Run the endpoint", "open the page" and "check it works" fail all three. A scenario whose observable could pass on
a broken implementation fails question three.

### 8. Order, failure and cleanup

- Depends on lines form a DAG; the numeric order is a valid execution order or a parallel set with disjoint Files.
- Failure branches exist for gates that can plausibly fail: what the executor does after a red baseline, a refused
  approval, a flaky test.
- Every scenario that spawns a process, port, tmux session, browser, worktree, tarball or temp directory has a
  teardown step with a receipt.
- Irreversible rows (migration, deletion, external write) carry a rollback or a stop-and-ask point.

## Proportionality

Match pressure to risk. Signs of an over-built plan: more checklist rows than decisions, evidence matrices that no
decision uses, repeated gate runs after every row for trivial work. Signs of an under-built plan: a migration with
no rollback, a security change with no negative test, a release row with no approval line. Both are findings.

## Row-by-row map

Produce a table in `plan-review.md`:

| Row | Title | Startable | Missing trigger or precondition | Smallest repair |
| --- | --- | --- | --- | --- |
| 1 | ... | yes | | |
| 2 | ... | no | Files line names `src/x.mjs`, which does not exist and is not marked new | mark it `(new)` or fix the path |

## Verdict templates

`PASS`:

```text
Verdict: PASS. Eight of eight dimensions hold. Every row is startable. Remaining uncertainty is gated by row 3's
acceptance. The plan is unchanged.
```

`ITERATE`:

```text
Verdict: ITERATE (2 findings).
MAJOR plans/x.md row 4 - Acceptance "feature works" restates the title; use `curl -i localhost:8080/health`
  returns 200 with body `ok`.
MAJOR plans/x.md Verification - gates listed, no real-surface probe; add one that exercises the CLI.
Smallest repairs: edit row 4 Acceptance, add one Verification line. Valid structure and decisions stay as written.
```

`NEEDS-CONTEXT`:

```text
Verdict: NEEDS-CONTEXT. Decision 2 (keep the old config key or migrate it) changes rows 3 to 5 and the rollback
plan. Question: should existing users keep the old key for one release?
```

## After the verdict

- `PASS` hands over to `start-work`. The reviewer leaves the launch to the user.
- `ITERATE` repairs run in `lit-plan` (revise the file) or, with the user's go-ahead, as minimal `edit_file`
  changes recorded under `## Amendments`. Re-review afterwards, with the previous findings as the checklist.
- `NEEDS-CONTEXT` waits for the user.
- Record the verdict as a `decision` ledger line with the plan path, and save `plan-review.md` under
  `.litmuse/evidence/<slug>/review/`.
