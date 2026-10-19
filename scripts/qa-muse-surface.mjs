#!/usr/bin/env node
// Real-surface QA against the installed `muse` binary inside a throwaway HOME, using Muse's offline echo
// provider: install → approve → doctor → one `muse exec --json` turn → check catalog and hook context → uninstall.
// The real ~/.config/muse and ~/.local/share/muse are never touched.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keep = process.argv.includes('--keep');
const SHIPPED = JSON.parse(readFileSync(join(root, 'plugin', '.muse-plugin', 'plugin.json'), 'utf8')).capabilities.skills.length;
const home = mkdtempSync(join(tmpdir(), 'litmuse-qa-'));
const ws = join(home, 'ws');
mkdirSync(ws, { recursive: true });
const env = {
  PATH: process.env.PATH,
  HOME: home,
  XDG_CONFIG_HOME: join(home, '.config'),
  XDG_DATA_HOME: join(home, '.local', 'share'),
  XDG_STATE_HOME: join(home, '.local', 'state'),
  XDG_CACHE_HOME: join(home, '.cache'),
  LITMUSE_NO_UPDATE_CHECK: '1',
  LITMUSE_SKIP_RUNTIMES: '1',
};
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function sessionLogs(dir, acc = []) {
  try {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) sessionLogs(p, acc);
      else if (n === 'session.jsonl' && !p.includes('/subagent/')) acc.push(p);
    }
  } catch { /* no sessions yet */ }
  return acc;
}

const version = run('muse', ['--version']);
check('muse on PATH', version.status === 0, version.stdout.trim());

const inst = run(process.execPath, [join(root, 'bin', 'litmuse.mjs'), 'install', '--yes', '--approve']);
check('install --yes --approve', inst.status === 0 && /Status: Ready/.test(inst.stdout), inst.stdout.split('\n').filter((l) => /^Status|FAIL/.test(l)).join(' | '));

const doc = run(process.execPath, [join(root, 'bin', 'litmuse.mjs'), 'doctor', '--offline']);
check('doctor PASS', doc.status === 0 && /LitMuse doctor: PASS/.test(doc.stdout), doc.stdout.split('\n').filter((l) => /^(FAIL|WARN|APPROVAL)|doctor:/.test(l)).join(' | '));

const exec = run('muse', ['exec', '--provider', 'echo', '--json', '--trust-workspace', 'lit plan a tiny todo app'], { cwd: ws });
check('muse exec (echo provider)', exec.status === 0, `exit ${exec.status}`);
writeFileSync(join(home, 'exec.jsonl'), exec.stdout);

const logs = sessionLogs(join(env.XDG_DATA_HOME, 'muse', 'sessions'));
const text = logs.map((f) => readFileSync(f, 'utf8')).join('\n');
const described = (text.match(/skill id=\\"plugin:litmuse:[a-z-]+\\" scope=\\"plugin\\" path=\\"[^\\]+\\">\\n<description>/g) ?? []).length;
check(`catalog lists all ${SHIPPED} LitMuse skills with descriptions`, described >= SHIPPED, `${described} entries with descriptions`);
check('UserPromptSubmit context reached the run', /LitMuse activation: the prompt starts with the lit keyword/.test(text));
check('SessionStart context reached the run', /LitMuse 0\.\d+\.\d+ is active in this Muse Code session/.test(text));
let ledger = '';
try {
  const dir = join(ws, '.litmuse', 'ledger');
  ledger = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('');
} catch { /* no ledger */ }
check('ledger records the lit-plan route through SessionEnd', /"event":"SessionEnd","route":"lit-plan"/.test(ledger), ledger.trim().split('\n').length + ' ledger lines');

// The motion route in a second workspace: the activation reaches the run, and the Stop hook holds a turn that rendered
// nothing with the skill's done gate (the echo provider cannot render, so the hold is the expected outcome).
const seen = new Set(logs);
const wsMotion = join(home, 'ws-motion');
mkdirSync(wsMotion, { recursive: true });
const motion = run('muse', ['exec', '--provider', 'echo', '--json', '--trust-workspace', 'lit motion a README cover loop for LOOPTEST'], { cwd: wsMotion });
check('muse exec on the motion route (echo provider)', motion.status === 0, `exit ${motion.status}`);
const motionText = sessionLogs(join(env.XDG_DATA_HOME, 'muse', 'sessions')).filter((f) => !seen.has(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
check('the motion activation loads plugin:litmuse:lit-typographic-motion', /read_skill id `plugin:litmuse:lit-typographic-motion`/.test(motionText));
check('the Stop hook held the motion turn with the done gate', /LitMuse lit-typographic-motion[^"]{0,40} is not done|LitMuse lit-typographic-motion: the work is not done/.test(motionText));

const un = run(process.execPath, [join(root, 'bin', 'litmuse.mjs'), 'uninstall', '--yes']);
check('uninstall', un.status === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `qa-muse-surface: FAIL (${failed})` : `qa-muse-surface: PASS (${results.length} checks)`);
if (keep) console.log(`kept ${home}`);
else rmSync(home, { recursive: true, force: true });
process.exitCode = failed ? 1 : 0;
