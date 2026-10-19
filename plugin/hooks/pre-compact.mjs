import { run } from './lib/common.mjs';
import { writeSnapshot } from './lib/handoff-snapshot.mjs';

// PreCompact can neither inject context nor block, so the hook writes what must survive compaction to disk;
// SessionStart re-injects it when the session resumes with source "compact".
run((payload) => {
  if (!writeSnapshot(payload)) return;
  process.stdout.write(`${JSON.stringify({ systemMessage: 'LitMuse saved .litmuse/handoff/latest.md' })}\n`);
});
