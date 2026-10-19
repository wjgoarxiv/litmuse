#!/usr/bin/env node
// verify-lsp.mjs <file> [--timeout=ms] [--server="<command line>"]
// Real language-server roundtrip for ONE file: resolve the server for the extension, spawn it over stdio, run
// initialize -> initialized -> didOpen, answer the server's own requests with empty results, and wait for
// textDocument/publishDiagnostics for that document. Dependency-free; installs nothing.
//
// Muse has no LSP tool, so this proves a user-installed server starts and answers. It is evidence about the
// SERVER, and the result never reaches Muse by itself: the model reads this script's output.
//
// Exit: 0 OK, 1 FAIL (not installed, crashed, timed out), 2 usage, 3 SKIP (no server known for the extension).
// Output: one JSON line {status, file, server, diagnostics, message} on stdout.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LANGUAGES } from './lsp-server-table.mjs';
import { findOnPath, spawnSafeAsync } from '../../../lib/host-process.mjs';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const timeoutArg = args.find((a) => a.startsWith('--timeout='));
const serverArg = args.find((a) => a.startsWith('--server='));
const timeoutMs = timeoutArg && Number(timeoutArg.slice(10)) > 0 ? Number(timeoutArg.slice(10)) : 60000;

const report = (status, fields) => process.stdout.write(`${JSON.stringify({ status, ...fields })}\n`);

if (!filePath) {
  process.stderr.write('usage: node verify-lsp.mjs <file> [--timeout=ms] [--server="<command line>"]\n');
  process.exit(2);
}
if (!existsSync(filePath) || !statSync(filePath).isFile()) {
  process.stderr.write(`verify-lsp: not a file: ${filePath}\n`);
  process.exit(2);
}

const absolute = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
const ext = extname(absolute).toLowerCase();
const entry = LANGUAGES.find((l) => l.extensions.includes(ext));
if (!entry) {
  report('SKIP', { file: absolute, message: `no language server known for "${ext}"` });
  process.exit(3);
}
const command = serverArg ? serverArg.slice(9).split(/\s+/).filter(Boolean) : entry.command;
const [bin, ...binArgs] = command;
if (!bin) {
  report('SKIP', { file: absolute, message: 'empty server command' });
  process.exit(3);
}

const text = readFileSync(absolute, 'utf8');
const uri = pathToFileURL(absolute).href;
const rootUri = pathToFileURL(process.cwd()).href;

const child = spawnSafeAsync(findOnPath(bin) ?? bin, binArgs, { stdio: ['pipe', 'pipe', 'pipe'], cwd: process.cwd() });
let settled = false;
let stderr = '';

function finish(code, status, message, diagnostics) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
  report(status, { file: absolute, server: command.join(' '), diagnostics: diagnostics ?? null, message });
  process.exit(code);
}

const timer = setTimeout(() => finish(1, 'FAIL', `timed out after ${timeoutMs}ms waiting for diagnostics`), timeoutMs);
child.on('error', (e) => finish(1, 'FAIL', e.code === 'ENOENT' ? `language server not installed (${bin}); nothing was installed` : e.message));
child.on('exit', (c) => finish(1, 'FAIL', `server exited (code ${c ?? '?'}) ${stderr.trim().slice(0, 400)}`));
child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

const send = (m) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...m }), 'utf8');
  child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]));
};

let buffer = Buffer.alloc(0);
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf('\r\n\r\n');
    if (end === -1) return;
    const m = /content-length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString('ascii'));
    if (!m) { buffer = buffer.subarray(end + 4); continue; }
    const start = end + 4;
    const len = Number(m[1]);
    if (buffer.length < start + len) return;
    const body = buffer.subarray(start, start + len).toString('utf8');
    buffer = buffer.subarray(start + len);
    let msg; try { msg = JSON.parse(body); } catch { continue; }
    onMessage(msg);
  }
});

function onMessage(msg) {
  if (msg.method && msg.id !== undefined) {
    const result = msg.method === 'workspace/configuration' ? (msg.params?.items || []).map(() => null) : null;
    send({ id: msg.id, result });
    return;
  }
  if (msg.id === 1 && msg.result !== undefined) {
    send({ method: 'initialized', params: {} });
    send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: entry.language, version: 1, text } } });
    return;
  }
  if (msg.method === 'textDocument/publishDiagnostics' && msg.params?.uri === uri) {
    const n = Array.isArray(msg.params.diagnostics) ? msg.params.diagnostics.length : 0;
    finish(0, 'OK', `roundtrip succeeded via ${entry.serverId}`, n);
  }
}

send({
  id: 1, method: 'initialize',
  params: {
    processId: process.pid, rootUri, workspaceFolders: [{ uri: rootUri, name: 'root' }],
    capabilities: { textDocument: { publishDiagnostics: {} }, workspace: { configuration: true, workspaceFolders: true } },
  },
});
