---
name: lit-typographic-motion
description: "Films and cover loops: moved to wjgoarxiv-skills (video-covers); hands over or gives the install line."
---

# lit-typographic-motion moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It directed finished short films from a one-line request: a treatment, a storyboard board round, the stage path (a page captured frame by frame) or the type path (kinetic type, lyric and quote videos, title sequences), an original score, look rounds and a QA gate (flash audit, legibility, determinism, sound). Cover mode made silent, seamless README cover loops.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `lit-typographic-motion` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `video-covers`
- Folder: `plugins/video-covers/skills/lit-typographic-motion/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/plugins/video-covers/skills/lit-typographic-motion --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-typographic-motion/`, else
`~/.config/muse/skills/lit-typographic-motion/`). The next session lists it in the catalog as `lit-typographic-motion`, scope `user`, next to
this stub. `muse skills uninstall lit-typographic-motion` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The copy in `video-covers` was written for the LitFamily host it moved from. Its text says a Stop hook checks the done list and names that host's engine set-up command; in Muse no hook checks the render any more, so the skill's own gate and done list are the only check, and its engine is set up straight from the installed folder as that repository's README describes.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-typographic-motion` is installed here;
   without it, a user-scope `lit-typographic-motion` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-typographic-motion` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `video-covers`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-typographic-motion` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a film, GIF or WebP loop from ad-hoc ffmpeg or canvas code in place of the skill. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
