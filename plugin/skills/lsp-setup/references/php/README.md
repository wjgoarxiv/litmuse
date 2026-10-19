# PHP: language-server and checker setup

- **Server id:** `php` with launch line `intelephense --stdio`
- **Extensions:** .php
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use php -l <file> for syntax, and vendor/bin/phpstan analyse --error-format=json when the project has it

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `npm install -g intelephense` (needs Node.js)

Confirm afterwards:

```bash
command -v intelephense php
```

Intelephense is a Node package; premium features need a licence key that LitMuse never handles.

## Project configuration

- `composer.json` and `vendor/` for autoload resolution; `phpstan.neon` for static analysis.

```json
{ "intelephense": { "environment": { "phpVersion": "8.3" } } }
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `phpactor` | open-source alternative |
| `phpstan` or `psalm` | CLI static analysers |

## Troubleshooting

- **PATH:** reopen the shell after a global npm install.
- **No Node.js:** install Node, then the package.
- **Wrong PHP version inferred:** set the `phpVersion` initialization option to match the project.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
