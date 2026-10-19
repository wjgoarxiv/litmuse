# Ruby: language-server and checker setup

- **Server id:** `ruby-lsp` with launch line `ruby-lsp`
- **Extensions:** .rb .rake .gemspec .ru
- **CLI checker for the Muse path:** none wired in diagnostics.mjs; use bundle exec rubocop --format json <files> when the project has RuboCop

Muse has no language-server tool, so the CLI checker is what produces evidence inside a session. The server below is useful to the user's editor, to CI, and to `scripts/verify-lsp.mjs` (a real one-file roundtrip). LitMuse prints the install commands and never runs them.

## Install (the user runs these)

- `gem install ruby-lsp`
- In a Bundler project add `ruby-lsp` and `rubocop` to the Gemfile `:development` group and run through `bundle exec`.

Confirm afterwards:

```bash
command -v ruby-lsp rubocop; ruby -v
```

ruby-lsp can use RuboCop for diagnostics; keep both versions aligned with the Gemfile.lock.

## Project configuration

- `Gemfile` and `Gemfile.lock` at the root; `.rubocop.yml` for lint rules.

```ruby
group :development do
  gem "ruby-lsp", require: false
  gem "rubocop", require: false
end
```

Write or edit these files only when the user asked for the change; report their current state otherwise.

## Alternatives

| command | when to choose |
| --- | --- |
| `solargraph` | older alternative server |
| `rubocop --lsp` | lint-only server mode |

## Troubleshooting

- **Bundler mismatch:** run inside the bundle (`bundle exec`) so versions match the lockfile.
- **No diagnostics:** check that `.rubocop.yml` is valid and is not disabling everything.
- **PATH:** a version manager (rbenv, asdf) needs a reshim after `gem install`.

## Verify

```bash
node <skill-dir>/scripts/detect-lsp.mjs .                 # server and checker status for this project
node <skill-dir>/scripts/verify-lsp.mjs <file>             # real server roundtrip for one file
node <skill-dir>/../lsp/scripts/diagnostics.mjs <file>     # CLI diagnostics, the evidence Muse can use
```

`verify-lsp.mjs` exits 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP. It proves the server starts and answers for that file. It does not make Muse call the server afterwards, and a project-wide claim still needs the project's own build or test command.
