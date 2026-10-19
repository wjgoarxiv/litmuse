# Autoconference provenance

Adapted from the owner source identified by these stable, network-neutral values:

- Owner source identifier: `064_autoconference-skill`
- Owner source commit: `58a65afc174cd8c2fa162bb0d1953b0a88e5d419`
- Owner source tree: `8e73d89cefd9ca136f9c45a918517cc5e809fd57`
- License: included MIT license, preserved in `LICENSE`

Anonymous retrieval is not claimed. The owner source is not anonymously public, so this record carries no
repository or mirror URL and does not depend on network retrieval.

The LitMuse adaptation keeps the seven modes (`core`, `plan`, `resume`, `analyze`, `debate`, `survey`, `ship`), the
protocol, prompt-contract, logging, convergence, crash-recovery and visualization references, the six scenario
templates, the three report assets and the scaffold, status and style helpers. The protocol is rewritten around Muse's
model: a root session that owns state and budget, children started with `subagent_spawn` under least-authority
`subagent_type` values, an approved start gate, and human-only irreversible actions. The source's detached loop script
is not carried: it depended on a host CLI and background shells, and a conference here needs a live root session to
prove child receipts. Source tests, guides, examples, release automation, caches and generated debris are excluded.
