---
name: lsp
description: "Diagnostics and code navigation through checker CLIs (tsc, pyright, gopls, cargo) before and after edits."
---

# LSP: diagnostics and navigation without a language-server tool

Muse Code exposes no language-server tool and no diagnostics tool. The active tool list (probed on Muse 1.4.11) has
`read_file`, `search`, `bash` and friends, and nothing that speaks LSP. LitMuse says so plainly and ships no bridge.
The supported path is the one a human uses in a terminal: run the project's own checkers with `bash`, normalise what
they print into one diagnostics shape, and treat a missing checker as a named gap, never as a clean result.

An MCP bridge to a language server was considered and left out. It would cost an approval per server, and Muse has
no host LSP client to hand the results to, so a bridge would be one more process to keep alive for less evidence
than the compiler already gives. A user who configures such a server outside this plugin gets it treated as one more
checker, and its identity is probed before its output is trusted.

Everything here is read-only or runs a build tool the project already owns. This skill installs no package, edits
no config file and starts no daemon. Installing and configuring belong to `lsp-setup`; this skill reports what is
missing and what the user could run.

## When this applies

- You just edited source files and are about to claim they are correct, or you are about to edit them and want a
  baseline first. This is the "diagnostics before and after an edit" loop that `lit-code`, `debugging`, `refactor`
  and `structural-search` send you to (`read_skill lsp`, or `/lsp`).
- You need a definition, a reference list, a type, or a rename-safety answer where a text search would mislead.
- Someone says "run diagnostics", "does it typecheck", "who calls this", "is this rename safe", "find references".
- A DoneClaim is about to cite diagnostics, a typecheck or a lint run as evidence.

Prose-only and documentation-only edits are outside it; waiting on a checker for a markdown change is false rigor.
Configuring or installing a server or checker goes to `lsp-setup`. A syntax-shaped search or codemod (every call
with this argument shape) goes to `structural-search`.

Route words: `lit lsp ...`, `lit diagnostics ...`, `/lsp`, `read_skill lsp`.

## Inputs and state

| Input | What it is | How to get it |
| --- | --- | --- |
| `edited_paths` | The files changed or about to change. Their extensions pick the checker, whatever the repo's dominant language. | `git diff --name-only`, or the paths you just wrote. |
| `change_shape` | Local behavior change, signature change, removed export, or rename. It decides how much navigation is needed. | Read the diff. |
| `tool_inventory` | Which checkers exist on this machine, observed this session. | `node <skill-dir>/scripts/diagnostics.mjs --tools` |
| `baseline` | The diagnostics that existed before your edit, for the same files. | Run the normaliser before editing. |
| `approval_state` | Whether installs or config changes are approved. Treat them as unapproved unless the user said otherwise. | `request_user_input`, or stop and report. |

`<skill-dir>` is the directory of the SKILL.md path that `read_skill lsp` returned. The normaliser is
`<skill-dir>/scripts/diagnostics.mjs`, the triage notes are `<skill-dir>/references/runtime-triage.md`, and the
per-tool command sheet is `<skill-dir>/references/cli-recipes.md`.

State to keep for the receipt (in `.litmuse/evidence/<slug>/` when the work has a slug, otherwise in the reply):
the inventory line for each checker used, the baseline output, the after-edit output, and the fallback used for any
file type without a checker. With an active goal, one ledger line such as
`{kind: "evidence", text: "lsp: 0 errors in 3 files via tsc", path}` is enough.

## Procedure

1. **Identify the language of each edited file** from its extension. A Python edit in a TypeScript repo needs a
   Python checker.
2. **Probe the toolchain first.** Run `node <skill-dir>/scripts/diagnostics.mjs --tools` and read which checkers are
   `present` or `missing`. The probe is what gives a later empty result its meaning: an empty list from a checker that
   ran is a clean result, while an empty list from a checker that never started only says that nobody looked. Report
   the two differently.
3. **Take a baseline before editing** when the change is substantial: run the normaliser on the files you are about
   to touch and keep the JSON. Findings that exist before your edit are pre-existing; report them and leave them
   alone.
4. **Run diagnostics scoped to the changed files.** `node <skill-dir>/scripts/diagnostics.mjs path/a.ts path/b.py`
   prints one JSON array of `{file, line, col, severity, code, message, source}`. The script groups files by
   language and project root, runs the right checker once per root, and by default keeps only findings in the files
   you named (`--all` keeps everything the checker reported). Start narrow; widen to the whole project when the change
   crosses modules.
5. **Read the severities.** `error`, `warning` and `info` are real findings. `missing` means the checker is
   absent and nothing ran; `failed` means it ran or tried to and gave no parseable result; `unsupported` means no
   checker is wired for that extension. Those last three are gaps and carry no verdict about the code.
6. **Separate what this change caused from what was already there.** Compare the after-edit list with the baseline
   by `(file, code, message)`. Fix what you introduced. Quote the pre-existing ones exactly and label them.
7. **Use navigation for identity and reach questions.** Definition, references and rename safety go through the
   recipes in `references/cli-recipes.md` (gopls; `scripts/tsserver-query.mjs` for TypeScript definition,
   references, quickinfo and rename preview through the project's own `typescript`; `tsc` module resolution output;
   compiler errors as an oracle) and fall back to `search` or `rg` labelled **textual**. Text
   search finds strings. It cannot tell a call from a comment, a shadowed local, or a same-named member of another
   type, so say "textual" whenever it stands in for a symbol answer.
8. **Re-check after a structural change.** A rename or signature change is validated before and diagnosed after.
   The second run catches dynamic dispatch, re-exports, string-keyed access and generated code that the first check
   missed.
9. **Escalate to the project's own commands** when file-scoped diagnostics fall short: the full typecheck, linter or
   test command from `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml` or CI config. Name the command and
   what it leaves uncovered.
10. **Receipt.** Report the checkers used with their versions, the exact normalised output rather than a paraphrase,
    what you fixed, what was pre-existing, and any file type that had no checker together with the fallback used.

### What the checkers answer better than reading

| Question | Better answered by | Why text search falls short |
| --- | --- | --- |
| Is the file I just edited valid now? | the checker's diagnostics | A guess about what might be broken is weaker than the compiler's current opinion. |
| Where is this symbol declared? | `gopls definition`, `tsc --traceResolution`, compiler output | Re-exports, aliases and generated declarations hide it from `rg`. |
| Who calls this function? | `gopls references`, a rename dry-run, compiler errors after a temporary signature change | `rg` mixes calls with comments and with same-named members of unrelated types. |
| What does this expression resolve to? | a type reveal in the checker (`reveal_type`, `tsc` error text, `rustc` mismatch message) | Names suggest types that often differ from the real ones. |
| Is this rename safe here? | `gopls rename -d`, or a branch-local edit plus a diagnostics run | A locally valid rename can still break a caller. |

Rule of thumb: questions about identity or reach go to a checker or symbol tool, and questions about intent are
answered by reading with `read_file`.

### Per-language starting points

| Extensions | Checker the normaliser runs | Project config it respects |
| --- | --- | --- |
| `.ts .tsx .mts .cts .js .jsx .mjs .cjs` | `tsc --noEmit --pretty false`: project mode when a `tsconfig.json` sits above the file, otherwise a loose per-file check | `tsconfig.json`, nearest `node_modules/.bin/tsc` |
| `.py .pyi` | `pyright` or `basedpyright` (`--outputjson`), `ruff check --output-format json`, `mypy` only when pyright is absent; plus a stdlib syntax check labelled syntax-only | `pyrightconfig.json`, `pyproject.toml`, `ruff.toml` |
| `.go` | `gopls check`; otherwise `go vet ./...` at the module root (package level) | `go.mod`, `go.work` |
| `.rs` | `cargo check --message-format=json --all-targets` at the crate root | `Cargo.toml` |
| `.c .h .cc .cpp .cxx .hpp` | `clangd --check=<file>`; otherwise `clang` or `cc -fsyntax-only` | `compile_commands.json`, `.clangd` |
| `.sh .bash .zsh .ksh` | `shellcheck -f json`; otherwise `bash -n` (syntax only, labelled) | `.shellcheckrc` |
| anything else | the script reports `unsupported`; use the project's own build, lint or test command | n/a |

A project-mode `tsc` run reports every error in the project, and the normaliser filters to the files you named. A
clean answer for your three files therefore claims nothing about the rest. Write "no findings in the 3 files I
changed", never "the project typechecks".

### Reading the normalised output

```json
{"file":"src/a.ts","line":12,"col":5,"severity":"error","code":"TS2322","message":"Type 'string' is not assignable to type 'number'.","source":"tsc"}
```

- `line` and `col` are 1-based. A `0` means the tool gave no position (a project-level or tool-level entry).
- `code` is the checker's own rule id (`TS2322`, `reportAttributeAccessIssue`, `E0308`, `SC2086`). Keep it in reports;
  it lets a reader look the rule up and lets you judge whether a suppression is legitimate.
- `source` names the tool and says `(syntax only)` when only a parser check ran. Syntax-only output is a parse
  result and is cited as one, never as a typecheck.
- Exit codes: `0` no error-level findings, `1` at least one error, `2` usage error, `3` only gaps (`missing`,
  `failed`, `unsupported`) with nothing else to report. Exit 3 is a gap report, and the work is still unverified.

## Muse tools and approvals

- `bash` runs the normaliser and the checker CLIs. Start from the project root unless a recipe says otherwise, and
  keep checker runs read-only: `--noEmit`, `check`, `vet`, `--check`; skip `build`, `fix`, `--write` and `format`.
  `cargo check` and `tsc --noEmit` can still write build metadata under `target/` or `.tsbuildinfo` when the project
  config asks for it; report that when it shows in `git status`.
- `read_file` and `search` answer intent questions and give the textual fallback. Label a `search` result as
  textual whenever it substitutes for a symbol answer.
- `subagent_spawn` is optional. For a wide reference audit use read-only agents (`litmuse/lit-planner`,
  `litmuse/quality-reviewer`, `litmuse/lit-verifier`). A child spawned without `subagent_type` is general-purpose
  with every work tool, including write and shell tools, so hand it nothing that could turn into edits.
- `request_user_input` has one use here: asking whether the user wants an install command run in their own
  terminal. Headless runs log the default (do not install) as a `decision` ledger line.
- The skill itself needs no `muse plugins approve`; skills and commands run without it. The LitMuse hooks may append
  a note after edits. Read it as a reminder to run this loop, and as no diagnostics result.
- Install nothing from inside this skill: no `npm install`, `pip install`, `go install`, `cargo install`, `brew` or
  `rustup component add`. Print the exact command and let the user run it with `! <command>` at the prompt.
- Keep checker configuration out of `~/.claude`, `~/.codex` and Muse's own config and credential files. Muse reads
  `~/.claude/CLAUDE.md`, `~/.claude/skills` and `~/.codex/skills` as foreign personal context; that is a read-only
  fact about the host, and a poor place to store tool settings.

## Evidence

Cite diagnostics so a reviewer can replay them.

1. **Capability line**: which checker, which version (`--tools` prints it), which files it covered. For example
   "tsc 5.x, project mode, tsconfig at `./tsconfig.json`, 4 files."
2. **Result**: the normalised JSON or its exact error rows, with `code`, `source` and `line`.
3. **Delta**: baseline against after-edit, split into introduced, fixed and pre-existing.
4. **Limits**: what the evidence leaves unproven. A file-scoped run says little about the whole build. A syntax-only
   run says little about types. `go vet` is package level and gives no references. A textual search says little
   about symbol identity.
5. **Gaps**: every `missing`, `failed` or `unsupported` row, quoted, with the fallback used and the install command
   the user could run (printed, never executed).
6. **Cleanup**: any scratch file, `.tsbuildinfo`, `target/` change or leftover process you created.

Cite a clean result only when the checker was observed present, the run produced no `failed` row, and the files you
changed were inside its scope. Otherwise report the gap.

For a rename or signature change, add the reference inventory: how many references, how many sit outside the package
that owns the symbol, and which came from a symbol tool and which from text alone. When references extend beyond the
package boundary, the change is an interface change and needs acceptance criteria beyond a passing check.

### Safe rename procedure when no symbol tool exists

1. Identify the declaration and its export boundary.
2. Search exact and transformed spellings (`fooBar`, `foo_bar`, `FOO_BAR`, `foo-bar`).
3. Classify hits: code, strings and keys, configuration, generated files, documentation.
4. Capture the baseline diagnostics and the project's typecheck and test results.
5. Edit one ownership region at a time and re-run the narrow check after each region.
6. Run the full relevant suite and one user-visible scenario.
7. Inspect the diff for accidental text replacements, especially inside strings and comments.

Run replacements in scoped steps only; an unrestricted replace across the repository based on a spelling match is
how identically named but unrelated symbols get renamed.

## Stop and report

Stop and report with `BLOCKED:` when:

- No checker serves the edited file type. Name the extension, quote the `missing` or `unsupported` rows, hand off to
  `lsp-setup`, and gather evidence from the project's own build, typecheck, lint or test command meanwhile. Keep the
  claim at "the code was not verified by a checker".
- The checker errors instead of answering (`failed`). The first stderr line goes in the report. One retry is fine
  after fixing the cause (wrong working directory, missing `go.mod`, stale lockfile); a retry loop is not.
- A rename or removal has a reference set that crosses a package or repository boundary that needs approval.
- Clearing a finding would require a behavior change, a suppression comment (`// @ts-ignore`, `# type: ignore`,
  `#[allow(...)]`) or a loosened `tsconfig` flag. Suppressing a diagnostic to tidy the output is a defect in itself.
  When a diagnostic is genuinely wrong, say so with the reason and leave the decision to the user.
- The checker's own configuration is broken (invalid `tsconfig.json`, unreadable `pyproject.toml`). Report the parse
  error and leave the config as it is.
- A command would need the network, an install, or credentials.

Documentation-only changes never stop here, since this skill is outside them.

## Pitfalls

- Reporting an empty list as "no problems" when the checker was missing, timed out, or looked at a different root.
  The normaliser's `missing` and `failed` rows exist to prevent this; read them.
- Taking an exit 0 for the whole project as proof about three files, or the reverse. Scope matters both ways.
- Citing a `syntax only` row as a typecheck.
- Running `tsc` without a project (`-p`) in a monorepo and getting config-less defaults (loose flags, no path
  aliases) that disagree with the real build. Use project mode and say which `tsconfig` applied.
- Running `pyright` from a directory without the project's virtual environment and reading "import could not be
  resolved" as a code defect. Check `venvPath` in `pyrightconfig.json` or activate the environment first.
- Fixing every pre-existing warning because the output is noisy. That grows a small change into a sprawling one.
- Omitting pre-existing errors so a file looks cleaner than it is.
- Using `rg` for references and calling the result a symbol answer.
- Letting a tool write files: `ruff --fix`, `cargo fix`, `go fmt -w`, `eslint --fix` and `tsc` without `--noEmit`
  all modify the tree. Those are edits, so keep them out of a diagnostics run.
- Starting with a whole-repo sweep. It buries the three findings your change caused under everything anyone ever
  left behind. Narrow first.
- Installing a checker mid-task to make the loop green. The user decides; print the command.
- Assuming the checker found by `which` is the project's pinned version. Prefer `node_modules/.bin`, `.venv/bin` and
  the toolchain file (`rust-toolchain.toml`, the `toolchain` line in `go.mod`) over a global binary, and report the
  version.

## Companion references

- `references/runtime-triage.md`: protocol-order diagnosis for a language server someone configured outside Muse,
  and for a checker that gives contradictory or empty results (root, document, indexing, capability).
- `references/cli-recipes.md`: exact CLI invocations for diagnostics, definition, references, rename preview and
  structural search per language, with the output shape each prints.
- `scripts/diagnostics.mjs`: the dependency-free normaliser described above (`--tools`, `--all`, `--timeout=`).
- `scripts/tsserver-query.mjs`: one-shot `definition`, `references`, `quickinfo` and `rename` preview against the
  project's installed TypeScript (`node tsserver-query.mjs references src/a.ts 12 5`); exit 3 when `typescript` is
  missing, and it installs nothing.
