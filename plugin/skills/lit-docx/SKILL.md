---
name: lit-docx
description: "Word documents (.docx): moved to wjgoarxiv-skills (documents); hands over or gives the install line."
---

# lit-docx moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It produced finished Word files (`.docx`): reports, briefs, manuals, proposals, memos and journal manuscripts in a tonality chosen for the content or a publisher profile, DOCX or PDF to Markdown, in-place edits of an existing `.docx`, PDF output, and a QA gate with rendered pages.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `lit-docx` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `documents`
- Folder: `plugins/documents/skills/lit-docx/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/plugins/documents/skills/lit-docx --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/lit-docx/`, else
`~/.config/muse/skills/lit-docx/`). The next session lists it in the catalog as `lit-docx`, scope `user`, next to
this stub. `muse skills uninstall lit-docx` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The copy in `documents` was written for the LitFamily host it moved from. It reaches the family's shared office runtime one level above `skills/` (`plugins/documents/lib/`), and a one-skill install copies only the skill folder, so its build and QA steps stop on a missing file in Muse until a Muse edition is published in that repository. Say so if the user asks for a finished document.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `lit-docx` is installed here;
   without it, a user-scope `lit-docx` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `lit-docx` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `documents`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `lit-docx` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a `.docx` by hand (python-docx, pandoc or raw OOXML) or a Markdown file passed off as the document. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
