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
| UserPromptSubmit | `lit` activation. A later `lit` while its route is active continues it, `lit <other route>` switches, a bare `lit` resumes a started plan, and `lit new` or `lit restart` starts over. During a start-work run it answers `lit approve`, `lit approve x`, `lit deny`, `lit skip-row [N]`, `lit pause`, `lit resume` and `lit cancel`. A prompt without `lit` gets one suggestion note. Deadline 110 s, for one replay. |
| PreToolUse | During lit-plan: writes through write_file, edit_file, apply_patch or delete_file stay inside `plans/` and `.litmuse/`, shell commands are read-only, and only read-only LitMuse agents may be spawned. During a start-work run: parks steps the run guard will not let through, refuses secrets and host homes, and allows `create_goal` only for a `goal: native` plan. On every route: guards against clustered negations and clustered hedges that a write adds to Markdown or text prose. |
| PostToolUse | The tool ledger, plus the whole-line comments an edit added for comment-checker and an advisory lit-humanizer check on written prose. |
| PostToolUseFailure | Ledger. |
| Stop | A lit-plan turn ends after its plan file exists, and a one-word `go` in the same session within 30 minutes then starts that plan with start-work. An approved start-work run is driven by one decision per stop (continue, wrap-up, done, impossible) with the Done-when check capped at 90 s; litgoal keeps going while criteria are open, at most 3 holds in a row without progress. Deadline 100 s. |
| PreCompact | Writes `.litmuse/handoff/latest.md` before Muse compacts. |
| SubagentStart | The return format for child agents. During a start-work run, a child session the payload names follows its parent's run guard. |
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

### The sunset and `--watch`

In a person's terminal the card is framed and carries a sunset scene in the cells its words leave free. That needs
stdout to be a terminal, `COLORTERM` to say truecolor, `NO_COLOR` to be unset, `COLORFGBG` not to name a light
background, and at least 64 columns. Anything else, and every pipe and `--json`, prints the plain card. The sun sits on
the lowest three rows in a run that leave it room, and the card grows when no rows do. A pane too short for the card
loses rows from the bottom of its body.

Where each part comes from:

| part | source |
| --- | --- |
| state, stage map, count | the workflow stack the hooks keep in `.litmuse/workflow-stack/` |
| task and criterion gauges | the plan's ticked rows, `.litmuse/goals/` |
| lanes and their clocks | SubagentStart and SubagentStop, in the stage record |
| skill chips | the route and the skill plan of the prompt that started it, in the stage record |
| last tool | the session's ledger, written after each call, for 15 minutes; a call still running is not recorded |
| `ctx ~12%` | Muse's estimate of its last prompt, in its session log, over the model catalog's window when every listed model has the same one; tokens alone otherwise |
| branch | `.git/HEAD` |

Muse keeps its 5-hour and weekly limits in no file, so the card does not show them.

Round ends on pills and gauges are decided once, in this order: `LITMUSE_GLYPHS` (`auto`; `round` or `nerd`; `basic`
or `square`); the choice saved by `install --glyphs` in `config.json`, over SSH too; then, on `auto`, Windows Terminal,
VS Code, WezTerm, Ghostty and kitty draw them; over SSH they are off; otherwise on when an icon (Nerd) font file is in the
system's font folders. Only file names are read, at most 4000 of them, three folders
deep. The installer's cards follow the same rule.

`litmuse status --card --watch` uses the alternate screen and restores it on `q`, Esc, Ctrl+C, SIGTERM, SIGHUP or an
error. It reads the record at most once a second and paints eight frames a second in between, sending only the rows
that changed. It moves while a route is active, its session has not stopped since the record last changed, and either
changed in the last 15 minutes; otherwise no frame is drawn. `LITMUSE_MOTION=off` (or `reduced`) holds it still. When
stdout is not a terminal, `--watch` prints the card once.

## The start-work autopilot

A start-work run that the user started with `yes`, `lit start plans/<f>.md` or `go` aims to finish with nobody at the
keyboard. The start approves the plan as it reads then; its `Run charter:` and `Scope roots:` lines are bound by hash,
so an edit after the start grants nothing.

- **Parked steps.** PreToolUse sorts each shell step, and the default is to park. Only these run: readers in their
  read-only forms, the plan's own Done-when check, the repo's own test and check commands (`npm test`, `npm run
  test|check|lint|build|typecheck`, `node --test`, `pytest`, `cargo test`, `go test`, `make test`), script runners
  (`node`, `python3`, `sh`) on files inside the project, and `git add` plus `git commit` under a run charter. A
  verb the guard does not know (`dd`, `tar`, `ln`, `chmod`, `truncate`, `install`, `patch`, `go run`, `cargo run`,
  `uv run`, `awk`) parks as X, and so does a shell redirect into the workspace; files are written with the file tools,
  which the guard checks path by path. A step the guard will not let through is parked with its exact text, folder,
  row and tier, and the model is told to continue:
  tier B is `touch`, `mkdir`, `cp` or `mv` onto new paths (in the workspace or a `(read)` Scope root); tier X is push, tag, publish,
  bump, reset, clean, every delete, overwrites, installs, network tools, unknown git subcommands, non-check package
  scripts, anything outside every root and an uncovered commit; held steps (globs, expansion, `sh -c`, `eval`, `sudo`,
  decoders, `bash_input`) are listed and never replayed. Secrets, the real host home, `.git/hooks`, `.git/config` and
  the run state are refused and never stored, and so is any shell write into the real host home outside the workspace.
  Links are followed through their whole chain (16 hops); a loop or a longer chain is refused, and a `name=value`
  operand such as `dd of=` and a `REV:path` or index operand such as `git show HEAD:.env`, `git show :.env` or `:0:.env` are checked as paths. A reader's unquoted glob or brace in the workspace (`cat .env*`, `cat *.pem`, `cat .{env,x}`) is expanded with the folder listing and every match is checked; a glob the guard cannot expand (an unreadable folder, `..`, `**`, a partly quoted word, more than 256 matches, no match at all, or a `[[:class:]]`, `[[=x=]]` or `[[.x.]]` bracket) is held. The native `search` tool over a folder that holds a protected place (the home folder, `/`) is refused. Secret names match case-insensitively (`.ENV`, `ID_RSA`), and a repo `.npmrc`, `.netrc` or `.pypirc` counts as a secret. A write, move or remove whose target is, holds or sits inside the run state (the hook state folder, the workspace `.litmuse` folder, its session records) is refused, so `mv .litmuse x` and `rm -rf .` are refused, while a copy or move into an existing folder is checked as the file it lands on (`cp src/a.mjs .` is tier B); file tools get the same checks. `grep -f` with a pattern file outside the project is held, clusters (`-rf F`, `-rfF`) included. `sort` and `file` options are read from an allowlist, short clusters (`-uo F`) and abbreviated long options (`--out=F`, `--comp`) included; anything else is held. A recursive reader (`grep -r`, `grep -d recurse`, `rg`, `rg --files`, `find`, `find -L`, `diff -r`, `ls -R`, `tree`, `du`) over a folder that holds a protected place (`grep -r x ~`, `grep -r -eKEY ~`, `find -L /`) is refused; a pattern given with `-e`/`-f`, attached or not, leaves every operand a path. Writes into any `.git` folder are refused, a linked worktree's git dir outside the workspace too. A record that fails its seal keeps every `lit deny` answer from a journal beside it. A state file that does not parse keeps the planning limits and still refuses protected reads (`read_file ~/.ssh/id_rsa`, `cat .env`); `lit cancel` replaces it and ends the run, and on a healthy run it drops the parked steps and turns the guard off. When `lit approve x` runs the step a BLOCKED row was waiting on, the next stop tells the model to remove the BLOCKED: line, finish and tick the row, and go on. A write tool aimed outside the workspace parks a path boundary. Readers that hide a write or a program are
  judged by it: a sed script other than p/d/q/s (w, W, r, R, e, s///w, s///e, `-f`), awk with system, getline, `|`
  or `>`, `rg --pre`, `rg --hostname-bin`, `sort --compress-program`, `git grep -O`, `less`/`more` with a `+command` and jq reading `env`, `$ENV` or `input_filename` are held; `sort -o`, a second `uniq` operand,
  `tree -o`, `git --output` and `find -fprint` count as writes to their target. Any tool the guard cannot read
  (cron, MCP servers, tools a later Muse adds) is held. A step over 2000 characters is refused and never stored, so no call can grow the run record. The guard fails closed: during an active run, a call it cannot read (too large, malformed) or check (an error while saving or reading the run state) is denied. Muse cuts hook output at 16 KiB, so every injected message stays
  within 12 KiB of UTF-8 after JSON escaping, and the inbox shows only the parked steps that fit its budget; the rest
  are counted as "(N more parked, not shown)" and stay out of the list the next answer replays. Caps: 32 B steps, 16 X steps, 16 paths.
- **Runner residual.** A script inside the project can do anything its author wrote, a push included, and the guard
  lets it run because it cannot read the script's effects. The same holds for the repo's own package scripts named
  test, check, lint, build or typecheck. A runner aimed at a script outside the project, or any other package
  script, parks as X. A script inside the project can also read `seal.key` in the state folder, because the guard reads only
  the commands it is handed; a script that does so can forge a sealed record. A replayed step that starts its own
  session with `setsid` leaves the process group, so the group kill at 100 s does not reach it.
- **Child lanes.** BLOCKED: Muse is not known to name the child session in its SubagentStart payload, so a child's
  tool calls cannot be tied to the run. During a run only the read-only `litmuse/*` agents start; any other
  `subagent_spawn` is held and listed in the inbox. The hook still binds a child when the payload does name it.
- **Sealed run state.** The run record sits in LitMuse's state folder, which the guard refuses to read or write, and
  every save carries an HMAC whose key lives in the same folder (`seal.key`, mode 600). A record that fails its seal
  loses its parked steps, snapshot, paths and grants, and the next approval word runs nothing and says so. The inbox
  names its list and a 12-character digest of the shown steps; replay refuses a list that no longer hashes to it.
- **Run charter.** `Run charter: commit on feat/qa in .` allows plain `git add <files>` and `git commit` on that branch
  in that repo, with the branch read from `.git/HEAD` (or a worktree's `gitdir:`) at call time.
- **Stop decision.** Each stop reads the plan once. `done`: every row is ticked, the `## Done when` check (allowlisted,
  no shell, 90 s cap; a timeout is kept for the turn) exits 0, no lane runs and nothing outward is parked; the run
  closes with one line that also names the steps it set aside. `continue`: it names the next open row. `wrap-up`: at
  most two nudges for one unchanged plan state, then one inbox, then silence until something changes. `impossible`:
  every open row carries `IMPOSSIBLE:` and nothing is parked.
- **The inbox** starts with `WAITING-ON-USER:` and shows up to 8 parked steps whole in code spans, the rest counted, the
  waiting and impossible rows, lanes running 30+ minutes, and the answers. Drawing it records a snapshot; `lit approve`
  runs only the shown B steps and grants the shown paths, `lit approve x` (the exact whole prompt) also runs the shown X
  steps. Each replay is re-checked first, runs through `/bin/sh -c` in its folder as its own process group, which is killed whole (background children
  too) when it ends or at 100 s; a timed-out step stays parked
  as timed out; its output tail reaches the model labelled untrusted inert data. `lit deny` drops every parked step and
  keeps those commands refused; `lit skip-row [N]` ticks row N with a `SKIPPED (lit skip-row):` note.
- **Host gaps.** Muse shows no hook text to the user, so each message meant for the user (completion line, inbox,
  impossible list) comes to the model as a block that asks it to reply with the text exactly and stop. A child lane is
  bound to the run only when SubagentStart names the child session. Replay needs `/bin/sh`.

## Suggestions without `lit`

A prompt without `lit` and without a slash command gets one note. `plot this csv` names lit-scientific-visualization
next to "none of these", and the model decides from the request; a prompt no rule fits gets one catalog line of skill
names. Text in code fences, inline code and host notifications is not read. The rules are in
`plugin/hooks/lib/suggest.mjs`; a rule ships only at recall ≥ 0.85 and near-miss false positives ≤ 0.10 on the sealed
held-out half of `test/fixtures/routing-eval`. `npm run eval:routing` scores only the dev half; the held-out half was scored once with `node scripts/routing-eval.mjs heldout --record` (after its sha256 check), and `npm test` reads only that record (`heldout-score.json`) and the digest.

## The goal set at plan approval

Muse keeps one goal per session. The model sets it with `create_goal` and closes it with `update_goal`, and you can end
it yourself with `/goal clear`. LitMuse only asks for one when a plan opts in with a `goal: native` line.

A plan written by lit-plan carries a `## Done when` block with one test command (`- check: \`npm test\``). When the plan
is saved, lit-plan runs `goal-propose.mjs`, which, for a `goal: native` plan, turns that block into a single objective such as
``Every row in plans/flag.md is ticked and `npm test` exits 0, or the latest reply starts with WAITING-ON-USER:, or after 30 turns [lit:4c7a9a52]``. It refuses judgment words ("works",
"잘 동작"), a push or publish as the only success, a command outside a short test allowlist and anything over 500
characters, and it runs the check once to prove the objective is still false. The approval question then reads
`Approve plan, start work and set goal: /goal <objective>? (yes / edit / no)`. When no goal is possible, it reads
`Approve plan and start work? (yes / no)`, with one `No goal set: <reason>` line under it. Under either question the
model renders an answer guide that goal-propose prints after a blank line: a title, the goal, one row per accepted answer
saying what it does (`yes` starts the work and sets the goal, `edit` changes the plan or its check and asks again, `no`
starts nothing) and `Type the word alone.` The model words it in your language; the answer words stay English because
the prompt hook matches them exactly.

Only the session that was asked can answer, within 30 minutes; a `yes` in another session starts nothing and shows `Approval not recorded for this session. Run: lit start plans/<f>.md`. After a one-shot `muse exec` run, start the plan with `lit start plans/<f>.md`, or resume that same session and type `yes`. An exact `yes` does both at once: the prompt hook starts start-work on the plan, the same start a typed
`lit start plans/<f>.md` makes, and tells the model to set that objective. If the start is refused (another live
session already runs start-work on the plan, or no row is open), nothing starts and no goal is armed, and the reply
shows `Work not started and no goal set: <reason>`. `no` starts nothing. PreToolUse refuses any other objective with a `[lit:…]` tag, so no LitMuse goal exists without your yes. If
you already have a goal of your own, LitMuse says so and leaves it alone. When every row is ticked, the Stop hook asks
the model once to run the check and close the goal on exit 0; `lit cancel` closes it as blocked. The records live in
`.litmuse/goal/` (the question, the armed answer and the owner), and SessionStart sweeps a question nobody answered.

A lit-loop or litwork run with no plan gets one question of its own. When the project has a test command (`npm test`,
`pytest`, `cargo test`, `go test ./...`) and the prompt names an objective, the prompt hook records the question at the
run's first activation, without running any test, and tells the model to end its first reply with
``Set goal for this lit-loop: /goal `npm test` exits 0 and this is done: <objective> [lit:4c7a9a52]? (yes / no)``. Muse shows no
hook text, so the question depends on the model repeating it, together with the answer guide the hook hands over (`yes`
sets the goal and the loop goes on, `no` goes on without one). An exact `yes` from the asking session, on the next prompt
only, arms the goal and tells the model to set it with `create_goal`; it starts no start-work. `no`, `edit` and any other
prompt drop the question. Without a test command the model asks after its failing check with
`goal-propose.mjs --loop --check "<check>" <objective>`, which runs the check once and prints `No goal set: <reason>` when
it already passes, cannot run or is not an allowlisted test command. A request that ends with `lit`, `lit-loop` or `litwork` asks
the same question, with the words before that word as the objective. No question is asked for a repeat, `lit goal`, a
plan, a bare `lit`, `lit continue` or `lit resume`, or a session that already holds an open goal or a pending question.

Read-only skills (lit-adhd, review-work, litresearch, the brainstorm skills and others) say `goal: never` in their
frontmatter and never set one.

## Companion skills on a lit route

A `+` word after `lit` (`lit +viz plot the results`, `lit plan +research +ast`) puts a companion skill beside the route.
LitMuse also adds one when the task text clearly asks for it (a chart, a diagram, a source survey, a code-shape search),
reading past code fences, code spans and quotes. A plan holds at most three skills, the route first; the activation
context lists them with why each is there, and a companion that became a LitFamily extension comes with its install
line once.

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
