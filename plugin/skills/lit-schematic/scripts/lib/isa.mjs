const VARIABLE_LETTERS = new Set('FLPTEIAS'.split(''));
const TAG_RE = /^([A-Z]{1,4})-(\d{3,4})([A-Z]?)$/;
const LINE_RE = /^(\d+)-([A-Z0-9]+)-([A-Z0-9]+)$/;

export function validateTag(tag) {
  const m = TAG_RE.exec(String(tag));
  if (!m) return { ok: false, reason: `tag ${tag} breaks the LETTERS-NNNN shape` };
  if (!VARIABLE_LETTERS.has(m[1][0])) {
    return { ok: false, reason: `tag ${tag} opens with ${m[1][0]}, outside the variable table` };
  }
  return { ok: true };
}

export function parseLineNumber(s) {
  const m = LINE_RE.exec(String(s).trim());
  if (!m) return { ok: false, reason: `line number ${s} breaks the SIZE-FLUID-SEQ grammar` };
  return { ok: true, size: m[1], fluid: m[2], seq: m[3] };
}
