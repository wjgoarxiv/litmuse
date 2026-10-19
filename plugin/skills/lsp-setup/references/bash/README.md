# Bash and POSIX shell: language-server and checker setup

- **Server id:** `bash` with launch line `bash-language-server start`
- **Extensions:** .sh .bash .zsh .ksh
- **CLI checker for the Muse path:** shellcheck -f json, falling back to bash -n (covered by lsp/scripts/diagnostics.mjs)

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `npm install -g bash-language-server`
- Real diagnostics need ShellCheck: macOS `brew install shellcheck`; Debian or Ubuntu `apt install shellcheck`; Fedora `dnf install ShellCheck`.

Confirm afterwards:

```bash
command -v bash-language-server shellcheck
```

ShellCheck does the linting. The language server only wraps it, and the CLI path needs ShellCheck alone.

## Project configuration

- `.shellcheckrc` for `shell=`, `disable=` and `external-sources=true`.
- A `# shellcheck shell=bash` directive in the file also sets the dialect.

```
shell=bash
external-sources=true
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `shfmt` | formatter, not a linter |

## Troubleshooting

- **No diagnostics:** ShellCheck is missing; install it and reopen the shell.
- **Wrong dialect:** `.zsh` and `.ksh` files are linted as bash and ShellCheck may flag shell-specific syntax; state that in the report.
- **PATH:** reopen the shell after a global npm install.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
