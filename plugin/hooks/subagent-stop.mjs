import { run, activeRoute, appendLedger } from './lib/common.mjs';
import { recordLaneStop } from './lib/stage.mjs';

run((payload) => {
  recordLaneStop(payload);
  const state = activeRoute(payload);
  if (!state) return;
  appendLedger(payload, { event: 'SubagentStop', route: state.route });
});
