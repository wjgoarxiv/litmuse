// Five content families (decks, documents, figures, design, video-covers) moved out of LitMuse into wjgoarxiv-skills,
// the one repository where a user picks only the skills they want. Each moved id keeps a same-name stub, so its route,
// its catalog entry, its doctor row and every lit keyword still land somewhere: the stub hands over to an installed
// copy or gives the one-skill `muse skills install` line, and builds nothing itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, sandbox, setMuseState, collect } from './helpers.mjs';
import { detectRoute, motionIntent, SKILL_ROUTES } from '../plugin/hooks/lib/routes.mjs';
import { DIGEST_EXTRAS, EXTRAS_BY_HOOK } from '../plugin/hooks/lib/digest.mjs';
import { readManifest, PLUGIN_DIR } from '../lib/bundle.mjs';
import { expectedSkillIds, doctor } from '../lib/doctor.mjs';
import { install } from '../lib/install.mjs';
import { uninstall } from '../lib/uninstall.mjs';
import { readLock } from '../scripts/sync-skills-lock.mjs';

const SKILLS = join(PLUGIN_DIR, 'skills');
const HOOKS = join(PLUGIN_DIR, 'hooks');
const PLACEHOLDER = '<path to your wjgoarxiv-skills clone>';

// id → [family, folder inside wjgoarxiv-skills that the one-skill install copies, id the installed copy answers to].
// The folder is the self-contained Muse edition (variants/litmuse/<id>), not the shared body under plugins/<family>/,
// which reaches family helpers outside the skill folder that a one-skill install does not carry.
const MOVED = {
  'lit-pptx': ['decks', 'variants/litmuse/lit-pptx', 'lit-pptx'],
  'lit-docx': ['documents', 'variants/litmuse/lit-docx', 'lit-docx'],
  'lit-diagram-drawer': ['figures', 'variants/litmuse/lit-diagram-drawer', 'lit-diagram-drawer'],
  'lit-schematic': ['figures', 'variants/litmuse/lit-schematic', 'lit-schematic'],
  'lit-scientific-visualization': ['figures', 'variants/litmuse/lit-scientific-visualization', 'lit-scientific-visualization'],
  'frontend-ui-ux': ['design', 'variants/litmuse/frontend-ui-ux', 'frontend-ui-ux'],
  'visual-qa': ['design', 'variants/litmuse/visual-qa', 'visual-qa'],
  'lit-typographic-motion': ['video-covers', 'variants/litmuse/lit-typographic-motion', 'lit-typographic-motion'],
  'readme-studio': ['video-covers', 'variants/litmuse/readme-studio', 'readme-studio'],
};
const installLine = (id) => `muse skills install ${PLACEHOLDER}/${MOVED[id][1]} --scope user`;
// The safe install lines, probed against Muse 1.4.15: `muse skills install` refuses an occupied folder (`skill already
// installed`, or `install would overwrite unmanaged files` when only the user's files are left), while `--force` and
// `muse skills update` rewrite the shipped files and keep every other one. So the stub looks first (reads only: Muse's
// user skills, the two foreign personal folders Muse loads, and the two project folders that outrank a user skill),
// moves an occupied folder whole into a dated folder beside Muse's skills that Muse does not scan, then installs.
const CONFIG = '${XDG_CONFIG_HOME:-$HOME/.config}/muse';
const preflightLine = (id) => `command ls -d "${CONFIG}/skills/${id}" "$HOME/.claude/skills/${id}" "$HOME/.codex/skills/${id}" .agents/skills/${id} .claude/skills/${id} 2>/dev/null`;
const moveAsideLine = (id) => `D="${CONFIG}/skills/${id}"; B="${CONFIG}/extension-backups/$(date +%Y%m%d-%H%M%S)"; [ -e "$D" ] && mkdir -p "$B" && mv "$D" "$B/" && echo "moved to $B/${id}"`;
const stubText = (id) => readFileSync(join(SKILLS, id, 'SKILL.md'), 'utf8');
const shells = ['bash', 'zsh'].filter((sh) => spawnSync(sh, ['-c', 'true']).status === 0);
const quiet = () => {};

const STATE_HOME = mkdtempSync(join(tmpdir(), 'litmuse-moved-state-'));
function hook(name, payload, extraEnv = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, `${name}.mjs`)], {
    input: JSON.stringify(payload), cwd: payload.cwd, encoding: 'utf8',
    env: { ...process.env, XDG_STATE_HOME: STATE_HOME, ...extraEnv },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const contextOf = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? '' : '');

for (const [id, [family, folder, installs]] of Object.entries(MOVED)) {
  test(`${id}: a same-name stub that names wjgoarxiv-skills, its folder and the one-skill install line`, () => {
    const text = stubText(id);
    assert.match(text, new RegExp(`^---\\nname: ${id}\\n`), 'frontmatter keeps the id');
    assert.match(text, /wjgoarxiv-skills/);
    assert.match(text, /^description: "[^"]*LitFamily extension/m, 'the catalog entry calls it a LitFamily extension');
    assert.match(text, new RegExp(`^# ${id} is now a LitFamily extension$`, 'm'), 'the heading calls it a LitFamily extension');
    assert.match(text, /extension shelf/, 'names wjgoarxiv-skills as the extension shelf');
    assert.ok(text.includes(`\`${family}\``), `names the ${family} family`);
    assert.ok(text.includes(`plugins/${family}/skills/${id}/`), 'names the folder the shared body lives in');
    assert.ok(text.includes(`\`${folder}/\``), 'names the Muse edition folder the install line copies');
    assert.doesNotMatch(text, /vendor\/scientific-visualization|until a Muse edition is published|written for the LitFamily host/, 'no stale caveat about the shared body');
    assert.ok(text.includes(installLine(id)), 'carries the Muse one-skill install line');
    assert.ok(text.includes(`read_skill id \`${installs}\``), 'hands over to the installed copy by its own id');
    assert.ok(text.includes(`muse skills uninstall ${installs}`), 'says how to take the copy out again');
    assert.ok(text.includes(`plugin:litmuse:${id}`) && text.includes(`$CONFIG_DIR/skills/${installs}/`), 'says the stub and the copy live in different scopes');
    assert.match(text, /INFO moved/, 'says how doctor reports the copy');
    assert.doesNotMatch(text, /\/Users\/[a-z]|\/home\/[a-z]|\/private\/tmp/, 'no private path');
    assert.doesNotMatch(text, /muse skills install \S*\/(?:Users|home)\//, 'install line uses the placeholder only');
  });

  test(`${id}: the stub looks first, moves an occupied folder aside whole, then installs; update and remove reuse them`, () => {
    const text = stubText(id);
    const look = text.indexOf(preflightLine(id));
    const move = text.indexOf(moveAsideLine(id));
    const put = text.indexOf(installLine(id));
    assert.ok(look > 0, 'carries the read-only look-first line');
    assert.ok(move > look, 'carries the move-aside line after it');
    assert.ok(put > move, 'and the install line last');
    assert.match(text, /^### Update$/m, 'an update section');
    assert.match(text, /^### Remove$/m, 'a remove section');
    const remove = text.slice(text.indexOf('### Remove'));
    assert.ok(remove.includes(`muse skills uninstall ${installs}`), 'remove ends with uninstall, which then only drops Muse\'s record');
    assert.match(remove, /step 2/, 'remove moves the folder aside first');
    assert.match(text, /lock\.json/, 'names Muse\'s own install record');
    assert.doesNotMatch(text, /muse skills install [^\n`]*--force|install line again with `--force`/, 'never installs with --force (it merges)');
    assert.doesNotMatch(text, /\brm -r/, 'never deletes a user folder');
    assert.doesNotMatch(moveAsideLine(id), /muse\/skills\/[^"]*extension-backups/, 'the backup sits outside the scanned skills folder');
  });

  test(`${id}: the stub is a stub: SKILL.md alone, small, with no body instructions left`, () => {
    assert.deepEqual(readdirSync(join(SKILLS, id)), ['SKILL.md']);
    const text = stubText(id);
    assert.ok(Buffer.byteLength(text) < 9000, `${Buffer.byteLength(text)} B`);
    assert.doesNotMatch(text, /SKILL_ROOT|<skill-dir>|\.\.\/\.\.\/lib|scripts\/[a-z-]+\.(?:mjs|py|js)|runtime install/, 'no body paths or engine commands');
    assert.match(text, /build(?:s)? nothing|write(?:s)? no /i, 'says it builds nothing while the copy is missing');
  });
}

test('the look-first and move-aside lines run as printed in bash and zsh: whole folder moved, user file kept, no nesting', { skip: shells.length === 0 }, () => {
  for (const sh of shells) {
    const home = mkdtempSync(join(tmpdir(), `litmuse-aside-${sh}-`));
    const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, '.config') };
    const ws = join(home, 'ws');
    mkdirSync(ws);
    const run = (line) => spawnSync(sh, ['-c', line], { cwd: ws, env, encoding: 'utf8' });
    const id = 'lit-pptx';
    const dest = join(home, '.config', 'muse', 'skills', id);
    assert.equal(run(preflightLine(id)).stdout, '', `${sh}: an empty home prints nothing`);
    assert.notEqual(run(moveAsideLine(id)).status, 0, `${sh}: nothing to move`);
    assert.equal(existsSync(join(home, '.config', 'muse', 'extension-backups')), false, `${sh}: no backup folder made for nothing`);

    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'SKILL.md'), '---\nname: lit-pptx\n---\nold\n');
    writeFileSync(join(dest, 'my-notes.md'), 'mine\n');
    mkdirSync(join(home, '.claude', 'skills', id), { recursive: true });
    const seen = run(preflightLine(id)).stdout.trim().split('\n');
    assert.deepEqual(seen.map((p) => p.replace(home, '~')).sort(), [`~/.claude/skills/${id}`, `~/.config/muse/skills/${id}`], `${sh}: lists every same-name folder`);

    const moved = run(moveAsideLine(id));
    assert.equal(moved.status, 0, moved.stderr);
    assert.equal(existsSync(dest), false, `${sh}: the skills folder is free for the install`);
    const backups = readdirSync(join(home, '.config', 'muse', 'extension-backups'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^\d{8}-\d{6}$/, 'a dated folder');
    const kept = join(home, '.config', 'muse', 'extension-backups', backups[0], id);
    assert.deepEqual(readdirSync(kept).sort(), ['SKILL.md', 'my-notes.md'], `${sh}: moved whole, nothing nested`);
    assert.equal(readFileSync(join(kept, 'my-notes.md'), 'utf8'), 'mine\n');
    assert.ok(moved.stdout.includes(kept), `${sh}: says where it went`);
  }
});

test('the README Extensions sections carry the same safe lines for any id', () => {
  for (const f of ['README.md', 'README_ko-KR.md']) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const line of [preflightLine('<skill>'), moveAsideLine('<skill>'), 'muse skills install <path to your wjgoarxiv-skills clone>/variants/litmuse/<skill> --scope user', 'muse skills uninstall <skill>']) {
      assert.ok(text.includes(line), `${f}: ${line}`);
    }
    assert.doesNotMatch(text, /install line again with `--force`|설치 줄을 `--force`/, `${f}: no --force advice`);
  }
});

test('the stubbed ids stay enrolled: manifest, route table, doctor listing and the lock policy', () => {
  const manifestIds = readManifest().capabilities.skills.map((s) => s.id);
  for (const id of Object.keys(MOVED)) {
    assert.ok(manifestIds.includes(id), `${id}: manifest`);
    assert.ok(SKILL_ROUTES.some((r) => r.id === id), `${id}: route table`);
    assert.ok(expectedSkillIds().includes(`plugin:litmuse:${id}`), `${id}: doctor listing`);
  }
  assert.deepEqual([...readLock().policy.movedStubs].sort(), Object.keys(MOVED).sort(), 'the lock names exactly the moved stubs');
  for (const id of Object.keys(MOVED)) {
    const b = readLock().budgets[id];
    assert.ok(b.maxSkillBytes <= 9000 && b.maxFiles === 1 && b.maxBytes <= 9000, `${id}: a stub budget, not a body budget`);
  }
});

test('lit routes still reach the stubs: decks, schematics, films and interfaces', () => {
  for (const p of ['lit 신규 서비스 투자 피칭 덱 10장, 네오 브루탈리즘 스타일로', 'lit a 10-slide launch deck in a neo-brutalist style']) {
    assert.equal(detectRoute(p)?.route, 'lit-pptx', p);
  }
  assert.notEqual(detectRoute('lit 사진 10장 보정 스타일로')?.route, 'lit-pptx');
  assert.equal(detectRoute('lit draw a P&ID of the column overhead')?.route, 'lit-schematic');
  assert.equal(detectRoute('lit draw an isometric cutaway of the autoclave')?.route, 'lit-schematic');
  assert.equal(detectRoute('lit schematic of the codebase')?.route, 'lit-loop');
  for (const p of ['lit 이 시 구절로 키네틱 타이포 영상 만들어줘', 'lit make a seamless cover loop for this repository', 'lit motion a README hero banner', 'lit-typographic-motion 봄 축제 오프닝']) {
    assert.equal(detectRoute(p)?.route, 'lit-typographic-motion', p);
  }
  for (const p of ['lit 이 영상 잘라서 자막 넣어줘', 'lit embed a background video in the landing page', 'lit 신입 교육용 슬라이드 덱 만들어줘']) {
    assert.notEqual(detectRoute(p)?.route, 'lit-typographic-motion', p);
  }
  assert.equal(motionIntent('a quick explainer video about tide pools, please make it'), true);
  assert.equal(detectRoute('lit build a pricing page with three plans')?.route, 'frontend-ui-ux');
  for (const id of ['lit-docx', 'lit-diagram-drawer', 'lit-scientific-visualization']) assert.equal(detectRoute(`${id} a quick request`)?.route, id);
});

test('activation on a moved route: not installed gives the install line and builds nothing; installed hands over', () => {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-moved-ws-'));
  const config = mkdtempSync(join(tmpdir(), 'litmuse-moved-config-'));
  const env = { XDG_CONFIG_HOME: config };
  const ask = (sid, prompt) => contextOf(hook('user-prompt-submit', { hook_event_name: 'UserPromptSubmit', prompt, session_id: sid, turn_id: 't1', cwd: ws }, env));

  const missing = ask('moved-1', 'lit-docx write a one-page memo about the office move');
  assert.match(missing, /LIT IGNITED · lit-docx/);
  assert.match(missing, /wjgoarxiv-skills/);
  assert.ok(missing.includes(installLine('lit-docx')), missing);
  assert.match(missing, /plugin:litmuse:lit-docx/, 'loads the stub');
  assert.match(missing, /build nothing/i);

  mkdirSync(join(config, 'muse', 'skills', 'lit-docx'), { recursive: true });
  writeFileSync(join(config, 'muse', 'skills', 'lit-docx', 'SKILL.md'), '---\nname: lit-docx\ndescription: "x"\n---\n');
  const installed = ask('moved-2', 'lit-docx write a one-page memo about the office move');
  assert.match(installed, /read_skill id `lit-docx`/, 'loads the installed copy by its own id');
  assert.ok(!installed.includes(installLine('lit-docx')), 'no install line once it is installed');

  // The figures plot skill installs as its Muse edition under the same id; the old source folder id no longer counts.
  const sciviz = ask('moved-3', 'lit-scientific-visualization plot the adsorption isotherm');
  assert.ok(sciviz.includes(installLine('lit-scientific-visualization')), sciviz);
  mkdirSync(join(config, 'muse', 'skills', 'scientific-visualization'), { recursive: true });
  writeFileSync(join(config, 'muse', 'skills', 'scientific-visualization', 'SKILL.md'), '---\nname: scientific-visualization\n---\n');
  assert.ok(ask('moved-4', 'lit-scientific-visualization plot the adsorption isotherm').includes(installLine('lit-scientific-visualization')), 'the old source id is not the Muse edition');
  mkdirSync(join(config, 'muse', 'skills', 'lit-scientific-visualization'), { recursive: true });
  writeFileSync(join(config, 'muse', 'skills', 'lit-scientific-visualization', 'SKILL.md'), '---\nname: lit-scientific-visualization\n---\n');
  assert.match(ask('moved-5', 'lit-scientific-visualization plot the adsorption isotherm'), /read_skill id `lit-scientific-visualization`/);
});

test('the session route table says which ids moved and where', () => {
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-moved-ss-'));
  const ctx = contextOf(hook('session-start', { hook_event_name: 'SessionStart', source: 'startup', session_id: 'moved-ss', cwd: ws }));
  assert.match(ctx, /wjgoarxiv-skills/);
  for (const id of Object.keys(MOVED)) assert.ok(ctx.includes(id), id);
});

test('the motion done gate left with the skill: a motion turn that rendered nothing ends without a hold', () => {
  assert.equal(existsSync(join(HOOKS, 'lib', 'motion.mjs')), false, 'hooks/lib/motion.mjs is gone');
  for (const f of ['stop.mjs', 'post-tool-use.mjs', 'user-prompt-submit.mjs']) {
    assert.doesNotMatch(readFileSync(join(HOOKS, f), 'utf8'), /motion\.mjs|evaluateMotionStop|recordMotionTool|armMotionTurn/, f);
  }
  assert.ok(DIGEST_EXTRAS.every((f) => !f.includes('lit-typographic-motion')), 'no motion engine in the hook digest');
  assert.equal(EXTRAS_BY_HOOK['stop.mjs'], undefined);
  const ws = mkdtempSync(join(tmpdir(), 'litmuse-moved-motion-'));
  const base = { session_id: 'moved-motion', cwd: ws };
  hook('user-prompt-submit', { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'lit motion a README cover loop for LOOPTEST', turn_id: 't1' });
  const stop = hook('stop', { ...base, hook_event_name: 'Stop', turn_id: 't1' });
  assert.equal(stop.code, 0);
  assert.doesNotMatch(stop.stdout, /"decision":\s*"block"|not done/, stop.stdout);
});

test('the engine runtimes left with the families: no office runtime, no engine module, no runtime command', () => {
  for (const f of ['office-runtime.mjs', 'office-runtime-lock', 'office_data.py', 'office_runtime_bootstrap.py', 'ooxml_integrity.py', 'pdf_fonts.py', 'render_pages.py', 'strict-json.mjs']) {
    assert.equal(existsSync(join(PLUGIN_DIR, 'lib', f)), false, `plugin/lib/${f}`);
  }
  const modules = readdirSync(SKILLS).flatMap((id) => (existsSync(join(SKILLS, id, 'scripts')) ? readdirSync(join(SKILLS, id, 'scripts')) : []).filter((f) => f.endsWith('-runtime.mjs')));
  assert.deepEqual(modules, []);
  assert.equal(existsSync(join(ROOT, 'lib', 'runtime.mjs')), false);
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'litmuse.mjs'), 'runtime', 'status'], { encoding: 'utf8', env: { ...process.env, ...sandbox().env } });
  assert.notEqual(r.status, 0, 'litmuse runtime is no longer a command');
  assert.doesNotMatch(readFileSync(join(ROOT, 'bin', 'litmuse.mjs'), 'utf8'), /runtime {2,}status/);
  assert.equal(readLock().policy.runtimes, undefined, 'no runtime list left in the lock policy');
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts['qa:cover-recipes'], undefined);
});

test('an installed Muse edition survives LitMuse install, reinstall and uninstall byte for byte', async () => {
  const { env } = sandbox();
  const copies = Object.values(MOVED).map(([, , installs]) => join(env.XDG_CONFIG_HOME, 'muse', 'skills', installs));
  for (const dir of copies) {
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${dir.split('/').pop()}\ndescription: "user copy"\n---\n`);
    writeFileSync(join(dir, 'lib', 'helper.mjs'), 'export const own = 1;\n');
  }
  const snapshot = () => copies.map((d) => [readFileSync(join(d, 'SKILL.md'), 'utf8'), readFileSync(join(d, 'lib', 'helper.mjs'), 'utf8')]);
  const before = snapshot();
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  assert.deepEqual(snapshot(), before, 'install and a second install (the upgrade path) leave the user copies alone');
  await uninstall({ env, flags: { yes: true }, interactive: false, print: quiet });
  assert.deepEqual(snapshot(), before, 'uninstall leaves the user copies alone');
});

test('doctor: no engine or office-tool rows, and an installed wjgoarxiv-skills copy is a handover, not an overlap', async () => {
  const { env } = sandbox();
  delete env.LITMUSE_SKIP_RUNTIMES;
  await install({ env, flags: { yes: true, approve: true }, interactive: false, print: quiet });
  setMuseState(env, {
    extraSkills: [
      { id: 'lit-docx', name: 'lit-docx', scope: 'user', activation: 'on', path: '$CONFIG_DIR/skills/lit-docx/SKILL.md', context_cost: { startup_bytes: 400 } },
      { id: 'lit-plan', name: 'lit-plan', scope: 'user', activation: 'on', path: '$CONFIG_DIR/skills/lit-plan/SKILL.md', context_cost: { startup_bytes: 400 } },
    ],
  });
  const out = collect();
  await doctor({ env, flags: { offline: true }, print: out.print });
  const text = out.text();
  assert.doesNotMatch(text, /engine (?:office|diagram|readme|sciviz|motion)|Poppler|LibreOffice|pandoc|xelatex|ffmpeg|libwebp/);
  assert.match(text, /runtime python3/, 'python3 stays for autoresearch');
  assert.doesNotMatch(text, /WARN overlap: personal skill lit-docx/);
  assert.match(text, /lit-docx.*wjgoarxiv-skills/);
  assert.match(text, /WARN overlap: personal skill lit-plan/, 'a core id still warns');
});
