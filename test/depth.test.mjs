import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, relative, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { PLUGIN_DIR } from '../lib/bundle.mjs';
import { runtimeModules, callRuntime } from '../lib/runtime.mjs';

const SKILLS = join(PLUGIN_DIR, 'skills');
const skillIds = readdirSync(SKILLS).filter((d) => statSync(join(SKILLS, d)).isDirectory()).sort();
// Closure, vocabulary and runtime lists live in the hand-owned policy of skills.lock.json; sizes and file counts are
// budgeted there too and checked by test/skills-lock.test.mjs.
const DEPTH = JSON.parse(readFileSync(new URL('../skills.lock.json', import.meta.url), 'utf8')).policy;

function walk(dir, acc = []) {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const TEXT = new Set(['.md', '.mjs', '.js', '.cjs', '.ts', '.py', '.json', '.yaml', '.yml', '.txt', '.html', '.css', '.svg', '.sh', '.toml', '.lock', '']);
const isText = (f) => TEXT.has(extname(f).toLowerCase()) && statSync(f).size < 4 * 1024 * 1024;
// Verbatim third-party legal text may name other tools; everything else in the bundle may not.
const LEGAL = /(^|\/)(LICENSE|NOTICE|ATTRIBUTION|THIRD[-_]PARTY|PROVENANCE|SOURCE-MANIFEST)[^/]*$|\/legal\//i;
const SIBLING = [/lit-?claude/i, /lit-?hermes/i, /lit-?codex/i, /lit-?opencode/i, /lit-?grok/i, /CLAUDE_PLUGIN_ROOT/, /\.claude-plugin/, /\/litclaude:/, /\bSkill\(/, /\bTodoWrite\b/, /lazy-?codex/i];
const HOSTS = [/Claude Code/, /\bCodex\b/, /\bOpenCode\b/, /\bGrok\b/, /\bHermes\b/];

const REF = /(?:^|[\s`'"(\[])((?:\.\.\/\.\.\/lib|references|scripts|templates|assets|specs|schemas|examples|fonts|data|modes|engine|bench|rules|vendor)\/[A-Za-z0-9_./-]*[A-Za-z0-9_])/g;

test('reference closure: every relative resource path a skill document names exists', () => {
  const missing = [];
  for (const id of skillIds) {
    const root = join(SKILLS, id);
    for (const f of walk(root).filter((p) => p.endsWith('.md') && !LEGAL.test(p))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(REF)) {
        const ref = m[1].replace(/[.]+$/, '');
        const next = text[m.index + m[0].length] ?? '';
        // Only file paths are checked: wildcard stems (`type-*.md`), placeholders and prose lists like `fonts/colors` are not.
        if (/[*<{$]/.test(next) || !/\.[A-Za-z0-9]{1,5}$/.test(ref)) continue;
        if (DEPTH.illustrativeRefs.includes(ref) || DEPTH.closureExempt.some((p) => relative(PLUGIN_DIR, f).startsWith(p))) continue;
        const candidates = [join(root, ref), join(dirname(f), ref), join(root, '..', '..', ref.replace(/^\.\.\/\.\.\//, ''))];
        if (!candidates.some((c) => existsSync(c))) missing.push(`${relative(PLUGIN_DIR, f)} → ${ref}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('no sibling product or host vocabulary anywhere in the bundle (legal files excepted)', () => {
  const hits = [];
  for (const f of walk(PLUGIN_DIR).filter(isText)) {
    const rel = relative(PLUGIN_DIR, f);
    if (LEGAL.test(rel)) continue;
    const text = readFileSync(f, 'utf8');
    for (const re of SIBLING) if (re.test(text)) hits.push(`${rel}: ${re}`);
    if (DEPTH.hostNameExempt.some((p) => rel.startsWith(p))) continue;
    for (const re of HOSTS) if (re.test(text)) hits.push(`${rel}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('the legal files name no sibling product either: attribution credits upstream sources only', () => {
  const hits = [];
  for (const f of walk(PLUGIN_DIR).filter(isText)) {
    const rel = relative(PLUGIN_DIR, f);
    if (!LEGAL.test(rel)) continue;
    const text = readFileSync(f, 'utf8');
    for (const re of SIBLING) if (re.test(text)) hits.push(`${rel}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('runtime modules answer status --json inside a sandbox and cache under the LitMuse data dir', () => {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-rt-'));
  const env = { PATH: process.env.PATH, HOME: home, XDG_DATA_HOME: join(home, 'data') };
  const mods = runtimeModules();
  assert.deepEqual(mods.map((m) => m.name), DEPTH.runtimes, 'shipped runtime modules');
  for (const m of mods) {
    const r = callRuntime(m, 'status', env);
    assert.equal(r.error, undefined, `${m.name}: ${r.error}`);
    assert.equal(typeof r.ready, 'boolean', `${m.name}: ready flag`);
    assert.ok(Array.isArray(r.missing), `${m.name}: missing list`);
    assert.ok(String(r.cache).startsWith(join(home, 'data', 'litmuse', 'runtime')), `${m.name}: cache ${r.cache}`);
    assert.equal(basename(dirname(m.file)) === 'lib' || basename(dirname(m.file)) === 'scripts', true);
  }
});

// M8 D2: lit-brainstorm hands off to deep-interview through one packet shape; both skills must agree on its headings.
test('the brainstorm hand-off template matches the headings deep-interview accepts', () => {
  const heads = (text) => text.split('\n').filter((l) => /^##? /.test(l)).map((l) => l.trim());
  const packet = heads(readFileSync(join(SKILLS, 'lit-brainstorm', 'templates', 'handoff-packet.md'), 'utf8'));
  const interview = readFileSync(join(SKILLS, 'deep-interview', 'SKILL.md'), 'utf8');
  const block = /### Hand-in from lit-brainstorm[\s\S]*?```markdown\n([\s\S]*?)```/.exec(interview)?.[1] ?? '';
  assert.ok(packet.length >= 5, 'packet has its sections');
  assert.deepEqual(packet, heads(block));
  assert.match(readFileSync(join(SKILLS, 'lit-brainstorm', 'SKILL.md'), 'utf8'), /\.litmuse\/brainstorm\/<slug>-handoff\.md/);
});
