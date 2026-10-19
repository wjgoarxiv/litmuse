import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './paths.mjs';
import { writeFileAtomic } from './safe-write.mjs';

export const STYLES = ['eli5', 'asd-ste100'];

const stylePath = (env) => join(paths(env).data, 'style.json');

// The chosen style name, or null when none is set or the file is unreadable, a link, or names an unknown style.
export function readStyle(env = process.env) {
  try {
    const file = stylePath(env);
    if (lstatSync(file).isSymbolicLink()) return null;
    const { style } = JSON.parse(readFileSync(file, 'utf8'));
    return STYLES.includes(style) ? style : null;
  } catch {
    return null;
  }
}

// `litmuse style eli5|asd-ste100|off|status`; returns the exit code.
export function styleCommand(args, env = process.env, print = console.log) {
  const [word] = args;
  if (!word || word === 'status') {
    print(`LitMuse output style: ${readStyle(env) ?? 'off'}`);
    return 0;
  }
  if (word !== 'off' && !STYLES.includes(word)) {
    print(`Unknown style "${word}". Use one of: ${STYLES.join(', ')}, off, status.`);
    return 1;
  }
  try {
    writeFileAtomic(stylePath(env), `${JSON.stringify({ style: word === 'off' ? null : word, updatedAt: new Date().toISOString() })}\n`);
  } catch (e) {
    print(`LitMuse could not save the style: ${e.message}`);
    return 1;
  }
  print(word === 'off' ? 'LitMuse output style: off. It applies from the next session start.' : `LitMuse output style: ${word}. It applies from the next session start.`);
  return 0;
}
