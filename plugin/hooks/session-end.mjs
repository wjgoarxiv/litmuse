import { run, readSession, writeSession, appendLedger } from './lib/common.mjs';
import { recordSessionEnd } from './lib/stage.mjs';

run((payload) => {
  recordSessionEnd(payload);
  const state = readSession(payload);
  if (!state) return;
  if (state.route) appendLedger(payload, { event: 'SessionEnd', route: state.route });
  writeSession(payload, { ...state, route: null, endedAt: Date.now() });
});
