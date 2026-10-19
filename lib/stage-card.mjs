import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { latestFile, readStage, stageFile, workspaceHash } from '../plugin/hooks/lib/stage.mjs';

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Plan rows are `- [ ] N. text` / `- [x] N. text`, read live from the plan file.
export function planProgress(cwd, planFile) {
  try {
    let file = planFile;
    if (!file) {
      const dir = join(cwd, 'plans');
      if (!existsSync(dir)) return null;
      let best = null;
      for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        const m = statSync(join(dir, name)).mtimeMs;
        if (/^- \[[ xX]\] \d+\./m.test(readFileSync(join(dir, name), 'utf8')) && (!best || m > best.m)) best = { name, m };
      }
      if (!best) return null;
      file = `plans/${best.name}`;
    }
    const rows = [...readFileSync(join(cwd, file), 'utf8').matchAll(/^- \[([ xX])\] (\d+)\.\s*(.*)$/gm)];
    if (!rows.length) return null;
    const open = rows.find((r) => r[1] === ' ');
    return {
      file, total: rows.length, done: rows.filter((r) => r[1] !== ' ').length,
      next: open ? { row: Number(open[2]), text: open[3].slice(0, 120) } : null,
    };
  } catch {
    return null;
  }
}

export function activeGoal(cwd) {
  try {
    const dir = join(cwd, '.litmuse', 'goals');
    let best = null;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const g = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        const m = statSync(join(dir, name)).mtimeMs;
        if (g && g.status === 'active' && (!best || m > best.m)) best = { g, m };
      } catch { /* skip unreadable goal */ }
    }
    if (!best) return null;
    const criteria = Array.isArray(best.g.criteria) ? best.g.criteria : [];
    return {
      slug: best.g.slug ?? null, objective: String(best.g.objective ?? '').slice(0, 200),
      met: criteria.filter((c) => c.status === 'pass').length, total: criteria.length,
      open: criteria.filter((c) => c.status !== 'pass').map((c) => ({ id: c.id, text: String(c.text ?? '').slice(0, 120) })),
    };
  } catch {
    return null;
  }
}

export function loadStage({ cwd, session, env = process.env }) {
  if (session) return readStage(stageFile(cwd, session, env));
  const ptr = readStage(latestFile(env));
  const entry = ptr && ptr[workspaceHash(cwd)];
  return entry && entry.session ? readStage(stageFile(cwd, entry.session, env)) : null;
}

export function buildCard({ cwd, session, env = process.env, now = Date.now() }) {
  const rec = loadStage({ cwd, session, env });
  const goal = activeGoal(cwd);
  if (!rec) return { active: false, route: null, goal, plan: planProgress(cwd, null), lanes: [], now };
  const lanes = (rec.lanes ?? []).map((l) => ({
    id: l.id, type: l.type, status: l.status,
    elapsedMs: (l.endedAt ?? now) - l.startedAt,
  }));
  return {
    active: Boolean(rec.route), route: rec.route ?? null, keyword: rec.keyword ?? null, kind: rec.kind ?? null,
    session: rec.session ?? null, activeMs: rec.route && rec.activatedAt ? now - rec.activatedAt : null,
    plan: planProgress(cwd, rec.plan ?? null), lanes, goal, updated: rec.updated ?? null, now,
  };
}

export function renderCard(card) {
  const out = [];
  out.push(card.active
    ? `LIT · ${card.route}${card.activeMs !== null ? ` · active ${fmtDuration(card.activeMs)}` : ''}${card.kind && card.kind !== 'ignite' ? ` (${card.kind})` : ''}`
    : 'LIT · no active route in this workspace');
  if (card.plan) {
    out.push(`plan ${card.plan.done}/${card.plan.total} · ${card.plan.file}${card.plan.next ? ` · next ${card.plan.next.row}. ${card.plan.next.text}` : ' · all rows ticked'}`);
  }
  const running = card.lanes.filter((l) => l.status === 'running');
  const finished = card.lanes.filter((l) => l.status !== 'running');
  if (running.length) out.push(`lanes running: ${running.map((l) => `${l.type} ${fmtDuration(l.elapsedMs)}`).join(', ')}`);
  if (finished.length) out.push(`lanes finished: ${finished.map((l) => `${l.type} ${l.status} ${fmtDuration(l.elapsedMs)}`).join(', ')}`);
  if (card.goal) {
    out.push(`goal: ${card.goal.objective} (${card.goal.met}/${card.goal.total} criteria met)`);
    for (const c of card.goal.open.slice(0, 5)) out.push(`  open ${c.id}: ${c.text}`);
  }
  return out.join('\n');
}
