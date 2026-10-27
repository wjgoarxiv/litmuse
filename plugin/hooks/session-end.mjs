import { run, readSession, writeSession, appendLedger } from './lib/common.mjs';
import { markLiveness, recordSessionEnd } from './lib/stage.mjs';

run((payload) => {
  recordSessionEnd(payload);
  markLiveness(payload, 'ended');
  const state = readSession(payload);
  if (!state) return;
  if (state.route) appendLedger(payload, { event: 'SessionEnd', route: state.route });
  writeSession(payload, { ...state, route: null, endedAt: Date.now() });
});
