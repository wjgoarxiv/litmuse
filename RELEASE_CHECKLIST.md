# LitMuse release checklist

Every publish, tag or push needs the maintainer's explicit approval. Work through this list first.

## Publish blockers (open)

- [x] Cover art (2026-10-22): both READMEs show the seven-bay motion cover with its reduced-motion still from
      `docs/assets/`, which ships in the pack; `test/package.test.mjs` checks the files and the pinned pack listing.
- [ ] /hud preview: `docs/hud-preset.md` still carries a `<!-- TODO(cover) -->` slot for the /hud preview image.
- [x] Brand terms: checked on 2026-10-22. Meta's pending trademark applications for the Muse names are noted, and
      the maintainer chose to ship the name LitMuse. The READMEs say it is an independent community project.

## Gates

- [ ] `npm test` (check `pgrep -fl 'node --test'` first; one suite at a time on this machine)
- [ ] `npm run check:version` — package.json, plugin manifest and CHANGELOG agree
- [ ] `npm run scan:legacy-tokens`
- [ ] Before any publish: run the umbrella decode-aware leak scan over every tracked and untracked file, `zsh ../plans/tools/leak-scan.sh $(git ls-files --cached --others --exclude-standard)` from the repo root (every tracked file as a target), and require rc 0. The legacy ancestor token is guarded there only; no form of it may be added to this repo.
- [ ] `npm run check:digests` — every hook's declared command carries the current code digest
- [ ] `npm pack --dry-run --json --ignore-scripts` — `[0].files` equals `test/fixtures/pack-files.json`
- [ ] `muse plugins validate plugin --json` — `valid: true`, no diagnostics
- [ ] `npm run qa:muse` — isolated HOME, real `muse`, echo provider
- [ ] Live: `muse exec --json --trust-workspace "lit plan a tiny todo app" < /dev/null` in a throwaway workspace, plus one
      lit-plan turn told to edit a file outside `plans/` (must be refused)
- [ ] Fresh clone: `git clone` the repo into a temp folder and run `npm test` there

## After publish

- [ ] `npm view @litfamily/litmuse version` matches, and `npx @litfamily/litmuse@latest install --dry-run` works
