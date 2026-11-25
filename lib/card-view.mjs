// The status card as a person's terminal shows it: one print, or, with --watch, a full-screen card that moves while work
// goes on. A dark truecolor terminal with room gets the framed card; a pipe, --json, NO_COLOR, fewer colours, a light
// background and a narrow terminal get the plain one.
import { buildCard, cardWorking, renderCard } from './stage-card.mjs';
import { cardFacts } from './card-facts.mjs';
import { cardLines, composeCard } from './framed-card.mjs';
import { roundGlyphs } from './glyphs.mjs';
import { colourDepth, litPill, markFor, pillWidth, termColumns } from './mark.mjs';
import { MAX_WIDTH, STILL_T, motionOff, sceneOn, wrapRow } from './sunset.mjs';

const ESC = '\u001b';
export const READ_MS = 1000;
export const FRAME_MS = 125;

// The terminal as the card sees it. `framed` is off wherever the plain card must stay as it is.
const terminal = (env, stream) => {
  const tty = stream?.isTTY === true;
  const depth = colourDepth({ env, isTTY: tty });
  const cols = termColumns({ env, stream });
  // The last column stays empty: some terminals wrap on it.
  return { tty, depth, cols, framed: sceneOn({ depth, env, cols }), width: Math.min(MAX_WIDTH, cols - 1) };
};

const plainRows = (card, term, version) => {
  const pill = term.tty ? litPill(version, term.depth) : null;
  return renderCard(card, { badge: pill && { text: pill, width: pillWidth(version) }, cols: term.cols }).split('\n');
};

const framed = (card, term, { env, cwd, version, now, working }) => composeCard(card, cardFacts({ cwd, card, env, now }), { width: term.width, round: roundGlyphs(env), working, version });

// `litmuse status --card`.
export function cardText(card, { env = process.env, stream = process.stdout, cwd = process.cwd(), version, now = card.now ?? Date.now() }) {
  const term = terminal(env, stream);
  const mark = term.tty ? `${markFor({ env, stream })}\n`.split('\n').slice(0, -1) : [];
  if (!term.framed) return [...mark, ...plainRows(card, term, version)].join('\n');
  const working = cardWorking(card, { env, now });
  const view = framed(card, term, { env, cwd, version, now, working });
  return [...mark, ...cardLines(view.grid(working ? STILL_T : null), term.width)].join('\n');
}

// What --watch shows for this state and terminal size. `moving` is false whenever the picture cannot change by itself.
export function watchView(card, { env = process.env, stream = process.stdout, cwd = process.cwd(), version, now = Date.now() }) {
  const term = terminal(env, stream);
  const height = Number(stream.rows) || 24;
  if (!term.framed) {
    const mark = markFor({ env, stream }).split('\n');
    const rows = plainRows(card, term, version).flatMap((row) => wrapRow(row, term.cols));
    const all = mark.length + rows.length <= height ? [...mark, ...rows] : rows;
    return { moving: false, frame: () => all.slice(0, height) };
  }
  const working = cardWorking(card, { env, now });
  const view = framed(card, term, { env, cwd, version, now, working });
  // A pane too short for the card loses rows from the bottom of its body, never its frame.
  const fit = (grid) => (grid.length > height ? [...grid.slice(0, Math.max(1, height - 1)), grid.at(-1)].slice(0, height) : grid);
  return { moving: working && !motionOff(env), frame: (t) => cardLines(fit(view.grid(t)), term.width) };
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
      view = watchView(card, { env, stream: out, cwd, version, now: now() });
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
