# Dart and Flutter: language-server and checker setup

- **Server id:** `dart` with launch line `dart language-server --lsp`
- **Extensions:** .dart
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use dart analyze --format=machine (or flutter analyze) as the project command

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- The server ships inside the Dart SDK and the Flutter SDK. macOS: `brew install dart`, or install Flutter and use its bundled `dart`.
- Other platforms: https://dart.dev/get-dart

Confirm afterwards:

```bash
command -v dart flutter; dart --version
```

There is no separate package; put `dart` (or Flutter's `bin`) on PATH.

## Project configuration

- `pubspec.yaml` at the package root; `analysis_options.yaml` for lints.

```yaml
include: package:lints/recommended.yaml
analyzer:
  language:
    strict-casts: true
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

None worth recommending; this is the standard server for the language.

## Troubleshooting

- **PATH:** Flutter users need `<flutter>/bin` exported; the bundled `dart` works.
- **Out-of-date SDK:** `dart --version` or `flutter upgrade` (the user runs the upgrade) when analysis chokes on new syntax.
- **Unresolved packages:** run `dart pub get` yourself first.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
