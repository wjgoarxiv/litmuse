## LitFamily · LitMuse

LitMuse adds the lit workflows to Muse Code (lit plan, lit review, lit research, lit handoff). Its
hooks load the full rules each session, so this block only sets the ground rules.

- `lit` at the start of a prompt is LitMuse's activation word, not the Lit web library.
- Plans live in `plans/`, handoffs in `.litmuse/handoff/latest.md`, run state in `.litmuse/`. Read them
  before resuming work in a repo.
- Never push, publish, tag or bump a version without the user's explicit yes for that action.
- Call work done only after its tests pass and the changed surface was checked for real.
- Turn this block off with `npx @litfamily/litmuse config agentFile off`.
