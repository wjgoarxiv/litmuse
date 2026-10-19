# Python: language-server and checker setup

- **Server id:** `basedpyright` with launch line `basedpyright-langserver --stdio`
- **Extensions:** .py .pyi
- **CLI checker for the Muse path:** pyright or basedpyright --outputjson, ruff check, mypy fallback, and a stdlib syntax check (covered by lsp/scripts/diagnostics.mjs)

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `uv tool install basedpyright` (isolated, on PATH via `~/.local/bin`)
- `pip install --user basedpyright` or `pip install pyright`
- Optional linter next to it: `uv tool install ruff`

Confirm afterwards:

```bash
command -v basedpyright-langserver pyright ruff
```

Type checkers and the linter serve different roles. Run a type server and, optionally, `ruff` alongside it rather than instead of it.

## Project configuration

- `pyrightconfig.json` or `[tool.pyright]` / `[tool.basedpyright]` in `pyproject.toml`: `typeCheckingMode`, `venvPath`, `venv`, `include`, `exclude`.
- `ruff.toml` or `[tool.ruff]` in `pyproject.toml` for lint rules.

```json
{ "venvPath": ".", "venv": ".venv", "typeCheckingMode": "standard", "include": ["src"] }
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `pyright-langserver --stdio` | upstream type checker |
| `ty server` | Astral, fast, pre-1.0 |
| `ruff server` | lint and format only; complements a type server |
| `mypy` | CLI-only type checker; the normaliser uses it when pyright is absent |

## Troubleshooting

- **PATH:** `uv tool install` writes to `~/.local/bin`; make sure that directory is on PATH.
- **"Import could not be resolved":** the checker is not seeing the project virtual environment. Set `venvPath` and `venv`, or run it inside the activated environment, before calling it a code defect.
- **Syntax-only row:** the stdlib compile check is a parse result; do not cite it as a type check.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
