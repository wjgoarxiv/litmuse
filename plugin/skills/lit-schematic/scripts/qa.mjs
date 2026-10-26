import { readFileSync } from 'node:fs';
import { runQA, CODES } from './lib/qa-core.mjs';

const args = process.argv.slice(2);
if (args.includes('--codes')) {
  console.log(CODES.join('\n'));
  process.exit(0);
}
const file = args.find((a) => !a.startsWith('-'));
if (!file) {
  console.error('usage: qa.mjs drawing.svg [--png f.png --pdf f.pdf]');
  process.exit(2);
}
const svg = readFileSync(file, 'utf8');
const { pass, fails } = runQA(svg);
if (pass) {
  console.log('QA PASS');
} else {
  for (const f of fails) console.log(`QA FAIL ${f.code}: ${f.msg}`);
  process.exit(1);
}
