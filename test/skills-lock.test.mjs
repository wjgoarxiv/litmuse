// skills.lock.json replaces the hand-kept depth and pack pins. `npm run sync:lock` writes its generated half
// (per-skill hashes, sizes and file counts, and the pack list); `policy` and `budgets` are hand-owned and kept
// across syncs. One test says the lock is current, one says every skill sits inside its budget, and the rest pin
// how sync:lock treats budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { LOCK_PATH, buildLock, budgetViolations, measureSkills, packFiles, readLock, seedBudget } from '../scripts/sync-skills-lock.mjs';

const SKILLS = join(ROOT, 'plugin', 'skills');

test('skills.lock.json is current (run npm run sync:lock after a skill or pack change)', () => {
  const lock = readLock();
  const fresh = buildLock({ skillsDir: SKILLS, pack: packFiles(ROOT), previous: lock });
  const stale = Object.keys({ ...lock.skills, ...fresh.skills })
    .filter((id) => JSON.stringify(lock.skills[id]) !== JSON.stringify(fresh.skills[id]))
    .sort();
  const extra = fresh.pack.filter((f) => !lock.pack.includes(f));
  const missing = lock.pack.filter((f) => !fresh.pack.includes(f));
  assert.deepEqual({ stale, extra, missing }, { stale: [], extra: [], missing: [] }, 'skills.lock.json is stale: run npm run sync:lock');
  assert.deepEqual(fresh, lock);
});

test('every shipped skill stays inside its byte and file-count budget', () => {
  const lock = readLock();
  const measured = measureSkills(SKILLS);
  assert.deepEqual(Object.keys(lock.budgets).sort(), Object.keys(measured).sort(), 'one budget per shipped skill');
  assert.deepEqual(budgetViolations(measured, lock.budgets, lock.policy), []);
});

test('budget checks catch a placeholder SKILL.md, a trimmed skill and a bloated one', () => {
  const policy = { familyFloorBytes: 12000 };
  const budgets = { a: { minSkillBytes: 15000, maxSkillBytes: 30000, minFiles: 4, maxFiles: 10, maxBytes: 90000 } };
  const ok = { a: { skillMd: { bytes: 16000 }, files: 5, bytes: 40000 } };
  assert.deepEqual(budgetViolations(ok, budgets, policy), []);
  const placeholder = { a: { skillMd: { bytes: 300 }, files: 5, bytes: 24300 } };
  assert.equal(budgetViolations(placeholder, budgets, policy).length, 2, 'below its own floor and the family floor');
  assert.match(budgetViolations({ a: { skillMd: { bytes: 16000 }, files: 2, bytes: 30000 } }, budgets, policy)[0], /a: 2 files < budget 4/);
  const bloated = budgetViolations({ a: { skillMd: { bytes: 31000 }, files: 11, bytes: 99000 } }, budgets, policy);
  assert.equal(bloated.length, 3, bloated.join('\n'));
});

test('sync:lock keeps hand-owned budgets and seeds or drops one only when told to', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-lock-'));
  try {
    for (const [id, size] of [['kept', 14000], ['fresh', 20123]]) {
      mkdirSync(join(dir, id, 'references'), { recursive: true });
      writeFileSync(join(dir, id, 'SKILL.md'), 'x'.repeat(size));
      writeFileSync(join(dir, id, 'references', 'r.md'), 'ref');
    }
    const previous = {
      policy: { familyFloorBytes: 12000, runtimes: [] },
      budgets: {
        kept: { minSkillBytes: 13000, maxSkillBytes: 99000, minFiles: 2, maxFiles: 9, maxBytes: 99000 },
        gone: { minSkillBytes: 1, maxSkillBytes: 2, minFiles: 1, maxFiles: 2, maxBytes: 2 },
      },
    };
    const plain = buildLock({ skillsDir: dir, pack: [], previous });
    assert.deepEqual(plain.budgets.gone, previous.budgets.gone, 'a removed skill keeps its budget without --drop');
    assert.equal(plain.budgets.fresh, undefined, 'a new skill gets no budget without --accept-new');
    assert.deepEqual(budgetViolations(plain.skills, plain.budgets, plain.policy), [
      'fresh: new skill without a budget (sync:lock --accept-new fresh)',
      'gone: budget for a missing skill (sync:lock --drop gone)',
    ]);
    const lock = buildLock({ skillsDir: dir, pack: ['b', 'a'], previous, acceptNew: ['fresh'], drop: ['gone'] });
    assert.deepEqual(lock.policy, previous.policy, 'policy is kept as written');
    assert.deepEqual(lock.budgets.kept, previous.budgets.kept, 'an existing budget is never rewritten');
    assert.equal(lock.budgets.gone, undefined, '--drop removes the orphan budget');
    assert.deepEqual(lock.budgets.fresh, seedBudget(lock.skills.fresh, previous.policy));
    assert.deepEqual(lock.budgets.fresh, { minSkillBytes: 20100, maxSkillBytes: 31000, minFiles: 2, maxFiles: 3, maxBytes: 31000 });
    assert.deepEqual(budgetViolations(lock.skills, lock.budgets, lock.policy), []);
    assert.deepEqual(lock.pack, ['a', 'b'], 'pack list is sorted');
    assert.equal(lock.skills.kept.files, 2);
    assert.match(lock.skills.kept.sha256, /^[0-9a-f]{64}$/);
    assert.equal(lock.skills.kept.skillMd.bytes, 14000);
    const again = buildLock({ skillsDir: dir, pack: ['a', 'b'], previous: lock });
    assert.deepEqual(again, lock, 'deterministic');
    assert.throws(() => buildLock({ skillsDir: dir, pack: [], previous: lock, acceptNew: ['kept'] }), /--accept-new kept: not a new skill/);
    assert.throws(() => buildLock({ skillsDir: dir, pack: [], previous: lock, drop: ['kept'] }), /--drop kept: not a missing skill/);
    writeFileSync(join(dir, 'kept', 'references', 'r.md'), 'ref2');
    assert.notEqual(buildLock({ skillsDir: dir, pack: [], previous: lock }).skills.kept.sha256, lock.skills.kept.sha256, 'a resource edit changes the skill hash');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync:lock cannot lower a floor by removing a skill, resyncing and re-adding it smaller', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-lock-readd-'));
  const skills = join(dir, 'skills');
  const lockFile = join(dir, 'lock.json');
  const sync = (...extra) =>
    spawnSync(process.execPath, [join(ROOT, 'scripts', 'sync-skills-lock.mjs'), '--skills', skills, '--lock', lockFile, '--no-pack', ...extra], { encoding: 'utf8' });
  const addSkill = (size) => {
    mkdirSync(join(skills, 'lit-plan'), { recursive: true });
    writeFileSync(join(skills, 'lit-plan', 'SKILL.md'), 'x'.repeat(size));
  };
  try {
    addSkill(36000);
    const budget = { minSkillBytes: 35900, maxSkillBytes: 54000, minFiles: 1, maxFiles: 2, maxBytes: 54000 };
    writeFileSync(lockFile, JSON.stringify({ policy: { familyFloorBytes: 12000 }, budgets: { 'lit-plan': budget }, skills: {}, pack: [] }));
    let r = sync();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const current = readFileSync(lockFile, 'utf8');

    rmSync(join(skills, 'lit-plan'), { recursive: true });
    r = sync();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /lit-plan: budget for a missing skill \(sync:lock --drop lit-plan\)/);
    assert.equal(readFileSync(lockFile, 'utf8'), current, 'an orphan budget is not dropped silently');

    addSkill(13100);
    r = sync();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /lit-plan: SKILL\.md 13100 B < budget 35900 B/);
    assert.equal(readFileSync(lockFile, 'utf8'), current, 'the re-added smaller skill meets the old floor');

    rmSync(join(skills, 'lit-plan'), { recursive: true });
    r = sync('--drop', 'lit-plan');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /dropped budget: lit-plan/);
    assert.equal(readLock(lockFile).budgets['lit-plan'], undefined);
    const dropped = readFileSync(lockFile, 'utf8');

    addSkill(13100);
    r = sync();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /lit-plan: new skill without a budget \(sync:lock --accept-new lit-plan\)/);
    assert.equal(readFileSync(lockFile, 'utf8'), dropped, 'a new skill is not seeded silently');

    r = sync('--accept-new', 'lit-plan');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /seeded budget: lit-plan \(SKILL\.md 13100-20000 B/);
    assert.equal(readLock(lockFile).budgets['lit-plan'].minSkillBytes, 13100);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the lock measures only git-tracked skill files: a stray .DS_Store does not change it', () => {
  const lock = readLock();
  const id = Object.keys(lock.skills).sort()[0];
  const stray = join(SKILLS, id, '.DS_Store');
  assert.ok(!existsSync(stray), `${stray} already exists`);
  try {
    writeFileSync(stray, 'stray finder metadata');
    assert.deepEqual(measureSkills(SKILLS)[id], lock.skills[id]);
  } finally {
    rmSync(stray, { force: true });
  }
});

test('sync:lock refuses to write while a skill breaks its budget, and the npm script is wired', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:lock'], 'node scripts/sync-skills-lock.mjs');
  assert.equal(pkg.scripts['sync:digests'], 'node scripts/sync-hook-digests.mjs', 'sync:digests unchanged');
  assert.ok(existsSync(LOCK_PATH));
  for (const gone of ['skill-depth.json', 'pack-files.json']) {
    assert.ok(!existsSync(join(ROOT, 'test', 'fixtures', gone)), `${gone} is replaced by skills.lock.json`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-lock-cli-'));
  try {
    mkdirSync(join(dir, 'tiny'));
    writeFileSync(join(dir, 'tiny', 'SKILL.md'), 'placeholder');
    const lockFile = join(dir, 'lock.json');
    const before = JSON.stringify({ policy: { familyFloorBytes: 12000, runtimes: [] }, budgets: { tiny: { minSkillBytes: 13000, maxSkillBytes: 20000, minFiles: 1, maxFiles: 2, maxBytes: 20000 } }, skills: {}, pack: [] });
    writeFileSync(lockFile, before);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'sync-skills-lock.mjs'), '--skills', dir, '--lock', lockFile, '--no-pack'], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /tiny: SKILL\.md 11 B < budget 13000 B/);
    assert.equal(readFileSync(lockFile, 'utf8'), before, 'nothing written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
