# Go: language-server and checker setup

- **Server id:** `gopls` with launch line `gopls`
- **Extensions:** .go
- **CLI checker for the Muse path:** gopls check, falling back to go vet ./... (covered by lsp/scripts/diagnostics.mjs); gopls definition, references, rename -d for navigation

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `go install golang.org/x/tools/gopls@latest`
- macOS alternative: `brew install gopls`
- The binary lands in `$(go env GOPATH)/bin`; add that directory to PATH.

Confirm afterwards:

```bash
command -v gopls; go env GOPATH
```

Requires the Go toolchain. `gopls` is the official and effectively only Go server.

## Project configuration

- `go.mod` at the module root (or `go.work` for a workspace) selects the build context; open the directory that contains it.
- `GOFLAGS`, build tags and `go.work` change what gopls loads; record them in the report.

```
module example.com/app

go 1.22
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **PATH:** export `$(go env GOPATH)/bin` and reopen the shell.
- **"no required module":** start from the directory holding `go.mod`; outside a module gopls degrades to per-file results. Run `go mod tidy` yourself if dependencies are unresolved.
- **Stale toolchain:** after upgrading Go, reinstall gopls with the same `go install` command.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
