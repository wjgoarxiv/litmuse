# CLI recipes for diagnostics and navigation

Muse has no language-server tool, so each question below is answered by a command run through `bash`. Every recipe
is read-only. A recipe whose tool is absent is a `missing` row in your report; the install command is printed for
the user and never run by the skill. `<skill-dir>` is the directory of the `lsp` SKILL.md that `read_skill lsp`
returned. Positions are 1-based unless a recipe says otherwise.

Always probe first:

```sh
node <skill-dir>/scripts/diagnostics.mjs --tools      # inventory with versions, one JSON array
```

## Diagnostics (all languages)

```sh
node <skill-dir>/scripts/diagnostics.mjs src/a.ts src/b.ts      # scoped to the files named
node <skill-dir>/scripts/diagnostics.mjs --all src/a.ts          # everything the checker reported
node <skill-dir>/scripts/diagnostics.mjs --timeout=300 crate/src/lib.rs
```

Output is one JSON array of `{file, line, col, severity, code, message, source}`. Severities `missing`, `failed` and
`unsupported` are gaps. Exit `0` clean of errors, `1` errors present, `2` usage, `3` gaps only.

## TypeScript and JavaScript

| Need | Command | Notes |
| --- | --- | --- |
| Diagnostics, project mode | `tsc --noEmit --pretty false -p tsconfig.json` | Output is `path(line,col): error TSnnnn: message`. Prefer `node_modules/.bin/tsc`. |
| Diagnostics for a loose file | `tsc --noEmit --pretty false --skipLibCheck --allowJs --checkJs file.ts` | No project flags apply; say so in the report. |
| Which config applied | `tsc --showConfig -p tsconfig.json` | Confirms `strict`, `paths`, `include`. |
| Why a module resolves where it does | `tsc --noEmit --traceResolution -p tsconfig.json \| rg "'./lib'"` | A definition answer for imports and re-exports. |
| Definition, references, type at a position | `node <skill-dir>/scripts/tsserver-query.mjs definition\|references\|quickinfo\|rename <file> <line> <col>` | Talks to the project's own `typescript` package. Exit 3 when `typescript` is absent. |
| Lint findings | `eslint --format json <files>` | Only when the project already configures ESLint. Without `--fix`. |

`typescript-language-server` has no one-shot command line. When it is installed it is useful to an editor, and for
Muse the `tsserver-query.mjs` helper reaches the same `tsserver` underneath. `rename` returns the locations that a
rename would touch; it applies nothing. The helper reports `missing` when `typescript` is absent and installs
nothing.

Monorepo note: run from the package that owns the `tsconfig.json`, or let the normaliser find the nearest one above
the file. A root `tsconfig.json` with `references` and `files: []` checks nothing by itself; use `tsc -b --noEmit`
only if the project already builds that way, and report that build mode may write `.tsbuildinfo`.

## Python

| Need | Command | Notes |
| --- | --- | --- |
| Type diagnostics | `pyright --outputjson <files>` (or `basedpyright`) | `generalDiagnostics[]` with 0-based `range`; the normaliser converts to 1-based. |
| Type reveal | add `reveal_type(expr)` in a scratch copy, run `pyright <scratch>` | Never leave the call in the real file. |
| Lint findings | `ruff check --output-format json --no-cache <files>` | Never `--fix`. |
| Type diagnostics, fallback | `mypy --show-column-numbers --show-error-codes --no-error-summary --no-color-output <files>` | Used by the normaliser only when pyright is absent. |
| Syntax only | `python3 -I -c "import sys; compile(open(sys.argv[1]).read(), sys.argv[1], 'exec')" <file>` | Always available with python3; labelled syntax-only. |
| References, textual | `rg -n --word-regexp '<name>' --glob '*.py'` | Label as textual; it cannot tell a method from a same-named attribute. |
| Environment problems | `pyright --verbose <file> 2>&1 \| head -40` | Shows which interpreter and `venvPath` were used. |

Python has no standard one-shot go-to-definition CLI. Use `rg` for candidates, then read the import chain with
`read_file`, and say the result is textual.

## Go

| Need | Command | Notes |
| --- | --- | --- |
| Diagnostics | `gopls check <files>` | Prints `file:line:col-col: message`. |
| Diagnostics, fallback | `go vet ./...` at the module root | Package level; includes compile errors. |
| Build errors | `go build ./... 2>&1` | Writes nothing for a multi-package build; add `-o /dev/null` for a single main package. |
| Definition | `gopls definition file.go:LINE:COL` | Also accepts `file.go:#BYTE_OFFSET`. |
| References | `gopls references file.go:LINE:COL` | Add `-d` to include the declaration. |
| Implementations | `gopls implementation file.go:LINE:COL` | Interface to concrete types and back. |
| Rename preview | `gopls rename -d file.go:LINE:COL newName` | `-d` prints a diff and writes nothing. Never use `-w`. |
| Symbols in a file | `gopls symbols file.go` | Quick outline. |
| Call hierarchy | `gopls call_hierarchy file.go:LINE:COL` | Callers and callees. |

Outside a module (`go.mod` missing) gopls degrades to per-file results; start from the directory that holds
`go.mod` or `go.work`.

## Rust

| Need | Command | Notes |
| --- | --- | --- |
| Diagnostics | `cargo check --message-format=json --all-targets --quiet` | JSON lines; `compiler-message` carries `level`, `code.code`, primary `spans[]`. |
| Lints | `cargo clippy --message-format=json --all-targets --quiet` | Only when clippy is installed. |
| Server-grade diagnostics | `rust-analyzer diagnostics .` | Slow on large workspaces; use `--timeout=300` on the normaliser or run it directly. |
| References, textual | `rg -n --word-regexp '<name>' --glob '*.rs'` | Label as textual. |
| Type of an expression | provoke a mismatch in a scratch copy (`let _: () = expr;`) and read the `mismatched types` message | Never in the real file. |

`rust-analyzer` has `symbols`, `analysis-stats` and `ssr` subcommands; none of them applies edits when run without a
write flag. Use `rust-analyzer ssr` only as a preview.

## C and C++

| Need | Command | Notes |
| --- | --- | --- |
| Diagnostics | `clangd --check=<file>` | Needs `compile_commands.json` for real flags. The normaliser parses `E[...] [code] Line N:` rows. |
| Diagnostics, fallback | `clang -fsyntax-only -fno-color-diagnostics <file>` | Add `-x c++` for C++ headers. Flags from the build system are missing, so say so. |
| Compilation database | `ls compile_commands.json build/compile_commands.json` | Missing means include paths and defines are guesses. |

## Shell

```sh
shellcheck -f json file.sh          # SCnnnn codes, line and column
bash -n file.sh                     # syntax only
```

## Structural search (any language)

```sh
ast-grep run -p '$FN($$$ARGS)' -l ts --json=compact src     # pattern search, read-only
ast-grep scan --json=compact                                  # rule files if the repo has sgconfig.yml
```

`ast-grep` (binary `ast-grep` or `sg`) searches by syntax tree, not by bytes, and is the closer match to a symbol
query than `rg` when the question is "every call of this shape". It is a pattern engine, so it still cannot resolve
which declaration a name refers to. Use `--rewrite` only through the `structural-search` skill, which previews and
applies codemods safely.

## Textual fallback (labelled)

```sh
rg -n --word-regexp '<name>' --glob '!node_modules' --glob '!target' --glob '!dist'
rg -n --type-add 'src:*.{ts,tsx,py,go,rs}' --type src '<name>\('
```

Report such a result as "textual references, N hits across M files; shadowing and dynamic access unchecked". For a
rename, classify every hit as code, string or key, configuration, generated file, or documentation before editing.

## Reading a result honestly

| Observation | It means | It does not mean |
| --- | --- | --- |
| Empty array, checker listed `present` | The checker ran on the named files and found nothing | The project builds, or untouched files are fine |
| Row with `severity: missing` | Nothing ran | The code is clean or broken |
| Row with `severity: failed` | The tool started or tried to start and gave no parseable output | Anything about the code |
| `source` ending in `(syntax only)` | A parser accepted or rejected the file | A type or lint result |
| gopls `references` returns one hit | The declaration only, in the package gopls loaded | No callers exist in other modules |
| `rg` finds ten hits | Ten lexical matches | Ten references |
