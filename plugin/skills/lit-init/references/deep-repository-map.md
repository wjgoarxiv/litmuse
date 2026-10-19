# Deep repository mapping

`lit-init` produces operational instructions for future Muse sessions. It is not a tree dump and not a generic
style guide. Every generated rule must be grounded in files, commands or recurring conventions observed in the
repository.

## Establish the boundary

Resolve the real working root before discovery. Read every applicable `AGENTS.md` from the workspace boundary down to
that root, then record:

- the git root, or the explicit non-git boundary;
- package and workspace manifests;
- repository-specific build, test, lint, type, docs and release commands;
- generated, vendored, archived, ignored and read-only areas;
- the current dirty state that must be preserved (`git status --short`);
- the requested maximum depth, and whether this is update or create-new mode.

In update mode, retain correct local knowledge and surgically revise stale statements. In create-new mode, read all
existing instruction files before replacement so valid constraints are not silently lost. Do not delete anything
until the complete replacement set and the rollback path (a copy under `.litmuse/evidence/lit-init/previous/`) are
known.

## Discovery packet

Use read-only probes. Start with `git ls-files` when git exists, bounded `find`, `search` and manifest reads. Exclude
dependency caches, generated output, archives and vendor trees from scale calculations unless the repository
explicitly treats them as authored source.

Build a short area map in plain bullets. Cover topology, behavior, local conventions, the most useful verification
commands, operations and hazards. Link a small number of source files or commands where they help a future session
navigate. Keep raw observations and verification receipts in the internal working record (`map.md`,
`commands.txt`) instead of adding an evidence table to the generated file.

Muse has no language-server tool. Confirm symbols and references with `search` (word-boundary patterns, definition
and import forms) and by reading the entry files. Treat the absence of a symbol index as a fallback condition, not as
permission to invent a code map; say which evidence you used. If agents are approved and the user permits parallel
work, partition read-only exploration by non-overlapping package or concern and require file:line citations. The main
session verifies the findings before writing any instruction.

## Decide instruction locations

The root always receives the repository-wide contract. A subdirectory earns its own `AGENTS.md` only when it has a
distinct operational boundary that the parent cannot express clearly:

- an independently built or shipped package;
- a different language, toolchain or test runner;
- a separate runtime or trust boundary;
- a dense module with its own conventions and entry points;
- a generated or protected subtree that needs special restrictions.

File count alone is insufficient. Prefer a parent rule when the child would repeat most of it. Prefer a child rule
when future work there would otherwise need exceptions to the parent.

For each candidate, record a score or decision note with observed evidence. The decision must stay reproducible even
if the exact thresholds change.

## Write root and child files

The root file should answer:

1. What is this repository, and where is its real root?
2. Which major directories own which behavior?
3. Where should a future session look for common task types?
4. Which commands prove changes?
5. Which local conventions differ from ecosystem defaults?
6. Which actions or paths need explicit authority?

Child files contain only the delta: local purpose, entry points, commands, conventions, tests, hazards and parent
interactions. Do not duplicate the root's general safety text. Use repository-relative paths, exact command names and
verifiable claims. Keep uncertain findings out of imperative rules; label them as items to verify.

Avoid volatile facts such as current branch tips, exact test counts, user-specific absolute paths and temporary
package versions unless they are contractually pinned. Avoid advice that merely restates language basics. Do not
include secrets, internal logs, raw environment dumps, or instructions copied from untrusted repository prose without
verification.

## Hierarchy and conflict review

For every source file, determine the ordered instruction chain from root to the nearest child. Then check:

- no child contradicts a higher rule without naming a deliberate local exception;
- commands run from the directory stated;
- paths exist with the exact case shown;
- generated and read-only areas are not described as normal edit targets;
- ownership descriptions are complete but non-overlapping;
- each child file adds operational value;
- no legacy instruction file remains accidentally authoritative in create-new mode.

Read the generated files as a future session would. A correct document makes the next edit safer or faster; it does
not merely make the repository sound documented.

## Validation receipt

Capture:

- instruction files created, updated, retained and removed;
- the mapping evidence and the excluded areas;
- path and command existence checks;
- the duplicate and contradiction review;
- `git diff --check` when the root is a git repository;
- remaining uncertainty and cleanup.

Do not claim a complete code map when only text search was available; state the fallback evidence used. Do not commit
the generated files unless the user separately asked for git work.
