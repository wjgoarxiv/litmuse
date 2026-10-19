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
npm pack --dry-run --json --ignore-scripts   # read [0].files; test/fixtures/pack-files.json pins it
npm run qa:muse                              # needs muse on PATH; uses an isolated HOME and the echo provider
muse plugins validate plugin --json          # valid:true, diagnostics []
```

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
- There is no LSP, diagnostics or browser tool. The `lsp` skill drives checker CLIs through `bash`; browser work drives
  the Chrome already on the machine.
- `muse schema generate-ts --out <dir> --experimental` (offline) shows the goal block `{objective, status,
  percentComplete, currentWork?, nextWork?}` and the context-usage triple; hook payloads carry no context usage.
- `--no-foreign-personal-context` exists only on `muse exec`; the interactive `muse` rejects it (1.4.11).

## Rules for changes

- After any change under `plugin/hooks/`, `plugin/context/` or a skill file listed in `DIGEST_EXTRAS` (`plugin/hooks/lib/digest.mjs`; today the lit-humanizer `scripts/core.mjs` and `rules.json`, and the lit-typographic-motion done-check `engine/node/done.mjs` with every engine module it imports), run `npm run sync:digests` (the hook commands carry a code digest; `test/hooks.test.mjs` fails on drift).

- The installer writes only under `$XDG_DATA_HOME/litmuse` and through the `muse` CLI. Never write `~/.claude`,
  `~/.codex`, or Muse's credential file; `lib/guard.mjs` and the install tests enforce it.
- `lit` re-entry lives in `plugin/hooks/user-prompt-submit.mjs` with `lib/reentry.mjs` and the intent flags from `detectRoute`; `test/reentry.test.mjs` pins it. A continue note stays under 600 bytes and never repeats the skill re-read line; unreadable state falls back to the full activation.
- Add a skill on all four surfaces at once: manifest, `plugin/hooks/lib/routes.mjs`, the skill folder, and the
  description budget. `test/bundle.test.mjs` fails on an orphan.
- Every skill keeps sibling depth: its SKILL.md size and file count are pinned in `test/fixtures/skill-depth.json`,
  and `test/depth.test.mjs` also checks reference closure (every relative path a skill document names exists) and that
  no file in `plugin/` names a sibling product or host outside verbatim third-party legal files. Raise a pin
  deliberately when a skill grows; never lower one to pass.
- lit-typographic-motion's done gate is hook-side: PostToolUse records `motion.mjs` runs and image `read_file` paths in
  `<session state>.motion.json` while the route is active, and Stop runs the skill's `engine/node/done.mjs` on the last
  output folder (at most two holds, then a not-done notice). `test/motion-hooks.test.mjs` drives it through the real hooks.
  Its `motion` engine is pre-warm only (`status --json` carries `prewarm: true`): a render never installs, and an
  unwarmed cache is exit 14 naming `npx @litfamily/litmuse runtime install motion`. The real-render tests
  (`test/motion-render.test.mjs`, `test/motion-film.test.mjs`) skip without a warm cache, Chrome and libwebp; set
  `LITMUSE_MOTION_RUNTIME` to a warm cache to run them. `npm run qa:cover-recipes -- --negatives --base <png>`
  re-renders the recipes against their pinned rows (needs the painting for painted-light).
- Pinned engines ship as `<name>-runtime.mjs` in `plugin/lib/` or a skill's `scripts/` and answer
  `status|install --json` with `{name, ready, cache, missing}`; they install only into
  `$XDG_DATA_HOME/litmuse/runtime/<name>`. `litmuse runtime` and doctor find them by that file name.
- Bump versions only with the user's approval, in `package.json`, `plugin/.muse-plugin/plugin.json` and
  `CHANGELOG.md` together.
- No publish, tag or push without explicit approval. Re-check Meta's brand terms for "Muse" before the first publish.
- Local state stays untracked: `.litmuse/`, `.litclaude/`, `HANDOFF.md`, `evidence/`, `plans/`.
