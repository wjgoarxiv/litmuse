# Rust: language-server and checker setup

- **Server id:** `rust` with launch line `rust-analyzer`
- **Extensions:** .rs
- **CLI checker for the Muse path:** cargo check --message-format=json (covered by lsp/scripts/diagnostics.mjs); rust-analyzer diagnostics .

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `rustup component add rust-analyzer rust-src` (pinned to the toolchain)
- macOS alternative: `brew install rust-analyzer`

Confirm afterwards:

```bash
command -v rust-analyzer cargo; rustup component list --installed
```

The rustup component stays in step with the toolchain. `rust-src` lets it index the standard library.

## Project configuration

- `Cargo.toml` at the crate or workspace root; `rust-toolchain.toml` pins the toolchain.
- `.cargo/config.toml` and feature flags change what compiles; record them.

```toml
[toolchain]
channel = "stable"
components = ["rust-analyzer", "rust-src", "clippy"]
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `cargo clippy` | lint findings through the same JSON message format |

## Troubleshooting

- **PATH:** the rustup shims live in `~/.cargo/bin` (or the Homebrew rustup prefix); reopen the shell.
- **Crashes while loading rust-src:** run `rustup component remove rust-src && rustup component add rust-src` yourself.
- **Proc-macro or build-script failures:** confirm `cargo check` passes first; rust-analyzer reuses the same toolchain.
- **Slow first run:** `cargo check` builds dependencies; pass `--timeout=600` to the normaliser instead of retrying.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
