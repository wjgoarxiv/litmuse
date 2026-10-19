# C and C++: language-server and checker setup

- **Server id:** `clangd` with launch line `clangd --background-index --clang-tidy`
- **Extensions:** .c .cpp .cc .cxx .c++ .h .hpp .hh .hxx .h++
- **CLI checker for the Muse path:** clangd --check=<file>, falling back to clang -fsyntax-only (covered by lsp/scripts/diagnostics.mjs)

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- macOS: `brew install llvm` (keg-only; add `$(brew --prefix llvm)/bin` to PATH) or use the Xcode command line tools' `clangd`
- Debian or Ubuntu: `apt install clangd`
- Other platforms: https://clangd.llvm.org/installation

Confirm afterwards:

```bash
command -v clangd; clangd --version
```

clangd needs a compilation database to know include paths and defines. Without one every file is a guess.

## Project configuration

- `compile_commands.json` at the project root or `build/`. Generate it with `cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, `bear -- make`, or `meson setup build`.
- `.clangd` for per-project flags.

```yaml
CompileFlags:
  Add: [-std=c++20]
  CompilationDatabase: build
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `ccls` | alternative C and C++ server |
| `clang-tidy` | lint CLI driven by the same database |

## Troubleshooting

- **Spurious "file not found" or unknown flags:** the database is missing or stale; regenerate it after changing the build.
- **Header diagnostics wrong:** make sure a translation unit that includes the header appears in the database, or add a `.clangd` flags block.
- **Homebrew LLVM not found:** the keg is not on PATH by default.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
