# AGENTS.md — LitMuse

LitMuse is the LitFamily package for Meta's Muse Code (`muse`). This repo is independent: its own git history,
npm package `@litfamily/litmuse`, version and tests. It shares ideas with its siblings and no files; re-express
any family feature in Muse's own plugin idiom.

## Layout

- `plugin/` — the Muse plugin bundle that gets installed. `plugin/.muse-plugin/plugin.json` is the native manifest
  (families: skills, commands, hooks; `agents/` is undeclared on purpose because Muse rejects an `agents`
  manifest key but parses `agents/*.md` at install). Skills `plugin/skills/<id>/SKILL.md`, commands
  `plugin/commands/*.md`, hooks `plugin/hooks/<event>.mjs` (one source file per hook id; shared code in
  `plugin/hooks/lib/`), session text `plugin/context/`.
- `lib/` + `bin/litmuse.mjs` — the dependency-free installer, doctor, models, uninstall.
- `test/` — `node --test`; `test/fixtures/fake-muse.mjs` stands in for the host, so tests never touch the real
  `~/.config/muse` or `~/.local/share/muse`.
- `scripts/` — version lockstep, legacy-token scan, and `qa-muse-surface.mjs` (real `muse` in a throwaway HOME).

## Gates

```bash
npm test
npm run check:version
npm run scan:legacy-tokens
npm pack --dry-run --json --ignore-scripts   # read [0].files; skills.lock.json pins it (npm run sync:lock)
npm run qa:muse                              # needs muse on PATH; uses an isolated HOME and the echo provider
muse plugins validate plugin --json          # valid:true, diagnostics []
```

`.github/workflows/ci.yml` runs the host-free gates (tests, `check:version`, `check:digests`, `scan:legacy-tokens`, the pack
list against `skills.lock.json`) on every push and pull request to `main`, on Node 22 and 24, with no `muse`
on the runner. The tests that would need the host use `fake-muse.mjs`. `npm run qa:muse` and `muse plugins validate` stay on a maintainer's machine. The suite also passes inside a herdr
pane; to rehearse CI, run it with `HERDR_ENV` unset, a temp HOME and `muse` off PATH.

## Host facts (probed on Muse Code 1.4.10, re-checked on 1.4.11; re-probe on a new build)

On 1.4.11 (2026-10-20) these held unchanged: approvals survived the launcher update, hook events and their
order, the 33 active tool names, `plugins validate`, and the hook refusal path. Only the catalog changed (below).

- UserPromptSubmit and SessionStart `hookSpecificOutput.additionalContext` reach the model. Hook stdout cap 16 KiB.
- Hooks and agent definitions need `muse plugins approve litmuse:hook:<id>` and
  `litmuse:agent_definition:litmuse/<name>`; skills and commands work without approval. `muse plugins remove`
  clears the approvals.
- Agent frontmatter: `tools:` (allowlist), `disallowedTools:` (denylist) and `model:` are parsed. Read-only agents use `tools:` allowlists; a live spawn of `litmuse/lit-planner` resolved to `effective_grant.work_tools = [read_file, search]` and the child reported no write access. Write-capable tools in 1.4.10: write_file, edit_file, apply_patch, delete_file, and the shell tools bash, bash_input, exec_command, shell.
- `subagent_spawn` args are `{command_id, objective, role, subagent_type?}`; without `subagent_type` the child is general-purpose with every work tool, and its tool calls carry the child's own session id. A live lit-plan run used such a child to `cp` a refused file, so lit-plan only allows read-only `litmuse/*` children. A live session also offers `workflow`, `cron_*`, `monitor` and `image_generation`.
- Hook trust is keyed on the manifest declaration: after `muse plugins update` with changed hook script content, the trusted definition hash stayed the same and the hook stayed approved.
- `muse plugins update` re-arms agent-definition approvals (package digest changes); hook approvals survive while their definition hash is unchanged. `muse exec --json` stdout carries no hook events; hook effects show in Muse's session log.
- Skill catalog cap 32 KB. On overflow Muse keeps bundled descriptions, then fills plugin descriptions in id
  order, and compacts the rest (mostly personal skills) to id + path; compacted entries still cost bytes. With
  ~70 personal skills and 155 B descriptions, 10 LitMuse descriptions were compacted; at ≤ 110 B all 31 fit.
  Keep every description ≤ 120 B (a test pins it). The SessionStart route table lists every skill anyway.
  1.4.11 added two bundled skills and lengthened two bundled descriptions (+1.9 KB of bundled text), so on the
  same Mac 13 of 31 LitMuse descriptions (`lit-pptx` onward in id order) were compacted again. Routes and
  `read_skill` by id still work; doctor's catalog WARN says so. Shortening further would not keep up with
  bundled growth, so the cap is treated as host budget, not a LitMuse defect.
- Muse loads `~/.claude/CLAUDE.md`, `~/.claude/skills` and `~/.codex/skills` as foreign personal context; it
  ignores `~/.claude/plugins` and `~/.claude/agents`. LitMuse leaves this on and steers through SessionStart.
- `/hud` is nine fixed on/off fields; plugins cannot add to it. `docs/hud-preset.md` is the shipped answer, and the
  hook-kept stage record behind `/lit-status` / `litmuse status --card` carries the live LIT card.
- Hook `systemMessage` is recorded in the session log but not shown in the 1.4.11 TUI or in `muse exec --json`, so a
  hook cannot draw the LIT banner. PreCompact output may only be `systemMessage` (or `continue:false`); it cannot inject
  context or block, so the PreCompact hook writes the handoff itself and SessionStart (`source: compact`) re-injects it.
  `muse plugins hook test <plugin>:<hook> --fixture f.json` (`{"event", "stdin"}`) checks a hook offline.
- `muse plugins install` copies the whole package directory into its content-addressed cache
  (`~/.local/share/muse/plugins/cache/local/litmuse/<hash>/package/`), undeclared `lib/` and every skill resource
  included, and `plugins validate` accepts them. Skills therefore reach their own files as `<skill-dir>/...` and the
  shared engine code as `<skill-dir>/../../lib/...`.
- Hook cost (probed on 1.4.14, 2026-11-03): plugin hooks take only `{id, event, command, timeoutMs?, statusMessage?}`, so there
  is no tool matcher and every PreToolUse/PostToolUse spawns. Inside Muse an empty `/usr/bin/true` hook takes ~35 ms and an
  empty Node hook ~72 ms; LitMuse's hooks run at that Node floor plus a few ms. SessionStart `additionalContext` becomes a
  `dynamic_turn` context block (order 900000) that is rebuilt on every resume and sits before the history, so it must be
  byte-stable within a session; UserPromptSubmit context is appended to the history instead. Stop's refusal text also
  lands in the context lane until the next turn.
- There is no LSP, diagnostics or browser tool. The `lsp` skill drives checker CLIs through `bash`; browser work drives
  the Chrome already on the machine.
- `muse schema generate-ts --out <dir> --experimental` (offline) shows the goal block `{objective, status,
  percentComplete, currentWork?, nextWork?}` and the context-usage triple; hook payloads carry no context usage.
- `--no-foreign-personal-context` exists only on `muse exec`; the interactive `muse` rejects it (1.4.11).
- Muse owns a user rules file, `$XDG_CONFIG_HOME/muse/AGENTS.md` (else `~/.config/muse/AGENTS.md`; the binary calls it
  `$CONFIG_DIR/AGENTS.md`). Probed on 1.4.14 in a throwaway HOME: the session log records it as a `rules_file` developer
  reminder, `scope: user`, `source_kind: native`, `trust_admitted: true`, even in an untrusted workspace. A file past
  32 000 bytes is cut ("startup context limit"), so the tail is never read. `/rules import` copies the foreign
  `~/.claude/CLAUDE.md` and `$CODEX_HOME/AGENTS.md` into it and offers overwrite or append. No native Muse setting adds
  an AI co-author line to commits or pull requests (no such string or settings key in the 1.4.14 binary).

## Rules for changes

- After any change under `plugin/hooks/`, `plugin/context/` or a skill file listed in `DIGEST_EXTRAS` (`plugin/hooks/lib/digest.mjs`; today the lit-humanizer `scripts/core.mjs` and `rules.json`), run `npm run sync:digests` (the hook commands carry a code digest; `test/hooks.test.mjs` fails on drift). Each extra belongs to the one hook that loads it (`EXTRAS_BY_HOOK`: humanizer → post-tool-use); a hook that starts loading a skill file must be added there, and a test pins where those loads live.

- The installer writes only under `$XDG_DATA_HOME/litmuse` and through the `muse` CLI, plus one marked block in Muse's
  own user rules file (`lib/agent-file.mjs`: consent first, add-then-remove returns the original bytes, a backup
  goes to `$XDG_DATA_HOME/litmuse/backups`; `test/agent-file.test.mjs` pins it). Never write `~/.claude`,
  `~/.codex`, or Muse's credential file; `lib/guard.mjs` and the install tests enforce it. The block text is
  `lib/agent-file-block.md` (≤ 1 200 bytes, names only LitMuse and Muse); it is not a hook or context file, so
  changing it needs no `sync:digests` and no hook re-approval.
- `lit` re-entry lives in `plugin/hooks/user-prompt-submit.mjs` with `lib/reentry.mjs` and the intent flags from `detectRoute`; `test/reentry.test.mjs` pins it. A continue note stays under 600 bytes and never repeats the skill re-read line; unreadable state falls back to the full activation.
- Add a skill on all four surfaces at once: manifest, `plugin/hooks/lib/routes.mjs`, the skill folder, and the
  description budget. `test/bundle.test.mjs` fails on an orphan.
- `skills.lock.json` is the one pin file. `npm run sync:lock` writes its generated half (each skill's SKILL.md and
  whole-folder sha256, bytes and file count, and the `npm pack` file list); run it after any change to a skill or to
  what ships, and `test/skills-lock.test.mjs` fails while it is stale. Its `policy` (family floor, moved stubs, closure and
  host-name exemptions) and `budgets` (per skill: SKILL.md min/max bytes, min/max files, max total bytes) are
  hand-owned: sync keeps them and refuses to write while any skill is outside its budget, a skill has no budget, or a
  budget has no skill. `--accept-new <id>` seeds a new skill's budget (its current size as the floor, 1.5x as the
  ceiling) and `--drop <id>` removes an orphan one; both are repeatable and print each id. Only git-tracked files are
  measured, so `git add` a new skill before syncing. Raise a budget deliberately when a skill grows;
  never lower one to pass. `test/depth.test.mjs` checks reference closure (every relative path a skill document names
  exists) and that no file in `plugin/` names a sibling product or host outside verbatim third-party legal files.
- Five content families moved to wjgoarxiv-skills (decks: lit-pptx; documents: lit-docx; figures: lit-diagram-drawer,
  lit-schematic, lit-scientific-visualization; design: frontend-ui-ux, visual-qa; video-covers: lit-typographic-motion,
  readme-studio). Each id keeps a same-name stub, `SKILL.md` only, on all four surfaces, listed in the lock's
  `policy.movedStubs` (exempt from the family floor, held to a stub budget). `plugin/hooks/lib/moved.mjs` is the one map
  of id → family, the folder `muse skills install` copies, and the id the copy answers to; the prompt hook uses it to
  hand a moved route to an installed user-scope copy (`$XDG_CONFIG_HOME/muse/skills/<id>/`) or give the install line,
  SessionStart lists the moved ids, and doctor reports an installed copy as `INFO moved`, not an overlap. The folder is
  always the self-contained Muse edition `variants/litmuse/<id>` of wjgoarxiv-skills, installed under the same id; the
  shared body under `plugins/<family>/` reaches family helpers outside its folder and is not installable alone. The
  installer and uninstaller never write `$CONFIG_DIR/skills/`, so an upgrade keeps the copy.
  `litmuse extensions <verb>` (`lib/extensions.mjs`, `test/extensions-cli.test.mjs`) is the one writer there, and only
  with `--yes`: it moves a folder into `$CONFIG_DIR/extension-backups/<stamp>/`, wraps `muse skills install` and
  `uninstall` (Muse's lock is the receipt), and keeps a sparse source clone in `$XDG_CACHE_HOME/litmuse/extensions-src`.
  Keep its text out of `plugin/hooks/lib/`: a change there changes every hook digest and re-arms all ten approvals.
  `test/moved-stubs.test.mjs` pins all of it, including that install, reinstall and uninstall leave a copy byte for byte. The motion done gate, the office runtime, every pinned engine and the
  `litmuse runtime` command left with these families; never port a body back into a stub.
- Bump versions only with the user's approval, in `package.json`, `plugin/.muse-plugin/plugin.json` and
  `CHANGELOG.md` together.
- No publish, tag or push without explicit approval. Re-check Meta's brand terms for "Muse" before the first publish.
- Local state stays untracked: `.litmuse/`, `.litclaude/`, `HANDOFF.md`, `evidence/`, `plans/`.
