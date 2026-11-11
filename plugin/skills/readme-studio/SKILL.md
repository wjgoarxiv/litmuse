---
name: readme-studio
description: "READMEs: moved to wjgoarxiv-skills (video-covers); hands over or gives the install line."
---

# readme-studio moved to wjgoarxiv-skills

LitMuse no longer carries this skill. It wrote factual READMEs from the repository itself: an inspected cover with outlined title type, an optional motion cover, and claims checked against the code; review requests stayed read-only.

The full skill, with its references, scripts and engines, now lives in wjgoarxiv-skills: the one repository that keeps
the LitFamily skills which moved out of the products, so each user installs only the skills they use. This folder is a
same-name stub. It keeps the `readme-studio` id, its catalog entry, its doctor row and every `lit` route that reaches it, and
it does one of two things: hand over to the installed copy, or say how to install it. It builds nothing itself.

## Where it lives

- Repository: wjgoarxiv-skills
- Family: `video-covers`
- Folder: `plugins/video-covers/skills/readme-studio/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/plugins/video-covers/skills/readme-studio --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/readme-studio/`, else
`~/.config/muse/skills/readme-studio/`). The next session lists it in the catalog as `readme-studio`, scope `user`, next to
this stub. `muse skills uninstall readme-studio` takes it out again. The repository has no public address yet, so a local
clone is the only source today; the install line stays the same once it is published.

The copy in `video-covers` was written for the LitFamily host it moved from; it reaches a shared mark helper one level above `skills/` (`plugins/video-covers/lib/`), which a one-skill install does not copy, so its cover-mark step stops on a missing file in Muse until a Muse edition is published in that repository.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `readme-studio` is installed here;
   without it, a user-scope `readme-studio` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `readme-studio` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it moved to the `video-covers`
   family of wjgoarxiv-skills, the install line above, and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** record in the ledger that `readme-studio` is not installed, leave its deliverable open (never mark it done), name the install line once in the final report, and carry on with the rest of the work.

## Hard stops

- Never make a README or a cover image written without reading the repository first. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
