import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Skills whose bodies moved to wjgoarxiv-skills. LitMuse keeps a same-name stub for each, so the route, the catalog
// entry and the doctor row stay. `folder` is what `muse skills install` copies; `installs` is the id that copy answers
// to in Muse's user skills. The figures plot adapter reaches its canonical source two folders up, which a one-skill
// install does not carry, so in Muse the source folder itself is the skill to install.
export const MOVED = {
  'lit-pptx': { family: 'decks' },
  'lit-docx': { family: 'documents' },
  'lit-diagram-drawer': { family: 'figures' },
  'lit-schematic': { family: 'figures' },
  'lit-scientific-visualization': { family: 'figures', folder: 'plugins/figures/vendor/scientific-visualization', installs: 'scientific-visualization' },
  'frontend-ui-ux': { family: 'design' },
  'visual-qa': { family: 'design' },
  'lit-typographic-motion': { family: 'video-covers' },
  'readme-studio': { family: 'video-covers' },
};

export function movedSkill(id) {
  const m = MOVED[id];
  if (!m) return null;
  return { id, family: m.family, folder: m.folder ?? `plugins/${m.family}/skills/${id}`, installs: m.installs ?? id };
}

export const installLine = (m) => `muse skills install <path to your wjgoarxiv-skills clone>/${m.folder} --scope user`;

// Muse keeps user skills in $CONFIG_DIR/skills/<id>/, where $CONFIG_DIR is $XDG_CONFIG_HOME/muse or ~/.config/muse.
export function installedCopy(m, env = process.env) {
  const configHome = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config');
  return existsSync(join(configHome, 'muse', 'skills', m.installs, 'SKILL.md'));
}

// The load line of a moved route: the installed copy when it is there, else the stub with the install line.
export function movedActivation(id, env = process.env) {
  const m = movedSkill(id);
  if (!m) return null;
  if (installedCopy(m, env)) {
    return `\`${id}\` moved to the \`${m.family}\` family of wjgoarxiv-skills and is installed here as user skill \`${m.installs}\`. After that line and before any other tool, load it with read_skill id \`${m.installs}\` and follow it; the LitMuse stub \`plugin:litmuse:${id}\` only points there.`;
  }
  return `\`${id}\` moved to the \`${m.family}\` family of wjgoarxiv-skills and is not installed here. After that line, load the stub with read_skill id \`plugin:litmuse:${id}\` and answer from it: say what the skill makes, that it moved, and give the one-skill install line \`${installLine(m)}\`. Build nothing in its place.`;
}
