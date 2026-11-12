---
name: frontend-ui-ux
description: "Interfaces: LitFamily extension (wjgoarxiv-skills, design); hands over or gives install line."
---

# frontend-ui-ux is now a LitFamily extension

LitMuse's core works on its own, and this skill is now a LitFamily extension that you add when you need it. It built and inspected interfaces from one locked house style, layout family and design kit: a design contract, a design-intelligence database, a pixel-art and signature-moment kit, and an interface probe across the responsive matrix.

The full skill, with its references, scripts and engines, lives in wjgoarxiv-skills, the LitFamily extension shelf.
Installed alongside LitMuse, the extensions you use give you the full LitFamily experience. This folder is a
same-name stub. It keeps the `frontend-ui-ux` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `design`
- Shared body: `plugins/design/skills/frontend-ui-ux/`
- Muse edition (the folder to install): `variants/litmuse/frontend-ui-ux/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/frontend-ui-ux --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/frontend-ui-ux/`, else
`~/.config/muse/skills/frontend-ui-ux/`). The next session lists it in the catalog as `frontend-ui-ux`, scope `user`, next to
this stub. `muse skills uninstall frontend-ui-ux` takes it out again. The repository is public at
https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line at that clone.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:frontend-ui-ux`, which the LitMuse installer owns. The copy is the user skill `frontend-ui-ux` in `$CONFIG_DIR/skills/frontend-ui-ux/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `frontend-ui-ux` is installed here;
   without it, a user-scope `frontend-ui-ux` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `frontend-ui-ux` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `design`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** Inside a lit workflow that edits an interface (lit-loop, litwork, start-work), the edit itself may go ahead under that workflow's own rules; record in the ledger that frontend-ui-ux is not installed, claim no design-lock or probe verdict, and name the install line once in the final report.

## Hard stops

- Never make a page or component built without the design lock, or a "pass" from the interface probe that never ran. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
