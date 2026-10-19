# Lua: language-server and checker setup

- **Server id:** `lua-ls` with launch line `lua-language-server`
- **Extensions:** .lua
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use luac -p <file> (syntax) or lua-language-server --check <dir> for workspace diagnostics

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- macOS: `brew install lua-language-server`
- Arch: `pacman -S lua-language-server`
- Elsewhere: download a release from https://github.com/LuaLS/lua-language-server and put its `bin` on PATH.

Confirm afterwards:

```bash
command -v lua-language-server luac
```

`lua-language-server --check <dir>` is a real one-shot CLI that prints diagnostics for a workspace; it is the right choice for the CLI path here.

## Project configuration

- `.luarc.json` at the root sets the runtime version, globals and the workspace library.

```json
{ "runtime.version": "LuaJIT", "diagnostics.globals": ["vim"], "workspace.library": ["$VIMRUNTIME/lua"] }
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **Undefined `vim` global:** add it to `diagnostics.globals` and set `workspace.library`.
- **Wrong runtime version:** set `runtime.version` to match the interpreter (`LuaJIT`, `Lua 5.4`) or the standard library reads as undefined.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
