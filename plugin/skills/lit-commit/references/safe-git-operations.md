# Safe git operations

This runbook covers commits, history investigation, recovery, rebases and pull-request evidence. Git commands can alter shared history or mix unrelated work, so establish authority and a recovery point first.

## Authority matrix

| Requested outcome | Read-only inspection | Local write | Remote or shared write |
|---|---|---|---|
| Explain status or history | allowed | none | none |
| Create commits | inspect first | stage and commit only the named scope | push needs separate authority |
| Reorder, squash or fix up | inspect first | only the named local branch | pushed history needs explicit rewrite authority |
| Recover lost work | inspect reflog and objects | restore to a new ref or file first | no remote mutation by default |
| Prepare a pull request | inspect branch and remote | optional local commits only if requested | creating or updating must be requested |

"Finish the code" grants no commit. Permission to commit grants no push. Permission to push grants no force-update, release or settings change.

## Snapshot before mutation

```bash
git status --short --branch
git diff --stat
git diff --staged --stat
git branch --show-current
git log -12 --oneline
git remote -v
```

Inspect the full relevant diff before staging. Resolve the repository root with `git rev-parse --show-toplevel`; an umbrella directory is often not the Git root. Note untracked and ignored work that matters to the task, and add it only when it is an intended product artifact.

When a remote relationship matters, read the configured upstream and compare tips. A failed upstream lookup means unknown or absent; it never signals that rewriting is safe.

## Atomic staging and commits

Build a staging manifest from the requested behavior. Group files by what can be reverted independently. An implementation and the tests that directly prove it usually belong together; unrelated docs, generated output, formatting and refactors usually go elsewhere.

Prefer explicit pathspecs:

```bash
git add -- path/to/file another/path
git diff --staged --stat
git diff --staged
```

Use hunk staging only when one file mixes separable user work and task work, and inspect the staged patch. Choose explicit paths over a broad add, however small the status looks. Before committing, confirm the staged diff holds no secrets, local ledgers, evidence archives, editor files, credentials or unrelated changes.

Derive message style from recent history. After the commit, capture the new hash, subject, staged state and remaining worktree state. A successful commit proves nothing about tests and implies no push.

## History investigation

Match the query to the claim:

- exact text appeared or disappeared: `git log -S "literal" -- path`;
- a diff line matched a pattern: `git log -G "pattern" -- path`;
- ownership of a current range: `git blame -L <start>,<end> -- path`;
- file history across a rename: `git log --follow -- path`;
- one candidate's intent: `git show --stat --patch <hash>`;
- first breaking change: `git bisect`, with known good and bad bounds and a deterministic command;
- recent local ref movement or recovery: `git reflog`.

Triangulate important conclusions with the candidate patch and neighboring history. Report hash, subject, path and relevant context, and separate author date, commit date and merge date when the difference matters.

## Rewrite and recovery gates

Before a rebase or autosquash, identify the base, list the exact commits to be rewritten, account for dirty work, and decide whether the branch is published. A protected or shared branch needs explicit authority. Resolve conflicts by reading the intended behavior and rerunning focused verification; choosing an entire side blindly is a defect.

Preferred exits when something goes wrong:

- the active rebase is wrong: `git rebase --abort`;
- a local commit is missing: find it in `git reflog`, then create a recovery branch before changing the current branch;
- staged content is wrong: unstage only the explicit path and keep its worktree content;
- a force update is approved: use a lease-based update and refresh remote state immediately before running it.

Reach for a destructive reset only after a recovery point exists. Restore the smallest object to a recoverable location first, verify it, then decide how it re-enters history.

## Pull-request evidence

When the user requests a pull request or an update to one, build the body from verified facts after the final diff and tests. Attach or link only artifacts that are shareable. Redact tokens, headers, cookies, private logs, user data, environment dumps and local absolute paths.

For each evidence artifact, record:

- the command or scenario that produced it;
- the product commit it verifies;
- its repository-relative or approved remote location;
- a short interpretation of the decisive observable;
- the cleanup or retention policy.

An artifact counts as attached after the pull-request body or comment surface shows it, and local existence does not suffice. Recheck branch status and review state before reporting success. When the task was only to draft a body, leave the pull request itself alone.

## Final receipt

Report the mode used, commands run, hashes or history findings, tests or probes, remaining dirty paths, remote actions actually performed, and the recovery point. State explicitly when no commit, push, rewrite, pull request, tag, version change or release action occurred.
