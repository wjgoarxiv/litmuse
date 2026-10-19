import { existsSync, realpathSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { paths } from './paths.mjs';
import { preflightDestinations, writeFileAtomic, copyFileAtomic } from './safe-write.mjs';
import { muse, museVersion, installedPlugin } from './muse.mjs';
import { stageState, stageBundle, packageVersion } from './bundle.mjs';
import { expectedApprovals, approvalStates } from './approvals.mjs';

function remedy(state, detail, p) {
  const saved = `${p.stage}.saved-${new Date().toISOString().slice(0, 10)}`;
  if (state === 'symlinked') {
    const link = detail.split(' is a symbolic link')[0];
    return `Remove the link itself (the files it points to stay): rm "${link}" — then run install again.`;
  }
  if (state === 'foreign') return `LitMuse only replaces a bundle it wrote. Move that path aside: mv "${p.stage}" "${saved}" — then run install again.`;
  return `The installed bundle was edited after install. Keep your edits with: mv "${p.stage}" "${saved}" — or discard them with: npx @litfamily/litmuse uninstall --discard-modified. Then run install again.`;
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

export async function install({ env = process.env, flags = {}, interactive = false, ask, print = console.log }) {
  const p = paths(env);
  const version = packageVersion();
  const scope = flags.scope || 'user';
  print(`LitMuse ${version} installer for Muse Code`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    print(`FAIL Node.js ${process.versions.node} is too old; LitMuse needs Node.js 20 or newer.`);
    return 1;
  }
  const mv = museVersion(env);
  if (!mv) {
    print('FAIL muse was not found on PATH. Install Muse Code first (https://dev.meta.ai/docs/muse-code), sign in once, then run this again.');
    return 1;
  }
  print(`Host: ${mv}`);

  const st = preflightDestinations(p) ?? stageState(p);
  if (['symlinked', 'foreign', 'modified'].includes(st.state)) {
    print(`FAIL destination ${st.state}: ${st.detail}`);
    print(remedy(st.state, st.detail, p));
    print('No files written.');
    return 1;
  }

  const existing = installedPlugin(env);
  const existingSource = existing?.source?.path;
  if (existingSource && !samePath(existingSource, p.stage)) {
    print(`FAIL Muse already has LitMuse ${existing.version ?? ''} installed from ${existingSource}.`.replace('  ', ' '));
    print(`This installer manages the copy in ${p.stage}. Remove the other one first with: muse plugins remove litmuse (this also clears its approvals), then run install again.`);
    print('No files written.');
    return 1;
  }
  const installArgs = existing ? ['plugins', 'update', 'litmuse', '--json'] : ['plugins', 'install', p.stage, '--scope', scope, '--json'];
  const approvals = expectedApprovals();

  print('');
  print('Plan');
  print(`  bundle      ${p.stage}${st.state === 'owned' ? ` (replaces LitMuse ${st.version})` : ''}`);
  print(`  backups     ${p.backups} (Muse settings.json and installed.json, when present)`);
  print(`  receipt     ${p.receipt}`);
  print(`  muse        muse ${installArgs.join(' ')}`);
  print(`  approvals   up to ${approvals.length} capabilities may need your approval in Muse (hooks and agents):`);
  for (const a of approvals) print(`    ${a.id}`);

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

  const written = [];
  written.push(...backupHostFiles(p));
  stageBundle(p);
  written.push(p.stage);

  const validation = muse(env, ['plugins', 'validate', p.stage, '--json']);
  const diagnostics = validation.json?.diagnostics ?? [];
  if (!validation.ok || validation.json?.valid !== true || diagnostics.length) {
    print('FAIL muse plugins validate rejected the bundle:');
    for (const d of diagnostics) print(`  ${d.code ?? 'diagnostic'}: ${d.message ?? JSON.stringify(d)}`);
    if (!diagnostics.length) print(`  ${validation.stderr.trim() || validation.stdout.trim()}`);
    print('Muse was left unchanged.');
    return 1;
  }

  const result = muse(env, installArgs);
  if (!result.ok) {
    print(`FAIL ${result.command} exited ${result.status}:`);
    print(`  ${(result.stderr || result.stdout).trim().split('\n').slice(0, 6).join('\n  ')}`);
    return 1;
  }
  const cachePath = result.json?.installed?.cache_path;
  written.push(p.museInstalled);
  if (cachePath) written.push(cachePath);
  print('');
  print(existing
    ? `Installed: LitMuse ${version} is updated in Muse from ${p.stage}. Skills and commands are active now.`
    : `Installed: LitMuse ${version} is installed in Muse at ${scope} scope. Skills and commands are active now.`);

  let states = approvalStates(muse(env, ['plugins', 'inspect', 'litmuse', '--json']).json);
  const pending = states.filter((s) => s.status !== 'trusted_enabled');
  if (pending.length) {
    print('');
    print(`Muse runs plugin hooks and agents only after you approve them (an update re-arms the agent approvals, and the hook approvals whenever hook code changed). ${pending.length} are waiting:`);
    for (const s of pending) print(`  ${s.id}  (${s.what})`);
    let approve = Boolean(flags.approve);
    if (!approve && interactive && ask) {
      approve = await ask(`Approve these ${pending.length} LitMuse capabilities now? [y/N] `);
    }
    if (approve) {
      const failed = [];
      for (const s of pending) {
        const r = muse(env, ['plugins', 'approve', s.id, '--json']);
        if (!r.ok) failed.push(`${s.id}: ${(r.stderr || r.stdout).trim().split(/\r?\n/)[0]}`);
      }
      written.push(`${p.museSettings} (runtime_capabilities for litmuse)`);
      for (const f of failed) print(`  FAIL approve ${f}`);
      states = approvalStates(muse(env, ['plugins', 'inspect', 'litmuse', '--json']).json);
    } else {
      print('');
      print('Approval needed. Run these when you are ready (or rerun install with --approve):');
      for (const s of pending) print(`  muse plugins approve ${s.id}`);
    }
  }

  const left = states.filter((s) => s.status !== 'trusted_enabled').length;
  writeFileAtomic(p.receipt, `${JSON.stringify({
    product: 'litmuse', version, scope, installedAt: new Date().toISOString(), host: mv,
    written, approvals: states.map((s) => ({ id: s.id, status: s.status })),
  }, null, 2)}\n`);
  written.push(p.receipt);

  print('');
  print('Written:');
  for (const w of written) print(`  ${w}`);
  print('');
  print(left === 0
    ? 'Status: Ready. Start Muse in a project and begin a prompt with `lit`. Check any time with `npx @litfamily/litmuse doctor`.'
    : `Status: installed, approval needed for ${left} capabilities. Run the commands above, then \`npx @litfamily/litmuse doctor\`.`);
  return 0;
}
