#!/usr/bin/env node

// check-plan.mjs: structural checker for plans/<slug>.md, as read by start-work and the resume logic.
//
//   node check-plan.mjs --check <plan.md>      handoff check: structure complete, rows may be unchecked
//   node check-plan.mjs --complete <plan.md>   post-execution audit: structure complete and every row ticked
//   node check-plan.mjs --skeleton <slug>      print templates/plan.md for <slug> on stdout (writes nothing)
//
// Node built-ins only. Reads one file, refuses symlinks and files over 256 KiB, writes only to stdout/stderr.
// Exit 0 = pass, 1 = findings, 2 = usage. A planning turn cannot run this (the route policy refuses node);
// start-work, a terminal and the test suite do.

import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const IMPLEMENTATION_ROW = /^- \[[ xX]\] (\d+)\. .+$/u;
export const FINAL_VERIFIER_ROW = /^- \[[ xX]\] F(\d+)\. .+$/u;
const INDENTED_ROW = /^[ \t]+- \[[ xX]\] (?:\d+|F\d+)\. /u;
const MAX_PLAN_BYTES = 256 * 1024;

export const SECTION_HEADERS = [
  '## TL;DR (for humans)',
  '## Scope',
  '## Bootstrap',
  '## Verification strategy',
  '## Execution strategy',
  '## Todos',
  '## Final verification wave',
  '## Commit strategy',
  '## Success criteria',
  '## DoneClaim',
];

export const ROW_LABELS = ['What to do', 'Files', 'References', 'Tests', 'Acceptance', 'QA scenario', 'Depends on', 'Commit'];
export const STATUSES = ['approved', 'awaiting approval', 'assumptions unconfirmed'];

export function visibleLines(text) {
  const out = [];
  let fence = null;
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!fence && m) {
      fence = { marker: m[1][0], length: m[1].length };
      continue;
    }
    if (fence && m && m[1][0] === fence.marker && m[1].length >= fence.length && m[2].trim() === '') {
      fence = null;
      continue;
    }
    if (!fence) out.push({ line, index });
  }
  return out;
}

// `Scope roots: <path> (<action>, <action>)`: an outside folder the plan's todos reach, granted up front.
export const SCOPE_ROOT_LINE = /^Scope roots?:[ \t]*(\S+)[ \t]*\(([a-z, -]+)\)[ \t]*$/u;
// An absolute path with at least two segments. Inside an inline code span only a span that is one bare
// path counts; a span holding spaces is a quoted command, which is data rather than a folder.
const ABSOLUTE_PATH = /(?<![\w.~/-])\/[\w.@+%,=~-]+(?:\/[\w.@+%,=~-]+)+\/?/gu;
const pathsIn = (line) => line
  .replace(/`([^`]*)`/gu, (_, span) => (/\s/u.test(span.trim()) ? ' ' : ` ${span.trim()} `))
  .match(ABSOLUTE_PATH) ?? [];

const realOr = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
const within = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const existingFolder = (path) => {
  for (let at = path; ; at = dirname(at)) {
    try {
      if (statSync(at).isDirectory()) return at;
    } catch { /* not there: climb */ }
    if (dirname(at) === at) return at;
  }
};

/**
 * Absolute paths named under `## Todos` (up to `## Final verification wave`, fences skipped) that lie
 * outside `projectRoot` and outside every `Scope roots:` line, one entry per folder: `{path, suggestion}`
 * with the line to add, or `{path, problem}` when the nearest existing folder is too broad to grant.
 */
export function uncoveredScopePaths(text, projectRoot) {
  const project = realOr(resolve(projectRoot));
  const lines = visibleLines(text);
  const granted = lines.map(({ line }) => SCOPE_ROOT_LINE.exec(line.trim())).filter(Boolean)
    .map(([, path]) => realOr(isAbsolute(path) ? path : resolve(project, path)));
  const found = new Map();
  let todos = false;
  for (const { line } of lines) {
    const heading = line.trimEnd();
    if (heading === '## Todos') todos = true;
    else if (/^## /u.test(heading)) todos = false;
    if (!todos) continue;
    for (const raw of pathsIn(line)) {
      const path = raw.replace(/[.,:;)]+$/u, '');
      const folder = realOr(existingFolder(path));
      const covered = [realOr(path), folder].some((p) => within(project, p) || granted.some((root) => within(root, p)));
      if (covered || found.has(folder)) continue;
      const tooBroad = dirname(folder) === dirname(dirname(folder)) || folder === realOr(homedir());
      found.set(folder, tooBroad
        ? { path, problem: `${path} is outside the project; name a narrower existing folder on a Scope roots line` }
        : { path, suggestion: `Scope roots: ${folder} (read)` });
    }
  }
  return [...found.values()];
}

export function checkPlan(text, { complete = false, projectRoot = null } = {}) {
  const problems = [];
  const lines = visibleLines(text);

  const status = lines.map(({ line }) => /^Status:\s*(.+?)\s*$/u.exec(line)).find(Boolean);
  if (!status) problems.push('missing header line: Status: approved | awaiting approval | assumptions unconfirmed');
  else if (!STATUSES.includes(status[1].toLowerCase())) problems.push(`unknown Status value: ${status[1]}`);

  let from = -1;
  for (const header of SECTION_HEADERS) {
    const found = lines.find(({ line }) => line.trimEnd() === header);
    if (!found) problems.push(`missing section: ${header}`);
    else if (found.index < from) problems.push(`section out of order: ${header}`);
    else from = found.index;
  }

  const rows = lines.filter(({ line }) => IMPLEMENTATION_ROW.test(line));
  const finals = lines.filter(({ line }) => FINAL_VERIFIER_ROW.test(line));
  if (!rows.length) problems.push('no implementation rows: expected at least one column-zero `- [ ] N. <title>`');
  if (!finals.length) problems.push('no final-verifier rows: expected column-zero `- [ ] F<number>. <title>`');

  for (const { line } of lines) {
    if (INDENTED_ROW.test(line)) problems.push(`indented task row is invisible to start-work: ${line.trim()}`);
  }

  const numbers = rows.map(({ line }) => Number(IMPLEMENTATION_ROW.exec(line)[1]));
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicates.length) problems.push(`duplicate task numbers: ${[...new Set(duplicates)].join(', ')}`);
  numbers.forEach((n, i) => {
    if (n !== i + 1 && !duplicates.includes(n)) problems.push(`task numbers are not consecutive from 1: found ${n} at position ${i + 1}`);
  });
  const finalNumbers = finals.map(({ line }) => Number(FINAL_VERIFIER_ROW.exec(line)[1]));
  finalNumbers.forEach((n, i) => {
    if (n !== i + 1) problems.push(`final-verifier numbers are not consecutive from F1: found F${n} at position ${i + 1}`);
  });
  if (rows.length && finals.length && finals[0].index < rows[rows.length - 1].index) {
    problems.push('final-verifier rows must come after the last implementation row');
  }

  const marked = lines.filter(({ line }) => IMPLEMENTATION_ROW.test(line) || FINAL_VERIFIER_ROW.test(line));
  for (let at = 0; at < marked.length; at += 1) {
    const { line, index } = marked[at];
    if (!IMPLEMENTATION_ROW.test(line)) continue;
    const end = marked[at + 1]?.index ?? Number.MAX_SAFE_INTEGER;
    // Stop the block at the next heading so trailing sections are not read as row content.
    const block = [];
    for (const v of lines) {
      if (v.index <= index || v.index >= end) continue;
      if (/^#{1,6} /u.test(v.line)) break;
      block.push(v.line);
    }
    const body = block.join('\n');
    for (const label of ROW_LABELS) {
      if (!new RegExp(`(^|[^A-Za-z])${label}\\s*:`, 'iu').test(body)) problems.push(`${line.trim()} - missing "${label}:"`);
    }
  }

  if (/<fill\b/u.test(text)) problems.push('unfilled <fill ...> placeholders remain: the plan is not decision-complete');

  if (projectRoot) {
    for (const entry of uncoveredScopePaths(text, projectRoot)) problems.push(entry.problem ?? `${entry.path} is outside the project and no Scope roots line covers it; add: ${entry.suggestion}`);
  }

  if (complete) {
    for (const { line } of marked) {
      if (/^- \[ \] /u.test(line)) problems.push(`row still open: ${line.trim()}`);
    }
  }
  return { ok: problems.length === 0, problems, rows: rows.length, finals: finals.length, status: status ? status[1] : null };
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 1;
}

function checkFile(planPath, options) {
  const path = resolve(process.cwd(), planPath);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return fail(`FAIL PLAN_NOT_FOUND: ${path}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return fail(`FAIL PLAN_UNSAFE: ${path} must be a regular file`);
  if (stat.size > MAX_PLAN_BYTES) return fail(`FAIL PLAN_TOO_LARGE: ${path}`);
  // The project is the folder holding plans/; a plan kept elsewhere is checked against the cwd.
  const projectRoot = basename(dirname(path)) === 'plans' ? dirname(dirname(path)) : process.cwd();
  const result = checkPlan(readFileSync(path, 'utf8'), { ...options, projectRoot });
  if (!result.ok) {
    for (const problem of result.problems) process.stderr.write(`FAIL ${problem}\n`);
    return 1;
  }
  process.stdout.write(`${options.complete ? 'PLAN_COMPLETE_PASS' : 'PLAN_STRUCTURE_PASS'} ${planPath} rows=${result.rows} final=${result.finals} status="${result.status}"\n`);
  return 0;
}

function skeleton(slug) {
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > 40 || !SLUG_PATTERN.test(slug)) {
    return fail('refused: slug must be lowercase kebab-case, at most 40 characters');
  }
  const template = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'plan.md');
  if (!existsSync(template)) return fail(`FAIL TEMPLATE_NOT_FOUND: ${template}`);
  process.stdout.write(readFileSync(template, 'utf8').replaceAll('{{slug}}', slug));
  return 0;
}

export function run(argv = process.argv.slice(2)) {
  const [mode, value, ...rest] = argv;
  if (rest.length || !value) return usage();
  if (mode === '--check') return checkFile(value, { complete: false });
  if (mode === '--complete') return checkFile(value, { complete: true });
  if (mode === '--skeleton') return skeleton(value);
  return usage();
}

function usage() {
  process.stderr.write('usage: check-plan.mjs --check <plan.md> | --complete <plan.md> | --skeleton <slug>\n');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.exitCode = fail(error instanceof Error ? error.message : String(error));
  }
}
