import { run, activeRoute, appendLedger, toolName, toolInput } from './lib/common.mjs';
import { markLiveness } from './lib/stage.mjs';

run((payload) => {
  markLiveness(payload, 'alive');
  const state = activeRoute(payload);
  if (!state) return;
  appendLedger(payload, {
    event: 'PostToolUseFailure',
    route: state.route,
    tool: toolName(payload),
    ok: false,
    inputKeys: Object.keys(toolInput(payload)).sort(),
  });
});
