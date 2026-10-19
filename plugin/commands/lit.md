---
description: "Run a request as a LitMuse lit route (plan, loop, review, research and more)"
argument-hint: "[plan|loop|work|review|research|handoff|recap|...] <task>"
---
LitMuse route request: $ARGUMENTS

Treat the line above as a LitMuse request; the prompt hook has already recorded its route.

1. The first word picks the route: loop → lit-loop, plan → lit-plan, work → litwork, goal → litgoal, research → litresearch, review → review-work, start → start-work, recap → lit-recap, status → lit-recap, handoff → lit-handoff, init → lit-init, debug → debugging, interview → deep-interview, crucible → lit-crucible, commit → lit-commit, refactor → refactor, burnoff → lit-burnoff, burnoff-file → lit-burnoff-file, brainstorm → lit-brainstorm, brainstorming → lit-brainstorm, ideation → lit-brainstorm, ideate → lit-brainstorm, idea → lit-brainstorm, ideas → lit-brainstorm, team → lit-team, conference → autoconference, rules → rules, lsp → lsp, diagnostics → lsp, lsp-setup → lsp-setup, motion → lit-typographic-motion, film → lit-typographic-motion, video → lit-typographic-motion, 영상 → lit-typographic-motion, explain → lit-comprehend, humanize → lit-humanizer, korean → lit-humanizer, 다듬어 → lit-humanizer, 윤문 → lit-humanizer. Any other first word means lit-loop, except a task that asks to make a film (a film compound such as kinetic type, lyric video, title sequence, cover loop, 모션그래픽, 가사 영상, or a bare video noun with a making verb), which goes to lit-typographic-motion. Skills without a keyword (frontend-ui-ux, readme-studio, visual-qa, comment-checker, wikify, autoresearch, structural-search, browser-drive, lit-code) are reached through lit-loop or their own `/<skill>` command.
2. Load that skill with read_skill using the id `plugin:litmuse:<route>` before any other tool, and follow it. When the hook context says the route is already active or resuming, skip steps 2 and 3: keep the criteria, plan and ledger you have.
3. Your first output, before any tool call or other text, is the line `🔥 **LIT IGNITED · <route>** 🔥` on its own line, once. When the hook context says the route continues, the line is `🔥 **LIT CONTINUES · <route>** 🔥` instead.
4. Report in reader mode: the result, any material risk, and the action the user must take.
