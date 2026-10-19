# YAML: language-server and checker setup

- **Server id:** `yaml-ls` with launch line `yaml-language-server --stdio`
- **Extensions:** .yaml .yml
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use yamllint -f parsable <file> when the project uses it, or a schema validator such as check-jsonschema

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `npm install -g yaml-language-server`

Confirm afterwards:

```bash
command -v yaml-language-server yamllint
```

Validation needs a schema. Without one the server only checks syntax.

## Project configuration

- A `# yaml-language-server: $schema=<url>` modeline in the file, or `yaml.schemas` in the client settings; `.yamllint` for lint rules.

```yaml
# yaml-language-server: $schema=https://json.schemastore.org/github-workflow.json
name: ci
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `yamllint` | lint CLI |
| `check-jsonschema` | schema validation CLI |

## Troubleshooting

- **No validation:** no schema matched; add a modeline or `yaml.schemas` entry.
- **Wrong schema applied:** SchemaStore guesses by file name; pin the schema explicitly.
- **PATH:** reopen the shell after a global npm install.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
