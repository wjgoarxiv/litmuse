---
name: lit-scientific-visualization
description: "Figures from data: moved to wjgoarxiv-skills (figures); hands over or gives the install line."
---

# lit-scientific-visualization moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It built journal-ready figures from measured or simulated data with a tuned matplotlib workflow: chart form, units, colour-blind-safe palettes, multi-panel layout, PDF/EPS/TIFF export and a visual check.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `lit-scientific-visualization` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `figures`
- Shared body: `plugins/figures/skills/lit-scientific-visualization/`
- Muse edition (the folder to install): `variants/litmuse/lit-scientific-visualization/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-scientific-visualization --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-scientific-visualization/`, else
`~/.config/muse/skills/lit-scientific-visualization/`). The next session lists it in the catalog as `lit-scientific-visualization`, scope `user`, next to
this stub. `muse skills uninstall lit-scientific-visualization` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval. A step that needs the pinned matplotlib environment sets it up on first use from the installed folder into a per-user cache; when the sandbox blocks that install, the copy stops with `BLOCKED:` and gives the user the one command to run in a terminal.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:lit-scientific-visualization`, which the LitMuse installer owns. The copy is the user skill `lit-scientific-visualization` in `$CONFIG_DIR/skills/lit-scientific-visualization/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-scientific-visualization` is installed here;
   without it, a user-scope `lit-scientific-visualization` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-scientific-visualization` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `figures`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-scientific-visualization` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a matplotlib figure from scratch in place of the skill, or a figure without the export and visual check. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
