---
name: lit-docx
description: "Word documents (.docx): LitFamily extension (wjgoarxiv-skills, documents); hands over or gives install line."
---

# lit-docx is now a LitFamily extension

LitMuse's core works on its own, and this skill is now a LitFamily extension that you add when you need it. It produced finished Word files (`.docx`): reports, briefs, manuals, proposals, memos and journal manuscripts in a tonality chosen for the content or a publisher profile, DOCX or PDF to Markdown, in-place edits of an existing `.docx`, PDF output, and a QA gate with rendered pages.

The full skill, with its references, scripts and engines, lives in wjgoarxiv-skills, the LitFamily extension shelf.
Installed alongside LitMuse, the extensions you use give you the full LitFamily experience. This folder is a
same-name stub. It keeps the `lit-docx` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `documents`
- Shared body: `plugins/documents/skills/lit-docx/`
- Muse edition (the folder to install): `variants/litmuse/lit-docx/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/lit-docx --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-docx/`, else
`~/.config/muse/skills/lit-docx/`). The next session lists it in the catalog as `lit-docx`, scope `user`, next to
this stub. `muse skills uninstall lit-docx` takes it out again. The repository is public at
https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line at that clone.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval. A step that needs the pinned office runtime (python-docx, PyMuPDF and the rest of its lock) sets it up on first use from the installed folder into a per-user cache; when the sandbox blocks that install, the copy stops with `BLOCKED:` and gives the user the one command to run in a terminal.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:lit-docx`, which the LitMuse installer owns. The copy is the user skill `lit-docx` in `$CONFIG_DIR/skills/lit-docx/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-docx` is installed here;
   without it, a user-scope `lit-docx` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-docx` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `documents`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-docx` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a `.docx` by hand (python-docx, pandoc or raw OOXML) or a Markdown file passed off as the document. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
