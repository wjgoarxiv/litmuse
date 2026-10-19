#!/usr/bin/env node

// check-goal.mjs: validate a litgoal record and test its evidence on disk.
//
//   node check-goal.mjs <.litmuse/goals/slug.json> [--json] [--root <dir>]
//
// Node built-ins only; reads the record and stats evidence files, writes nothing.
// Evidence paths resolve against --root (default: the current directory).
// Exit 0 = record valid and every claimed pass is backed; 1 = findings; 2 = usage or unreadable record.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const CRITERION_STATUS = new Set(['open', 'pass', 'fail', 'blocked']);
const GOAL_STATUS = new Set(['active', 'review_blocked', 'needs_user_decision', 'blocked', 'done', 'dropped']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const attemptOf = (path) => Number(/-a(\d+)-/u.exec(basename(path))?.[1] ?? 1);
const kindOf = (path) => /-(red|green|surface|cleanup)(?=[.-]|$)/u.exec(basename(path))?.[1] ?? 'other';

export function checkGoal(record, root = process.cwd()) {
  const problems = [];
  const demotions = [];
  const rows = [];
  const bad = (message) => problems.push(message);

  if (!record || typeof record !== 'object') return { ok: false, problems: ['record is not an object'], rows, demotions };
  if (!SLUG.test(record.slug ?? '') || record.slug.length > 40) bad('slug must be lowercase kebab-case, at most 40 characters');
  if (typeof record.objective !== 'string' || !record.objective.trim()) bad('objective is empty');
  if (!GOAL_STATUS.has(record.status)) bad(`unknown goal status: ${record.status}`);
  if (!Array.isArray(record.criteria) || record.criteria.length === 0) bad('criteria must be a non-empty array');

  const seen = new Set();
  for (const c of Array.isArray(record.criteria) ? record.criteria : []) {
    if (!/^c\d+$/u.test(c?.id ?? '')) { bad(`bad criterion id: ${c?.id}`); continue; }
    if (seen.has(c.id)) bad(`duplicate criterion id: ${c.id}`);
    seen.add(c.id);
    if (typeof c.text !== 'string' || !c.text.trim()) bad(`${c.id}: text is empty`);
    if (!CRITERION_STATUS.has(c.status)) bad(`${c.id}: unknown status ${c.status}`);
    const attempt = Number.isInteger(c.attempt) && c.attempt > 0 ? c.attempt : 1;
    const evidence = Array.isArray(c.evidence) ? c.evidence : [];
    const files = evidence.filter((e) => typeof e === 'string' && !e.startsWith('ledger:'));
    const ledgerRefs = evidence.filter((e) => typeof e === 'string' && e.startsWith('ledger:'));
    const missing = files.filter((e) => !existsSync(resolve(root, e)));
    const current = files.filter((e) => attemptOf(e) === attempt && !missing.includes(e));
    const kinds = new Set(current.map(kindOf));
    const lastLine = (p) => readFileSync(resolve(root, p), 'utf8').trimEnd().split('\n').pop() ?? '';
    const cleaned = kinds.has('cleanup') || ledgerRefs.length > 0
      || current.some((p) => kindOf(p) === 'surface' && statSync(resolve(root, p)).isFile() && /^cleanup/iu.test(lastLine(p)));
    const gaps = [];
    if (missing.length) gaps.push(`missing files: ${missing.join(', ')}`);
    if (!kinds.has('green')) gaps.push('no current-attempt green evidence');
    if (!kinds.has('surface')) gaps.push('no current-attempt surface evidence');
    if (!cleaned) gaps.push('no cleanup receipt');
    if (c.status === 'pass' && gaps.length) demotions.push({ id: c.id, gaps });
    rows.push({ id: c.id, status: c.status, attempt, evidence: files.length + ledgerRefs.length, backed: gaps.length === 0, gaps });
  }

  const allPass = rows.length > 0 && rows.every((r) => r.status === 'pass' && r.backed);
  const open = (record.blockers ?? []).filter((b) => b && b.resolved !== true);
  if (record.status === 'done' && !allPass) bad('status is done but not every criterion is a backed pass');
  if (record.status === 'done' && open.length) bad('status is done with unresolved blockers');
  if (record.status === 'done' && record.verdict?.result !== 'met') bad('status is done but verdict.result is not "met"');
  if (record.verdict && !['met', 'not met'].includes(record.verdict.result)) bad(`unknown verdict.result: ${record.verdict.result}`);
  if (record.verdict?.result === 'not met' && !record.verdict.reason) bad('verdict "not met" needs a reason');
  if (open.some((b) => b.source === 'review') && record.status === 'active') bad('open review blocker: status should be review_blocked');

  return { ok: problems.length === 0 && demotions.length === 0, problems, demotions, rows, canClose: allPass && open.length === 0 && problems.length === 0 };
}

export function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const rootAt = argv.indexOf('--root');
  const root = rootAt >= 0 ? resolve(argv[rootAt + 1] ?? '.') : process.cwd();
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--root');
  if (files.length !== 1) {
    process.stderr.write('usage: check-goal.mjs <record.json> [--json] [--root <dir>]\n');
    return 2;
  }
  let record;
  try {
    record = JSON.parse(readFileSync(resolve(files[0]), 'utf8'));
  } catch (error) {
    process.stderr.write(`FAIL RECORD_UNREADABLE: ${error.message}\n`);
    return 2;
  }
  const result = checkGoal(record, root);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    const passed = result.rows.filter((r) => r.status === 'pass' && r.backed).length;
    process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${record.slug ?? files[0]} ${passed}/${result.rows.length} backed, canClose=${Boolean(result.canClose)}\n`);
    for (const r of result.rows) process.stdout.write(`  ${r.id} ${r.status} attempt=${r.attempt} evidence=${r.evidence}${r.gaps.length ? ` gaps: ${r.gaps.join('; ')}` : ''}\n`);
    for (const p of result.problems) process.stderr.write(`FAIL ${p}\n`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) process.exitCode = run();
