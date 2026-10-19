# TypeScript and JavaScript: language-server and checker setup

- **Server id:** `typescript` with launch line `typescript-language-server --stdio`
- **Extensions:** .ts .tsx .js .jsx .mjs .cjs .mts .cts (also .vue .svelte .astro through their own servers)
- **CLI checker for the Muse path:** tsc --noEmit --pretty false (covered by lsp/scripts/diagnostics.mjs; navigation by lsp/scripts/tsserver-query.mjs)

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- Project-local (preferred): `npm install --save-dev typescript typescript-language-server`
- Global: `npm install -g typescript-language-server typescript`
- Only `typescript` is needed for the CLI path: `tsc` and `tsserver-query.mjs` use it, the language server wrapper is optional.

Confirm afterwards:

```bash
command -v typescript-language-server; ls node_modules/.bin/tsc
```

`typescript-language-server` is a thin wrapper over `tsserver`; it needs the `typescript` package next to it, either in the project `node_modules` or globally. Install both.

## Project configuration

- `tsconfig.json` (or `jsconfig.json` for plain JavaScript) at the package root decides `strict`, `paths`, `include` and `references`.
- In a monorepo each package owns its own `tsconfig.json`; the checker should run from the package that owns the file.

```json
{ "compilerOptions": { "strict": true, "noEmit": true, "target": "es2022", "module": "esnext", "moduleResolution": "bundler", "skipLibCheck": true }, "include": ["src"] }
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `deno lsp` | Deno projects |
| `biome lsp-proxy` | Biome as lint and format server |
| `vscode-eslint-language-server --stdio` | ESLint diagnostics (`npm i -g vscode-langservers-extracted`) |
| `oxlint --lsp` | fast Oxc linting |
| `vue-language-server --stdio` | .vue files |
| `svelteserver --stdio` | .svelte files |
| `astro-ls --stdio` | .astro files |

## Troubleshooting

- **PATH:** global npm binaries need the npm global bin directory (`npm prefix -g`/bin) on PATH; reopen the shell after `npm i -g`.
- **"Could not find tsserver":** the `typescript` package is missing; install it in the project or globally.
- **Path aliases unresolved:** the check ran without the project config. Use project mode (`-p tsconfig.json`) and state which config applied.
- **Solution-style root tsconfig** (`"files": []` plus `references`): the root checks nothing; run from the package, or use `tsc -b --noEmit` only if the project already builds that way (it may write `.tsbuildinfo`).

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
