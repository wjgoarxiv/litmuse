# Haskell: language-server and checker setup

- **Server id:** `haskell-language-server` with launch line `haskell-language-server-wrapper --lsp`
- **Extensions:** .hs .lhs
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use cabal build --dry-run or cabal build all / stack build as the project command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `ghcup install hls` (install ghcup from https://www.haskell.org/ghcup/, or `brew install ghcup`)
- A GHC plus Cabal or Stack is needed first: `ghcup install ghc`, `ghcup install cabal`.

Confirm afterwards:

```bash
command -v haskell-language-server-wrapper ghc cabal
```

HLS must support the project's GHC version.

## Project configuration

- `cabal.project`, `stack.yaml`, and `hie.yaml` (the "cradle") for multi-package repos; `gen-hie > hie.yaml` generates one.

```yaml
cradle:
  cabal:
    component: "lib:myproject"
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **GHC mismatch:** install an HLS build for the project's GHC, or align the GHC.
- **No cradle:** add `hie.yaml` in multi-package repos.
- **Slow first load:** HLS compiles dependencies on first open; wait with a bound.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
