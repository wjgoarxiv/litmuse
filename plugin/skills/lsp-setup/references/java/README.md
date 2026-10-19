# Java: language-server and checker setup

- **Server id:** `jdtls` with launch line `jdtls`
- **Extensions:** .java
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use mvn -q -DskipTests compile or ./gradlew compileJava as the project build command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- macOS: `brew install jdtls`
- Linux and Windows: download a release from https://github.com/eclipse-jdtls/eclipse.jdt.ls, extract it, and put the `jdtls` launcher on PATH
- A JDK 17 or newer is needed to run the server itself.

Confirm afterwards:

```bash
command -v jdtls; java -version
```

The project may target an older Java; the server still needs JDK 17+.

## Project configuration

- `pom.xml` or `build.gradle(.kts)` must be valid; a broken build descriptor breaks symbol resolution.

```
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"   # macOS example
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **No JDK found:** the server exits immediately; set `JAVA_HOME` to a JDK 17+.
- **Slow or empty first run:** the initial classpath import takes a minute or more on large Maven or Gradle projects.
- **Stale state:** deleting the jdtls workspace data directory forces a clean re-index; tell the user before doing it.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
