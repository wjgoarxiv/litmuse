// Bounded response bodies: a chunked response must trip the size limit while it is
// still streaming, not after the whole body has been buffered into the heap.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readCapped } from '../plugin/lib/capped-fetch.mjs';

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
