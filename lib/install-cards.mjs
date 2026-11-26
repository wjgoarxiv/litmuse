// The cards a person at a terminal sees during `litmuse install` and `litmuse uninstall`: the mark, the questions, the
// work, one row per answer, and the closing panel. Every value starts in column 24, and one blank row parts two blocks. cardsFor() returns null for everything else (a pipe, CI, --yes, --dry-run,
// TERM=dumb, a small window, LITMUSE_AGENT_FILE), and then install and uninstall print their plain lines.
import { emitKeypressEvents } from 'node:readline';
import { CAP_LEFT, CAP_RIGHT, roundGlyphs } from './glyphs.mjs';
import { SIZES, colourDepth, markRows, sample } from './mark.mjs';
import { displayWidth } from '../plugin/lib/rewind/gauge.mjs';

const MIN_COLS = 40;
const MIN_ROWS = 12;
const MAX_CARD = 100;
const FOLD = 20;
const LABEL = 19;
const STEP = 19;
const BUTTON = 15;
// Keys already typed when a card appears are dropped, and so is the Enter that follows a y or n out of habit.
const SETTLE_MS = 30;
const HABIT_MS = 400;

const ESC = '\u001b';
const PINK = '#ff2d95';
const VIOLET = '#b48cff';
const CYAN = '#8be9fd';
const ORANGE = '#ff8f3c';
const GREEN = '#50e68c';
const AMBER = '#ffb02e';
const RED = '#ff5577';
const INK = '#0b0e14';
const BASIC = { [PINK]: 95, [VIOLET]: 94, [CYAN]: 96, [ORANGE]: 93, [GREEN]: 92, [AMBER]: 93, [RED]: 91, [INK]: 30 };

const DRAWN = {
  box: ['╭', '╮', '╰', '╯', '─', '│'], chosen: ['╔', '╗', '╚', '╝', '═', '║'], done: '✓', fail: '✗', warn: '!', note: '·', busy: '⠙', pointer: '❯', arrows: '← →',
};
const TYPED = {
  box: ['+', '+', '+', '+', '-', '|'], chosen: ['#', '#', '#', '#', '=', '#'], done: 'ok', fail: 'x', warn: '!', note: '-', busy: '*', pointer: '>', arrows: 'Left Right',
};
const TYPED_FOR = { '·': '-', '—': '-', '→': '->', '…': '...' };

const bare = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');
const cells = (text) => displayWidth(bare(text));
const pad = (text, width) => text + ' '.repeat(Math.max(0, width - cells(text)));

// Wraps at spaces, keeping a line's own indent. A longer word (a path) continues on the next line; nothing is dropped.
export function wrap(text, width) {
  const indent = /^ */.exec(text)[0];
  const lines = [indent];
  for (const word of text.trim().split(/ +/)) {
    const last = lines.length - 1;
    const empty = lines[last].trim() === '';
    if (cells(lines[last]) + (empty ? 0 : 1) + cells(word) <= width) {
      lines[last] += empty ? word : ` ${word}`;
      continue;
    }
    if (!empty) lines.push(indent);
    for (const ch of word) {
      if (cells(lines.at(-1) + ch) > width) lines.push(indent);
      lines[lines.length - 1] += ch;
    }
  }
  return lines;
}

const cubeLevel = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));

function painter(depth) {
  const code = (hex, back, basic) => {
    if (depth === '16') return String(basic + (back ? 10 : 0));
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    const value = depth === 'truecolor' ? `2;${r};${g};${b}` : `5;${16 + 36 * cubeLevel(r) + 6 * cubeLevel(g) + cubeLevel(b)}`;
    return `${back ? 48 : 38};${value}`;
  };
  const paint = (text, { fg, bg, bold, dim, basic }) => {
    if (depth === 'none' || !text) return text;
    const codes = [bold && 1, dim && 2, fg && code(fg, false, BASIC[fg] ?? basic), bg && code(bg, true, BASIC[bg] ?? basic)].filter(Boolean);
    return `${ESC}[${codes.join(';')}m${text}${ESC}[0m`;
  };
  // `text` along `stops`; `at` and `of` say where it lies on a longer run, so a border cut by its title stays one ramp.
  const ramp = (text, stops, { onto = 'fg', at = 0, of = [...text].length, bold = false } = {}) => {
    if (depth === 'none') return text;
    const parts = [];
    [...text].forEach((ch, i) => {
      const step = Math.round(((at + i) / Math.max(1, of - 1)) * 20) / 20;
      if (parts.at(-1)?.step === step) parts.at(-1).text += ch;
      else parts.push({ step, text: ch });
    });
    return parts.map((p) => paint(p.text, {
      [onto]: sample(stops, p.step), basic: BASIC[stops[Math.round(p.step * (stops.length - 1))]], bold, ...(onto === 'bg' ? { fg: INK } : {}),
    })).join('');
  };
  return { paint, ramp };
}

// NO_COLOR keeps the cards without colour; a terminal below 256 colours gets the sixteen basic ones.
function depthOf(env, stdout) {
  if (env.NO_COLOR) return 'none';
  const depth = colourDepth({ env, isTTY: stdout.isTTY });
  return depth === 'none' ? '16' : depth;
}

const typedLocale = (env) => {
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
  return locale !== '' && !/utf-?8/i.test(locale);
};

/** Panel rows for `[label, value]` pairs of what is about to happen. */
export const planRows = (pairs) => pairs.map(([label, value]) => ({ mark: 'note', label, value }));

const lightTerminal = (env) => /;(7|15)$/.test(env.COLORFGBG ?? '');

/** The cards for this terminal, or null when the plain lines should be printed. */
export function cardsFor({ env = process.env, flags = {}, stdin = process.stdin, stdout = process.stdout, ...rest } = {}) {
  const person = stdin.isTTY && stdout.isTTY && typeof stdin.setRawMode === 'function' && !env.CI && !/^dumb$/i.test(env.TERM ?? '');
  if (!person || flags.yes || flags.dryRun || env.LITMUSE_AGENT_FILE) return null;
  if ((stdout.columns || 80) < MIN_COLS || (stdout.rows || 24) < MIN_ROWS) return null;
  return createCards({ env, stdin, stdout, ...rest });
}

export function createCards({ env, stdin, stdout, proc = process, now = Date.now, settleMs = SETTLE_MS }) {
  const depth = depthOf(env, stdout);
  const typed = typedLocale(env);
  // Decided once, so a run never mixes round and square.
  const round = depth === 'truecolor' && !typed && !lightTerminal(env) && roundGlyphs(env);
  const sign = typed ? TYPED : DRAWN;
  const { paint, ramp } = painter(depth);
  const cols = () => stdout.columns || 80;
  const rows = () => stdout.rows || 24;
  const width = () => Math.min(MAX_CARD, cols() - 2);
  const inner = () => width() - 4;
  const say = (text) => (typed ? String(text).replace(/[·—→…]/g, (ch) => TYPED_FOR[ch]) : String(text));
  const bold = (text) => paint(text, { bold: true });
  const dim = (text) => paint(text, { dim: true });
  let letterAt = -Infinity;
  // Folded rows stand together; any other two blocks have one blank row between them.
  let last = null;
  const apart = (kind) => {
    const blank = last !== null && !(last === 'fold' && kind === 'fold') ? '\n' : '';
    last = kind;
    return blank;
  };
  const home = env.HOME && env.HOME !== '/' ? `${env.HOME.replace(/[\\/]$/, '')}` : null;
  /** Paths under the home folder start with `~`. */
  const short = (value) => (home ? String(value).replaceAll(`${home}/`, '~/').replaceAll(`${home}\\`, '~\\') : String(value));

  // Text on a gradient fill, one cell wider on each side: a round cap, or a cell of the fill.
  const filled = (text, stops) => {
    const size = cells(text) + 2;
    if (!round) return ramp(` ${text} `, stops, { onto: 'bg', bold: true });
    return paint(CAP_LEFT, { fg: stops[0] }) + ramp(text, stops, { onto: 'bg', bold: true, at: 1, of: size }) + paint(CAP_RIGHT, { fg: stops.at(-1) });
  };

  const frame = ({ tag = 'LIT', title, body, bad }) => {
    const w = width();
    const [tl, tr, bl, br, h, v] = sign.box;
    const edge = (text, at) => ramp(text, bad ? [RED, RED] : [PINK, VIOLET, CYAN], { at, of: w });
    const pill = depth === 'none' ? `[${tag}]` : filled(tag, [ORANGE, PINK]);
    const name = say(title);
    const fits = cells(pill) + cells(name) + 9 <= w;
    const head = ` ${pill} ${fits ? `${dim(say('·'))} ${bold(name)} ` : ''}`;
    const used = 2 + cells(head);
    const inside = fits ? body : [...wrap(name, w - 4).map(bold), ...body];
    return [
      ` ${edge(tl + h, 0)}${head}${edge(h.repeat(w - used - 1) + tr, used)}`,
      ...inside.map((row) => ` ${edge(v, 0)} ${pad(row, w - 4)} ${edge(v, w - 1)}`),
      ` ${edge(bl + h.repeat(w - 2) + br, 0)}`,
    ];
  };

  const marked = (mark) => paint(sign[mark], { fg: { done: GREEN, fail: RED, warn: AMBER, note: VIOLET, busy: PINK }[mark], bold: true });

  // A folded row's value starts in column 24; a long label, or a narrow window, puts it after one space.
  const rowLines = (mark, label, value) => {
    const lead = ` ${marked(mark)} `;
    const name = say(label);
    const room = cols() - 1;
    const wide = pad(lead + name, 3 + FOLD + 1);
    const start = cells(wide) + cells(say(value)) <= room || room - cells(wide) >= 24 ? wide : `${lead}${name} `;
    return wrap(say(value), Math.max(12, room - cells(start))).map((line, i) => (i ? ' '.repeat(cells(start)) : start) + bold(line));
  };

  /** One folded answer or step. */
  const row = (mark, label, value) => { stdout.write(`${apart('fold')}${rowLines(mark, label, value).join('\n')}\n`); };

  /** The LIT mark centred over the cards, as large as the window allows, then one dim line about the run. */
  const intro = (line) => {
    const most = rows() >= 48 ? 0 : rows() >= 34 ? 1 : 2;
    const size = SIZES.slice(most).find(([, min]) => width() >= min);
    const art = markRows({ cols: cols(), depth: colourDepth({ env, isTTY: true }), size: size?.[0] });
    const indent = ' '.repeat(Math.max(0, 1 + Math.floor((width() - Math.max(...art.map(cells))) / 2)));
    stdout.write(`\n${art.map((r) => indent + r).join('\n')}\n\n${wrap(say(short(line)), width()).map((l) => ` ${dim(l)}`).join('\n')}\n`);
    last = 'text';
  };

  const textLines = (heading, lines) => [
    ...wrap(say(heading), width()).map((l) => ` ${bold(l)}`),
    ...lines.flatMap((line) => (/^ {4}/.test(line) ? [` ${line}`] : wrap(say(line), width() - 2).map((l) => ` ${l}`))),
  ];
  /** Wrapped text under a heading. A command (four spaces in) stays on one line, so it can be copied. */
  const text = (heading, lines) => { stdout.write(`${apart('text')}${textLines(heading, lines).join('\n')}\n`); };

  /** One line that is never wrapped, so it can be found and copied whole. */
  const line = (words) => { stdout.write(`${apart('text')} ${bold(say(words))}\n`); };

  /** A finished card: sections of { head, rows: [{ mark, label, value }] }. Values wrap and are never cut. The first of `hints` that fits takes the empty top row. */
  const panel = ({ title, sections, bad = false, hints: lines = [] }) => {
    const markCells = 2;
    const labelCells = inner() < 56 ? 0 : LABEL;
    const body = sections.flatMap(({ head, rows: list }) => [
      '',
      ...(head ? [paint(head, { fg: bad ? RED : PINK, bold: true })] : []),
      ...list.flatMap(({ mark = 'done', label = '', value }) => {
        const lead = pad(marked(mark), Math.max(markCells, cells(marked(mark)) + 1));
        const loud = mark === 'warn' || mark === 'fail' ? bold : (line) => line;
        const name = say(label);
        if (label && !labelCells) return [...wrap(name, inner() - markCells).map((line, i) => (i ? ' '.repeat(markCells) : lead) + bold(line)), ...wrap(say(short(value)), inner() - markCells).map((line) => ' '.repeat(markCells) + loud(line))];
        const named = label ? lead + bold(name) : lead;
        const start = !label ? lead : cells(named) < markCells + labelCells ? pad(named, markCells + labelCells) : `${named} `;
        return wrap(say(short(value)), inner() - cells(start)).map((line, i) => (i ? ' '.repeat(cells(start)) : start) + loud(line));
      }),
    ]);
    const hint = lines.find((line) => cells(line) <= inner());
    if (hint) body[0] = dim(say(hint));
    stdout.write(`${apart('card')}${frame({ title, body, bad }).join('\n')}\n`);
  };

  /**
   * The work card: `steps` are [name, what it does]. next() starts a step, done() folds the card to one row, and fail()
   * leaves it on screen with the running step marked.
   */
  const work = (title, label, steps) => {
    let at = -1;
    let shown = 0;
    const joins = last === 'fold';
    const draw = (stopped = false) => {
      const list = steps.map(([name, what], i) => {
        const mark = i < at ? 'done' : i > at ? 'note' : stopped ? 'fail' : 'busy';
        const lead = `${pad(marked(mark), 2)}${mark === 'done' || mark === 'note' ? name : bold(name)}`;
        const start = pad(lead, 2 + (inner() < 56 ? Math.max(...steps.map(([n]) => cells(n))) + 2 : STEP));
        return cells(start) + cells(what) <= inner() ? start + (mark === 'note' || mark === 'done' ? dim(say(what)) : say(what)) : lead;
      });
      const lines = frame({ title, body: ['', ...list] });
      const lead = shown ? `${ESC}[${shown}A\r` : apart('card');
      shown = lines.length;
      stdout.write(`${lead}${lines.map((line) => `${line}${ESC}[K`).join('\n')}\n`);
    };
    return {
      next: () => {
        at += 1;
        draw();
      },
      fail: () => draw(true),
      done: () => {
        // The blank row over the card goes too when the row joins others.
        stdout.write(`${ESC}[${shown + (joins ? 1 : 0)}A\r${ESC}[J${rowLines('done', label, `${steps.length} of ${steps.length} checked`).join('\n')}\n`);
        last = 'fold';
      },
    };
  };

  const buttons = (yes, defaultYes, small) => {
    const ending = inner() >= 44 ? ' (default)' : ' default';
    const size = inner() >= 44 ? BUTTON : BUTTON - 2;
    const drawn = [true, false].map((value) => {
      const on = value === yes;
      const label = pad(`${on ? sign.pointer : ' '} ${value ? 'Yes' : 'No'}${value === defaultYes ? ending : ''}`, size);
      const plain = depth === 'none' || typed;
      if (small) return [on ? (depth === 'none' ? `[${label}]` : filled(label, [PINK, VIOLET])) : dim(` ${label} `)];
      const [tl, tr, bl, br, h, v] = on && plain ? sign.chosen : sign.box;
      const wide = size + 6;
      const line = (chars, at) => (on ? ramp(chars, [PINK, VIOLET], { at, of: wide, bold: plain }) : dim(chars));
      const face = !on ? ` ${label} ` : plain ? ` ${bold(label)} ` : filled(label, [PINK, VIOLET]);
      return [line(tl + h.repeat(wide - 2) + tr, 0), `${line(v, 0)} ${face} ${line(v, wide - 1)}`, line(bl + h.repeat(wide - 2) + br, 0)];
    });
    return drawn[0].map((left, i) => `${left}  ${drawn[1][i]}`);
  };

  const hints = (list) => list.reduce((lines, hint) => {
    const joined = lines.length ? `${lines.at(-1)}   ${hint}` : hint;
    return lines.length && cells(joined) > inner() ? [...lines, hint] : [...lines.slice(0, -1), joined];
  }, []).map(dim);

  // Roomy when the window allows, then tighter; the note and both buttons always stay.
  const question = ({ tag, title, note, list }, defaultYes, yes) => {
    const noteLines = wrap(say(note), inner());
    const enter = `Enter = ${yes ? 'Yes' : 'No'}`;
    const see = list ? [list.hint] : [];
    const keys = hints(['y / n answer', `${sign.arrows} switch`, enter, ...see, 'Ctrl+C stop']);
    const small = buttons(yes, defaultYes, true);
    const big = buttons(yes, defaultYes, false);
    const pair = cells(big[0]) <= inner() ? big : small;
    const heading = `${title} ${defaultYes ? '[Y/n]' : '[y/N]'}`;
    const drawn = [
      ['', ...noteLines, '', ...pair, '', ...keys],
      [...noteLines, '', ...pair, '', ...keys],
      [...noteLines, ...small, ...keys],
      [...noteLines, ...small, ...hints(['y / n', enter, ...see, 'Ctrl+C stop'])],
    ].map((body, i) => [...(i < 2 ? [''] : []), ...frame({ tag, title: heading, body })]);
    return drawn.find((list) => list.length < rows()) ?? drawn.at(-1).slice(-(rows() - 1));
  };

  /** Asks with a card: `card` is { tag, title, note, yes, no, list? }; `list` is { hint, heading, lines }, printed above
   * the card when the person types l. Ctrl+C and Ctrl+D throw, as they do at the plain prompt. */
  const ask = async (_plain, { defaultYes = false, card }) => {
    let yes = defaultYes;
    let shown = [];
    let held = false;
    const lift = (count) => (count ? `${ESC}[${count}A` : '');
    const draw = (over = shown.length) => {
      shown = question(card, defaultYes, yes);
      stdout.write(`${lift(over)}\r${shown.map((line) => `${line}${ESC}[K\r\n`).join('')}${ESC}[J`);
    };
    const wipe = () => `${lift(shown.length)}\r${ESC}[J`;
    const fold = (mark, value) => stdout.write(`${wipe()}${apart('fold')}${rowLines(mark, card.title, value).join('\n')}\n`);
    const showList = () => {
      stdout.write(`${wipe()}${apart('text')}${textLines(card.list.heading, card.list.lines).join('\n')}\n`);
      draw(0);
    };
    const take = () => {
      held = true;
      stdin.setRawMode(true);
      stdin.resume();
      stdout.write(`${ESC}[?25l`);
    };
    const give = () => {
      if (!held) return;
      held = false;
      stdout.write(`${ESC}[?25h`);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const undo = [];
    const on = (source, event, fn) => {
      source.on(event, fn);
      undo.push(() => source.removeListener(event, fn));
    };
    const release = () => {
      give();
      for (const fn of undo.splice(0)) fn();
    };

    take();
    on(proc, 'exit', give);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      on(proc, signal, () => {
        release();
        proc.kill(proc.pid, signal);
      });
    }
    try {
      const answer = await new Promise((resolve, reject) => {
        let ready = false;
        let settling;
        const stop = (reason) => {
          clearTimeout(settling);
          reject(new Error(reason));
        };
        const suspend = () => {
          stdout.write(`${ESC}[?25h`);
          stdin.setRawMode(false);
          proc.once('SIGCONT', () => {
            if (!held) return;
            stdin.setRawMode(true);
            stdout.write(`${ESC}[?25l`);
            draw(0);
          });
          proc.kill(0, 'SIGTSTP');
        };
        emitKeypressEvents(stdin);
        on(stdin, 'keypress', (ch, key = {}) => {
          if (key.ctrl && key.name === 'c') stop('Aborted with Ctrl+C');
          else if (!ready || key.meta || key.name === 'escape') return;
          else if (key.ctrl && key.name === 'd') stop('Aborted with Ctrl+D');
          else if (key.ctrl && key.name === 'z' && proc.platform !== 'win32') suspend();
          else if (key.ctrl) return;
          else if (key.name === 'return' || key.name === 'enter') {
            if (now() - letterAt >= HABIT_MS) resolve(yes);
          } else if (/^[yn]$/i.test(ch ?? '')) {
            letterAt = now();
            resolve(/y/i.test(ch));
          } else if (card.list && /^l$/i.test(ch ?? '')) showList();
          else if (['left', 'right', 'tab'].includes(key.name)) {
            yes = !yes;
            draw();
          }
        });
        on(stdin, 'end', () => stop('Aborted: the terminal closed'));
        on(stdout, 'resize', () => {
          // The old rows may have wrapped in the new width: step over what they take up now.
          if (ready) draw(Math.min(shown.reduce((sum, line) => sum + Math.max(1, Math.ceil(cells(line) / cols())), 0), rows() - 1));
        });
        settling = setTimeout(() => {
          ready = true;
          draw();
        }, settleMs);
      });
      fold('done', answer ? card.yes : card.no);
      return answer;
    } catch (err) {
      fold('fail', 'stopped');
      throw err;
    } finally {
      release();
    }
  };

  return { ask, row, text, line, panel, work, intro, short };
}
