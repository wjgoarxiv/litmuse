// The status card as a person's terminal shows it: one print with the sunset beside the words, or, with --watch, a
// full-screen card that moves while work goes on. A pipe, --json, NO_COLOR, fewer colours, a light background and a
// narrow terminal never reach the scene.
import { buildCard, cardLight, cardWorking, renderCard } from './stage-card.mjs';
import { colourDepth, litPill, markFor, pillLabel, pillWidth, termColumns } from './mark.mjs';
import { BRAND, MAX_WIDTH, STILL_T, SUN_ROWS, SUN_W, gradedPill, ink, mix, motionOff, neon, paint, paintRows, place, roundCaps, rowCells, sceneOn, wrapRow } from './sunset.mjs';

const ESC = '\u001b';
export const READ_MS = 1000;
export const FRAME_MS = 125;

// The terminal as the card sees it. `scene` is off wherever today's output must stay as it is.
const terminal = (env, stream) => {
  const tty = stream?.isTTY === true;
  const depth = colourDepth({ env, isTTY: tty });
  const cols = termColumns({ env, stream });
  return { tty, depth, cols, scene: sceneOn({ depth, env, cols }), caps: roundCaps(env) };
};

const cardRows = (card, term, version, cols = term.cols) => {
  const pill = !term.tty ? null : term.scene ? gradedPill(pillLabel(version), BRAND, term.caps) : litPill(version, term.depth);
  return renderCard(card, {
    badge: pill && { text: pill, width: pillWidth(version) }, cols, dress: term.scene ? { caps: term.caps } : null,
  }).split('\n');
};

// `litmuse status --card`. The mark's tagline and the blank row under it lend the sun room over a short card.
export function cardText(card, { env = process.env, stream = process.stdout, version }) {
  const term = terminal(env, stream);
  const mark = term.tty ? `${markFor({ env, stream })}\n`.split('\n').slice(0, -1) : [];
  const rows = cardRows(card, term, version);
  const light = term.scene ? cardLight(card) : null;
  if (!light) return [...mark, ...rows].join('\n');
  const art = mark.slice(0, -2);
  // The last column stays empty: some terminals wrap on it.
  const width = Math.min(MAX_WIDTH, term.cols - 1);
  return [...art, ...paintRows([...mark.slice(-2), ...rows], width, { ...light, t: light.dim ? null : STILL_T })].join('\n');
}

// The watched card inside its neon frame, laid out once per state: the headline sits in the top rule, at least three
// rows of body give the sun its place. frame(t) paints it for one moment.
function framed(rows, width, light) {
  const inner = width - 4;
  const title = rowCells(rows[0]) <= inner - 4 ? rows[0] : '';
  const body = (title ? rows.slice(1) : rows).flatMap((row) => wrapRow(row, inner));
  while (body.length < SUN_ROWS) body.push('');
  const spot = place(body, inner);
  const sunMid = 2 + spot.at + SUN_W / 2;
  const lit = light && spot.top !== null && spot.sea === body.length - 1;
  const rule = (x, r, t) => {
    const i = Math.floor(x / 4) * 4;
    let hue = neon(Math.min(1, i / width + r * 0.02));
    if (t !== null) hue = mix(hue, '#ffffff', 0.15 + 0.15 * Math.sin((t / 2.4) * Math.PI * 2));
    if (r === 2 && lit) {
      const near = Math.max(0, 1 - Math.abs(i - sunMid) / 26);
      const ring = 0.5 + 0.5 * Math.sin(Math.abs(i - sunMid) * 0.55 - (t ?? 0) * 2.6);
      hue = mix(hue, near > 0.6 ? '#ffd24a' : '#ff8f3c', Math.min(1, near * (0.45 + 0.85 * ring)));
    }
    return light?.dim ? mix(hue, '#30363d', 0.45) : hue;
  };
  const line = (from, chars, r, t) => ink([...chars].map((ch, i) => (ch === ' ' ? null : { ch, fg: rule(from + i, r, t) })));
  // Side walls are placed by column, so a character the terminal draws wider than expected cannot bend the frame.
  const wall = (t) => [line(0, '│', 1, t), `${ESC}[${width}G${line(width - 1, '│', 1, t)}`];
  const lead = title ? 4 + rowCells(title) : 0;
  return (t) => {
    const tails = light ? paint(spot, { ...light, t }) : new Map();
    const [left, right] = wall(t);
    const top = title
      ? `${line(0, '╭─ ', 0, t)}${title}${line(lead - 1, ` ${'─'.repeat(width - lead - 1)}╮`, 0, t)}`
      : line(0, `╭${'─'.repeat(width - 2)}╮`, 0, t);
    return [
      top,
      ...body.map((text, r) => `${left} ${text}${tails.has(r) ? ink(tails.get(r).slice(Math.min(inner, spot.ends[r]))) : `${ESC}[K`}${right}`),
      line(0, `╰${'─'.repeat(width - 2)}╯`, 2, t),
    ];
  };
}

// What --watch shows for this state and terminal size. `moving` is false whenever the picture cannot change by itself.
export function watchView(card, { env = process.env, stream = process.stdout, version, now = Date.now() }) {
  const term = terminal(env, stream);
  const height = Number(stream.rows) || 24;
  const width = Math.min(MAX_WIDTH, term.cols - 1);
  let draw;
  if (term.scene) {
    draw = framed(cardRows(card, term, version, width - 8), width, cardLight(card));
  } else {
    const rows = cardRows(card, term, version).flatMap((row) => wrapRow(row, term.cols));
    draw = () => rows;
  }
  const mark = markFor({ env, stream }).split('\n');
  const above = mark.length + draw(null).length <= height ? mark : [];
  const moving = term.scene && !motionOff(env) && cardWorking(card, { env, now });
  return { moving, frame: (t) => [...above, ...draw(t)].slice(0, height) };
}

/**
 * `litmuse status --card --watch` on a terminal: the alternate screen, one timer, the state read at most once a second
 * and repainted from memory in between. Resolves with the exit code once the terminal is back as it was.
 */
export function watchCard({ cwd = process.cwd(), env = process.env, out = process.stdout, input = process.stdin, proc = process, now = Date.now, version, read = () => buildCard({ cwd, env, now: now() }) }) {
  return new Promise((resolve) => {
    const started = now();
    let timer = null;
    let readAt = -Infinity;
    let card = null;
    let view = null;
    let shown = [];
    let open = true;
    const raw = Boolean(input?.isTTY && input.setRawMode);

    const draw = () => {
      const rows = view.frame(view.moving ? (now() - started) / 1000 : null);
      let bytes = '';
      for (let r = 0; r < Math.max(rows.length, shown.length); r += 1) {
        if (rows[r] !== shown[r]) bytes += `${ESC}[${r + 1};1H${rows[r] ?? ''}${ESC}[0m${ESC}[K`;
      }
      shown = rows;
      if (bytes) out.write(bytes);
    };
    const compose = () => {
      view = watchView(card, { env, stream: out, version, now: now() });
    };
    const tick = () => {
      if (now() - readAt >= READ_MS) {
        readAt = now();
        card = read();
        compose();
      }
      draw();
      timer = setTimeout(tick, view.moving ? FRAME_MS : Math.max(1, READ_MS - (now() - readAt)));
    };
    const resize = () => {
      compose();
      shown = [];
      out.write(`${ESC}[2J`);
      draw();
    };
    const restore = () => {
      if (!open) return;
      open = false;
      clearTimeout(timer);
      if (raw) input.setRawMode(false);
      out.write(`${ESC}[0m${ESC}[?7h${ESC}[?25h${ESC}[?1049l`);
    };
    const stop = (code) => {
      restore();
      out.off('resize', resize);
      input?.off?.('data', key);
      input?.pause?.();
      for (const [name, handler] of signals) proc.off(name, handler);
      proc.off('exit', restore);
      resolve(code);
    };
    // Raw mode hands Ctrl+C over as a key; q and Esc leave too.
    const key = (data) => {
      if (['\u0003', 'q', 'Q', ESC].includes(String(data))) stop(0);
    };
    const signals = [['SIGINT', () => stop(0)], ['SIGTERM', () => stop(143)], ['SIGHUP', () => stop(129)]];

    for (const [name, handler] of signals) proc.on(name, handler);
    proc.on('exit', restore);
    out.on('resize', resize);
    if (raw) {
      input.setRawMode(true);
      input.on('data', key);
      input.resume();
    }
    out.write(`${ESC}[?1049h${ESC}[?25l${ESC}[?7l${ESC}[2J`);
    tick();
  });
}
