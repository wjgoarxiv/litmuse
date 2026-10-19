# Swift: language-server and checker setup

- **Server id:** `sourcekit-lsp` with launch line `sourcekit-lsp`
- **Extensions:** .swift .objc .objcpp
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use swift build or xcodebuild as the project build command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- It ships with the Swift toolchain. macOS: `xcode-select --install` or install full Xcode; it resolves through `xcode-select -p`.
- Linux: install a toolchain from swift.org and add its `usr/bin` to PATH.

Confirm afterwards:

```bash
command -v sourcekit-lsp; xcode-select -p
```

Pure Xcode projects without a SwiftPM manifest or a compilation database resolve poorly.

## Project configuration

- `Package.swift` for SwiftPM, or `compile_commands.json` for mixed or Objective-C code.

```swift
// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "App", targets: [.executableTarget(name: "App")])
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **Wrong toolchain:** point `xcode-select -s` at the right Xcode (the user runs it).
- **No manifest:** add `Package.swift` or generate `compile_commands.json`.
- **First build is slow;** the server builds the module graph on first open.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
