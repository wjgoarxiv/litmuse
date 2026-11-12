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

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-typographic-motion --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-typographic-motion/`, else
`~/.config/muse/skills/lit-typographic-motion/`). The next session lists it in the catalog as `lit-typographic-motion`, scope `user`, next to
this stub. `muse skills uninstall lit-typographic-motion` takes it out again. The repository is public at
https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line at that clone.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval. A step that needs the pinned motion engine and its fonts sets it up on first use from the installed folder into a per-user cache; when the sandbox blocks that install, the copy stops with `BLOCKED:` and gives the user the one command to run in a terminal.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:lit-typographic-motion`, which the LitMuse installer owns. The copy is the user skill `lit-typographic-motion` in `$CONFIG_DIR/skills/lit-typographic-motion/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-typographic-motion` is installed here;
   without it, a user-scope `lit-typographic-motion` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-typographic-motion` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `video-covers`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-typographic-motion` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a film, GIF or WebP loop from ad-hoc ffmpeg or canvas code in place of the skill. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
