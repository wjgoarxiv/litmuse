import { rmSync } from 'node:fs';
import { paths } from './paths.mjs';
import { muse, installedPlugin } from './muse.mjs';
import { stageState } from './bundle.mjs';
import { assertSafeWritePath } from './guard.mjs';

export async function uninstall({ env = process.env, flags = {}, interactive = false, print = console.log }) {
  const p = paths(env);
  const plugin = installedPlugin(env);
  const st = stageState(p);
  print('LitMuse uninstall');
  print(`  muse plugin   ${plugin ? 'muse plugins remove litmuse (also clears its approvals)' : 'not installed in Muse'}`);
  const discard = st.state === 'modified' && flags.discardModified;
  const bundleLine = st.state === 'owned' || discard
    ? `remove ${p.stage}${discard ? ` (discarding edits: ${st.detail})` : ''}`
    : st.state === 'absent' ? 'absent' : `keep ${p.stage} (${st.state}: ${st.detail})`;
  print(`  bundle        ${bundleLine}`);
  if (st.state === 'modified' && !discard) print('  hint          add --discard-modified to remove the edited bundle too');
  print(`  kept          ${p.backups} and ${p.receipt}`);
  if (flags.dryRun) {
    print('Dry run: nothing removed.');
    return 0;
  }
  if (!interactive && !flags.yes) {
    print('Nothing removed: this shell has no terminal. Rerun with --yes.');
    return 0;
  }
  if (plugin) {
    const r = muse(env, ['plugins', 'remove', 'litmuse', '--json']);
    if (!r.ok) {
      print(`FAIL ${r.command}: ${(r.stderr || r.stdout).trim().split(/\r?\n/)[0]}`);
      return 1;
    }
    print('Removed the LitMuse plugin from Muse.');
  }
  if (st.state === 'owned' || discard) {
    rmSync(assertSafeWritePath(p.stage), { recursive: true, force: true });
    print(`Removed ${p.stage}.`);
  }
  print('Project files LitMuse sessions wrote (plans/, .litmuse/) stay in each project.');
  return 0;
}
