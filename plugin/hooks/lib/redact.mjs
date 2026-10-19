// Hooks may import only from plugin/hooks/lib, so the credential shapes of plugin/lib/secret-shapes.mjs are
// repeated here for the handoff snapshot. Each hit is replaced in place; the snapshot never carries a credential.
const SHAPES = [
  /-----BEGIN (?:RSA |EC |DSA |ED25519 |OPENSSH |ENCRYPTED |SSH2 ENCRYPTED )?PRIVATE KEY-----/giu,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/giu,
  /(?<![A-Za-z0-9_])(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Za-z0-9_])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}(?![A-Za-z0-9_])/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{20,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/gu,
  /(?<![A-Za-z0-9_])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9_-])/gu,
  /(?<![A-Za-z0-9_])xapp-[A-Za-z0-9-]{20,}(?![A-Za-z0-9_-])/gu,
  /(?<![A-Za-z0-9_])AIza[0-9A-Za-z_-]{20,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Za-z0-9_])hf_[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Za-z0-9_])whsec_[A-Za-z0-9]{24,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Za-z0-9_])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Za-z0-9_])(?:glpat|gldt|glrt)-[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_])/gu,
  /(?<![A-Za-z0-9_])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_])/gu,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/giu,
  /(?<![A-Za-z0-9-])(?:proxy-)?authorization\s*:\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s+(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=\s*\S+|\S{12,})/giu,
  /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s,;]+/giu,
  /\b[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*[_-](?:token|secret|key)(?:[_-][A-Za-z0-9]+)*\s*[:=]\s*[^\s,;]+/giu,
  /(?<![A-Za-z0-9_])_?auth(?:[_-]?token)?\s*[:=]\s*[^\s,;]{8,}/giu,
  /(?<![A-Za-z0-9+.-])(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/[^/?#\s]+@/gu,
];
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

export function redact(value) {
  let text = String(value ?? '').replace(CONTROL, ' ');
  for (const re of SHAPES) text = text.replace(re, '[REDACTED]');
  return text;
}

// One line of at most `max` characters, credentials removed first so a cut never leaves half of one.
export function clip(value, max = 200) {
  const text = redact(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
