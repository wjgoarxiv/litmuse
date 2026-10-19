import { homedir } from 'node:os';
import { join } from 'node:path';

// Every location LitMuse reads or writes, resolved from one environment so tests can sandbox HOME.
export function paths(env = process.env) {
  const home = env.HOME || homedir();
  const dataHome = env.XDG_DATA_HOME || join(home, '.local', 'share');
  const configHome = env.XDG_CONFIG_HOME || join(home, '.config');
  const data = join(dataHome, 'litmuse');
  return {
    home,
    data,
    stage: join(data, 'bundle'),
    backups: join(data, 'backups'),
    receipt: join(data, 'receipt.json'),
    updateCache: join(data, 'update-check.json'),
    museSettings: join(configHome, 'muse', 'settings.json'),
    museInstalled: join(dataHome, 'muse', 'plugins', 'installed.json'),
    museCatalogDir: join(dataHome, 'muse', 'model-catalog'),
    foreignRules: join(home, '.claude', 'CLAUDE.md'),
  };
}
