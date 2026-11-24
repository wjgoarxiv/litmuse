// The cards a person at a terminal sees during `litmuse install` and `litmuse uninstall`: the questions, one row per
// finished step, and the closing panel. cardsFor() returns null for everything else (a pipe, CI, --yes, --dry-run,
// TERM=dumb, a small window, LITMUSE_AGENT_FILE), and then install and uninstall print their plain lines.
import { emitKeypressEvents } from 'node:readline';
import { colourDepth, sample } from './mark.mjs';
import { displayWidth } from '../plugin/lib/rewind/gauge.mjs';

const MIN_COLS = 40;
const MIN_ROWS = 12;
const MAX_CARD = 100;
const LABEL = 16;
// Keys already typed when a card appears are dropped, and so is the Enter that follows a y or n out of habit.
const SETTLE_MS = 30;
const HABIT_MS = 400;

const ESC = '\u001b';
const PINK = '#ff2d95';
const VIOLET = '#b48cff';
const CYAN = '#8be9fd';
const ORANGE = '#ff8f3c';
const GREEN = '#50e68c';
const AMBER = '#ffaf3c';
const RED = '#ff5577';
const INK = '#0b0e14';
const BASIC = { [PINK]: 95, [VIOLET]: 94, [CYAN]: 96, [ORANGE]: 93, [GREEN]: 92, [AMBER]: 93, [RED]: 91, [INK]: 30 };

const DRAWN = {
  box: ['╭', '╮', '╰', '╯', '─', '│'], chosen: ['╔', '╗', '╚', '╝', '═', '║'], done: '✓', fail: '✗', warn: '!', note: '·', pointer: '❯', arrows: '← →',
};
const TYPED = {
  box: ['+', '+', '+', '+', '-', '|'], chosen: ['#', '#', '#', '#', '=', '#'], done: 'ok', fail: 'x', warn: '!', note: '-', pointer: '>', arrows: 'Left Right',
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

  const frame = ({ tag = 'LIT', title, body, bad }) => {
    const w = width();
    const [tl, tr, bl, br, h, v] = sign.box;
    const edge = (text, at) => ramp(text, bad ? [RED, RED] : [PINK, VIOLET, CYAN], { at, of: w });
    const pill = depth === 'none' ? `[${tag}]` : ramp(` ${tag} `, [ORANGE, PINK], { onto: 'bg', bold: true });
    const name = say(title);
    const fits = cells(pill) + cells(name) + 8 <= w;
    const head = fits ? `${pill} ${bold(name)} ` : pill;
    const used = 2 + cells(head);
    const inside = fits ? body : [...wrap(name, w - 4).map(bold), ...body];
    return [
      ` ${edge(tl + h, 0)}${head}${edge(h.repeat(w - used - 1) + tr, used)}`,
      ...inside.map((row) => ` ${edge(v, 0)} ${pad(row, w - 4)} ${edge(v, w - 1)}`),
      ` ${edge(bl + h.repeat(w - 2) + br, 0)}`,
    ];
  };

  const marked = (mark) => paint(sign[mark], { fg: { done: GREEN, fail: RED, warn: AMBER, note: VIOLET }[mark], bold: true });

  const rowLines = (mark, label, value) => {
    const lead = ` ${pad(marked(mark), sign.done.length)} ${pad(say(label), LABEL)}`;
    return wrap(say(value), Math.max(12, cols() - 1 - cells(lead)))
      .map((line, i) => (i ? ' '.repeat(cells(lead)) : lead) + (mark === 'fail' || mark === 'warn' ? bold(line) : line));
  };

  /** One finished step. */
  const row = (mark, label, value) => { stdout.write(`${rowLines(mark, label, value).join('\n')}\n`); };

  /** Wrapped text under a heading. A command (four spaces in) stays on one line, so it can be copied. */
  const text = (heading, lines) => {
    stdout.write(`\n${wrap(` ${say(heading)}`, Math.min(MAX_CARD, cols() - 1)).map(bold).join('\n')}\n`);
    for (const line of lines) {
      stdout.write(`${/^ {4}/.test(line) ? line : wrap(say(line), Math.min(MAX_CARD, cols() - 1)).join('\n')}\n`);
    }
  };

  /** A finished card: sections of { head, rows: [{ mark, label, value }] }. Values wrap and are never cut. */
  const panel = ({ title, sections, bad = false }) => {
    const markCells = sign.done.length + 1;
    const labels = sections.flatMap((s) => s.rows.map((r) => cells(r.label ?? '')));
    const labelCells = inner() < 56 ? 0 : Math.max(0, ...labels) && Math.max(...labels) + 2;
    const body = sections.flatMap(({ head, rows: list }) => [
      '',
      ...(head ? [paint(head, { fg: bad ? RED : PINK, bold: true })] : []),
      ...list.flatMap(({ mark = 'done', label = '', value }) => {
        const lead = pad(marked(mark), markCells);
        const lines = wrap(say(value), inner() - markCells - labelCells);
        if (label && !labelCells) return [lead + bold(label), ...lines.map((line) => ' '.repeat(markCells) + line)];
        return lines.map((line, i) => (i ? ' '.repeat(markCells + labelCells) : lead + pad(label && bold(label), labelCells)) + line);
      }),
    ]);
    stdout.write(`\n${frame({ title, body, bad }).join('\n')}\n\n`);
  };

  const buttons = (yes, defaultYes, small) => {
    const ending = inner() >= 44 ? ' (default)' : ' default';
    const size = 5 + ending.length;
    const drawn = [true, false].map((value) => {
      const on = value === yes;
      const label = pad(`${on ? sign.pointer : ' '} ${value ? 'Yes' : 'No'}${value === defaultYes ? ending : ''}`, size);
      const face = (around) => ramp(around + label + around, [PINK, VIOLET], { onto: 'bg', bold: true });
      if (small) return [on ? (depth === 'none' ? `[${label}]` : face(' ')) : ` ${label} `];
      if (on && depth !== 'none' && !typed) {
        const lip = (ch) => ramp(ch.repeat(size + 4), [PINK, VIOLET]);
        return [lip('▄'), face('  '), lip('▀')];
      }
      const [tl, tr, bl, br, h, v] = on ? sign.chosen : sign.box;
      const line = on ? (t) => paint(t, { fg: PINK, bold: true }) : dim;
      return [line(tl + h.repeat(size + 2) + tr), `${line(v)} ${on ? bold(label) : label} ${line(v)}`, line(bl + h.repeat(size + 2) + br)];
    });
    return drawn[0].map((left, i) => `${left}  ${drawn[1][i]}`);
  };

  const hints = (list) => list.reduce((lines, hint) => {
    const joined = lines.length ? `${lines.at(-1)}   ${hint}` : hint;
    return lines.length && cells(joined) > inner() ? [...lines, hint] : [...lines.slice(0, -1), joined];
  }, []).map(dim);

  // Roomy when the window allows, then tighter; the note and both buttons always stay.
  const question = ({ tag, title, note }, defaultYes, yes) => {
    const noteLines = wrap(say(note), inner());
    const enter = `Enter = ${yes ? 'Yes' : 'No'}`;
    const keys = hints(['y / n answer', `${sign.arrows} switch`, enter, 'Ctrl+C stop']);
    const small = buttons(yes, defaultYes, true);
    const big = buttons(yes, defaultYes, false);
    const pair = cells(big[0]) <= inner() ? big : small;
    const heading = `${title} ${defaultYes ? '[Y/n]' : '[y/N]'}`;
    const drawn = [
      ['', ...noteLines, '', ...pair, '', ...keys],
      [...noteLines, '', ...pair, '', ...keys],
      [...noteLines, ...small, ...keys],
      [...noteLines, ...small, ...hints(['y / n', enter, 'Ctrl+C stop'])],
    ].map((body, i) => [...(i < 2 ? [''] : []), ...frame({ tag, title: heading, body })]);
    return drawn.find((list) => list.length < rows()) ?? drawn.at(-1).slice(-(rows() - 1));
  };

  /** Asks with a card: `card` is { tag, title, note, yes, no }. Ctrl+C and Ctrl+D throw, as they do at the plain prompt. */
  const ask = async (_plain, { defaultYes = false, card }) => {
    let yes = defaultYes;
    let shown = [];
    let held = false;
    const lift = (count) => (count ? `${ESC}[${count}A` : '');
    const draw = (over = shown.length) => {
      shown = question(card, defaultYes, yes);
      stdout.write(`${lift(over)}\r${shown.map((line) => `${line}${ESC}[K\r\n`).join('')}${ESC}[J`);
    };
    const fold = (mark, value) => stdout.write(`${lift(shown.length)}\r${ESC}[J${rowLines(mark, card.title, value).join('\n')}\n`);
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
          } else if (['left', 'right', 'tab'].includes(key.name)) {
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

  return { ask, row, text, panel };
}
