# LitMuse reference

**English** · [한국어](./reference_ko-KR.md) · [Back to the README](../README.md)

This page holds the detail a first install does not need: what each hook does, how the live record behind the status
card lists sessions, and the short block LitMuse can add to Muse's own rules file.

## Hooks

LitMuse ships 10 hooks. Muse runs them only after you approve them, and each hook's declared command carries a digest
of its code, so an update that changes a hook asks you again.

| Hook | What it does |
| --- | --- |
| SessionStart | LitMuse context and routes. After a compaction it re-injects the saved handoff once, and it adds the answer style you chose with `litmuse style`. |
| UserPromptSubmit | `lit` activation. A later `lit` while its route is active continues it, `lit <other route>` switches, a bare `lit` resumes a started plan, and `lit new` or `lit restart` starts over. |
| PreToolUse | During lit-plan: writes through write_file, edit_file, apply_patch or delete_file stay inside `plans/` and `.litmuse/`, shell commands are read-only, and only read-only LitMuse agents may be spawned. On every route: guards against clustered negations and clustered hedges that a write adds to Markdown or text prose. |
| PostToolUse | The tool ledger, plus the whole-line comments an edit added for comment-checker and an advisory lit-humanizer check on written prose. |
| PostToolUseFailure | Ledger. |
| Stop | A lit-plan turn ends after its plan file exists, and a one-word `go` in the same session within 30 minutes then starts that plan with start-work. start-work keeps going while plan rows are open and litgoal while criteria are open, each at most 3 holds in a row without progress. |
| PreCompact | Writes `.litmuse/handoff/latest.md` before Muse compacts. |
| SubagentStart | The return format for child agents. |
| SubagentStop | Ledger lines. |
| SessionEnd | Ledger lines. |

The full planning-turn allowlist that PreToolUse enforces is in the README under
[What a planning turn may do](../README.md#what-a-planning-turn-may-do).

## The live record behind the card

Muse's `/hud` shows fixed fields only, so the hooks keep a live record of their own: the route, plan progress and
running child agents, plus each session's liveness (PostToolUse says alive, Stop idle, SessionEnd ended).
`/lit-status` and `npx @litfamily/litmuse status --card` show it.

- **Other sessions.** The card lists other sessions of the project running first, then idle.
- **Finished work.** It keeps a finished start-work as done for a minute.
- **herdr panes.** It names a herdr pane session `<skill> · <pane>`.
- **Updates.** It says `restart to <version>` when a newer LitMuse was installed after the session started.

## A short block in Muse's own rules file

Muse keeps one user rules file of its own, `~/.config/muse/AGENTS.md` (`$XDG_CONFIG_HOME/muse/AGENTS.md` when that is
set), and loads it as user-scope rules at the start of every session, trusted workspace or not. LitMuse's hooks already
carry the full guidance, so the file gets only a short block of ground rules.

The block says four things: `lit` is LitMuse's activation word; where plans and handoffs live; never push, publish, tag
or bump a version without a yes; and call work done only after the tests pass and the changed surface was checked.

**You decide whether it goes in.**

| Run | What happens to the block |
| --- | --- |
| Interactive install | Asks once; the default is yes, and a No is remembered |
| Install with `--yes` | Adds it |
| No terminal and no `--yes` | Never writes it |
| `--no-agent-file` | Skips it for one run |
| `npx @litfamily/litmuse config agentFile off` | Removes the block at once and keeps it off |
| `config agentFile on` | Puts it back |

**Your text stays yours.** Only the lines between `<!-- litfamily:litmuse:start … -->` and
`<!-- litfamily:litmuse:end -->` are LitMuse's.

- **Byte for byte.** Removing the block returns the file exactly as it was (a file the block created is deleted
  again), and Windows line endings are kept.
- **Backup.** A copy of your file goes to `~/.local/share/litmuse/backups/` the first time the block goes in.
- **Left alone.** A symbolic link, a non-UTF-8 file or a damaged marker pair is left alone and reported.
- **Length.** Muse cuts a rules file after 32,000 bytes, so on a file that long the installer writes nothing and
  `doctor` says the block would never be read.
- **State.** `doctor` and `status` show the state as `present`, `stale`, `absent`, `malformed` or `off`.
- **`/rules import`.** If you run `/rules import` in Muse and choose to overwrite the file, the block goes with it;
  `install` puts it back.
