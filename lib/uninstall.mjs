import { rmSync } from 'node:fs';
import { paths } from './paths.mjs';
import { muse, installedPlugin } from './muse.mjs';
import { stageState } from './bundle.mjs';
import { assertSafeWritePath } from './guard.mjs';
import { removeAgentFile } from './agent-file.mjs';
import { packageVersion } from './bundle.mjs';
import { planRows } from './install-cards.mjs';
import { ownedIconFont, removeIconFont } from './icon-font.mjs';

export async function uninstall({ env = process.env, flags = {}, interactive = false, print = console.log, cards = null, font: { platform } = {} }) {
  const p = paths(env);
  const plugin = installedPlugin(env);
  const st = stageState(p);
  const pluginLine = plugin ? 'muse plugins remove litmuse (also clears its approvals)' : 'not installed in Muse';
  const discard = st.state === 'modified' && flags.discardModified;
  const bundleLine = st.state === 'owned' || discard
    ? `remove ${p.stage}${discard ? ` (discarding edits: ${st.detail})` : ''}`
    : st.state === 'absent' ? 'absent' : `keep ${p.stage} (${st.state}: ${st.detail})`;
  const font = ownedIconFont({ env, platform });
  const plan = [
    ['muse plugin', pluginLine],
    ['bundle', bundleLine],
    ...(st.state === 'modified' && !discard ? [['hint', 'add --discard-modified to remove the edited bundle too']] : []),
    ...(font.remove.length ? [['icon font', `remove ${font.remove.join(', ')}`]] : []),
    ['kept', `${p.backups} and ${p.receipt}`],
  ];
  if (cards) cards.panel({ title: 'LitMuse uninstall', sections: [{ rows: planRows(plan.map(([label, value]) => [label[0].toUpperCase() + label.slice(1), value])) }] });
  else {
    print('LitMuse uninstall');
    for (const [label, value] of plan) print(`  ${label.padEnd(14)}${value}`);
  }
  if (flags.dryRun) {
    print(removeAgentFile({ env, version: packageVersion(), dryRun: true }));
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
      const why = `${r.command}: ${(r.stderr || r.stdout).trim().split(/\r?\n/)[0]}`;
      if (cards) cards.row('fail', 'Muse plugin', why);
      else print(`FAIL ${why}`);
      return 1;
    }
    if (cards) cards.row('done', 'Muse plugin', 'removed from Muse');
    else print('Removed the LitMuse plugin from Muse.');
  }
  if (st.state === 'owned' || discard) {
    rmSync(assertSafeWritePath(p.stage), { recursive: true, force: true });
    if (cards) cards.row('done', 'Bundle', `removed ${p.stage}`);
    else print(`Removed ${p.stage}.`);
  }
  const gone = removeIconFont({ env, platform });
  const fontLines = [
    ...(gone.remove.length ? [`removed ${gone.remove.join(', ')}; other products may draw square ends until an icon font is installed again`] : []),
    ...(gone.keep.length ? [`kept ${gone.keep.join(', ')} (the file changed, or its folder is now a link)`] : []),
  ];
  for (const line of fontLines) {
    if (cards) cards.row('done', 'Icon font', line);
    else print(`Icon font: ${line}.`);
  }
  const rules = removeAgentFile({ env, version: packageVersion() });
  const stays = 'Project files LitMuse sessions wrote (plans/, .litmuse/) stay in each project.';
  if (cards) {
    cards.row(/refused/.test(rules) ? 'warn' : 'done', 'Rules file', rules.replace('AGENT_FILE: ', ''));
    cards.panel({ title: 'LitMuse uninstall is done', sections: [{ rows: [{ value: stays }] }] });
  } else {
    print(rules);
    print(stays);
  }
  return 0;
}
