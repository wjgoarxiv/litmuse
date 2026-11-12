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

The repository is public at https://github.com/wjgoarxiv/wjgoarxiv-skills; clone it once and point the install line
at that clone. Run the three steps from the project you work in, one line each; zsh and bash both take them.

1. Look first. This line only reads. It prints each folder Muse could load as `frontend-ui-ux`: your Muse user skills, the
   personal folders `~/.claude/skills` and `~/.codex/skills` that Muse also loads, and the project's `.agents/skills`
   and `.claude/skills`.

```bash
command ls -d "${XDG_CONFIG_HOME:-$HOME/.config}/muse/skills/frontend-ui-ux" "$HOME/.claude/skills/frontend-ui-ux" "$HOME/.codex/skills/frontend-ui-ux" .agents/skills/frontend-ui-ux .claude/skills/frontend-ui-ux 2>/dev/null
```

2. If the first of those paths was printed, move that folder aside whole. It goes to a dated folder under
   `extension-backups/` beside Muse's skills, where Muse does not look, with every file you added still inside. When
   nothing is there, the line does nothing.

```bash
D="${XDG_CONFIG_HOME:-$HOME/.config}/muse/skills/frontend-ui-ux"; B="${XDG_CONFIG_HOME:-$HOME/.config}/muse/extension-backups/$(date +%Y%m%d-%H%M%S)"; [ -e "$D" ] && mkdir -p "$B" && mv "$D" "$B/" && echo "moved to $B/frontend-ui-ux"
```

3. Install:

```bash
muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/frontend-ui-ux --scope user
```

`muse skills install` copies that folder into Muse's user skills (`$XDG_CONFIG_HOME/muse/skills/frontend-ui-ux/`, else
`~/.config/muse/skills/frontend-ui-ux/`) and records the source folder, the time and each file's hash in its own lock,
`$CONFIG_DIR/skills/.muse/lock.json`, so no other receipt is needed. The next session lists it in the catalog as
`frontend-ui-ux`, scope `user`, next to this stub. Muse refuses to install over a folder that is already there (`skill already
installed`, or `install would overwrite unmanaged files` when only your own files are left in it); step 2 is the way
past that. A personal copy in `~/.claude/skills/frontend-ui-ux/` or `~/.codex/skills/frontend-ui-ux/` ranks below the user skill, so after
the install Muse loads this one and reports those as shadowed. A project copy in `.agents/skills/frontend-ui-ux/` or
`.claude/skills/frontend-ui-ux/` ranks above it inside that project; move or rename that one to use the extension there.

### Update

Run steps 1 to 3 again; the old copy lands in a new dated folder. Leave out `--force` and `muse skills update frontend-ui-ux`:
both rewrite the shipped files in place and keep every other file, so anything a newer edition dropped would stay
behind.

### Remove

Run step 2, then `muse skills uninstall frontend-ui-ux`. With the folder already moved it deletes nothing and only drops Muse's
record, so a later `muse skills update` cannot bring the copy back. Run on its own, `muse skills uninstall` deletes the
files it copied and leaves the ones you added in a folder Muse no longer lists, which then blocks the next install
until you move it aside.

The Muse edition is this skill rewritten to stand alone in Muse. It carries its own helpers, fonts and lockfiles, works with Muse's own tools, and needs no LitMuse hook, agent or approval.

The copy and this stub do not collide. The stub is the plugin skill `plugin:litmuse:frontend-ui-ux`, which the LitMuse installer owns. The copy is the user skill `frontend-ui-ux` in `$CONFIG_DIR/skills/frontend-ui-ux/`, a folder the LitMuse installer and uninstaller never write or remove, so `npx @litfamily/litmuse install`, a plugin update and `muse plugins update` all leave it alone, and `doctor` reports it as `INFO moved` rather than an overlap. To take a newer edition, follow Update above.

## What to do when this stub loads

1. Look at the hook context or the catalog. The LitMuse activation line says whether `frontend-ui-ux` is installed here;
   without it, a user-scope `frontend-ui-ux` in the catalog (or in `muse skills list --source user`) means it is.
2. **Installed:** load it with read_skill id `frontend-ui-ux` (the user skill, without the `plugin:litmuse:` prefix) and
   follow it for the whole request. This stub adds no rules of its own.
3. **Not installed, asked for directly:** reply in a few lines: what the skill makes, that it is now a LitFamily extension in the `design`
   family of wjgoarxiv-skills, the three lines above (look first, move an occupied folder aside, install), and that a new session picks it up. Build nothing and write no
   files in its place.
4. **Not installed, inside a lit workflow:** Inside a lit workflow that edits an interface (lit-loop, litwork, start-work), the edit itself may go ahead under that workflow's own rules; record in the ledger that frontend-ui-ux is not installed, claim no design-lock or probe verdict, and name the install line once in the final report.

## Hard stops

- Never make a page or component built without the design lock, or a "pass" from the interface probe that never ran. A stand-in made without the skill is not its output.
- Never claim a render, QA or done verdict the moved skill did not produce.
- Never run the install line for the user unasked: it writes into their Muse config. Show it and let them choose.
