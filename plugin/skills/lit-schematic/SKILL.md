---
name: lit-schematic
description: "P&ID/PFD schematics: LitFamily extension (wjgoarxiv-skills, figures); hands over or gives install line."
---

# lit-schematic is now a LitFamily extension

LitMuse's core works on its own, and this skill is now a LitFamily extension that you add when you need it. It drew physical schematics of real equipment: P&IDs with ISA-5.1 tags and control loops, PFDs and equipment layouts, isometric cutaways and journal apparatus figures, as millimetre-sized SVG with PDF and 600 dpi PNG, checked by a QA gate and by looking at the render.

The full skill, with its references, scripts and engines, lives in wjgoarxiv-skills, the LitFamily extension shelf.
Installed alongside LitMuse, the extensions you use give you the full LitFamily experience. This folder is a
same-name stub. It keeps the `lit-schematic` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `figures`
- Shared body: `plugins/figures/skills/lit-schematic/`
- Muse edition (the folder to install): `variants/litmuse/lit-schematic/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-schematic --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-schematic/`, else
`~/.config/muse/skills/lit-schematic/`). The next session lists it in the catalog as `lit-schematic`, scope `user`, next to
this stub. `muse skills uninstall lit-schematic` takes it out again. The repository is public at
https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line at that clone.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:lit-schematic`, which the LitMuse installer owns. The copy is the user skill `lit-schematic` in `$CONFIG_DIR/skills/lit-schematic/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-schematic` is installed here;
   without it, a user-scope `lit-schematic` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-schematic` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `figures`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-schematic` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a P&ID, PFD or cutaway SVG by hand in place of the skill. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
