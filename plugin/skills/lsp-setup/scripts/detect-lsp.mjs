#!/usr/bin/env node
// detect-lsp.mjs [projectDir] [--json]
// Read-only scan: which source languages the project contains, whether each language's server and CLI checker
// resolve on PATH (or in node_modules/.bin), which project config files exist, and the install command the USER
// could run. It starts no server and installs nothing.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { findOnPath } from '../../../lib/host-process.mjs';
import { LANGUAGES } from './lsp-server-table.mjs';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'target', '.venv', 'venv', 'vendor',
  '.cache', '__pycache__', '.turbo', 'coverage', '.litmuse']);
const MAX_FILES = 50000;
const BASENAME_EXT = { Dockerfile: '.dockerfile', Containerfile: '.dockerfile' };

const args = process.argv.slice(2);
const wantsJson = args.includes('--json');
const root = resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
if (!existsSync(root) || !statSync(root).isDirectory()) {
  process.stderr.write(`detect-lsp: not a directory: ${root}\n`);
  process.exit(2);
}

function collect(dir) {
  const found = new Map();
  const names = new Set();
  const stack = [dir];
  let seen = 0;
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur); } catch { continue; }
    for (const e of entries) {
      if (seen >= MAX_FILES) return { found, names };
      const full = join(cur, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP.has(e)) stack.push(full); continue; }
      if (!st.isFile()) continue;
      seen += 1;
      names.add(e);
      const ext = (BASENAME_EXT[e] || extname(e)).toLowerCase();
      if (ext) found.set(ext, (found.get(ext) || 0) + 1);
    }
  }
  return { found, names };
}

function resolveBin(cmd) {
  return findOnPath(cmd, { dirs: [join(root, 'node_modules', '.bin'), join(root, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin')] });
}

function hasProjectFile(names, pattern) {
  if (!pattern.includes('*')) return names.has(pattern);
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return [...names].some((n) => re.test(n));
}

const { found, names } = collect(root);
const results = [];
for (const s of LANGUAGES) {
  const count = s.extensions.reduce((n, ext) => n + (found.get(ext) || 0), 0);
  if (!count) continue;
  const server = resolveBin(s.command[0]);
  const checker = s.checker ? resolveBin(s.checker === 'pyright' ? 'pyright' : s.checker) || (s.checker === 'pyright' ? resolveBin('basedpyright') : null) : null;
  results.push({
    language: s.language, files: count, serverId: s.serverId, serverCommand: s.command[0], serverInstalled: !!server, serverPath: server,
    cliChecker: s.checker, cliCheckerInstalled: s.checker ? !!checker : null,
    projectFiles: s.projectFiles.filter((p) => hasProjectFile(names, p)), projectFilesWanted: s.projectFiles,
    installHint: s.installHint,
  });
}

if (wantsJson) {
  process.stdout.write(`${JSON.stringify({ root, results }, null, 2)}\n`);
  process.exit(0);
}

const lines = [`LSP setup scan: ${root}`, ''];
if (!results.length) lines.push('No languages with a known server were detected here.');
for (const r of results) {
  const srv = r.serverInstalled ? `server OK (${r.serverPath})` : `server MISSING (${r.serverCommand})`;
  const chk = r.cliChecker ? (r.cliCheckerInstalled ? `checker OK (${r.cliChecker})` : `checker MISSING (${r.cliChecker})`) : 'checker none wired';
  lines.push(`${r.language.padEnd(11)} ${String(r.files).padStart(5)} files  ${srv}; ${chk}`);
  lines.push(`            project files: ${r.projectFiles.length ? r.projectFiles.join(', ') : `none of ${r.projectFilesWanted.join(', ') || 'n/a'}`}`);
  if (!r.serverInstalled || (r.cliChecker && !r.cliCheckerInstalled)) lines.push(`            you could run: ${r.installHint}`);
}
lines.push('', 'Nothing was installed or started. Read references/<language>/README.md, then verify with verify-lsp.mjs or lsp/scripts/diagnostics.mjs.');
process.stdout.write(`${lines.join('\n')}\n`);
