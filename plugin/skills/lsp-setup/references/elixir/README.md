# Elixir: language-server and checker setup

- **Server id:** `elixir-ls` with launch line `elixir-ls`
- **Extensions:** .ex .exs
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use mix compile --warnings-as-errors --no-deps-check as the project command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- Needs Erlang/OTP and Elixir first.
- macOS: `brew install elixir-ls`
- Linux or manual: build the release from https://github.com/elixir-lsp/elixir-ls (`mix deps.get && mix compile && mix elixir_ls.release2 -o release`) and put `release/` on PATH.

Confirm afterwards:

```bash
command -v elixir-ls elixir mix; elixir --version
```

Build elixir-ls with the same Erlang and Elixir versions the project uses to avoid bytecode errors.

## Project configuration

- `mix.exs` at the project root; `.formatter.exs` for formatting.

```
asdf reshim elixir   # asdf users, after installing the launcher
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `lexical` | alternative Elixir server |
| `next-ls` | alternative Elixir server |

## Troubleshooting

- **asdf shims:** reshim after installing so the `elixir-ls` shim resolves.
- **Slow first start:** ElixirLS compiles dependencies on first run.
- **OTP mismatch:** rebuild elixir-ls against the project's toolchain.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
