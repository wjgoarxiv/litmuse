import { lstatSync, readFileSync } from 'node:fs';
import { paths } from './paths.mjs';
import { writeFileAtomic } from './safe-write.mjs';

// LitMuse's own config.json: the rules-file choice (agentFile) and the round-ends choice (glyphs).
export function readConfig(env) {
  try {
    const file = paths(env).config;
    if (lstatSync(file).isSymbolicLink()) return {};
    return JSON.parse(readFileSync(file, 'utf8')) ?? {};
  } catch {
    return {};
  }
}

export function writeConfig(env, patch) {
  return writeFileAtomic(paths(env).config, `${JSON.stringify({ ...readConfig(env), ...patch }, null, 2)}\n`);
}
