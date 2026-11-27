import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, emitContext, PLUGIN_ROOT, readSession, safeId, writeSession } from './lib/common.mjs';
import { recordLaneStart } from './lib/stage.mjs';

// A child spawned during a start-work run meets the run's guard: its own route state points at the parent, whose
// state holds the parked queue. Only a child session id the payload names binds; nothing is guessed.
function bindChild(payload) {
  const parent = readSession(payload);
  if (parent?.route !== 'start-work' || parent.run?.status !== 'active') return;
  const child = ['child_session_id', 'subagent_session_id', 'agent_session_id'].map((k) => safeId(payload[k])).find(Boolean);
  if (!child || child === payload.session_id) return;
  writeSession({ ...payload, session_id: child }, { route: 'start-work', parentSession: payload.session_id, activatedAt: Date.now() });
}

run((payload) => {
  recordLaneStart(payload);
  try { bindChild(payload); } catch { /* binding is best effort; the lane still starts */ }
  emitContext('SubagentStart', readFileSync(join(PLUGIN_ROOT, 'context', 'child.md'), 'utf8').trim());
});
