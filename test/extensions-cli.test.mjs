// `litmuse extensions <verb>`: the stubs' manual lines done in code, against the fake muse in a throwaway HOME.
// Each test builds a small wjgoarxiv-skills shelf of its own and never reaches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, sandbox, collect, museCalls } from './helpers.mjs';
import { extensionsCommand, extPaths } from '../lib/extensions.mjs';
import { install } from '../lib/install.mjs';
import { doctor } from '../lib/doctor.mjs';

function shelf(version = 'v1', ids = ['visual-qa', 'lit-docx', 'lit-pptx']) {
  const root = mkdtempSync(join(tmpdir(), 'litmuse-shelf-'));
  for (const id of ids) writeEdition(root, id, version);
  return root;
}

function writeEdition(root, id, version) {
  const dir = join(root, 'variants', 'litmuse', id);
  mkdirSync(join(dir, 'references'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id} edition ${version}\n---\nbody ${version}\n`);
  writeFileSync(join(dir, 'references', 'notes.md'), `notes ${version}\n`);
}

function setup() {
  const { home, env } = sandbox();
  const ws = join(home, 'ws');
  mkdirSync(ws, { recursive: true });
  const p = extPaths(env);
  const run = async (args, flags = {}) => {
    const out = collect();
    const code = await extensionsCommand({ args, flags, env, print: out.print, cwd: ws });
    return { code, text: out.text() };
  };
  const lock = () => JSON.parse(readFileSync(p.lock, 'utf8')).skills;
  const backups = () => (existsSync(p.backups) ? readdirSync(p.backups).sort() : []);
  return { home, env, ws, p, run, lock, backups };
}

function personal(home, rel, id) {
  const dir = join(home, rel, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: mine\n---\nmine\n`);
  return dir;
}

test('install is a dry run until --yes, then Muse copies the edition and its lock is the receipt', async () => {
  const { env, p, run, lock, backups } = setup();
  const from = shelf();
  const dry = await run(['install', 'visual-qa'], { from });
  assert.equal(dry.code, 0);
  assert.match(dry.text, /muse skills install .*variants\/litmuse\/visual-qa --scope user/);
  assert.match(dry.text, /Dry run: nothing was moved or installed/);
  assert.ok(!existsSync(join(p.skills, 'visual-qa')), 'dry run writes nothing');
  assert.ok(!museCalls(env).some((c) => c[1] === 'install'), 'and calls no muse install');

  const real = await run(['install', 'visual-qa'], { from, yes: true });
  assert.equal(real.code, 0, real.text);
  assert.ok(existsSync(join(p.skills, 'visual-qa', 'SKILL.md')));
  assert.match(lock()['visual-qa'].source.path, /variants\/litmuse\/visual-qa$/);
  assert.deepEqual(backups(), [], 'nothing to move aside on a fresh install');

  const listed = await run(['list'], { json: true });
  const row = JSON.parse(listed.text).extensions.find((r) => r.id === 'visual-qa');
  assert.equal(row.state, 'installed');
  assert.equal(row.receipt.files, 2);

  const again = await run(['install', 'visual-qa'], { from, yes: true });
  assert.match(again.text, /visual-qa: current/, 'a second install of the same files does nothing');
  assert.deepEqual(backups(), []);
});

test('install over an existing folder moves it aside whole, with the user file, and leaves one live copy', async () => {
  const { home, p, run, backups } = setup();
  const old = personal(home, '.config/muse/skills', 'lit-docx');
  writeFileSync(join(old, 'my-notes.md'), 'keep me');
  const check = await run(['check']);
  assert.equal(check.code, 1);
  assert.match(check.text, /lit-docx: .*folder Muse has no record of/);
  assert.match(check.text, /fix: npx @litfamily\/litmuse extensions install lit-docx --yes/);

  const r = await run(['install', 'lit-docx'], { from: shelf(), yes: true });
  assert.equal(r.code, 0, r.text);
  const [stampDir] = backups();
  assert.match(stampDir, /^\d{8}-\d{6}$/);
  assert.equal(readFileSync(join(p.backups, stampDir, 'lit-docx', 'my-notes.md'), 'utf8'), 'keep me');
  assert.ok(!existsSync(join(p.skills, 'lit-docx', 'my-notes.md')), 'the new copy is clean');
  assert.ok(!existsSync(join(p.skills, 'lit-docx', 'lit-docx')), 'no nesting');
  assert.match(readFileSync(join(p.skills, 'lit-docx', 'SKILL.md'), 'utf8'), /edition v1/);
  assert.equal((await run(['check'])).code, 0, 'clean afterwards');
});

test('a same-name personal skill stops the install and is named; --allow-shadow installs and only warns', async () => {
  const { home, p, run } = setup();
  const mine = personal(home, '.claude/skills', 'visual-qa');
  const r = await run(['install', 'visual-qa'], { from: shelf(), yes: true });
  assert.equal(r.code, 1);
  assert.ok(r.text.includes(mine), 'names the competing folder');
  assert.match(r.text, /Nothing was changed/);
  assert.ok(!existsSync(join(p.skills, 'visual-qa')));

  const ok = await run(['install', 'visual-qa'], { from: shelf(), yes: true, allowShadow: true });
  assert.equal(ok.code, 0, ok.text);
  assert.match(ok.text, /warning: .*same name/);
  assert.ok(existsSync(join(mine, 'SKILL.md')), 'the personal skill is never touched');
  const list = await run(['list']);
  assert.match(list.text, /same name: .*\.claude\/skills\/visual-qa \(user, shadowed\)/);
});

test('a project copy that outranks the extension is reported by check', async () => {
  const { ws, run } = setup();
  await run(['install', 'lit-pptx'], { from: shelf(), yes: true });
  personal(ws, '.agents/skills', 'lit-pptx');
  const c = await run(['check']);
  assert.equal(c.code, 1);
  assert.match(c.text, /\.agents\/skills\/lit-pptx \(project\) outranks the extension/);
  const row = JSON.parse((await run(['list'], { json: true })).text).extensions.find((x) => x.id === 'lit-pptx');
  assert.equal(row.shadowed, true);
});

test('update reinstalls only what changed in the source, moving the old copy aside', async () => {
  const { p, run, backups, lock } = setup();
  const from = shelf('v1');
  await run(['install', 'visual-qa', 'lit-docx', 'lit-pptx'], { from, yes: true });
  const before = lock()['lit-docx'].installed_at;
  assert.equal((await run(['update'], { from, yes: true })).text.match(/current/g).length, 3, 'nothing changed yet');
  writeEdition(from, 'lit-docx', 'v2');
  const dry = await run(['update'], { from });
  assert.match(dry.text, /lit-docx: move/);
  assert.match(dry.text, /visual-qa: current/);
  assert.match(dry.text, /lit-schematic: not installed/);
  const r = await run(['update'], { from, yes: true });
  assert.equal(r.code, 0, r.text);
  assert.match(readFileSync(join(p.skills, 'lit-docx', 'SKILL.md'), 'utf8'), /edition v2/);
  assert.equal(backups().length, 1);
  assert.deepEqual(readdirSync(join(p.backups, backups()[0])), ['lit-docx']);
  assert.notEqual(lock()['lit-docx'].installed_at, before);
});

test('remove moves an installed extension aside and drops the record; a user folder is refused', async () => {
  const { home, p, run, lock, backups } = setup();
  await run(['install', 'visual-qa'], { from: shelf(), yes: true });
  const mine = personal(home, '.config/muse/skills', 'lit-docx');
  const refused = await run(['remove', 'lit-docx'], { yes: true });
  assert.equal(refused.code, 1);
  assert.ok(refused.text.includes(mine) && /REFUSED/.test(refused.text));
  assert.ok(existsSync(join(mine, 'SKILL.md')));

  const dry = await run(['remove', 'visual-qa']);
  assert.match(dry.text, /Dry run/);
  assert.ok(existsSync(join(p.skills, 'visual-qa')));
  const r = await run(['remove', 'visual-qa'], { yes: true });
  assert.equal(r.code, 0, r.text);
  assert.ok(!existsSync(join(p.skills, 'visual-qa')));
  assert.ok(existsSync(join(p.backups, backups()[0], 'visual-qa', 'SKILL.md')), 'moved, never deleted');
  assert.equal(lock()['visual-qa'], undefined);
});

test('prune-backups lists with sizes, deletes only with --yes, and only dated folders inside its own folder', async () => {
  const { p, run } = setup();
  const old = join(p.backups, '20200101-000000', 'lit-docx');
  const fresh = join(p.backups, '29990101-000000', 'lit-docx');
  for (const d of [old, fresh]) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'SKILL.md'), 'x'.repeat(2048)); }
  const other = join(p.backups, 'not-a-stamp');
  mkdirSync(other);
  const dry = await run(['prune-backups'], { olderThan: '30' });
  assert.match(dry.text, /\* 20200101-000000 +2\.0 KB +lit-docx/);
  assert.match(dry.text, /Dry run: 1 marked/);
  assert.ok(existsSync(old));
  const r = await run(['prune-backups'], { olderThan: '30', yes: true });
  assert.equal(r.code, 0);
  assert.ok(!existsSync(join(p.backups, '20200101-000000')));
  assert.ok(existsSync(fresh) && existsSync(other), 'newer and unknown folders stay');
});

test('a linked backups folder or extension folder fails closed', async () => {
  const { home, p, run } = setup();
  mkdirSync(join(home, 'elsewhere'), { recursive: true });
  mkdirSync(p.museDir, { recursive: true });
  symlinkSync(join(home, 'elsewhere'), p.backups);
  assert.equal((await run(['prune-backups'], { yes: true })).code, 1);
  mkdirSync(p.skills, { recursive: true });
  symlinkSync(join(home, 'elsewhere'), join(p.skills, 'lit-docx'));
  const r = await run(['install', 'lit-docx'], { from: shelf(), yes: true });
  assert.equal(r.code, 1);
  assert.match(r.text, /symbolic link/);
});

test('without --from it keeps a sparse clone in its own cache; an unreachable source stops before any change', async () => {
  const { env, home, p, run } = setup();
  const g = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const origin = shelf('v1');
  g(['init', '-q'], origin);
  g(['add', '.'], origin);
  g(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1'], origin);

  env.LITMUSE_EXTENSIONS_REPO = join(home, 'no-such-repo');
  const mine = personal(home, '.config/muse/skills', 'lit-docx');
  const off = await run(['install', 'lit-docx'], { yes: true });
  assert.equal(off.code, 1);
  assert.match(off.text, /could not fetch .*--from/s);
  assert.ok(existsSync(join(mine, 'SKILL.md')) && !existsSync(p.backups), 'nothing moved');
  assert.ok(!existsSync(p.cache), 'no half clone left');

  env.LITMUSE_EXTENSIONS_REPO = `file://${origin}`;
  const dry = await run(['install', 'visual-qa']);
  assert.match(dry.text, /cloned into .*extensions-src \(on --yes\)/);
  assert.ok(!existsSync(p.cache), 'a dry run does not clone');
  const r = await run(['install', 'visual-qa'], { yes: true });
  assert.equal(r.code, 0, r.text);
  assert.ok(existsSync(join(p.cache, 'variants', 'litmuse', 'visual-qa', 'SKILL.md')));
  assert.ok(p.cache.startsWith(env.XDG_CACHE_HOME));

  writeEdition(origin, 'visual-qa', 'v2');
  g(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'v2'], origin);
  const u = await run(['update', 'visual-qa'], { yes: true });
  assert.equal(u.code, 0, u.text);
  assert.match(readFileSync(join(p.skills, 'visual-qa', 'SKILL.md'), 'utf8'), /edition v2/);
});

test('install and doctor point at the extensions verbs; the hook-side notice is the 0.1.12 text', async () => {
  const { env, home } = setup();
  personal(home, '.config/muse/skills', 'lit-docx');
  const out = collect();
  assert.equal(await install({ env, flags: { yes: true, approve: true }, interactive: false, print: out.print }), 0);
  assert.match(out.text(), /npx @litfamily\/litmuse extensions install <skill>` moves an old copy aside first/);
  assert.match(out.text(), /1 thing in your extension folders needs a look: run `npx @litfamily\/litmuse extensions check`/);
  const d = collect();
  await doctor({ env, flags: { offline: true }, print: d.print });
  assert.match(d.text(), /WARN extensions: 0 of 9 installed; 1 thing to look at; run npx @litfamily\/litmuse extensions check/);
  const help = spawnSync(process.execPath, [join(ROOT, 'bin', 'litmuse.mjs'), 'help'], { encoding: 'utf8' });
  assert.match(help.stdout, /extensions +list \| check \| install \| update \| remove \| prune-backups/);
  const hookLib = readFileSync(join(ROOT, 'plugin', 'hooks', 'lib', 'extensions.mjs'), 'utf8');
  assert.doesNotMatch(hookLib, /extensions (check|install)|move the old copy aside/, 'no hook text changed for this');
});

test('unknown ids and families are refused before anything runs', async () => {
  const { run } = setup();
  assert.equal((await run(['install', 'lit-plan'], { from: shelf() })).code, 2);
  assert.equal((await run(['install'], { family: 'nope', from: shelf() })).code, 2);
  const fam = await run(['install'], { family: 'figures', from: shelf('v1', ['lit-schematic', 'lit-diagram-drawer', 'lit-scientific-visualization']) });
  assert.equal(fam.code, 0);
  assert.equal(fam.text.match(/muse skills install/g).length, 3);
});


// Review fixes (2026-11-13).

test('a personal same-name skill with no extension installed is only listed, never a check finding', async () => {
  const { env, home, run } = setup();
  const mine = personal(home, '.claude/skills', 'lit-pptx');
  const c = await run(['check']);
  assert.equal(c.code, 0, c.text);
  assert.match(c.text, /nothing to fix/);
  assert.ok((await run(['list'])).text.includes(mine), 'list still names it');
  const d = collect();
  await doctor({ env, flags: { offline: true }, print: d.print });
  assert.match(d.text(), /INFO extensions: 0 of 9 installed, nothing to fix/);
});

test('a symlinked file in an edition is hashed by its content, as Muse records it', async () => {
  const { p, run, backups } = setup();
  const from = shelf();
  symlinkSync('notes.md', join(from, 'variants', 'litmuse', 'visual-qa', 'references', 'link.md'));
  assert.equal((await run(['install', 'visual-qa'], { from, yes: true })).code, 0);
  const u = await run(['update', 'visual-qa'], { from, yes: true });
  assert.match(u.text, /visual-qa: current/, u.text);
  assert.deepEqual(backups(), [], 'a symlink does not force a reinstall');
  symlinkSync('notes.md', join(from, 'variants', 'litmuse', 'visual-qa', 'references', 'later.md'));
  const dry = await run(['update', 'visual-qa'], { from });
  assert.match(dry.text, /visual-qa: move/, 'a symlink added later is a change');
  assert.ok(existsSync(join(p.skills, 'visual-qa', 'SKILL.md')));
});

test('a failed muse skills list stops every verb instead of hiding the same-name guard', async () => {
  const { env, home, run } = setup();
  personal(home, '.claude/skills', 'visual-qa');
  env.FAKE_MUSE_SKILL_LIST_FAIL = '1';
  const c = await run(['check']);
  assert.equal(c.code, 1);
  assert.match(c.text, /FAIL .*muse skills list/);
  const i = await run(['install', 'visual-qa'], { from: shelf(), yes: true });
  assert.equal(i.code, 1);
  assert.match(i.text, /FAIL .*muse skills list/);
});

test('dry runs say what they compared with: nothing before the first fetch, the cached copy after it', async () => {
  const { env, home, p, run } = setup();
  const g = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const origin = shelf('v1');
  g(['init', '-q'], origin);
  g(['add', '.'], origin);
  g(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'v1'], origin);
  await run(['install', 'visual-qa'], { from: shelf('v1'), yes: true });
  env.LITMUSE_EXTENSIONS_REPO = `file://${origin}`;
  const dry = await run(['install', 'visual-qa']);
  assert.equal(dry.code, 0);
  assert.doesNotMatch(dry.text, /visual-qa: move/, 'no move is promised before there is anything to compare');
  assert.match(dry.text, /visual-qa: compared after the source is fetched/);
  assert.ok(!existsSync(p.cache));
  assert.equal((await run(['update', 'visual-qa'], { yes: true })).code, 0);
  const cached = await run(['update', 'visual-qa']);
  assert.match(cached.text, /Compared with the cached copy; --yes fetches first, so the result may differ\./);
});

test('the same files from a new path are current; only the receipt source moves, atomically', async () => {
  const { p, run, lock, backups } = setup();
  const a = shelf();
  await run(['install', 'visual-qa'], { from: a, yes: true });
  const before = lock()['visual-qa'];
  const b = shelf();
  const dry = await run(['update', 'visual-qa'], { from: b });
  assert.match(dry.text, /visual-qa: current/);
  assert.equal(lock()['visual-qa'].source.path, before.source.path, 'a dry run rewrites nothing');
  const r = await run(['update', 'visual-qa'], { from: b, yes: true });
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /visual-qa: current/);
  assert.doesNotMatch(r.text, /Muse recorded each install/, 'nothing was installed, so no install receipt is claimed');
  const after = lock()['visual-qa'];
  assert.equal(after.source.path, join(b, 'variants', 'litmuse', 'visual-qa'));
  assert.equal(after.installed_at, before.installed_at);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(backups(), []);
  assert.deepEqual(readdirSync(join(p.skills, '.muse')), ['lock.json'], 'no temp file left');
});
