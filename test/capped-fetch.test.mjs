// Bounded response bodies: a chunked response must trip the size limit while it is
// still streaming, not after the whole body has been buffered into the heap.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { readCapped } from '../plugin/lib/capped-fetch.mjs';
import { get } from '../plugin/skills/lit-typographic-motion/engine/node/assets.mjs';
import { fetchBytes as runtimeFetchBytes } from '../plugin/skills/lit-typographic-motion/engine/node/runtime.mjs';

const streamOf = (count, size, seen = { count: 0, cancelled: false }) => ({
  seen,
  body: {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => {
          if (i >= count) return { done: true, value: undefined };
          i += 1;
          seen.count += 1;
          return { done: false, value: Buffer.alloc(size, 7) };
        },
      };
    },
    cancel: async () => {
      seen.cancelled = true;
    },
  },
});

const response = (body, { length = null } = {}) => ({
  ok: true,
  headers: { get: (name) => (name === 'content-length' ? length : null) },
  body,
  arrayBuffer: async () => Buffer.concat([]),
});

test('readCapped stops a streaming body past the limit without consuming it all', async () => {
  const { seen, body } = streamOf(10, 1024 * 1024);
  await assert.rejects(readCapped(response(body), 5 * 1024 * 1024, 'https://x.example/big'), /larger than/);
  assert.ok(seen.count < 10, `read ${seen.count} of 10 chunks before stopping`);
  assert.equal(seen.cancelled, true, 'the stream is cancelled on abort');
});

test('readCapped returns a small streaming body whole', async () => {
  const { body } = streamOf(3, 100);
  const bytes = await readCapped(response(body), 5 * 1024 * 1024, 'https://x.example/small');
  assert.equal(bytes.length, 300);
});

test('readCapped still caps a non-streaming response after buffering', async () => {
  const big = { ok: true, headers: { get: () => null }, body: null, arrayBuffer: async () => Buffer.alloc(100, 1) };
  await assert.rejects(readCapped(big, 10, 'https://x.example/blob'), /larger than/);
});

test('motion assets refuse an oversized image stream while it is still flowing', async () => {
  const { seen, body } = streamOf(8, 1024 * 1024);
  const fetchImpl = async () => response(body);
  await assert.rejects(get(fetchImpl, 'https://img.example/photo.jpg', { accept: 'image/*', limit: 4 * 1024 * 1024 }), /larger than|limit/);
  assert.ok(seen.count < 8, `read ${seen.count} of 8 chunks before stopping`);
});


test('motion assets follow public hops and refuse a private redirect', async () => {
  const calls = [];
  const page = (status, location, bytes) => ({ status, ok: status === 200,
    headers: { get: (name) => (name === 'location' ? location : (name === 'content-length' ? String(bytes.length) : 'image/png')) },
    body: null, arrayBuffer: async () => bytes });
  const send = async (href) => { calls.push(href);
    return href.endsWith('/a') ? page(302, 'https://img.example/b.png', Buffer.alloc(0)) : page(200, null, Buffer.alloc(10)); };
  const buf = await get(send, 'https://img.example/a', { accept: 'image/*', limit: 4 * 1024 * 1024 });
  assert.deepEqual(calls, ['https://img.example/a', 'https://img.example/b.png']);
  assert.equal(buf.length, 10);
  const evil = async () => ({ status: 302, ok: false,
    headers: { get: (name) => (name === 'location' ? 'https://169.254.169.254/latest' : null) }, body: null });
  await assert.rejects(get(evil, 'https://img.example/a', { accept: 'image/*', limit: 4 * 1024 * 1024 }), /private/);
});

test('motion runtime refuses an install payload past its cap while streaming', async () => {
  const server = createServer((req, res) => {
    res.on('error', () => {});
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    let n = 0;
    let dead = false;
    req.on('close', () => { dead = true; });
    const tick = () => {
      if (dead) return;
      n += 1;
      if (n > 140) return res.end();
      if (!res.write(Buffer.alloc(1024 * 1024, 3))) { res.once('drain', tick); return; }
      setImmediate(tick);
    };
    tick();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await assert.rejects(runtimeFetchBytes(`http://127.0.0.1:${port}/pkg.tgz`, { sha256: null, env: {} }), /larger than/);
  } finally {
    server.close();
  }
});
