---
name: lit-pptx
description: "PowerPoint decks: moved to wjgoarxiv-skills (decks); hands over or gives the install line."
---

# lit-pptx moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It built finished PowerPoint decks (`.pptx`) from a request, notes or source files: a design direction chosen for the audience, Markdown slide source compiled with native editable charts, embedded Pretendard fonts, a QA gate and a look at the rendered pages.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `lit-pptx` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `decks`
- Shared body: `plugins/decks/skills/lit-pptx/`
- Muse edition (the folder to install): `variants/litmuse/lit-pptx/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-pptx --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-pptx/`, else
`~/.config/muse/skills/lit-pptx/`). The next session lists it in the catalog as `lit-pptx`, scope `user`, next to
this stub. `muse skills uninstall lit-pptx` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval. A step that needs the pinned office runtime (pptxgenjs, sharp, python-pptx and the rest of its lock) sets it up on first use from the installed folder into a per-user cache; when the sandbox blocks that install, the copy stops with `BLOCKED:` and gives the user the one command to run in a terminal.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:lit-pptx`, which the LitMuse installer owns. The copy is the user skill `lit-pptx` in `$CONFIG_DIR/skills/lit-pptx/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-pptx` is installed here;
   without it, a user-scope `lit-pptx` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-pptx` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `decks`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-pptx` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a `.pptx` by hand (python-pptx, pptxgenjs or raw OOXML) or a slide outline passed off as the deck. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
