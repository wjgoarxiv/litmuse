#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { install } from '../lib/install.mjs';
import { uninstall } from '../lib/uninstall.mjs';
import { doctor } from '../lib/doctor.mjs';
import { models } from '../lib/models.mjs';
import { packageVersion, PACKAGE_ROOT, stageState } from '../lib/bundle.mjs';
import { paths } from '../lib/paths.mjs';
import { installedPlugin, museVersion } from '../lib/muse.mjs';
import { checkUpdate } from '../lib/update-check.mjs';
import { runtime } from '../lib/runtime.mjs';
import { buildCard, renderCard } from '../lib/stage-card.mjs';
import { styleCommand } from '../lib/style.mjs';
import { runRewindCli } from '../plugin/lib/rewind/collect.mjs';

const HELP = `LitMuse ${packageVersion()}: LitFamily workflows for Meta's Muse Code

Usage: litmuse <command> [options]

Commands
  install      Stage the plugin, install it into Muse at user scope, and offer the approvals
  doctor       Check install state, every approval, skill enrollment, catalog bytes and overlaps
  status       Short version of doctor plus an update check; --card shows the live LIT card for this folder
  models       List the models and effort tiers your Muse catalog offers
  hud          Show the recommended /hud and /theme preset
  style        eli5 | asd-ste100 | off | status: the answer style LitMuse adds to every session
  runtime      status [name] | install <name|all>: the pinned engine runtimes, cached under the LitMuse data dir
  rewind       Cross-session brief records [--json] [--here] [--since 7d] [--max 12] [--session <id>]
  uninstall    Remove the plugin from Muse and the staged bundle
  help         This text

Options
  --dry-run    Show every destination and command; write nothing
  --yes, -y    Allow writes from a shell without a terminal (agents, CI)
  --approve    Approve the hooks and agents without asking (for scripts)
  --scope <s>  Muse install scope: user (default) or project
  --json       Machine-readable output (doctor, models)
  --offline    Skip the npm update check
  --discard-modified  uninstall: also remove a bundle edited after install
  --version    Print the version`;

function parse(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--approve') flags.approve = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--offline') flags.offline = true;
    else if (a === '--discard-modified') flags.discardModified = true;
    else if (a === '--card') flags.card = true;
    else if (a === '--scope') flags.scope = argv[++i];
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-v') flags.version = true;
    else rest.push(a);
  }
  return { command: rest[0] ?? 'help', args: rest.slice(1), flags };
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

async function main() {
  const { command, args, flags } = parse(process.argv.slice(2));
  const env = process.env;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !env.CI);
  const print = (line) => process.stdout.write(`${line}\n`);
  if (flags.version) {
    print(packageVersion());
    return 0;
  }
  if (flags.help || command === 'help') {
    print(HELP);
    return 0;
  }
  if (flags.scope && !['user', 'project'].includes(flags.scope)) {
    print('--scope takes user or project');
    return 2;
  }
  switch (command) {
    case 'install':
    case 'update':
      return install({ env, flags, interactive, ask, print });
    case 'uninstall':
      return uninstall({ env, flags, interactive, print });
    case 'doctor':
      return doctor({ env, flags, print });
    case 'models':
      return models({ env, flags, print });
    case 'runtime':
      return runtime({ env, flags, args, print });
    case 'rewind':
      return runRewindCli(flags.json ? [...args, '--json'] : args, process.cwd(), { env });
    case 'hud':
      print(readFileSync(join(PACKAGE_ROOT, 'docs', 'hud-preset.md'), 'utf8'));
      return 0;
    case 'style':
      return styleCommand(args, env, print);
    case 'status': {
      if (flags.card) {
        const card = buildCard({ cwd: process.cwd(), env });
        print(flags.json ? JSON.stringify(card, null, 2) : renderCard(card));
        return 0;
      }
      const st = stageState(paths(env));
      const plugin = installedPlugin(env);
      print(`LitMuse ${packageVersion()} · host ${museVersion(env) ?? 'muse not found'}`);
      print(`bundle ${st.state}${st.version ? ` (${st.version})` : ''} · Muse plugin ${plugin ? `installed ${plugin.version ?? ''}`.trim() : 'not installed'}`);
      if (!flags.offline) {
        const u = await checkUpdate(env);
        if (u.latest && u.latest !== packageVersion()) print(`update: ${u.latest} available (npx @litfamily/litmuse@latest install)`);
      }
      print('Run `npx @litfamily/litmuse doctor` for every check.');
      return 0;
    }
    default:
      print(`Unknown command: ${command}\n\n${HELP}`);
      return 2;
  }
}

main().then((code) => { process.exitCode = code ?? 0; }, (err) => {
  process.stderr.write(`litmuse: ${err.message}\n`);
  process.exitCode = 1;
});
