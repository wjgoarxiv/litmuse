// The command line: every flag LitMuse takes. Anything else that starts with a dash is refused, except for `rewind`,
// which reads its own flags.
export const NPX = 'npx --yes @litfamily/litmuse@latest';
export const GLYPH_CHOICES = ['auto', 'round', 'square'];

const SWITCHES = new Map([
  ['--dry-run', 'dryRun'], ['--yes', 'yes'], ['-y', 'yes'], ['--approve', 'approve'], ['--json', 'json'], ['--offline', 'offline'],
  ['--no-agent-file', 'noAgentFile'], ['--discard-modified', 'discardModified'], ['--card', 'card'], ['--watch', 'watch'],
  ['--all', 'all'], ['--allow-shadow', 'allowShadow'], ['--round', 'round'], ['--agent', 'agent'],
  ['--help', 'help'], ['-h', 'help'], ['--version', 'version'], ['-v', 'version'],
]);
const VALUES = new Map([['--scope', 'scope'], ['--from', 'from'], ['--family', 'family'], ['--older-than', 'olderThan'], ['--glyphs', 'glyphs']]);

export const FLAGS = [...SWITCHES.keys(), ...VALUES.keys()];

/** `{command, args, flags, problem}`; `problem` is what makes the line unusable, or null. */
export function parse(argv) {
  const flags = {};
  const rest = [];
  const problems = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (SWITCHES.has(a)) flags[SWITCHES.get(a)] = true;
    else if (!VALUES.has(a)) rest.push(a);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('-')) problems.push(`${a} needs a value.`);
    else flags[VALUES.get(a)] = argv[++i];
  }
  const command = rest[0] ?? 'help';
  const unknown = command === 'rewind' ? undefined : rest.find((a) => a.startsWith('-'));
  if (unknown) problems.unshift(`Unknown option: ${unknown}.`);
  if (flags.scope && !['user', 'project'].includes(flags.scope)) problems.push('--scope takes user or project.');
  if (flags.glyphs && !GLYPH_CHOICES.includes(flags.glyphs)) problems.push(`--glyphs takes ${GLYPH_CHOICES.join(', ')}.`);
  if ((flags.round || flags.glyphs) && !['install', 'update'].includes(command)) problems.push('--round and --glyphs work with install and update.');
  return { command, args: rest.slice(1), flags, problem: problems[0] ?? null };
}
