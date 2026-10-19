import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './paths.mjs';

// Models and effort tiers come only from the catalog Muse caches from its provider, so a model
// the host adds tomorrow shows up here with no LitMuse release.
export function listModels(env = process.env) {
  const dir = paths(env).museCatalogDir;
  if (!existsSync(dir)) return [];
  const seen = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let catalog;
    try {
      catalog = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch {
      continue;
    }
    for (const row of Array.isArray(catalog.rows) ? catalog.rows : []) {
      if (row.visibility !== 'visible' || typeof row.model_id !== 'string' || seen.has(row.model_id)) continue;
      seen.set(row.model_id, {
        id: row.model_id,
        label: row.display_label || row.model_id,
        isDefault: Boolean(row.is_default),
        released: row.release_date ?? null,
        efforts: (row.reasoning_effort_variants ?? []).map((v) => v.tier).filter(Boolean),
      });
    }
  }
  return [...seen.values()];
}

export function suggestedEffort(model) {
  return model.efforts.includes('medium') ? 'medium' : model.efforts[0] ?? null;
}

export function models({ env = process.env, flags = {}, print = console.log }) {
  const list = listModels(env);
  if (flags.json) {
    print(JSON.stringify(list, null, 2));
    return list.length ? 0 : 1;
  }
  if (!list.length) {
    print(`No Muse model catalog found in ${paths(env).museCatalogDir}. Start Muse once (the TUI or \`muse exec\`) so it caches the catalog, then run this again.`);
    return 1;
  }
  print('Models your Muse install offers (from its own catalog):');
  for (const m of list) {
    print(`  ${m.id}${m.isDefault ? ' (default)' : ''}  efforts: ${m.efforts.join(', ') || 'host default'}`);
  }
  print('');
  print('Pick one per run:');
  for (const m of list) {
    const effort = suggestedEffort(m);
    print(`  muse --model ${m.id}${effort ? ` --reasoning-effort ${effort}` : ''}`);
  }
  return 0;
}
