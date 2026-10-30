// A LitFamily block inside a file the user owns: the lines from `<!-- litfamily:<id>:start v=<version> -->`
// to `<!-- litfamily:<id>:end -->`. Only those lines are written; everything before and after stays byte for
// byte. The start marker also records what was put in front of the block (`pre=`, hex) and whether the
// file was made for the block (`new=1`), so removal takes back exactly that and add-then-remove restores
// the original bytes under either line ending. A start without its end, or a repeated marker, is
// malformed: it is reported and refused, never repaired by guesswork.

export class ManagedBlockError extends Error {}

const startPrefix = (id) => `<!-- litfamily:${id}:start`;
const endMarker = (id) => `<!-- litfamily:${id}:end -->`;
const START_LINE = /^<!-- litfamily:[^:\s]+:start v=(\S+)((?: [a-z]+=[0-9a-f]*)*) -->/u;

function indexesOf(text, needle) {
  const at = [];
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) at.push(i);
  return at;
}

// The block's span `[start, end)` with its recorded attributes, or null when the file has none.
function locate(text, id) {
  const starts = indexesOf(text, startPrefix(id));
  const ends = indexesOf(text, endMarker(id));
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    throw new ManagedBlockError(`malformed LitFamily ${id} block: expected one start and one end marker`);
  }
  const head = START_LINE.exec(text.slice(starts[0]));
  if (!head) throw new ManagedBlockError(`malformed LitFamily ${id} block: unreadable start marker`);
  const attrs = Object.fromEntries(head[2].trim().split(' ').filter(Boolean).map((pair) => pair.split('=')));
  return {
    start: starts[0],
    end: ends[0] + endMarker(id).length,
    version: head[1],
    pre: attrs.pre ? Buffer.from(attrs.pre, 'hex').toString('utf8') : '',
    created: attrs.new === '1',
  };
}

function render({ id, version, body }, eol, { pre, created }) {
  const attrs = `${pre ? ` pre=${Buffer.from(pre, 'utf8').toString('hex')}` : ''}${created ? ' new=1' : ''}`;
  const lines = String(body).replace(/\r?\n$/u, '').split(/\r?\n/u);
  return [`${startPrefix(id)} v=${version}${attrs} -->`, ...lines, endMarker(id)].join(eol);
}

/** `{state: 'absent' | 'present' | 'malformed', version, created, end}` for block `id` in `text`; `end` is the index just past its end marker. */
export function inspectBlock(text, id) {
  try {
    const span = locate(text, id);
    return span ? { state: 'present', version: span.version, created: span.created, end: span.end } : { state: 'absent', version: null, created: false, end: null };
  } catch {
    return { state: 'malformed', version: null, created: false, end: null };
  }
}

/** Adds block `block` or replaces the one there; `created` marks a file made for it. Returns `{text, changed}`. */
export function upsertBlock(text, block, { created = false } = {}) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const span = locate(text, block.id);
  if (span) {
    const next = `${text.slice(0, span.start)}${render(block, eol, span)}${text.slice(span.end)}`;
    return { text: next, changed: next !== text };
  }
  const pre = text === '' ? '' : `${text.endsWith('\n') ? '' : eol}${eol}`;
  return { text: `${text}${pre}${render(block, eol, { pre, created })}${eol}`, changed: true };
}

/** Removes block `id`, the line ending after it and whatever was put before it. `created` comes from its marker. */
export function removeBlock(text, id) {
  const span = locate(text, id);
  if (!span) return { text, changed: false, created: false };
  let before = text.slice(0, span.start);
  let after = text.slice(span.end);
  const eol = after.startsWith('\r\n') ? '\r\n' : after.startsWith('\n') ? '\n' : '';
  after = after.slice(eol.length);
  if (span.pre && before.endsWith(span.pre)) before = before.slice(0, -span.pre.length);
  return { text: `${before}${after}`, changed: true, created: span.created };
}
