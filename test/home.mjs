// Imported first by every test file (node --test gives each its own process). Hooks, scripts and the CLI find the user's
// files through HOME and XDG_*, so a child that inherits this environment sees an empty home and never the real one.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'litmuse-test-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.XDG_DATA_HOME = join(home, '.local', 'share');
process.env.XDG_STATE_HOME = join(home, '.local', 'state');
process.env.XDG_CONFIG_HOME = join(home, '.config');
process.env.XDG_CACHE_HOME = join(home, '.cache');
process.on('exit', () => rmSync(home, { recursive: true, force: true, maxRetries: 3 }));
