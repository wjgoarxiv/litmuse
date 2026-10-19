# Language-server and checker triage

Use this when a user expects symbol navigation, diagnostics, rename or hover from Muse, when a checker returns empty
or contradictory results, or when someone has configured a language server outside LitMuse and wants it diagnosed.

Three different systems all get called "LSP support":

1. a language-server or checker executable installed on the machine;
2. a client that starts it and speaks its protocol or reads its output;
3. a Muse-visible tool that hands the result to the model.

Muse 1.4.11 has the first (whatever the user installed) and, through `bash`, a crude version of the second (the
normaliser and the recipes in `cli-recipes.md`). It has no tool of the third kind: the active tool list contains no
LSP or diagnostics tool, and an editor that holds a live server for itself gives Muse nothing. An MCP bridge was
considered and not shipped, because it adds an approval per server and Muse has no host client to receive it.
Re-probe on a new Muse build before relying on this; the launcher updates itself about hourly.

## Establish the capability boundary

```sh
node <skill-dir>/scripts/diagnostics.mjs --tools
muse plugins list                                          # shows whether any MCP or LSP-like plugin is enrolled
```

Classify the request:

| User need | Required capability | Honest fallback in Muse |
| --- | --- | --- |
| compile or type errors | compiler or type checker | run the project's checked command, or the normaliser |
| lint findings | linter | the project's configured linter, without `--fix` |
| go to definition | symbol tool | `gopls definition`, `tsserver-query.mjs definition`, else `rg` plus import tracing (textual) |
| find references | indexed workspace tool | `gopls references`, `tsserver-query.mjs references`, else scoped `rg` (textual) |
| symbol rename | server rename edit | list references, edit region by region, compile and test |
| hover or type display | server hover | `tsserver-query.mjs quickinfo`, `reveal_type` in a scratch copy |
| live post-edit diagnostics | hook wired to a client | explicit normaliser run after the edit |

Never describe a fallback as equivalent to a protocol result. Text search finds lexical matches and cannot prove
symbol identity. A clean compile rejects invalid code and says nothing about every diagnostic an editor would show.

## Diagnosing an external server or contradictory results

Go in protocol order and stop at the first broken boundary. Reinstalling at every failure cannot repair a wrong
root, an unsupported capability, a stale document version or a missing Muse client.

### 1. Executable and version

```sh
command -v <server>
<server> --version
```

Confirm the resolved binary rather than the package-manager record. A wrapper script may launch a different runtime
than you expect. Version skew between an editor extension, a global binary, the project toolchain and the lockfile is
a common cause of contradictory output.

### 2. Root selection

Servers pick a project root from marker files (`tsconfig.json`, `go.mod`, `Cargo.toml`, `pyrightconfig.json`,
`compile_commands.json`). In a monorepo the wrong root initialises fine and returns empty symbols and incomplete
diagnostics. Capture the canonical root path, the config file selected, the target file, and whether generated,
vendored and build directories are excluded.

### 3. Initialization and capabilities

A client sends `initialize`, reads the capability object, then sends `initialized`. Rename, workspace symbols,
semantic tokens and pull diagnostics are all optional; read the response instead of assuming support.

### 4. Document lifecycle

For file-scoped features the document must be opened with the right language id and version, and every edit must be
sent before asking again. Save-only servers need the file written to disk. When edits land in the wrong column, check
position encoding: UTF-16 code units are the protocol default, and byte offsets or scalar counts are different
numbers. `tsserver-query.mjs` takes editor-style 1-based line and column, with the column counted in UTF-16 units.

### 5. Indexing

Rust, Java, Kotlin and Haskell servers index before they answer fully. A bounded wait is correct; an unbounded one
is a hang. If progress never completes, look at excluded paths and the build file.

### 6. Result interpretation

An empty result may mean:

- the server returned a valid empty set;
- the document was never opened;
- indexing is incomplete;
- the root is wrong;
- the feature is unsupported;
- the request timed out or was cancelled;
- the response was for an older document version;
- the client filtered it.

Tell these apart with logs and capability data. An empty list never becomes "no problems" without that step.

### 7. Muse enrollment

| Boundary | Evidence | Typical correction |
| --- | --- | --- |
| executable | `command -v`, version output | use the project-pinned install and PATH |
| runtime | server startup stderr | align Node, JVM, .NET, Python or native runtime |
| root | selected config and working directory | start from the package that owns the config |
| initialization | capability response | drop unsupported assumptions |
| document | path, language id, version | synchronise the right document |
| indexing | progress or log completion | wait with a bound, or fix excluded paths |
| feature | declared capability plus one request | rely only on confirmed features |
| Muse enrollment | `muse plugins list`, the active tool list in the session | stay in CLI mode when no tool exists |

## Evidence record

For each claim keep:

```text
Need:
Capability expected:
Client surface:
Executable and version:
Root:
File and position:
Request or command:
Raw result or error:
Fallback command:
What this proves:
What stays unproven:
Cleanup:
```

Delete scratch logs that contain source text, environment values or private absolute paths. Confirm that no
background server, port, temp directory or edited client configuration remains unless the user asked to keep it.
