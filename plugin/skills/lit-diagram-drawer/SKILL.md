---
name: lit-diagram-drawer
description: "Diagrams: moved to wjgoarxiv-skills (figures); hands over or gives the install line."
---

# lit-diagram-drawer moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It drew conceptual and technical diagrams (architecture, workflows, systems, data models, timelines) as HTML or SVG with PNG and slide-safe SVG export, checked by its own verifier and by looking at the render.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `lit-diagram-drawer` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `figures`
- Folder: `plugins/figures/skills/lit-diagram-drawer/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/plugins/figures/skills/lit-diagram-drawer --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-diagram-drawer/`, else
`~/.config/muse/skills/lit-diagram-drawer/`). The next session lists it in the catalog as `lit-diagram-drawer`, scope `user`, next to
this stub. `muse skills uninstall lit-diagram-drawer` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The copy in `figures` was written for the LitFamily host it moved from; its renderer and doctor commands may name that host's tools. Follow its steps with Muse's own tools and report any step that cannot run here.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-diagram-drawer` is installed here;
   without it, a user-scope `lit-diagram-drawer` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-diagram-drawer` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `figures`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-diagram-drawer` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make an SVG, Mermaid or HTML diagram by hand in place of the skill. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
