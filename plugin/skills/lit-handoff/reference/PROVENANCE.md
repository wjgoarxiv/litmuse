# Handoff closure provenance

The handoff reference closure bundled in this skill is an owner-authorized MIT source snapshot (copyright Woojin,
see `../LICENSE`). Four authored files are preserved byte for byte; only the file name of the first one changed so
that Muse does not treat a nested file as a second skill entrypoint.

| Path in this skill | Origin path | SHA-256 |
| --- | --- | --- |
| `reference/canonical-handoff.md` | `SKILL.md` | `e5bbd253dfa5b5baa9739dfaebc458003daab43cb27c4a407423da1e7a31dec6` |
| `evals/evals.json` | `evals/evals.json` | `0a70f0d149e59641100c7dcf8b9f2f1c0ceae57b98518e165f08088f2c2484da` |
| `examples/HANDOFF-example-generic-auth-refactor.md` | `examples/HANDOFF-example-generic-auth-refactor.md` | `43c767e573ac8c8900832d2b7a92ee1e83fd2d3d794fe2c82ecef87e5737f2a3` |
| `templates/HANDOFF.md` | `templates/HANDOFF.md` | `2a795a06e7bb81a57e6675ae70ed26db0dbfdb792c01f0a60f96f02cbef49fbd` |

- Source commit of the snapshot: `235ed3af614a7becaee6ef1d1a18e5c4b13994f4` (provenance only; nothing here depends on the
  original checkout at runtime).
- `node scripts/verify-closure.mjs` recomputes these hashes from the installed files and exits 0 only when all four match.
- The Muse-specific behavior (destinations, the `.litmuse/handoff/` mirror, the compaction mode, secret handling,
  verification) lives in `SKILL.md` and never edits the four files above.
- The canonical text uses the placeholder `${SKILL_ROOT}`; in Muse it is `<skill-dir>`, the directory of this skill's
  `SKILL.md`.
