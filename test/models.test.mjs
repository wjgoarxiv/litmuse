import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sandbox, collect } from './helpers.mjs';
import { listModels, models } from '../lib/models.mjs';

function seedCatalog(env, extraRows = []) {
  const dir = join(env.XDG_DATA_HOME, 'muse', 'model-catalog');
  mkdirSync(dir, { recursive: true });
  const base = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'model-catalog.json'), 'utf8'));
  base.rows.push(...extraRows);
  writeFileSync(join(dir, '6d657461__p746268.json'), JSON.stringify(base));
}

test('visible catalog rows are offered with their own effort tiers', () => {
  const { env } = sandbox();
  seedCatalog(env);
  const list = listModels(env);
  assert.deepEqual(list.map((m) => m.id), ['muse-spark-1.3', 'muse-spark-1.2']);
  assert.equal(list[0].isDefault, true);
  assert.deepEqual(list[1].efforts, ['minimal', 'low', 'medium', 'high', 'xhigh']);
});

test('a future model row is offered with no code change', () => {
  const { env } = sandbox();
  seedCatalog(env, [{
    model_id: 'muse-nova-2.0', display_label: 'Muse Nova 2.0', visibility: 'visible', is_current: true, is_default: false,
    release_date: '2027-01-01', reasoning_effort_variants: [{ tier: 'low' }, { tier: 'ultra' }],
  }]);
  const nova = listModels(env).find((m) => m.id === 'muse-nova-2.0');
  assert.ok(nova);
  assert.deepEqual(nova.efforts, ['low', 'ultra']);
  const out = collect();
  models({ env, flags: {}, print: out.print });
  assert.match(out.text(), /muse-nova-2\.0/);
  assert.match(out.text(), /--model muse-nova-2\.0 --reasoning-effort low/);
});

test('missing catalog explains how to fill it', () => {
  const { env } = sandbox();
  assert.deepEqual(listModels(env), []);
  const out = collect();
  const code = models({ env, flags: {}, print: out.print });
  assert.equal(code, 1);
  assert.match(out.text(), /model catalog/i);
});

test('the shipped code names no model id', () => {
  for (const f of ['lib/models.mjs', 'lib/install.mjs', 'lib/doctor.mjs', 'bin/litmuse.mjs']) {
    assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), /muse-spark|muse-image/, f);
  }
});
