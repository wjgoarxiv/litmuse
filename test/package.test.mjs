import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

test('npm pack payload matches the pinned allow-list', () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path).sort();
  const pinned = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'pack-files.json'), 'utf8'));
  assert.deepEqual(files, pinned);
  for (const f of files) {
    assert.doesNotMatch(f, /^(test|scripts|\.litmuse|\.litclaude|evidence|plans)\//, f);
    assert.notEqual(f, 'AGENTS.md');
  }
});

test('READMEs: both languages, the packed motion cover with its reduced-motion still, hud preset linked', () => {
  const pinned = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'pack-files.json'), 'utf8'));
  for (const f of ['README.md', 'README_ko-KR.md']) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(text, /TODO\(cover\)/, `${f}: cover slot still open`);
    assert.match(text, /<source media="\(prefers-reduced-motion: reduce\)" srcset="\.\/docs\/assets\/cover-motion-still\.webp" \/><img src="\.\/docs\/assets\/cover-motion\.webp"/, `${f}: cover`);
    assert.match(text, /seven|일곱/, `${f}: seven-member family`);
    assert.match(text, /docs\/hud-preset\.md/, `${f}: hud preset link`);
    assert.match(text, /npx @litfamily\/litmuse install/, `${f}: install line`);
    assert.doesNotMatch(text, /\b\w+, not \w+/, `${f}: X, not Y pair`);
  }
  for (const asset of ['docs/assets/cover-motion.webp', 'docs/assets/cover-motion-still.webp']) {
    assert.ok(existsSync(join(ROOT, asset)), asset);
    assert.ok(pinned.includes(asset), `${asset} ships in the pack`);
  }
  assert.ok(existsSync(join(ROOT, 'AGENTS.md')));
  assert.ok(existsSync(join(ROOT, 'docs', 'hud-preset.md')));
});

test('.gitignore keeps local state out of the repo', () => {
  const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n');
  for (const entry of ['.litclaude/', '.litmuse/', '/HANDOFF.md', '.handoff/', 'evidence/', 'node_modules/', 'plans/']) {
    assert.ok(lines.includes(entry), entry);
  }
});

// A packed file that git ignores would be missing from a fresh clone (the handoff template once hit `HANDOFF.md`).
test('no file in the pack is ignored by git', () => {
  const pinned = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'pack-files.json'), 'utf8'));
  const r = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: ROOT, input: pinned.join('\n'), encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '', `ignored by git: ${r.stdout.trim()}`);
});
