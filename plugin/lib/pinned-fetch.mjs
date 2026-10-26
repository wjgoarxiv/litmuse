// Pinned HTTPS: resolve once for the hop check, then connect only to the approved
// address, so a name that answers again with a private address (DNS rebinding) cannot
// move the connection. TLS still verifies the certificate for the name.
import { isIP, isIPv4, isIPv6 } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

const privateV4 = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
};

// Loopback, link-local, private, CGNAT, benchmark, multicast and cloud-metadata ranges,
// plus IPv4-mapped IPv6 forms of the same. Anything else, including bare names, is public.
export const isPrivateAddress = (address) => {
  const ip = String(address).replace(/^\[|\]$/gu, '').toLowerCase();
  if (isIPv4(ip)) return privateV4(ip);
  if (!isIPv6(ip)) return false;
  const mapped = /^(?:0*:)*:?ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/u.exec(ip);
  if (mapped) {
    if (mapped[1]) return privateV4(mapped[1]);
    const [high, low] = [mapped[2], mapped[3]].map((part) => Number.parseInt(part, 16));
    return privateV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return ip === '::' || ip === '::1' || /^f[cd]/u.test(ip) || /^fe[89ab]/u.test(ip) || /^ff/u.test(ip);
};

// One redirect hop: https only, no local names or addresses, and names must resolve to
// at least one address with none private. Returns the href with the approved address, so
// the connect below cannot be moved by a second, private answer.
export const checkHop = async (href, lookup, httpsNote = 'fetch https only') => {
  let url;
  try {
    url = new URL(href);
  } catch {
    throw new Error(`refusing ${href}: not a URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`refusing ${url.protocol} ${href}: ${httpsNote}`);
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host)) {
    throw new Error(`refusing ${href}: a loopback, link-local or private host`);
  }
  if (isIP(host)) return { href: url.href, address: host, family: isIP(host) };
  if (!lookup) return { href: url.href, address: null, family: 0 };
  const addresses = await lookup(host, { all: true });
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error(`refusing ${href}: ${host} does not resolve`);
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`refusing ${href}: ${host} resolves to a private address`);
  }
  return { href: url.href, address: addresses[0].address, family: addresses[0].family };
};

// node:https with a lookup that answers only with the approved address, read back as a
// Response. `request` is injectable for tests; pass a real name and the TLS certificate
// is still verified for it.
export const pinnedSend = (request = httpsRequest) => (href, { headers, signal }, { address, family }) => new Promise((resolveResponse, reject) => {
  const pin = (host, options, callback) => {
    if (typeof options === 'function') { options(null, address, family); return; }
    if (options && options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
  const req = request(href, { headers, signal, lookup: pin }, (res) => {
    const answer = new Headers();
    for (const [name, value] of Object.entries(res.headers ?? {})) {
      for (const item of [value].flat()) if (item !== undefined) answer.append(name, String(item));
    }
    const empty = [204, 205, 304].includes(res.statusCode);
    if (empty && typeof res.resume === 'function') res.resume();
    try {
      resolveResponse(new Response(empty ? null : Readable.toWeb(res), { status: res.statusCode, headers: answer }));
    } catch (error) {
      if (typeof res.destroy === 'function') res.destroy();
      reject(error);
    }
  });
  req.on('error', reject);
  req.end();
});
