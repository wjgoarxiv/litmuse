# Kotlin: language-server and checker setup

- **Server id:** `kotlin-ls` with launch line `kotlin-lsp`
- **Extensions:** .kt .kts
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use ./gradlew compileKotlin as the project build command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- Download a release of the JetBrains Kotlin LSP from https://github.com/Kotlin/kotlin-lsp, extract it, and place the `kotlin-lsp` launcher on PATH (a symlink works).
- A JDK is required.

Confirm afterwards:

```bash
command -v kotlin-lsp; java -version
```

The official server is pre-release. Pin a known-good release and expect occasional breakage.

## Project configuration

- `build.gradle.kts` and `settings.gradle.kts` at the root; Gradle resolution runs on first open.

```
ln -s /path/to/kotlin-lsp/kotlin-lsp.sh ~/.local/bin/kotlin-lsp
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **No JDK:** the server fails to start; install a JDK or set `JAVA_HOME`.
- **Slow first import:** Gradle resolution on a large project can take minutes; wait with a bound.
- **`.kts` scripts resolve more slowly** than `.kt` sources; that is expected.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
