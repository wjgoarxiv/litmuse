import { homedir } from 'node:os';
import { join } from 'node:path';
import { xdgData } from './guard.mjs';

// Every location LitMuse reads or writes, resolved from one environment so tests can sandbox HOME.
export function paths(env = process.env) {
  const home = env.HOME || homedir();
  const dataHome = env.XDG_DATA_HOME || join(home, '.local', 'share');
  const configHome = env.XDG_CONFIG_HOME || join(home, '.config');
  // Our own records stay in one place whatever the working folder; Muse's own files are where Muse puts them.
  const data = join(xdgData(env) ?? join(home, '.local', 'share'), 'litmuse');
  return {
    home,
    data,
    stage: join(data, 'bundle'),
    backups: join(data, 'backups'),
    receipt: join(data, 'receipt.json'),
    updateCache: join(data, 'update-check.json'),
    config: join(data, 'config.json'),
    iconFont: join(data, 'icon-font.json'),
    notice: join(data, 'first-session-notice.json'),
    shown: join(data, 'shown.jsonl'),
    museSettings: join(configHome, 'muse', 'settings.json'),
    museRules: join(configHome, 'muse', 'AGENTS.md'),
    museInstalled: join(dataHome, 'muse', 'plugins', 'installed.json'),
    museCatalogDir: join(dataHome, 'muse', 'model-catalog'),
    foreignRules: join(home, '.claude', 'CLAUDE.md'),
  };
}
