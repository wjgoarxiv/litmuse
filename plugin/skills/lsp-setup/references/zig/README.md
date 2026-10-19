# Zig: language-server and checker setup

- **Server id:** `zls` with launch line `zls`
- **Extensions:** .zig .zon
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use zig build --summary all or zig ast-check <file>

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- macOS: `brew install zls`
- Elsewhere: download a prebuilt release that matches your Zig version from https://github.com/zigtools/zls, or build it with `zig build -Doptimize=ReleaseSafe`.

Confirm afterwards:

```bash
command -v zls zig; zig version; zls --version
```

The zls version must match the zig version. A mismatch gives crashes, parse errors or silent failures.

## Project configuration

- `build.zig` and `build.zig.zon` at the root.

```
zig ast-check src/main.zig   # syntax and AST checks without a full build
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **Version mismatch (critical):** after upgrading Zig, upgrade or rebuild zls too.
- **zig not found:** zls shells out to `zig`; it must be on PATH as well.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
