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
- Shared body: `plugins/video-covers/skills/readme-studio/`
- Muse edition (the folder to install): `variants/litmuse/readme-studio/`

## Install it in Muse (this one skill)

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/readme-studio --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/readme-studio/`, else
`~/.config/muse/skills/readme-studio/`). The next session lists it in the catalog as `readme-studio`, scope `user`, next to
this stub. `muse skills uninstall readme-studio` takes it out again. The repository is public at
https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line at that clone.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval. A step that needs the pinned type-shaping runtime sets it up on first use from the installed folder into a per-user cache; when the sandbox blocks that install, the copy stops with `BLOCKED:` and gives the user the one command to run in a terminal.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:readme-studio`, which the LitMuse installer owns. The copy is the user skill `readme-studio` in `$CONFIG_DIR/skills/readme-studio/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition from the clone, run the install line again with `--force`.

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
