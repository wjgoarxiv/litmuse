import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sandbox } from './helpers.mjs';
import { readManifest, PLUGIN_DIR, parseFrontmatter, stageBundle } from '../lib/bundle.mjs';
import { SKILL_ROUTES } from '../plugin/hooks/lib/routes.mjs';
import { expectedSkillIds } from '../lib/doctor.mjs';
import { paths } from '../lib/paths.mjs';

const manifest = readManifest();
const skillDirs = readdirSync(join(PLUGIN_DIR, 'skills')).filter((d) => statSync(join(PLUGIN_DIR, 'skills', d)).isDirectory()).sort();
const skills = manifest.capabilities.skills;
const REQUIRED_SECTIONS = ['## When this applies', '## Inputs and state', '## Procedure', '## Muse tools and approvals', '## Evidence', '## Stop and report', '## Pitfalls'];
const FORBIDDEN = [/Claude Code/, /LitClaude/i, /\/litclaude:/, /TodoWrite/, /Skill\(/, /CLAUDE_PLUGIN_ROOT/, /\bCodex\b/, /OpenCode/, /\bGrok\b/, /\bHermes\b/];
// Measured on a Mac with ~70 personal skills: compacted entries still cost their id and path, so at 155 B
// average Muse ran out of budget mid-way through LitMuse; at ≤ 110 B all 31 descriptions fit.
const DESCRIPTION_MAX = 120;
const DESCRIPTION_TOTAL_MAX = 30000;
const CATALOG_CAP = 32 * 1024;

test('manifest: native shape, plugin id and 39 skills', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.name, 'litmuse');
  assert.equal(manifest.compat.manifestDir, '.muse-plugin');
  assert.equal(skills.length, 39);
  for (const key of ['tools', 'agents', 'outputStyles', 'settings', 'apps']) assert.equal(key in manifest.capabilities, false, key);
});

test('every skill is enrolled on all four surfaces: manifest, route table, staged copy, doctor listing', () => {
  const manifestIds = skills.map((s) => s.id).sort();
  assert.deepEqual(manifestIds, skillDirs, 'manifest ↔ plugin/skills directories');
  assert.deepEqual(SKILL_ROUTES.map((r) => r.id).sort(), skillDirs, 'route table');
  assert.deepEqual([...expectedSkillIds()].sort(), skillDirs.map((d) => `plugin:litmuse:${d}`), 'doctor listing');
  const { env } = sandbox();
  stageBundle(paths(env));
  for (const id of skillDirs) {
    assert.ok(existsSync(join(paths(env).stage, 'skills', id, 'SKILL.md')), `staged copy of ${id}`);
  }
  for (const s of skills) assert.equal(s.path, `skills/${s.id}/SKILL.md`);
});

test('skill frontmatter, sections, density and clean-room vocabulary', () => {
  for (const id of skillDirs) {
    const text = readFileSync(join(PLUGIN_DIR, 'skills', id, 'SKILL.md'), 'utf8');
    const fm = parseFrontmatter(text);
    assert.equal(fm.name, id, `${id}: name`);
    assert.ok(fm.description, `${id}: description`);
    let at = -1;
    for (const h of REQUIRED_SECTIONS) {
      const i = text.indexOf(`\n${h}\n`);
      assert.ok(i > at, `${id}: ${h} present and in order`);
      at = i;
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 650, `${id}: ${words} words is below the density floor`);
    assert.ok(Buffer.byteLength(text) < 256 * 1024, `${id}: body under the host's 256 KiB limit`);
    for (const re of FORBIDDEN) assert.doesNotMatch(text, re, `${id}: ${re}`);
  }
});

test('catalog budget: every description short enough to stay uncompacted', () => {
  let total = 0;
  for (const id of skillDirs) {
    const { description } = parseFrontmatter(readFileSync(join(PLUGIN_DIR, 'skills', id, 'SKILL.md'), 'utf8'));
    const bytes = Buffer.byteLength(description);
    assert.ok(bytes <= DESCRIPTION_MAX, `${id}: ${bytes} B > ${DESCRIPTION_MAX} B`);
    total += bytes;
  }
  assert.ok(total <= DESCRIPTION_TOTAL_MAX, `descriptions ${total} B`);
  const entryOverhead = 110;
  assert.ok(total + skillDirs.length * entryOverhead < CATALOG_CAP / 2, 'LitMuse keeps under half of the 32 KB catalog');
});

test('agents: 11 definitions; read-only ones use a tools allowlist', () => {
  const dir = join(PLUGIN_DIR, 'agents');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  assert.equal(files.length, 11);
  const readOnly = ['lit-verifier', 'quality-reviewer', 'korean-style-analyzer', 'korean-prose-editor', 'meaning-preservation-auditor', 'native-flow-reviewer', 'polish-orchestrator'];
  for (const f of files) {
    const name = f.slice(0, -3);
    const text = readFileSync(join(dir, f), 'utf8');
    const fm = parseFrontmatter(text);
    assert.equal(fm.name, name);
    assert.ok(Buffer.byteLength(fm.description) <= 160, name);
    if (readOnly.includes(name)) assert.equal(fm.tools, 'read_file, search', name);
    if (name === 'lit-planner' || name === 'librarian-researcher') assert.match(fm.tools, /^read_file, search\b/);
    for (const re of FORBIDDEN) assert.doesNotMatch(text, re, `${name}: ${re}`);
  }
});

test('hooks: one source file per hook id, all present', () => {
  const sources = manifest.capabilities.hooks.map((h) => h.command[1]);
  assert.equal(new Set(sources).size, sources.length);
  for (const h of manifest.capabilities.hooks) {
    assert.deepEqual(h.command[0], 'node');
    assert.ok(existsSync(join(PLUGIN_DIR, h.command[1])), h.id);
  }
});

test('commands: every manifest command exists and takes $ARGUMENTS', () => {
  for (const c of manifest.capabilities.commands) {
    const text = readFileSync(join(PLUGIN_DIR, c.path), 'utf8');
    assert.ok(parseFrontmatter(text).description, c.id);
    assert.match(text, /\$ARGUMENTS/, c.id);
    assert.equal(skills.some((s) => s.id === c.id), false, `${c.id} does not shadow a skill`);
  }
});

test('version lockstep: package.json, plugin.json and CHANGELOG agree', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.match(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')}\\b`, 'm'));
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'LitMuse contributors');
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'dependency-free runtime');
});

// Review M6: read-only agents use an allowlist; denylists name every write-capable tool Muse 1.4.10 has.
test('agent tool policies cover every write-capable tool', () => {
  const fm = (n) => parseFrontmatter(readFileSync(join(PLUGIN_DIR, 'agents', `${n}.md`), 'utf8'));
  assert.equal(fm('lit-planner').tools, 'read_file, search');
  assert.equal(fm('lit-planner').disallowedTools, undefined);
  assert.equal(fm('librarian-researcher').tools, 'read_file, search, web_search, web_fetch');
  for (const tool of ['write_file', 'edit_file', 'apply_patch', 'delete_file']) assert.match(fm('qa-runner').disallowedTools, new RegExp(`\\b${tool}\\b`));
});

// Review L4: /lit names every keyword the prompt hook understands.
test('the /lit command lists every keyword route', async () => {
  const { KEYWORD_ROUTES } = await import('../plugin/hooks/lib/routes.mjs');
  const text = readFileSync(join(PLUGIN_DIR, 'commands', 'lit.md'), 'utf8');
  for (const [word, route] of Object.entries(KEYWORD_ROUTES)) assert.match(text, new RegExp(`${word} → ${route}`), word);
});

// Review L3: shipped placeholders are tracked as publish blockers.
test('RELEASE_CHECKLIST lists the open publish blockers', () => {
  const text = readFileSync(join(ROOT, 'RELEASE_CHECKLIST.md'), 'utf8');
  assert.match(text, /TODO\(cover\)/);
  assert.match(text, /brand terms/i);
});


// Round 2, R2-M2: the token guard lives in the umbrella decode-aware scan, and the checklist requires it.
test('RELEASE_CHECKLIST requires the umbrella decode-aware leak scan before any publish', () => {
  const text = readFileSync(join(ROOT, 'RELEASE_CHECKLIST.md'), 'utf8');
  assert.match(text, /zsh \.\.\/plans\/tools\/leak-scan\.sh .*every tracked/);
  assert.match(text, /decode-aware/);
  assert.match(text, /before any publish/i);
});

test('docs list the lit-plan tool allowlist', async () => {
  const { LIT_PLAN_READ_ONLY_TOOLS } = await import('../plugin/hooks/lib/policy.mjs');
  const text = readFileSync(join(ROOT, 'README.md'), 'utf8');
  for (const tool of LIT_PLAN_READ_ONLY_TOOLS) assert.match(text, new RegExp(`\`${tool}\``), tool);
});
