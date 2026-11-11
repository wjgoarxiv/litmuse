---
name: visual-qa
description: "Browser checks of a built UI: moved to wjgoarxiv-skills (design); hands over or gives the install line."
---

# visual-qa moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It checked an interface that already exists the way a user sees it: in a real browser, at phone, tablet and desktop widths, in every state that matters, with a screenshot, an evidence manifest and a named blocker when no browser could be driven.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `visual-qa` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `design`
- Folder: `plugins/design/skills/visual-qa/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/plugins/design/skills/visual-qa --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/visual-qa/`, else
`~/.config/muse/skills/visual-qa/`). The next session lists it in the catalog as `visual-qa`, scope `user`, next to
this stub. `muse skills uninstall visual-qa` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The copy in `design` was written for the LitFamily host it moved from; its browser steps may name that host's tools. Follow its steps with Muse's own tools and report any step that cannot run here.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `visual-qa` is installed here;
   without it, a user-scope `visual-qa` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `visual-qa` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `design`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** Inside a lit workflow or a review-work lane that asks for visual-qa, record that visual-qa is not installed, give no visual verdict (the lane is BLOCKED, not passed), and name the install line once in the final report.

## Hard stops

- Never make a visual verdict from reading source code, or screenshots described but not taken. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
