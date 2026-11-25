import { existsSync, realpathSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { paths } from './paths.mjs';
import { preflightDestinations, writeFileAtomic, copyFileAtomic } from './safe-write.mjs';
import { muse, museVersion, installedPlugin } from './muse.mjs';
import { stageState, stageBundle, packageVersion } from './bundle.mjs';
import { expectedApprovals, approvalStates } from './approvals.mjs';
import { agentFileAsks, agentFilePlan, installAgentFile } from './agent-file.mjs';
import { MOVED, movedSkill, installLine } from '../plugin/hooks/lib/moved.mjs';
import { SHELF, extensionsNotice, leftoverRuntime } from '../plugin/hooks/lib/extensions.mjs';
import { noticeHash, wasShown, recordShown } from './shown.mjs';
import { survey, findings, CLI } from './extensions.mjs';
import { planRows } from './install-cards.mjs';

function remedy(state, detail, p) {
  const saved = `${p.stage}.saved-${new Date().toISOString().slice(0, 10)}`;
  if (state === 'symlinked') {
    const link = detail.split(' is a symbolic link')[0];
    return `Remove the link itself (the files it points to stay): rm "${link}" — then run install again.`;
  }
  if (state === 'foreign') return `LitMuse only replaces a bundle it wrote. Move that path aside: mv "${p.stage}" "${saved}" — then run install again.`;
  return `The installed bundle was edited after install. Keep your edits with: mv "${p.stage}" "${saved}" — or discard them with: npx @litfamily/litmuse uninstall --discard-modified. Then run install again.`;
}

// Edits inside a skill that became a LitFamily extension: this release ships only a stub there, so the place to keep
// customising it is the extension's own user-skill folder, which LitMuse never writes.
function extensionRemedy(changed = [], p) {
  const ids = Object.keys(MOVED).filter((id) => changed.some((rel) => rel.startsWith(`skills/${id}/`)));
  return ids.map((id) => {
    const userDir = join(dirname(p.museSettings), 'skills', id);
    return `${id} is now a LitFamily extension, and this LitMuse keeps only a short stub in its folder. After moving the bundle aside as above, install the extension (git clone ${SHELF}, then ${installLine(movedSkill(id))}) and carry your edits into ${userDir}, which LitMuse never writes.`;
  });
}

// Printed after the notice above, from the CLI side: that notice lives in the hook library, and every change there
// makes Muse ask the user to approve all ten hooks again.
function extensionLines(env) {
  const lines = [`  Muse refuses a folder that is already there. \`${CLI} extensions install <skill>\` moves an old copy aside first, then installs (it shows the plan; add --yes to run it).`];
  const sv = survey(env);
  const n = sv.error ? 0 : findings(sv).length;
  if (n) lines.push(`  ${n} thing${n === 1 ? '' : 's'} in your extension folders need${n === 1 ? 's' : ''} a look: run \`${CLI} extensions check\`.`);
  return lines;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Copies the Muse files that install and approval will rewrite. The credential file is never read or copied.
function backupHostFiles(p) {
  const saved = [];
  const at = stamp();
  for (const file of [p.museSettings, p.museInstalled]) {
    if (!existsSync(file)) continue;
    saved.push(copyFileAtomic(file, join(p.backups, `${basename(file)}.${at}.bak`)));
  }
  return saved;
}

function samePath(a, b) {
  const real = (x) => {
    try { return realpathSync(x); } catch { return resolve(x); }
  };
  return real(a) === real(b);
}

const counted = (list) => {
  const of = (kind, word) => {
    const n = list.filter((a) => a.kind === kind).length;
    return n ? [`${n} ${word}${n === 1 ? '' : 's'}`] : [];
  };
  return `${list.length} (${[...of('hook', 'hook'), ...of('agent', 'agent')].join(', ')})`;
};

export async function install({ env = process.env, flags = {}, interactive = false, ask, print = console.log, cards = null }) {
  const p = paths(env);
  const version = packageVersion();
  const scope = flags.scope || 'user';
  // With cards, these lines are drawn as rows and panels instead.
  const plain = cards ? () => {} : print;
  let stage = 'Check';
  const fail = (what, ...notes) => {
    if (cards) {
      cards.panel({
        title: 'INSTALL STOPPED', bad: true,
        sections: [{ rows: [
          { mark: 'fail', label: 'Stage', value: stage }, { mark: 'fail', label: 'Reason', value: what },
          { mark: 'note', label: 'Next', value: notes.length ? 'the lines below' : 'fix this, then run the install again' },
        ] }],
      });
      if (notes.length) print('');
      for (const line of notes) print(line);
    } else for (const line of [`FAIL ${what}`, ...notes]) print(line);
    return 1;
  };
  const section = (heading, lines) => {
    if (cards) {
      cards.text(heading, lines);
      return;
    }
    print('');
    print(heading);
    for (const line of lines) print(line);
  };
  plain(`LitMuse ${version} installer for Muse Code`);
  cards?.intro(`Installs into ${p.data}. Your Muse settings are backed up first.`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    return fail(`Node.js ${process.versions.node} is too old; LitMuse needs Node.js 20 or newer.`);
  }
  const mv = museVersion(env);
  if (!mv) {
    return fail('muse was not found on PATH. Install Muse Code first (https://dev.meta.ai/docs/muse-code), sign in once, then run this again.');
  }
  plain(`Host: ${mv}`);

  const st = preflightDestinations(p) ?? stageState(p);
  if (['symlinked', 'foreign', 'modified'].includes(st.state)) {
    return fail(
      `destination ${st.state}: ${st.detail}`,
      remedy(st.state, st.detail, p),
      ...(st.state === 'modified' ? extensionRemedy(st.changed, p) : []),
      'No files written.',
    );
  }

  const existing = installedPlugin(env);
  const existingSource = existing?.source?.path;
  if (existingSource && !samePath(existingSource, p.stage)) {
    return fail(
      `Muse already has LitMuse ${existing.version ?? ''} installed from ${existingSource}.`.replace('  ', ' '),
      `This installer manages the copy in ${p.stage}. Remove the other one first with: muse plugins remove litmuse (this also clears its approvals), then run install again.`,
      'No files written.',
    );
  }
  const installArgs = existing ? ['plugins', 'update', 'litmuse', '--json'] : ['plugins', 'install', p.stage, '--scope', scope, '--json'];
  const approvals = expectedApprovals();

  const plan = [
    ['bundle', `${p.stage}${st.state === 'owned' ? ` (replaces LitMuse ${st.version})` : ''}`],
    ['backups', `${p.backups} (Muse settings.json and installed.json, when present)`],
    ['receipt', p.receipt],
    ['rules file', agentFilePlan({ env, flags })],
    ['muse', `muse ${installArgs.join(' ')}`],
    ['approvals', `up to ${approvals.length} capabilities may need your approval in Muse (hooks and agents):`],
  ];
  if (cards) {
    cards.panel({
      title: `LitMuse ${version} install plan`,
      sections: [{ rows: planRows([['Host', mv], ...plan.map(([label, value]) => [label[0].toUpperCase() + label.slice(1), value]).slice(0, -1), ['Approvals', `up to ${counted(approvals)}`]]) }],
    });
  } else {
    print('');
    print('Plan');
    for (const [label, value] of plan) print(`  ${label.padEnd(12)}${value}`);
    for (const a of approvals) print(`    ${a.id}`);
  }

  if (flags.dryRun) {
    print('');
    print('Dry run: no files written and no Muse command that changes state was run.');
    return 0;
  }
  if (!interactive && !flags.yes) {
    print('');
    print('No files written: this shell has no terminal. Rerun with --yes to install (add --approve to approve the capabilities above as well).');
    return 0;
  }

  const previous = st.state === 'owned' ? st.version : existing?.version;
  const leftovers = [leftoverRuntime(p.data)].filter((d) => existsSync(d));

  const written = [];
  const steps = cards?.work(`Installing LitMuse ${version}`, 'Install steps', [
    ['Backups', 'save your Muse settings'], ['Bundle', 'copy the plugin bundle'], ['Validate', 'muse plugins validate'], ['Muse', `muse plugins ${existing ? 'update' : 'install'}`],
  ]);
  const step = (name) => {
    stage = name;
    steps?.next();
  };
  const stopped = (...told) => {
    steps?.fail();
    return fail(...told);
  };
  step('Backups');
  written.push(...backupHostFiles(p));
  step('Bundle');
  stageBundle(p);
  written.push(p.stage);

  step('Validate');
  const validation = muse(env, ['plugins', 'validate', p.stage, '--json']);
  const diagnostics = validation.json?.diagnostics ?? [];
  if (!validation.ok || validation.json?.valid !== true || diagnostics.length) {
    return stopped(
      'muse plugins validate rejected the bundle:',
      ...diagnostics.map((d) => `  ${d.code ?? 'diagnostic'}: ${d.message ?? JSON.stringify(d)}`),
      ...(diagnostics.length ? [] : [`  ${validation.stderr.trim() || validation.stdout.trim()}`]),
      'Muse was left unchanged.',
    );
  }

  step('Muse');
  const result = muse(env, installArgs);
  if (!result.ok) {
    return stopped(`${result.command} exited ${result.status}:`, `  ${(result.stderr || result.stdout).trim().split('\n').slice(0, 6).join('\n  ')}`);
  }
  const cachePath = result.json?.installed?.cache_path;
  written.push(p.museInstalled);
  if (cachePath) written.push(cachePath);
  const installed = existing
    ? `LitMuse ${version} is updated in Muse from ${p.stage}. Skills and commands are active now.`
    : `LitMuse ${version} is installed in Muse at ${scope} scope. Skills and commands are active now.`;
  plain('');
  plain(`Installed: ${installed}`);
  steps?.done();

  let states = approvalStates(muse(env, ['plugins', 'inspect', 'litmuse', '--json']).json);
  const pending = states.filter((s) => s.status !== 'trusted_enabled');
  const named = (s) => `  ${s.id}  (${s.what})`;
  const asksApproval = pending.length > 0 && !flags.approve && interactive && Boolean(ask);
  const questions = Number(asksApproval) + Number(agentFileAsks({ env, flags, interactive, ask, version }));
  if (pending.length) {
    let approve = Boolean(flags.approve);
    const decided = approve;
    if (!decided && !(cards && asksApproval)) {
      section(`Muse runs plugin hooks and agents only after you approve them (an update re-arms the agent approvals, and the hook approvals whenever hook code changed). ${pending.length} are waiting:`, pending.map(named));
    }
    if (asksApproval) {
      approve = await ask(`Approve these ${pending.length} LitMuse capabilities now? [y/N] `, {
        card: {
          tag: `LIT 1/${questions}`,
          title: 'Approvals',
          note: `Muse runs plugin hooks and agents only after you approve them. Yes approves these ${counted(pending)} now; No prints the commands for later.`,
          yes: `approve ${pending.length}`,
          no: 'not now',
          list: { hint: `l list all ${pending.length}`, heading: `${pending.length} LitMuse capabilities are waiting`, lines: pending.map((s) => (s.kind === 'hook' ? named(s) : `  ${s.id}`)) },
        },
      });
    }
    if (approve) {
      if (decided) {
        plain('');
        plain(`Approving ${pending.length} LitMuse capabilities...`);
      }
      const failed = [];
      for (const s of pending) {
        const r = muse(env, ['plugins', 'approve', s.id, '--json']);
        if (!r.ok) failed.push(`${s.id}: ${(r.stderr || r.stdout).trim().split(/\r?\n/)[0]}`);
      }
      written.push(`${p.museSettings} (runtime_capabilities for litmuse)`);
      for (const f of failed) {
        if (cards) cards.row('fail', 'Approve', f);
        else print(`  FAIL approve ${f}`);
      }
      states = approvalStates(muse(env, ['plugins', 'inspect', 'litmuse', '--json']).json);
      const byId = new Map(states.map((s) => [s.id, s]));
      const approved = pending.filter((s) => byId.get(s.id)?.status === 'trusted_enabled');
      const still = states.filter((s) => s.status !== 'trusted_enabled');
      if (approved.length) {
        if (cards) cards.row('done', 'Approved', counted(approved));
        else section(`Approved ${approved.length} LitMuse capabilities:`, approved.map(named));
      }
      // With cards, the closing card and the commands after it say what is left.
      if (!cards && still.length) section(`${still.length} are still waiting:`, still.map(named));
      else if (!cards) print('No capabilities are still waiting for approval.');
    } else if (!cards) {
      section('Approval needed. Run these when you are ready (or rerun install with --approve):', pending.map((s) => `  muse plugins approve ${s.id}`));
    }
  }

  plain('');
  let rules = null;
  const rulesRow = (line) => {
    const value = line.replace('AGENT_FILE: ', '');
    rules = { mark: /^(created|updated|unchanged)/.test(value) ? 'done' : /^(off|skipped)/.test(value) ? 'note' : 'warn', label: 'Rules file', value };
  };
  written.push(...await installAgentFile({
    env, flags, interactive, ask, print: cards ? rulesRow : print, version, backupDir: p.backups, tag: `LIT ${questions}/${questions}`,
  }));

  const left = states.filter((s) => s.status !== 'trusted_enabled').length;
  // A new version (or a first install) arms the one-time notice for the next Muse session; a same-version reinstall
  // leaves whatever the last one armed.
  if (previous !== version) {
    writeFileAtomic(p.notice, `${JSON.stringify({ version, pending: true, leftovers })}\n`);
    written.push(p.notice);
  }

  writeFileAtomic(p.receipt, `${JSON.stringify({
    product: 'litmuse', version, scope, installedAt: new Date().toISOString(), host: mv,
    written, approvals: states.map((s) => ({ id: s.id, status: s.status })),
  }, null, 2)}\n`);
  written.push(p.receipt);

  plain('');
  plain('Written:');
  for (const w of written) plain(`  ${w}`);
  plain('');
  if (cards) {
    const names = new Map([
      [p.stage, 'Bundle'], [p.museInstalled, 'Muse plugin list'], [cachePath, 'Muse copy'], [p.museRules, 'Rules file'], [p.notice, 'First-run note'], [p.receipt, 'Receipt'], [p.config, 'Config'],
    ]);
    const nameOf = (path) => names.get(path) ?? (path.startsWith(p.backups) ? 'Backup' : 'Muse settings');
    const waiting = states.filter((s) => s.status !== 'trusted_enabled');
    cards.panel({
      title: `LitMuse ${version} is installed`,
      sections: [
        { head: 'Installed', rows: [
          { label: 'Muse plugin', value: `${existing ? 'updated' : `installed at ${scope} scope`}; skills and commands are active now` },
          ...written.filter((path) => path !== p.museRules).map((path) => ({ label: nameOf(path), value: path })),
          ...(rules ? [rules] : []),
          left === 0 ? { label: 'Approvals', value: 'every hook and agent is approved' } : { mark: 'warn', label: 'Approvals', value: `${counted(waiting)} still to approve; the commands are below` },
        ] },
        { head: 'Next', rows: planRows([
          ...(left ? [['Approve', 'run the commands below']] : []),
          ['Start', 'open Muse in a project and begin a prompt with lit'], ['Check', 'npx @litfamily/litmuse doctor'],
        ]) },
      ],
    });
    if (left) cards.text('Approval needed. Run these when you are ready (or rerun install with --approve):', waiting.map((s) => `    muse plugins approve ${s.id}`));
  }
  // The notice and the fixed line after it are printed once per text; the live count of folders to check always is.
  const [fixedLine, ...liveLines] = extensionLines(env);
  const noticeLines = [...extensionsNotice({ leftovers }), fixedLine];
  const hash = noticeHash(noticeLines.join('\n'));
  if (wasShown(p.shown, hash)) {
    if (cards && liveLines.length) cards.text('LitFamily extensions', liveLines);
    else for (const line of liveLines) print(line);
  } else {
    if (cards) cards.text(noticeLines[0], [...noticeLines.slice(1), ...liveLines]);
    else for (const line of [...noticeLines, ...liveLines]) print(line);
    recordShown(p.shown, hash);
  }
  if (!cards) {
    print('');
    print(left === 0
      ? 'Status: Ready. Start Muse in a project and begin a prompt with `lit`. Check any time with `npx @litfamily/litmuse doctor`.'
      : `Status: installed, approval needed for ${left} capabilities. Run the commands above, then \`npx @litfamily/litmuse doctor\`.`);
  }
  return 0;
}
