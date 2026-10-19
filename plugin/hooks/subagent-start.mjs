import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, emitContext, PLUGIN_ROOT } from './lib/common.mjs';
import { recordLaneStart } from './lib/stage.mjs';

run((payload) => {
  recordLaneStart(payload);
  emitContext('SubagentStart', readFileSync(join(PLUGIN_ROOT, 'context', 'child.md'), 'utf8').trim());
});
