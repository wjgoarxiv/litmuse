---
name: visual-qa
description: "Browser checks of a built UI: LitFamily extension (wjgoarxiv-skills, design); hands over or gives install line."
---

# visual-qa is now a LitFamily extension

LitMuse's core works on its own, and this skill is now a LitFamily extension that you add when you need it. It checked an interface that already exists the way a user sees it: in a real browser, at phone, tablet and desktop widths, in every state that matters, with a screenshot, an evidence manifest and a named blocker when no browser could be driven.

The full skill, with its references, scripts and engines, lives in wjgoarxiv-skills, the LitFamily extension shelf.
Installed alongside LitMuse, the extensions you use give you the full LitFamily experience. This folder is a
same-name stub. It keeps the `visual-qa` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `design`
- Shared body: `plugins/design/skills/visual-qa/`
- Muse edition (the folder to install): `variants/litmuse/visual-qa/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/visual-qa --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/visual-qa/`, else
`~/.config/muse/skills/visual-qa/`). The next session lists it in the catalog as `visual-qa`, scope `user`, next to
this stub. `muse skills uninstall visual-qa` takes it out again. The repository is public at
https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line at that clone.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:visual-qa`, which the LitMuse installer owns. The copy is the user skill `visual-qa` in `$CONFIG_DIR/skills/visual-qa/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `visual-qa` is installed here;
   without it, a user-scope `visual-qa` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `visual-qa` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `design`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** Inside a lit workflow or a review-work lane that asks for visual-qa, record that visual-qa is not installed, give no visual verdict (the lane is BLOCKED, not passed), and name the install line once in the final report.

## Hard stops

- Never make a visual verdict from reading source code, or screenshots described but not taken. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
