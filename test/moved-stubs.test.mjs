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
const stubText = (id) => readFileSync(join(SKILLS, id, 'SKILL.md'), 'utf8');
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
    assert.match(text, /install line again with `--force`/, 'says how to take a newer edition');
    assert.doesNotMatch(text, /\/Users\/[a-z]|\/home\/[a-z]|\/private\/tmp/, 'no private path');
    assert.doesNotMatch(text, /muse skills install \S*\/(?:Users|home)\//, 'install line uses the placeholder only');
  });

  test(`${id}: the stub is a stub: SKILL.md alone, small, with no body instructions left`, () => {
    assert.deepEqual(readdirSync(join(SKILLS, id)), ['SKILL.md']);
    const text = stubText(id);
    assert.ok(Buffer.byteLength(text) < 9000, `${Buffer.byteLength(text)} B`);
    assert.doesNotMatch(text, /SKILL_ROOT|<skill-dir>|\.\.\/\.\.\/lib|scripts\/[a-z-]+\.(?:mjs|py|js)|runtime install/, 'no body paths or engine commands');
    assert.match(text, /build(?:s)? nothing|write(?:s)? no /i, 'says it builds nothing while the copy is missing');
  });
}

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
