---
name: refactor
description: "Restructure code and keep behavior: characterization tests first, small steps, contracts intact."
---

# Refactor

A refactor changes how code is arranged and leaves what it does exactly as it was. The proof is a set of tests
that pass before the first move and after the last one, plus the real surface behaving identically. If behavior
changes on purpose, the work is a feature or a bug fix and needs its own failing test, its own acceptance
criteria and its own diff.

This skill is a phased workflow. The phase order is authoritative: characterize, gate the intent, map the
codebase, assess coverage, plan, execute one verified step at a time, then sweep for regressions. Do not skip
phases because a change "looks mechanical". Refactoring without tests is reckless; refactoring without
understanding the impact zone is destructive.

The skill governs behavior-preserving change only. It does not authorize unrelated cleanup, dependency upgrades,
formatting churn, public API redesign, git publication or release activity.

## When this applies

- The user asks to split a large file, extract a function or module, rename across the codebase, flatten nesting,
  inline a needless abstraction, replace a pattern, move code between packages, simplify control flow, modernize
  syntax, or remove dead code.
- The user types `/refactor`, `refactor <target>`, or a bare `lit refactor ...` prompt that the LitMuse
  UserPromptSubmit hook routes here.
- A plan task in `plans/<slug>.md` is labelled refactor, restructure, extract, simplify or cleanup.
- `lit-burnoff` or `review-work` flagged an oversized module or a needless abstraction and the user approved the
  fix.

When the request also changes behavior (new feature, bug fix), split it: refactor first under this skill, then
change behavior under `litwork` or `debugging`. Mixed diffs make equivalence unprovable. When the request is
vague ("improve", "clean up") and no concrete smell or target is named, do not start editing; run the intent
gate in Phase 1 first.

Optional arguments, accepted in prose or flag form:

| Argument | Meaning | Default |
| --- | --- | --- |
| `<refactoring-target>` | A file path (`src/auth/handler.ts`), a symbol ("the AuthService class"), a pattern ("all functions using the deprecated API"), or a description ("extract validation logic into a separate module") | required |
| `--scope=<file\|module\|project>` | Single file, module or directory, or the whole codebase | `module` |
| `--strategy=<safe\|aggressive>` | `safe` demands maximum coverage before every step; `aggressive` allows broader steps only where coverage is adequate | `safe` |

## Inputs and state

- Target: files, symbols or a directory, plus the intended end shape in one sentence.
- Slug for evidence: `.litmuse/evidence/<slug>/` (derive it from the target or from the active goal).
- Test runner and gates from `AGENTS.md`, the package manifest scripts, `Makefile`, `Taskfile`, `go.mod`,
  `Cargo.toml` or `pyproject.toml`. Detect them from the repository; never assume a runner.
- Repository authority: `AGENTS.md`, generated-code markers, package `files[]` allowlists, lint and format
  configs, and `git status --short` (preserve unrelated dirty work).
- Optional plan `plans/<slug>.md`; tick rows `- [ ] N.` to `- [x] N.` as steps land.
- Optional goal `.litmuse/goals/<slug>.json`; attach the equivalence evidence to its criterion.
- Optional ledger `.litmuse/ledger/<session-id>.jsonl` for `decision` and `evidence` lines.
- Open `references/safe-change-playbook.md` (relative to this skill's directory) before any multi-file,
  public-surface, generated-code, persistent-data or otherwise high-risk refactor. It holds the decision packet,
  dependency-map method, compatibility strategies, generated-artifact classes, error, ordering and performance
  preservation checks, a review matrix and the failure-response order.
- Muse has no language-server tool. Wherever a precise semantic answer is wanted (definition, references,
  rename safety, diagnostics) use the CLI route described under "Muse tools and approvals", and load
  `read_skill lsp` (or `/lsp`) for the diagnostics workflow once that skill is present.

Before acting, resolve these. Repository inspection should answer most of them; ask the user only for what it
cannot answer:

- the exact declaration, module, pattern or dependency boundary being changed;
- which observable inputs, outputs, errors, timing guarantees, persistence effects and public names must stay
  stable;
- file, module, package or repository scope;
- whether compatibility shims or a staged migration are allowed;
- the commands and the real scenario that will prove no regression.

## Procedure

Seed one `write_todos` item per phase right after the request is understood, then keep the list current as
phases and steps complete:

1. Phase 0 characterize
2. Phase 1 intent gate
3. Phase 2 codebase analysis
4. Phase 3 codemap
5. Phase 4 coverage assessment and verification plan
6. Phase 5 plan generation
7. Phase 6 execute with per-step verification
8. Phase 7 final regression sweep

### Classify the transformation

Name the kind of transformation first. Each kind has a primary risk and a required inventory.

| Transformation | Primary risk | Required inventory |
| --- | --- | --- |
| rename | hidden string or external name | declaration, references, serialization, config, docs |
| extract function or type | changed ownership or evaluation order | inputs, outputs, effects, error and cancellation path |
| move module or file | import and runtime-loading changes | import graph, package exports, build and bundle rules |
| change signature | missed callers and default drift | direct and dynamic consumers, adapters, public declarations |
| split module | cycles and initialization order | dependency direction, side effects, public entry points |
| replace dependency | semantic and operational mismatch | used behavior, configuration, failure modes, resource model |
| remove dead code | dynamic or configuration-based reachability | loaders, registries, reflection, templates, generated references |
| simplify control flow | changed precedence or short-circuiting | branch table, side effects, error outcomes |
| data or schema migration | compatibility and rollback | readers, writers, stored versions, deploy order, recovery |

Then pick the operating mode:

| Mode | Trigger | Required behavior |
| --- | --- | --- |
| Local mechanical | one symbol or one file, complete references known | baseline, preview, apply, narrow check, scenario |
| Cross-file mechanical | rename, signature change, import move, repetitive structural edit | build the consumer map, batch by ownership, verify every batch |
| Structural | extraction, module split, dependency inversion, state-machine reshaping | freeze behavior, plan seams, migrate incrementally |
| Public migration | exported API, persisted schema, config, protocol, CLI or package surface | inventory consumers, define compatibility and rollback, require explicit user authority |
| Cleanup request | vague simplify, modernize or clean up | identify concrete smells and recommend a bounded target before editing |
| Capability degraded | a requested semantic tool is unavailable | use the documented fallback and disclose its weaker proof |

### Phase 0: characterize (mandatory)

A characterization test pins current behavior before any change. It asserts the contract, not incidental
formatting or internal call order.

1. Run the full test suite and save the output to `.litmuse/evidence/<slug>/00-baseline.log`. A red baseline
   stops the refactor; report the pre-existing failures first and show later that the refactor added none. Do
   not repair unrelated baseline failures without authorization.
2. Measure coverage of the target if the runner supports it. For each public function, class, export, CLI flag
   or HTTP route in the target, confirm at least one test exercises it.
3. Write characterization tests for uncovered behavior: call the code with representative inputs and assert the
   current outputs, including odd ones. Pin what the code does today even where it looks wrong. Prove each new
   test can fail by breaking the named behavior briefly, then restoring it. Save the run to
   `01-characterized.log`.
4. If a characterization test reveals that current behavior is broken, stop and clarify whether the task has
   become a bug fix. Do not "fix while refactoring".
5. State the contract you commit to before editing: the behavior that must remain unchanged, the current output
   or manifest shape captured, and the smallest cohesive unit to move, split, rename or simplify.

Good contracts to pin, by surface: a CLI command succeeds or fails with a controlled message and exit code; an
HTTP route returns the same status and body shape; a hook emits the same JSON; a package manifest exports the
same entries; an installer preserves unrelated user settings; documentation keeps required install and safety
guidance.

### Phase 1: intent gate (mandatory first decision)

Classify and validate the request before any exploration.

| Signal | Classification | Action |
| --- | --- | --- |
| Specific file or symbol | Explicit | Proceed to codebase analysis |
| "Refactor X to Y" | Clear transformation | Proceed to codebase analysis |
| "Improve", "clean up" | Open-ended | Must ask: what specific improvement? |
| Ambiguous scope | Uncertain | Must ask: which modules or files? |
| Missing context | Incomplete | Must ask: what is the desired outcome? |

Confirm before proceeding:

- [ ] the target is clearly identified
- [ ] the desired outcome is understood
- [ ] the scope is defined (file, module or project)
- [ ] success criteria can be articulated

If any of those is unclear, ask through `request_user_input` (in a headless run, take the safest default and log
it as a `decision` ledger line), using this shape:

```
I want to make sure I understand the refactoring goal correctly.

What I understood: [interpretation]
What I'm unsure about: [specific ambiguity]

Options I see:
1. [Option A] - [implications]
2. [Option B] - [implications]

My recommendation: [suggestion with reasoning]

Should I proceed with [recommendation], or would you prefer something different?
```

Do not ask for facts that repository inspection can answer. Ask one precise question, not a survey.

### Phase 2: codebase analysis

Discovery is search plus semantic tools; search alone is a lead, never the verdict. Gather, in parallel when the
questions are independent:

1. all occurrences and definitions of the target (paths, line numbers, usage patterns);
2. everything that imports, uses or depends on the target (dependency chains, import graphs);
3. similar code patterns elsewhere (analogous implementations, established conventions);
4. every test related to the target (test paths, case names, coverage indicators);
5. architectural patterns and module boundaries around the target (layers, design patterns in use).

Start with exact paths and symbols using the `search` tool, or `bash` for `rg`:

```sh
rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!target' '<symbol-or-key>' .
rg -n 'exports|bin|files|types|main|module' package.json '**/package.json' 2>/dev/null
rg --files | rg '(^|/)(AGENTS\.md|README|CHANGELOG|Cargo\.toml|go\.mod|pyproject\.toml|tsconfig)'
```

Adapt exclusions to the repository. Inspect:

- declaration and ownership;
- exports and public entry points;
- direct callers and callback registration;
- dynamic loading, reflection, dependency injection, registries and plugin manifests;
- serialization, database, wire, CLI, environment and configuration names;
- tests, examples, documentation, templates and generated inputs;
- package, build, lint, formatter and release inclusion rules.

Record false-positive match categories (strings, comments, fixtures, unrelated symbols with the same spelling)
before mechanical editing.

When the impact zone is "every call site of X" or "every import of this shape", use `read_skill
structural-search`: it finds them by syntax instead of bytes, and it says honestly when no structural engine is
installed instead of handing back a grep count that includes comments and strings. For definitions,
references and diagnostics without a language server, use the CLI route (see "Muse tools and approvals") and
`read_skill lsp`.

Gather the baseline diagnostics now (`tsc --noEmit`, `pyright --outputjson`, `ruff check`, `go vet ./...`,
`cargo check --message-format=json`, whichever the repo uses) so that later "no new errors" claims compare
against a captured number.

### Phase 3: codemap

Write the definitive codemap to `.litmuse/evidence/<slug>/codemap.md`. Build it from Phase 2 evidence, not from
memory.

````
CODEMAP: [TARGET]

### Core files (direct impact)
- `path/to/file.ts:L10-L50` - primary definition
- `path/to/file2.ts:L25` - key usage

### Dependency graph
[TARGET]
├── imports from:
│   ├── module-a (types)
│   └── module-b (utils)
├── imported by:
│   ├── consumer-1.ts
│   └── consumer-2.ts
└── used by:
    ├── handler.ts (direct call)
    └── service.ts (dependency injection)

### Impact zones
| Zone | Risk level | Files affected | Test coverage |
|------|------------|----------------|---------------|
| Core | HIGH | 3 files | 85% covered |
| Consumers | MEDIUM | 8 files | 70% covered |
| Edge | LOW | 2 files | 50% covered |

### Established patterns
- Pattern A: [description] - used in N places
- Pattern B: [description] - established convention
````

A dependency graph needs direction. A file list is not a dependency map. Add package exports, generated inputs,
configuration, persistence, user documentation and tests beside the node they constrain, and mark cycles and
import-time side effects.

Then list the public contract: exported names and signatures, file paths other tools read, CLI flags,
serialized formats and package `exports` entries. These stay byte-compatible unless the user approved a break.

Derive the constraints:

- **Must follow:** the existing patterns the codemap surfaced.
- **Must not break:** critical dependencies and the public contract.
- **Safe to change:** isolated code zones.
- **Requires migration:** the places a breaking change would touch.

Rate each impact zone LOW, MEDIUM or HIGH and order the steps from LOW to HIGH. For a risky move answer: who owns
the invariant after the move, which layer may depend on which, what public surface remains, what construction or
initialization order changes, and which error and cancellation path crosses the new seam.

### Phase 4: coverage assessment and verification plan

Detect the test infrastructure from the repository (`package.json` scripts, `pytest.ini` or `pyproject.toml`,
`*_test.go`, `Cargo.toml`) and read the coverage of the target (which files cover it, which cases exist, whether
integration tests exist, which edge cases are tested, an estimated percentage).

| Coverage level | Strategy |
| --- | --- |
| HIGH (> 80%) | Run the existing tests after each step |
| MEDIUM (50-80%) | Run the tests and add safety assertions around the seams you touch |
| LOW (< 50%) | Pause: propose adding characterization tests first |
| NONE | Block aggressive refactoring; only proceed after characterization tests exist or the user explicitly accepts the risk |

When coverage is LOW or NONE, ask:

```
Test coverage for [TARGET] is [LEVEL].

Risk assessment: refactoring without adequate tests is dangerous.

Options:
1. Add tests first, then refactor (recommended)
2. Proceed with extra caution; manual verification required
3. Abort the refactoring

Which approach do you prefer?
```

Document the plan in the codemap file or in `verification-plan.md`:

````
VERIFICATION PLAN

### Test commands
- Unit: `npm test` / `pytest` / `go test ./...` / `cargo test`
- Integration: [command, if one exists]
- Type check: `tsc --noEmit` / `pyright` / `go vet ./...` / `cargo check`

### Verification checkpoints (after each step)
1. diagnostics: zero new errors against the Phase 2 baseline
2. test command: all pass
3. type check: clean

### Regression indicators
- [specific test that must pass]
- [behavior that must be preserved]
- [API contract that must not change]
````

Evidence is layered and no layer substitutes for a later one:

| Layer | Example | What it proves |
| --- | --- | --- |
| Parse or build | compiler or parser | edited artifacts are structurally accepted |
| Static semantics | typecheck, CLI diagnostics | checked relationships satisfy that tool |
| Focused behavior | targeted test or direct invocation | the named contract still behaves as expected |
| Integration | real adapter, database, service or process boundary | the connected ownership path works |
| User surface | CLI, HTTP, browser, TUI, package or hook scenario | the externally visible outcome remains |
| Diff audit | scoped diff, forbidden-token and generated-file checks | the transformation stayed inside the declared boundary |

A compiler-checked rename can produce complete edits for one symbol and still say nothing about reflection,
configuration strings, serialized names, templates, external consumers or runtime loading.

### Phase 5: plan generation

Write the plan before editing. Spawn `litmuse/lit-planner` (read-only; it cannot write) with the codemap and the
verification plan inlined, or write the plan yourself for a small target. Either way the plan must:

1. break the work into atomic steps, each independently verifiable;
2. order steps by dependency (what must happen first);
3. name exact files and line ranges for every step;
4. include a rollback action for every step;
5. define commit checkpoints;
6. state the compatibility strategy (see the playbook) and the shim removal criterion when one exists.

Open the decision packet from the playbook and fill it in; if it cannot be written from repository evidence, the
refactor is not ready:

```text
Target:
Structural outcome:
Observable behavior preserved:
Explicit non-goals:
Consumers:
Baseline commands:
Real scenario:
Migration order:
Rollback:
```

Good slices are reversible and independently checkable:

1. introduce the new internal seam with old behavior;
2. migrate one ownership region;
3. verify;
4. migrate the remaining in-scope consumers;
5. switch the public boundary;
6. remove temporary compatibility;
7. run the full gates and the scenario.

For public migrations a shim may be required. Define its warning, owner, removal criterion and deadline; never
leave an untracked "temporary" alias.

Review and validate the plan: all identified files addressed, each step reversible, dependency order respected,
test commands specified at each step. Convert it into granular `write_todos` items (`Step N: ...`,
`Verify step N: run tests`). Tick the matching `plans/<slug>.md` rows only as steps land.

### Phase 6: execute (per step: edit, verify, revert on red)

For each step run the same protocol.

**Pre-step.** Mark the step in progress. Read the current file state with `read_file`. Confirm that diagnostics
equal the Phase 2 baseline and that `git status --short` shows no overlapping unowned changes.

**Choose the editing method**, in this order of preference:

1. a compiler-supported migration or semantic rename whose returned edits can be reviewed;
2. a syntax-aware transformation with dry-run output (`read_skill structural-search`: preview, review, then
   apply);
3. a small explicit patch with `edit_file`;
4. a carefully bounded text replacement followed by a semantic inspection of the diff.

Never apply an unrestricted textual replacement based only on spelling. Rename only what the impact map says is
the same symbol; do not rename every textual match (strings, generated output, fixtures, unrelated symbols).
Do not claim a semantic operation ran unless a command in this session actually ran and its output is saved.

**Execute one coherent step.** One mechanical change per step (extract, move, rename, inline). Preserve
behavior and avoid opportunistic cleanup. Move one structural unit at a time; do not mix rename, extraction,
behavior tweak, docs update and formatting in one diff. Keep the project's module style (for example explicit
import extensions where the repo requires them). Preserve comments only while they stay accurate; update stale
comments the move introduced; remove imports the refactor made unused; do not remove pre-existing dead code
unless the task includes cleanup or your change made it unused.

When moving a public symbol, leave a re-export at the old path so callers keep working. Remove the shim only
when the user asks and every caller is migrated.

**Post-step verification (mandatory).**

1. Parse, format-check, compile or typecheck the touched ownership region and compare diagnostics against the
   baseline.
2. Run the narrowest behavioral test, then the affected tests.
3. Inspect `git diff -- <paths>`.
4. Search for stale declarations, imports and compatibility markers.
5. Compare failures with the captured baseline.

Record one line per step in `.litmuse/evidence/<slug>/steps.md`:

```text
Step:
Files:
Precondition:
Command or preview:
Observed result:
Behavioral check:
Rollback:
Cleanup:
```

**Step completion.** Verification passes: mark the step complete, tick the plan row, continue. Verification
fails: stop and fix before anything else.

**Failure recovery.** On any failed verification:

1. stop immediately and do not start the next slice;
2. preserve the failing command and its output;
3. revert the failed change (only your own slice: `git restore -- <your files>` after confirming those files
   carry no unrelated user edits; never `git reset --hard`, `git clean` or `git checkout .`);
4. diagnose what went wrong and identify the earliest slice that introduced it;
5. choose: fix and retry smaller, skip the step if optional, spawn a read-only `litmuse/quality-reviewer` with
   the failure inlined to propose a fix strategy, or ask the user;
6. rerun the baseline and the failing scenario before resuming, and update the plan.

Never proceed to the next step with broken tests. Three consecutive failures on the same step end the run: stop
and report with the evidence.

**Commit checkpoints.** After each coherent group offer a checkpoint commit through `lit-commit` when the user
wants commits; otherwise leave the working tree and say so. Format when committing:

```
refactor(scope): description

[details of what was changed and why]
```

### Phase 7: final regression sweep

1. Run the full test suite and save it to `02-after.log`. Compare test counts with the baseline: equal or higher
   with zero new failures.
2. Run the full type check, the linter and the build if the project has one.
3. Re-run diagnostics on every changed file and compare with the baseline.
4. For a published package, compare the pack listing before and after (`npm pack --dry-run --json`, read
   `[0].files`) so no file silently drops out of the payload.
5. Exercise the real surface once (the CLI command, the page, the import a downstream user makes, the packaged
   or built artifact) and save it to `03-surface.log`.
6. Run the final adversarial pass:
   - search for the old public name and all transformed spellings;
   - run an invalid-input and failure-path scenario;
   - exercise runtime loading from the packaged or built form;
   - compare exit codes, response shape, side effects and ordering;
   - inspect the diff with whitespace ignored and then normally;
   - check generated artifacts from their source, never by hand-editing them;
   - confirm cleanup: no residual process, port, temp directory or compatibility file.
7. Summarize:

```markdown
Refactoring complete

### What changed
- [list of changes]

### Files modified
- `path/to/file.ts` - [what changed]

### Verification results
- Tests: PASSED (X/Y passing, baseline X/Y)
- Type check: CLEAN
- Lint: CLEAN
- Build: SUCCESS
- Real surface: [scenario and result]

### Regressions
None observed on the surfaces above. Not covered: [list].
```

## Safe split checklist

Split by responsibility, never by arbitrary line range. Every new file has one clear owner, named after what it
contains: parsing, registry or state reads, registry or state writes, command dispatch, hook context
construction, documentation-only policy, QA scripts.

- Circular imports checked after each move (run the build, or a cycle detector if the repo has one).
- Side effects at module top level keep the same load order.
- Default exports and named exports are both preserved where both existed.
- Tests move with the code they test, or keep importing from the public path.
- Package `files[]` allowlists, manifests, docs that link to file paths, and hooks that reference script
  locations are updated in the same slice.
- Public CLI commands are never renamed without a compatibility alias; install paths never change without a
  migration test.

## Cross-language reminders

### TypeScript and JavaScript

Check package exports, type-only imports, ESM and CJS boundaries, declaration output, runtime path aliases,
bundler inclusion and test transforms. A passing typecheck may not exercise runtime module resolution.

### Python

Check import-time side effects, package re-exports, entry points, decorators, string-based registration, pickled
names, migrations and dynamic imports. Run with the project's actual environment manager.

### Rust

Check visibility, feature flags, trait implementations, macro expansion, conditional compilation, public
re-exports, unsafe invariants and downstream crates. Formatting and compilation do not replace targeted behavior
or soundness checks.

### Go

Check interfaces satisfied implicitly, build tags, generated sources, init functions, embed directives, module
and package paths, wire formats and race behavior. Run the race detector when ownership or concurrency changes.

### JVM, .NET, native and other compiled ecosystems

Check reflection, annotations or attributes, resource names, generated bindings, ABI, binary compatibility,
linker configuration and platform-specific builds. One local platform is not cross-platform proof.

### Documentation refactors

Documentation moves are refactors when meaning is preserved. Keep required warnings, commands, ids and safety
language at the point of use; do not shorten below corpus guards; re-run brand and token scanners after large
moves. Update exact-phrase tests only when the new phrasing states the same contract more clearly.

## Deprecated code and library migration

When a deprecated method or API turns up during a refactor:

1. Spawn a read-only research child (`subagent_type: litmuse/librarian-researcher`) or use `web_fetch` on the
   official docs to find the recommended modern replacement before editing.
2. Do not auto-upgrade to the latest version unless the user explicitly asked for a migration; a
   behavior-preserving refactor must not silently change runtime behavior.
3. If the user did request a migration, fetch the current API docs first, write characterization tests for the
   old behavior, then migrate step by step under Phase 6.

## Parallel dispatch for file-independent steps

When the plan has several file-independent steps you may work them in parallel with `subagent_spawn`. This
refines Phases 5 and 6; it adds no new authority. There is one orchestrator (you) and a set of children, and no
persistent team.

**Plan requirement.** Ask the planner to append a Parallelism Analysis:

```
Output a Parallelism Analysis section with:
- total_atomic_steps: integer
- file_independent_steps: integer (parallelizable, no cross-file blocker)
- cross_file_dependent_steps: integer (has blockers)
- per_step_class: [{step_id, class: 'mechanical' | 'reasoning', blockedBy: [step_ids], rationale}]
- dispatch_recommendation: 'parallel-batch' | 'sequential' with reason
- rationale for the grouping
```

`mechanical` means rename, extract variable, inline, simple move, or a signature change without call-site logic.
`reasoning` means logic-preserving work that needs thought: extract function, restructure a conditional,
pattern transformation, cross-file API change. Recommend `parallel-batch` when `file_independent_steps >= 3`,
otherwise `sequential`. If any required field is missing, stop and re-request the plan with the exact missing
field names; never batch from a partial plan.

**Preconditions (fail hard if any fails).**

1. Every batched step is `file_independent` (empty `blockedBy`); steps with blockers run sequentially in
   dependency order.
2. No two children in one batch touch the same file; children share no state and overlapping edits would race.
3. Each child brief is self-contained: children do not see the conversation, so inline the step, files and line
   ranges, rollback, codemap summary, constraints and established patterns.

**Child authority.** A child spawned without `subagent_type` is general-purpose and holds every work tool,
including shell and file writes, so say so in the brief and constrain it: no commits, no tests, no files outside
its list. Prefer `litmuse/lit-executor` for the edit lanes. Read-only lanes (mapping, review) use
`litmuse/lit-planner`, `litmuse/librarian-researcher` or `litmuse/quality-reviewer`.

**Child briefs.**

- Mechanical step: apply the step verbatim with no scope expansion; run the CLI diagnostics on touched files;
  return files touched, diagnostics status and a diff summary; do not run the suite and do not commit.
- Reasoning step: read the plan step carefully, preview any structural rewrite first, review it, then apply; if
  the step is ambiguous or needs out-of-scope changes return `UNCLEAR` with the reason instead of guessing;
  return files touched, diagnostics status and a diff summary; do not run the suite.

**After `subagent_wait` / `subagent_read_result` account for every child** (the orchestrator owns verification;
children never run the suite or commit):

- Run the verification yourself, or spawn a read-only `litmuse/lit-verifier` whose brief inlines the touched
  files and the verify commands and asks for `PASS` or `FAIL:<failing test, specific error, suggested revert
  hunks>`. Do not checkpoint a commit before PASS.
- PASS: make the commit checkpoint for that step and proceed.
- FAIL: retry with a fix hint (re-dispatch that single step with the failure inlined) or, after three FAIL cycles
  on the same step, stop and report with the evidence.
- `UNCLEAR`: re-harvest context with a targeted read-only lane and re-dispatch with the clarified brief.

Proceed to Phase 7 only when every batched step is committed or recorded and every paired verification
returned PASS. Add a "Dispatch path" line to the Phase 7 summary, with batch metrics when the parallel path was
used (batches, children per batch, verification lanes).

Worktree isolation per child lets a risky variant run in parallel; merge only the variant whose gates pass.

## Muse tools and approvals

- `search` and `read_file` build the codemap; `edit_file` applies each step (`apply_patch` for multi-hunk
  changes); `bash` runs gates and the CLI diagnostics; `write_file` writes evidence and characterization tests.
- Muse has no LSP tool. Replace each semantic question with a CLI:

  | Question | Command through `bash` |
  | --- | --- |
  | type errors, TypeScript | `tsc --noEmit` (add `-p <tsconfig>`) |
  | Python types and lint | `pyright --outputjson`, `ruff check`, `mypy` |
  | Go | `go vet ./...`, `gopls check <files>`, `go build ./...` |
  | Rust | `cargo check --message-format=json` |
  | references to a symbol | `rg -nw '<symbol>'` filtered by the impact map, or `read_skill structural-search` for syntactic matches |
  | rename | the compiler-assisted tool for the language (`gopls rename`, `ts-morph` scripts, `rope`) when present, else a structural rewrite with a dry run, else a reviewed `edit_file` series |

  Say plainly in the evidence which tool produced which claim; a text search does not prove semantic
  completeness. `read_skill lsp` (`/lsp`) owns the diagnostics workflow.
- `read_skill structural-search` drives `ast-grep` through `bash`. If the engine is missing, its documented
  blocked path applies: report `BLOCKED` for the structural step, or fall back to a labelled textual search
  and the weaker evidence it gives. Never substitute a regex search and call it structural.
- `subagent_spawn {command_id, objective, role, subagent_type}`: for a wide codemap spawn `litmuse/lit-planner`
  for the map while you write characterization tests, or two read-only children each scanning half the
  importers. Always set `subagent_type`; without it the child is general-purpose with every work tool. Child
  reports are leads, not evidence: replay decisive commands yourself. Agents need user approval
  (`muse plugins approve litmuse:agent_definition:litmuse/<name>`); without it, map in the main session and say
  so once.
- Do not delegate two edits to the same file. Do not let a child commit, publish, run destructive git or expand
  scope unless the user separately authorized it.
- `request_user_input` for the intent-gate and low-coverage questions; headless runs log the default chosen as
  a `decision` ledger line.
- `write_todos` keeps the phase list and step list current.
- Reverting with `git restore` touches the working tree; confirm the target files carry no unrelated user edits
  before the first step (`git status --short`). Do not stash, reset or clean the repository to recover.
- No publish, tag, push or version bump from this skill.

## Evidence

`.litmuse/evidence/<slug>/` holds:

| File | Content |
| --- | --- |
| `00-baseline.log` | full suite before any change, with exit status and known pre-existing failures |
| `01-characterized.log` | suite after characterization tests were added |
| `codemap.md` | the Phase 3 codemap, public contract and constraints |
| `verification-plan.md` | commands, checkpoints, regression indicators (may live in the codemap) |
| `steps.md` | one block per step using the step template |
| `02-after.log` | full suite after the last step |
| `03-surface.log` | the real-surface scenario |
| `diagnostics-before.txt` / `diagnostics-after.txt` | CLI diagnostics captured at Phase 2 and Phase 7 |

Append ledger lines with `kind:"evidence"` for each file and `kind:"decision"` for any contract change the user
approved. If baseline gates are already red, isolate the pre-existing failure and show the refactor did not add
a new one.

Review matrix for the final check:

| Question | Evidence |
| --- | --- |
| Did all intended consumers migrate? | semantic result when available plus scoped searches |
| Did public names remain compatible? | package, API, CLI and config inspection plus a scenario |
| Did runtime loading still work? | run the built or packaged artifact |
| Did errors remain stable? | failure-path scenario (type or code, cause chain, exit or HTTP status, retryability) |
| Did ordering and side effects remain? | event or state sequence before and after for high-risk paths |
| Did concurrency ownership remain safe? | race or schedule tool and a cancellation scenario |
| Were generated files handled correctly? | generator command and a clean follow-up run |
| Can the step be reversed? | an explicit owned rollback without a destructive repository reset |
| Is temporary state gone? | process, port, temp, config and diff receipt |

The completion claim states: invariant preserved, files changed, baseline evidence, post-change evidence,
real-surface probes, known risks and cleanup. It states that no behavior change was intended. If a gate was
skipped, name why and what risk that leaves. If a temporary characterization test was added, keep it only when
it protects future behavior, and say which.

## Stop and report

Report in the reader-facing channel:

- **Result:** PASS (equivalence shown), FAIL (a step could not be made green), or BLOCKED (baseline red, missing
  tests that cannot be written, contract break needed, structural engine unavailable for a required structural
  step).
- **Material risk:** dynamic lookups, external consumers or persisted formats the tests cannot see; anything
  outside the evidence boundary. Never call behavior "unchanged" beyond the surfaces actually observed, and never
  hide a partial migration behind "mostly complete".
- **Required action:** shim removal, approved contract changes, follow-up behavior changes.

Keep the exact commands, counts and cleanup receipts in the evidence files unless the user asked for them.

Abort and consult the user when:

- coverage is NONE for the target and the user declined characterization tests;
- a change would break a public API or contract;
- the scope is still unclear after one clarifying question;
- three consecutive verification failures hit the same step, or any step breaks a test you cannot explain within
  two attempts (revert it and report);
- a user-defined constraint would be violated;
- the working tree has overlapping unowned changes;
- a generated file has no authoritative regeneration path;
- the migration would silently break an external or persisted contract;
- the only verification surface is unavailable and no meaningful fallback exists;
- required credentials, services, hardware or fixtures are absent;
- rollback would need destructive git or data mutation the user did not authorize;
- the change crosses into another repository, a release, a publish, a tag or a deployment;
- tests reveal that current behavior is not understood, or the refactor needs a feature change to pass, or the
  diff touches more surfaces than planned, or package output changes unexpectedly.

Record a blocked result with the exact boundary. Stopping preserves behavior until a new plan or approval
exists; it is not failure.

## Pitfalls

Never:

- skip the diagnostics check after a change, or proceed with red tests;
- edit a symbol without first mapping its call sites;
- suppress type or lint errors (`as any`, `@ts-ignore`, `# type: ignore`, `#[allow]`, `//nolint`) to make a
  step pass;
- delete or weaken a test to make a refactor pass, or update a characterization test to match new output (that
  turns a regression into a pass);
- commit broken code or hide a behavior change in a refactor commit;
- change plugin keys, install paths, public command names or package exports silently.

Common traps:

- Skipping characterization because "the change is mechanical". Mechanical moves break import paths, load order
  and string-keyed registries.
- Vague "clean up everything" work without a bounded outcome.
- Large single-step moves that leave you unable to say which edit broke the build.
- Trusting a tool preview without reviewing its edits, or trusting compiler success over runtime behavior.
- Adding an abstraction before identifying two real consumers or one explicit boundary.
- Moving code while also changing error behavior, defaults, ordering or side effects.
- Deleting compatibility before all in-scope consumers migrate.
- Using tests that assert internal call order as proof that behavior is preserved.
- Treating typecheck, compilation, line count or a green unit suite as complete evidence.
- Formatting the entire repository and burying the semantic diff.
- Forgetting non-code consumers: docs that link to file paths, package `files[]`, manifest entries, hooks that
  reference script locations, installed payload files that look unused.
- Deleting "unused" docs or tests that are shipped payload.
- Editing another contributor's files, reverting unrelated dirty state, or committing without authority.
- Bundling a "small fix" into the refactor diff.
- Treating child reports as proof, or letting a bare child run with every write tool.

Always: understand before changing, preview before applying, verify after every step, follow the established
patterns the codemap surfaced, keep the todo list current, commit only at logical checkpoints when the user wants
commits, and report issues the moment they appear.

Refactoring without tests is reckless. Refactoring without understanding the impact zone is destructive. This
workflow makes sure you do neither.
