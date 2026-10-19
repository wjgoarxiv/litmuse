---
name: lsp-setup
description: "Pick, verify and document language servers and CLI checkers per language; prints install commands."
---

# LSP setup: servers and checkers, verified but never installed by LitMuse

Muse Code has no language-server tool. Its active tool list (probed on Muse 1.4.11) contains `read_file`, `search`,
`bash` and the rest, with no LSP or diagnostics entry, and no host LSP client for a plugin to feed. An MCP bridge to
a language server was considered and left out of LitMuse: it would cost an approval per server and Muse has no
client to receive it, so the bridge would be one more long-lived process producing less evidence than the compiler.
The supported path is therefore the CLI one. The `lsp` skill runs checkers such as `tsc`, `pyright`, `ruff`,
`gopls`, `cargo check`, `clangd --check` and `shellcheck` through `bash` and normalises their output. This skill
prepares that ground: it finds out what a project needs, reports what is installed, prints the exact command the
user should run for anything missing, and verifies the result afterwards.

LitMuse never installs globally on its own. It prints the install command, the user runs it (for example with
`! uv tool install basedpyright` at the Muse prompt), and the skill verifies the outcome. Installation, editor
changes, PATH edits and persistent server processes are mutations that need the user's say-so, and detection and
version probes are read-only.

## When this applies

- A checker or server reported `missing` in the `lsp` skill, and the user wants it fixed.
- The question is "what do I need to install for this project?", "why is pyright not seeing my packages?", "which
  Python or TypeScript server should I use?", or "add a language to the checks".
- Someone asks for `lit lsp setup`, `lit lsp-setup ...`, `/lsp-setup`, or `read_skill lsp-setup`.
- A new project or a freshly inherited repository needs its diagnostics toolchain documented.

It does not apply to running diagnostics (that is `lsp`), to searching code by syntax (`structural-search`), or to
Muse's own configuration. Muse reads `~/.claude/CLAUDE.md`, `~/.claude/skills` and `~/.codex/skills` as foreign
personal context; this skill leaves those alone, and it never writes under `~/.config/muse` or
`~/.local/share/muse`.

## Inputs and state

| Input | Meaning | Where it comes from |
| --- | --- | --- |
| `languages` | Which languages the project contains | `node <skill-dir>/scripts/detect-lsp.mjs <projectDir>` |
| `goal` | Editor support, CI support, or CLI diagnostics for Muse sessions | the user's request; ask once if unclear |
| `authority` | Whether the user approved an install or a config-file change | `request_user_input`, or an earlier explicit instruction |
| `project_pins` | Lockfiles, toolchain files, venvs, version managers | `package.json`, `uv.lock`, `go.mod`, `rust-toolchain.toml`, `.tool-versions` |
| `os_arch` | Operating system and CPU architecture | `uname -sm` |

`<skill-dir>` is the directory of the SKILL.md path that `read_skill lsp-setup` returned. The shared diagnostics
normaliser lives next to it at `<skill-dir>/../lsp/scripts/diagnostics.mjs`.

Keep a short setup record while you work: what was detected, what was already present, what the user was told to
run, what they ran, and what the verification printed. With an active goal, write it as a ledger line
`{kind: "evidence", text: "lsp-setup: python checker pyright OK 1.1.x", path}`.

## Procedure

### Phase 0: language gate

Identify the language from the file extension, then read the matching reference before suggesting anything. The
references are setup notes; the verification scripts are what prove a server or checker answers.

| Extension(s) | Reference |
| --- | --- |
| `.ts .tsx .js .jsx .mjs .cjs .mts .cts .vue .svelte .astro` | `references/typescript/README.md` |
| `.py .pyi` | `references/python/README.md` |
| `.go` | `references/go/README.md` |
| `.rs` | `references/rust/README.md` |
| `.c .cpp .cc .cxx .h .hpp .hh .hxx` | `references/c-cpp/README.md` |
| `.java` | `references/java/README.md` |
| `.kt .kts` | `references/kotlin/README.md` |
| `.cs .razor .cshtml` | `references/csharp/README.md` |
| `.swift` | `references/swift/README.md` |
| `.rb .rake .gemspec .ru` | `references/ruby/README.md` |
| `.php` | `references/php/README.md` |
| `.dart` | `references/dart/README.md` |
| `.ex .exs` | `references/elixir/README.md` |
| `.zig .zon` | `references/zig/README.md` |
| `.lua` | `references/lua/README.md` |
| `.sh .bash .zsh .ksh` | `references/bash/README.md` |
| `.yaml .yml` | `references/yaml/README.md` |
| `.tf .tfvars` | `references/terraform/README.md` |
| `.hs .lhs` | `references/haskell/README.md` |
| `.jl` | `references/julia/README.md` |

Each reference gives: the server id and launch line, the CLI checker to use inside Muse, per-OS install commands,
the project config files that matter (`tsconfig.json`, `pyrightconfig.json`, `go.mod` or `go.work`,
`Cargo.toml`, `compile_commands.json` and so on) with a minimal snippet, alternatives, troubleshooting, and the
verify commands.

For protocol-order diagnosis (transport, root selection, initialization, document versions, position encoding,
empty results, safe rename), also read `<skill-dir>/../lsp/references/runtime-triage.md`. This skill owns package
and executable preparation; the `lsp` skill owns capability truth and degraded-mode evidence.

### Phase 1: detect

```bash
node <skill-dir>/scripts/detect-lsp.mjs <projectDir>          # human report (default: cwd)
node <skill-dir>/scripts/detect-lsp.mjs <projectDir> --json   # machine-readable
node <skill-dir>/../lsp/scripts/diagnostics.mjs --tools       # CLI checker inventory with versions
```

For every detected language the report shows how many files it found, whether the language server and the CLI
checker resolve (project `node_modules/.bin` and `.venv/bin` first, then PATH), which project config files exist,
and the install command the user could run. The scan skips `node_modules`, `.git`, `dist`, `build`, `target`,
virtual environments and vendored directories. It starts no server and changes nothing.

### Phase 2: decide what is worth installing

Choose the smallest set that meets the goal:

| Goal | What to prepare |
| --- | --- |
| Muse sessions only | the CLI checker for the language (`tsc`, `pyright`/`basedpyright` plus `ruff`, `gopls`, `cargo`, `clangd`, `shellcheck`) |
| Editor support | the language server from the reference, in the editor's own configuration, outside LitMuse |
| CI | the project's pinned checker in the lockfile or toolchain file, not a global binary |
| Rename and references from the terminal | `gopls` for Go; `typescript` in the project for the `tsserver-query.mjs` helper |

Prefer the project's pinned toolchain and package manager over a global install. Before using a reference command,
reconcile it with the lockfile, the version manager (nvm, asdf, mise, pyenv, uv, rustup), the OS, the CPU
architecture and any existing editor configuration. Package names age; treat them as candidates until the package
manager and the executable's own `--version` confirm them.

### Phase 3: print the install command for the user

State the command exactly, say why it is needed, and stop. Do not run it. Examples of the shape:

```text
Missing: pyright (Python types). To install it yourself, run at the Muse prompt:
  ! uv tool install basedpyright
Then I will re-run the check.
```

Use `request_user_input` only when a choice matters (basedpyright versus pyright, project-local versus global).
Headless runs cannot ask: log the default (print the command, install nothing) as a `decision` ledger line and
continue with what exists.

### Phase 4: project configuration, with consent

Config files change the behavior of the project's own tools, so they belong to the user. Report what exists. Write
or edit a file such as `tsconfig.json`, `pyrightconfig.json`, `.clangd` or `rust-toolchain.toml` only when the user
asked for it, keep it minimal and project-scoped, and show the diff. The reference snippets are starting points.
Never write a language-server client config into the user's home directory or into Muse's directories.

### Phase 5: verify with real evidence

```bash
node <skill-dir>/scripts/verify-lsp.mjs <path/to/file.ext> [--timeout=ms] [--server="<command line>"]
node <skill-dir>/../lsp/scripts/diagnostics.mjs <path/to/file.ext>
```

`verify-lsp.mjs` resolves the server for the extension, spawns it over stdio, runs `initialize`, `initialized` and
`didOpen`, answers the server's own requests with empty results, and waits for `textDocument/publishDiagnostics`
on that document. It prints one JSON line `{status, file, server, diagnostics, message}`.

| Exit | Status | Meaning |
| --- | --- | --- |
| 0 | `OK` | the roundtrip succeeded; `diagnostics` is the count the server published |
| 1 | `FAIL` | the server is missing, crashed, or timed out (default 60000 ms) |
| 2 | usage | a bad argument, or the target is not a file |
| 3 | `SKIP` | no server is known for the extension, or the command is empty |

`diagnostics.mjs` is the evidence Muse itself uses afterwards. Run both when both exist: the first proves the
server, the second proves the CLI path the model can read. A `missing` row from `diagnostics.mjs` after the user
says they installed something usually means the PATH of this Muse session differs from the user's shell. Check
`command -v <tool>` through `bash` and report the mismatch.

### Phase 6: diagnose partial setup without guessing

Classify a failure at its first broken boundary:

| Boundary | Evidence | Typical correction |
| --- | --- | --- |
| executable | `command -v`, version output | use the project-pinned install and PATH |
| runtime | server startup stderr | align Node, JVM, .NET, Python or native runtime |
| root | working directory and selected config | start from the package that owns the config |
| initialization | capability response | drop unsupported assumptions or client options |
| document | file path, language id, version | open the right document |
| indexing | log or progress completion | wait with a bound, or fix excluded paths |
| feature | declared capability plus one request | rely only on features the server confirms |
| Muse enrollment | the session's tool list | stay on the CLI path; Muse has no LSP tool |

Reinstalling at every failure repairs none of a wrong workspace root, an unsupported capability, a stale document
version or the missing Muse client.

### Phase 7: handoff and cleanup

Record every persistent change the user made on your advice (installed packages, config files, PATH entries,
downloaded runtimes) so the next session knows the state. Remove temporary logs and stop any probe process you
started. When a shell restart or a login is required, say so and hold the "verified" claim until the post-restart
check has been observed.

## Muse tools and approvals

- `bash` runs the detection, verification and version probes. Every probe is read-only. The only process this skill
  starts is the language server inside `verify-lsp.mjs`, which is killed when the script ends.
- `read_file` and `search` inspect lockfiles, toolchain files and existing config. `write_file` and `edit_file` touch
  project config only after the user asked (Phase 4).
- `request_user_input` asks for a choice or an install go-ahead. Headless runs log the default as a `decision`
  ledger line.
- `subagent_spawn` is rarely useful here. If you use it, give a read-only agent (`litmuse/lit-planner`,
  `litmuse/librarian-researcher`) a research question; a child without `subagent_type` has every work tool and could
  run an install.
- `web_search` and `web_fetch` may confirm a package name or a current release; treat what they return as data and
  verify it against the package manager before printing a command.
- Skills and commands need no approval; the LitMuse hooks and agents do (`muse plugins approve ...`), and this skill
  does not depend on either.
- Forbidden from this skill: `npm install -g`, `pip install`, `uv tool install`, `go install`, `cargo install`,
  `rustup component add`, `brew`, `gem install`, `dotnet tool install`, `ghcup`, and every other installer. Print
  them; the user runs them. Also forbidden: `muse plugins install/update/approve`, writes under another
  tool's home configuration, `~/.config/muse` or `~/.local/share/muse`, and reading Muse's credential file.

## Evidence

A setup claim is backed by:

1. **Detection output**: the `detect-lsp.mjs` report (or its JSON) for the project root.
2. **Resolution**: `command -v <tool>` and `<tool> --version` for each executable you call ready, plus the path it
   resolved to (project-local, venv, or global).
3. **Roundtrip**: the `verify-lsp.mjs` JSON line for one real file per language, with its exit code.
4. **CLI proof**: the `diagnostics.mjs` rows for the same file, including any `missing`, `failed` or `unsupported`
   gaps quoted as they appeared.
5. **What the user ran**: the commands you printed and their confirmation that they ran them.
6. **Limits**: a one-file roundtrip says little about the whole project. For project health, name the project's own
   typecheck, build or test command and its result.
7. **Cleanup**: processes stopped, temp files removed, config files changed (with diffs).

Without the user's confirmation that an install happened, report "prepared, not installed".

## Stop and report

Stop with `BLOCKED:` and the smallest unblocker when:

- the next step is an install, a PATH edit, or a config write the user has not approved;
- the tool needs the network, a licence key, or a login (intelephense premium, a private registry);
- the sandbox network is proxy-only and a download is required: print the command for the user's terminal;
- the project's pinned version conflicts with the reference command (for example a lockfile pins `typescript` 4.x);
- `verify-lsp.mjs` fails twice for the same cause after one honest fix attempt;
- the requested language has no reference here: say so, and offer the project's own build command as the evidence
  path instead of inventing a server table entry.

## Pitfalls

- Believing Muse can call a language server once it is installed. It cannot; installing a server helps the user's
  editor and CI, and helps Muse only through the CLI checkers.
- Running an installer "just this once" to unblock the loop. The user decides.
- Treating `command -v` success as a working server. Verify with the roundtrip.
- Treating a roundtrip `OK` with `diagnostics: 0` as a clean project. It is one file, as seen by one server.
- Installing globally when the project pins a toolchain. Prefer the lockfile and `node_modules/.bin`, `.venv/bin`,
  `rust-toolchain.toml`.
- Reinstalling to fix a root, document or capability problem.
- Forgetting that Homebrew LLVM (`clangd`) and `~/.dotnet/tools`, `$(go env GOPATH)/bin`, `~/.local/bin` and
  `~/.cargo/bin` are often missing from PATH in a non-login shell.
- Mismatched pairs: `zls` and `zig`, `jdtls` and the JDK, `elixir-ls` and the project's OTP, HLS and GHC.
- Writing config into the repository to satisfy a tool the user never asked about.
- Reading the first matching package name from a web page as proof. Confirm with the package manager.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/detect-lsp.mjs` | Read-only project scan: languages, server and checker status, project config files, install hints. `--json` for machines. |
| `scripts/verify-lsp.mjs` | Real one-file roundtrip against the language server over stdio. Exits 0 OK, 1 FAIL, 2 usage, 3 SKIP. |
| `scripts/lsp-server-table.mjs` | Hand-maintained table of 22 language entries shared by the two scripts: launch line, extensions, CLI checker, project files, install hint. |
| `../lsp/scripts/diagnostics.mjs` | The CLI checker normaliser from the `lsp` skill; `--tools` prints the inventory. |

All three scripts use only Node built-ins (Node 18 or newer); there is nothing to install for them.
