---
name: lit-typographic-motion
description: "Films and cover loops: LitFamily extension (wjgoarxiv-skills, video-covers); hands over or gives install line."
---

# lit-typographic-motion is now a LitFamily extension

LitMuse's core works on its own, and this skill is now a LitFamily extension that you add when you need it. It directed finished short films from a one-line request: a treatment, a storyboard board round, the stage path (a page captured frame by frame) or the type path (kinetic type, lyric and quote videos, title sequences), an original score, look rounds and a QA gate (flash audit, legibility, determinism, sound). Cover mode made silent, seamless README cover loops.

The full skill, with its references, scripts and engines, lives in wjgoarxiv-skills, the LitFamily extension shelf.
Installed alongside LitMuse, the extensions you use give you the full LitFamily experience. This folder is a
same-name stub. It keeps the `lit-typographic-motion` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `video-covers`
- Shared body: `plugins/video-covers/skills/lit-typographic-motion/`
- Muse edition (the folder to install): `variants/litmuse/lit-typographic-motion/`

## Install it in Muse (this one skill)

The repository is public at https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line
at that clone. Run the three steps from the project you work in, one line each; zsh and bash both take them.

1. Look first. This line only reads. It prints each folder Muse could load as `lit-typographic-motion`: your Muse user skills, the
   personal folders `~/.claude/skills` and `~/.codex/skills` that Muse also loads, and the project's `.agents/skills`
   and `.claude/skills`.

```bash
command ls -d "${XDG_CONFIG_HOME:-$HOME/.config}/muse/skills/lit-typographic-motion" "$HOME/.claude/skills/lit-typographic-motion" "$HOME/.codex/skills/lit-typographic-motion" .agents/skills/lit-typographic-motion .claude/skills/lit-typographic-motion 2>/dev/null
```

2. If the first of those paths was printed, move that folder aside whole. It goes to a dated folder under
   `extension-backups/` beside Muse's skills, where Muse does not look, with every file you added still inside. When
   nothing is there, the line does nothing.

```bash
D="${XDG_CONFIG_HOME:-$HOME/.config}/muse/skills/lit-typographic-motion"; B="${XDG_CONFIG_HOME:-$HOME/.config}/muse/extension-backups/$(date +%Y%m%d-%H%M%S)"; [ -e "$D" ] && mkdir -p "$B" && mv "$D" "$B/" && echo "moved to $B/lit-typographic-motion"
```

3. Install:

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-typographic-motion --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-typographic-motion/`, else
`~/.config/muse/skills/lit-typographic-motion/`) and records the source folder, the time and each file's hash in its own lock,
`$CONFIG_DIR/skills/.muse/lock.json`, so no other receipt is needed. The next session lists it in the catalog as
`lit-typographic-motion`, scope `user`, next to this stub. Muse refuses to install over a folder that is already there (`skill already
installed`, or `install would overwrite unmanaged files` when only your own files are left in it); step 2 is the way
past that. A personal copy in `~/.claude/skills/lit-typographic-motion/` or `~/.codex/skills/lit-typographic-motion/` ranks below the user skill, so after
the install Muse loads this one and reports those as shadowed. A project copy in `.agents/skills/lit-typographic-motion/` or
`.claude/skills/lit-typographic-motion/` ranks above it inside that project; move or rename that one to use the extension there.

### Or let LitMuse run the lines

`npx @litfamily/litmuse extensions install lit-typographic-motion` runs steps 1 to 3 for you. It prints the plan first, stops and names
any same-name skill in another folder Muse reads (that one is never touched), moves an occupied folder aside into
`extension-backups/`, then calls `muse skills install`. Nothing changes until you add `--yes`. `--from <clone>` uses
your own clone; without it LitMuse keeps a shallow clone in its cache. `extensions update`, `extensions remove lit-typographic-motion`,
`extensions check`, `extensions list` and `extensions prune-backups` cover the rest, with the same `--yes` rule.

### Update

Run steps 1 to 3 again; the old copy lands in a new dated folder. Leave out `--force` and `muse skills update lit-typographic-motion`:
both rewrite the shipped files in place and keep every other file, so anything a newer edition dropped would stay
behind.

### Remove

Run step 2, then `muse skills uninstall lit-typographic-motion`. With the folder already moved it deletes nothing and only drops Muse's
record, so a later `muse skills update` cannot bring the copy back. Run on its own, `muse skills uninstall` deletes the
files it copied and leaves the ones you added in a folder Muse no longer lists, which then blocks the next install
until you move it aside.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval. A step that needs the pinned motion engine and its fonts sets it up on first use from the installed folder into a per-user cache; when the sandbox blocks that install, the copy stops with `BLOCKED:` and gives the user the one command to run in a terminal.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:lit-typographic-motion`, which the LitMuse installer owns. The copy is the user skill `lit-typographic-motion` in `$CONFIG_DIR/skills/lit-typographic-motion/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition, follow Update above.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-typographic-motion` is installed here;
   without it, a user-scope `lit-typographic-motion` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-typographic-motion` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `video-covers`
   family of wjgoarxiv-skills, the three lines above (look first, move an occupied folder aside, install) or the one `extensions install` line, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-typographic-motion` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a film, GIF or WebP loop from ad-hoc ffmpeg or canvas code in place of the skill. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
