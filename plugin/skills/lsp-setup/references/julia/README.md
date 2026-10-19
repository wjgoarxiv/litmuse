# Julia: language-server and checker setup

- **Server id:** `julials` with launch line `julia --startup-file=no --history-file=no -e "using LanguageServer; runserver()"`
- **Extensions:** .jl
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; no syntax-only check is wired; the project's own test command (`julia --project -e 'using Pkg; Pkg.test()'`, run by the user's approval) is the evidence

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- macOS: `brew install juliaup && juliaup add release`
- Linux: `curl -fsSL https://install.julialang.org | sh`
- Windows: `winget install julia -s msstore`
- Then add the package to a shared environment: `julia -e 'using Pkg; Pkg.activate("lsp"; shared=true); Pkg.add("LanguageServer")'`

Confirm afterwards:

```bash
command -v julia
```

There is no `julials` binary; the server is launched by the `julia` command itself.

## Project configuration

- `Project.toml` and `Manifest.toml` at the root.

```
JULIA_PROJECT=@lsp julia --startup-file=no -e 'using LanguageServer; runserver()'
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **First run precompiles and is silent:** it can take minutes; use a long `--timeout` and do not kill it.
- **Package not found:** `LanguageServer` must be in the environment the server runs in; set `JULIA_PROJECT` to it.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
