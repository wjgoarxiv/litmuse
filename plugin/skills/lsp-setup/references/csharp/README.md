# C# and Razor: language-server and checker setup

- **Server id:** `csharp` with launch line `csharp-ls (Razor: roslyn-language-server --stdio)`
- **Extensions:** .cs .razor .cshtml
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use dotnet build --no-restore -v q as the project build command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `dotnet tool install -g csharp-ls` (needs the .NET SDK, not just the runtime)
- Razor: `dotnet tool install -g roslyn-language-server --prerelease` (Razor stdio support needs 5.8.0 or newer)
- Global tools land in `~/.dotnet/tools`; add that directory to PATH.

Confirm afterwards:

```bash
command -v csharp-ls roslyn-language-server; dotnet --version
```

An unrestored solution yields empty results.

## Project configuration

- A `.sln` or `.csproj` at or above the file; run `dotnet restore` yourself first.

```
export PATH="$PATH:$HOME/.dotnet/tools"
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `roslyn-language-server` | Microsoft Roslyn-based server, required for Razor |

## Troubleshooting

- **No SDK:** install the SDK before the tool.
- **No symbols:** run `dotnet restore`.
- **PATH:** reopen the shell after adding `~/.dotnet/tools`.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
