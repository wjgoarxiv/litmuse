#!/usr/bin/env node
// Appends one well-formed line to a LitMuse ledger, so quoting in the shell cannot corrupt the JSON.
// Standard library only. Touches nothing else.
//
//   node ledger-append.mjs --session <id> --kind note|evidence|decision --text "<text>" [--path <path>]
//
// The line is {"ts","kind","text","path"?} appended to .litmuse/ledger/<id>.jsonl under the current directory.
// Exit 0 on success (prints the file written), 2 on a bad argument.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const KINDS = new Set(['note', 'evidence', 'decision']);
const flags = new Map();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
    process.stderr.write(`bad argument near ${argv[i]}\n`);
    process.exit(2);
  }
  flags.set(argv[i].slice(2), argv[i + 1]);
}

const session = flags.get('session');
const kind = flags.get('kind');
const text = flags.get('text');
if (!session || !/^[A-Za-z0-9._-]{1,128}$/u.test(session) || session.startsWith('.')) {
  process.stderr.write('--session must be a plain id (letters, digits, dot, dash, underscore)\n');
  process.exit(2);
}
if (!KINDS.has(kind)) {
  process.stderr.write('--kind must be note, evidence or decision\n');
  process.exit(2);
}
if (!text || text.length > 4000) {
  process.stderr.write('--text is required and at most 4000 characters\n');
  process.exit(2);
}

const entry = { ts: new Date().toISOString(), kind, text };
if (flags.has('path')) entry.path = flags.get('path');

const dir = join(process.cwd(), '.litmuse', 'ledger');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${session}.jsonl`);
appendFileSync(file, `${JSON.stringify(entry)}\n`);
process.stdout.write(`${file}\n`);
