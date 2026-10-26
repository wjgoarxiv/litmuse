export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function attrs(o) {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
}

export function el(name, attributes = {}, children = '') {
  const a = attrs(attributes);
  if (children === '' || children === null) return `<${name}${a}/>`;
  return `<${name}${a}>${children}</${name}>`;
}

export function text(x, y, s, opts = {}) {
  return el('text', {
    x, y, 'font-size': opts.size ?? 7, 'font-family': opts.font ?? 'Arial, sans-serif',
    fill: opts.fill ?? '#111', 'text-anchor': opts.anchor ?? 'start',
    'data-clear': opts.clear === false ? undefined : 'true',
  }, esc(s));
}

export function doc({ width = 420, height = 297, title = 'drawing' }, body) {
  const ground = `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" ` +
    `viewBox="0 0 ${width} ${height}" data-sheet="A3" data-title="${esc(title)}">\n${ground}\n${body}\n</svg>\n`;
}

export function comment(s) {
  return `<!-- ${s} -->`;
}
