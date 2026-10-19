# Muse surfaces and the proof each one needs

Use this table while drafting rows for a repository that is a Muse plugin bundle (LitMuse or a sibling bundle built the same way). Include only the rows that apply; a generic command that observes none of the changed surfaces is padding. Paths below follow the LitMuse layout and shift with the target repository.

| Changed surface | Minimum plan evidence |
| --- | --- |
| `plugin/skills/<id>/SKILL.md` and its folder | the repository test that checks skill structure and corpus depth, the legacy-token scanner when prose changed, a closure check that every relative path the skill names exists, and the description byte budget |
| `plugin/.muse-plugin/plugin.json` | `muse plugins validate plugin --json` returning `valid: true` with no diagnostics, plus the version lockstep check when a version moved |
| `plugin/commands/*.md` | the command body read back, and the prompt-hook probe that routes the same words |
| `plugin/hooks/**` and `plugin/context/**` | malformed-stdin fixtures, prompt-injection fixtures treated as data, a direct hook smoke through the hook runner, and the digest sync (`npm run sync:digests`) because hook commands carry a code digest |
| `plugin/agents/*.md` | frontmatter parse (`tools:` allowlist, `disallowedTools:`, `model:`), and a spawn probe showing the effective tool grant for read-only agents |
| installer, doctor, uninstall (`lib/`, `bin/`) | installer tests against the fake host, the write-boundary guard test, and a throwaway-home run of the real `muse` |
| package files, `package.json`, `files[]` | `npm pack --dry-run --json --ignore-scripts` read through `[0].files` and compared with the pinned file list |
| scripts and tooling | a direct invocation with inputs that prove the observable contract, plus a failure-path invocation when the script validates input |
| documentation and CI files | the docs test if present, and a dry command that confirms every referenced script and path exists |

## Approval and trust facts a plan must respect

- Hooks and agent definitions run once the user has approved them with `muse plugins approve litmuse:hook:<id>` or `litmuse:agent_definition:litmuse/<name>`. Skills and commands need no approval.
- Hook trust is keyed on the declared command, so a changed hook script keeps its approval unless the command text (which carries the digest) changes. A plan that edits hooks includes the digest sync row.
- `muse plugins update` re-arms agent-definition approvals.
- The installer writes under `$XDG_DATA_HOME/litmuse` and through the `muse` CLI. Plans leave the config directories of other tools and Muse's credential file alone.
- Muse loads some foreign personal context (`~/.claude/CLAUDE.md`, `~/.claude/skills`, `~/.codex/skills`); a plan that depends on skill listing accounts for the 32 KB skill-catalog budget.
- A model-free run (`muse exec` with the echo provider) cannot call tools, so hook blocking is proven only with a real model. A plan states which of the two proofs a row uses.

## Release neutrality

State in the plan whether the work is release-neutral: no version bump, tag, publish, package upload or generated release note unless the user approved release work separately. `npm publish`, version edits, tags and pushes are never implicit verification commands. Prefer the narrowest package check that observes the changed surface.
