// DNS-rebinding parity: resolve once for the hop check, then connect only to the
// approved address. A name that answers public and then private must not move the
// connection; TLS still verifies the certificate for the name.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';

import { checkHop, isPrivateAddress, pinnedSend } from '../plugin/lib/pinned-fetch.mjs';

test('private addresses cover loopback, link-local, private, CGNAT and metadata ranges', () => {
  for (const ip of ['127.0.0.1', '10.0.0.9', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '100.64.0.1', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'ff02::1', '::ffff:127.0.0.1', '[::1]']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', 'example.com']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('checkHop refuses non-https, local names, literal private addresses and empty resolves', async () => {
  await assert.rejects(checkHop('http://example.com/x', null), /https only/);
  await assert.rejects(checkHop('https://localhost/x', null), /loopback/);
  await assert.rejects(checkHop('https://x.localhost/x', null), /loopback/);
  await assert.rejects(checkHop('https://127.0.0.1/x', null), /private host/);
  await assert.rejects(checkHop('https://10.1.2.3/x', null), /private host/);
  await assert.rejects(checkHop('https://[::1]/x', null), /private host/);
  const resolvingPrivate = async () => [{ address: '10.0.0.9', family: 4 }];
  await assert.rejects(checkHop('https://example.com/x', resolvingPrivate), /resolves to a private/);
  await assert.rejects(checkHop('https://example.com/x', async () => []), /does not resolve/);
});

test('checkHop approves public literals and resolved names with the first address', async () => {
  assert.deepEqual(await checkHop('https://93.184.216.34/x', null), { href: 'https://93.184.216.34/x', address: '93.184.216.34', family: 4 });
  const resolvingPublic = async () => [{ address: '93.184.216.34', family: 4 }, { address: '93.184.216.35', family: 4 }];
  assert.deepEqual(await checkHop('https://example.com/x', resolvingPublic), { href: 'https://example.com/x', address: '93.184.216.34', family: 4 });
  assert.deepEqual(await checkHop('https://example.com/x', null), { href: 'https://example.com/x', address: null, family: 0 });
});

test('pinnedSend answers DNS only with the approved address, in both arities', async () => {
  let seen = null;
  const request = (href, options, callback) => {
    seen = options.lookup;
    const req = new EventEmitter();
    req.end = () => process.nextTick(() => req.emit('error', new Error('stop')));
    return req;
  };
  const send = pinnedSend(request);
  await assert.rejects(send('https://example.com/x', { headers: {}, signal: undefined }, { address: '93.184.216.34', family: 4 }), /stop/);
  const all = await new Promise((resolve, reject) => seen('example.com', { all: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))));
  assert.deepEqual(all, [{ address: '93.184.216.34', family: 4 }]);
  const one = await new Promise((resolve, reject) => seen('example.com', (err, address, family) => (err ? reject(err) : resolve([address, family]))));
  assert.deepEqual(one, ['93.184.216.34', 4]);
});

test('pinnedSend connects even when the name would rebind on a second answer', async () => {
  const connected = [];
  const request = (href, options, callback) => {
    options.lookup('example.com', { all: true }, (err, addrs) => {
      connected.push(addrs[0].address);
      const res = Readable.from(['<html>rebound?</html>']);
      res.statusCode = 200;
      res.headers = { 'content-type': 'text/html' };
      process.nextTick(() => callback(res));
    });
    const req = new EventEmitter();
    req.end = () => {};
    return req;
  };
  const send = pinnedSend(request);
  const response = await send('https://example.com/page', { headers: {}, signal: undefined }, { address: '93.184.216.34', family: 4 });
  assert.equal(connected.join(','), '93.184.216.34');
  assert.equal(response.status, 200);
});
