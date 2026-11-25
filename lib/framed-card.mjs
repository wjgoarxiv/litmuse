// The status card as a framed card: title edge, stage map, task, threads and lanes, skills, and the context on the
// bottom edge, with the sunset in the cells no text uses. composeCard() lays one state out as rows of cells and returns
// a painter for any moment; every row is exactly `width` cells. Parts without data are left out.
import { displayWidth } from '../plugin/lib/rewind/gauge.mjs';
import { REVIEW_LANES } from '../plugin/hooks/lib/workflow-stack.mjs';
import { CAP_LEFT, CAP_RIGHT } from './glyphs.mjs';
import { sample } from './mark.mjs';
import { REVIEW_LANE_LABELS, burstOf, waitingOf } from './stage-card.mjs';
import { FAINT, SUN_ROWS, SUN_W, ink, mix, neon, paint, place } from './sunset.mjs';

const WHITE = '#e6edf3';
const DIM = '#7d8590';
const RAIL = '#46505c';
const TRACK = '#2a2340';
const MUTED = '#2d333b';
const MUTED_TEXT = '#adb5bf';
const DARK = '#0b0e14';
const ACCENT = '#8be9fd';
const VIOLET = '#b48cff';
const PINK = '#ff2d8a';
const ORANGE = '#ff8f3c';
const WARM = '#ff7a45';
const GREEN = '#6bdb8f';
const AMBER = '#ffaf3c';
const RED = '#ff5f6b';
const BRAND = ['#ffa033', '#ff6a55', '#ff3388'];
const RAINBOW = ['#ff6b6b', '#ffaf5f', '#ffff87', '#87ff9f', '#87d7ff', '#af87ff', '#ff87d7', '#ff6b6b'];
export const STAGES = {
  main: ['interview', 'plan', 'work', 'review', 'done'],
  loop: ['PIN', 'RED', 'GREEN', 'VERIFY', 'REVIEW', 'RECORD'],
  research: ['decompose', 'wave', 'expand', 'verify', 'synthesis'],
};
const UNIT = { main: 'task', loop: 'criterion', research: 'wave' };
const MAX_BODY = 40;

// Text as cells: one entry per cell, `''` for the second half of a wide character. Controls, joiners and variation
// selectors are dropped, so a row is as wide as it counts.
const WIDE = /\p{Emoji_Presentation}/u;
export function say(text, style = {}) {
  const out = [];
  for (const ch of String(text ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Co}︀-️]|\p{Regional_Indicator}/gu, '')) {
    const cells = Math.max(displayWidth(ch), WIDE.test(ch) ? 2 : 0);
    if (cells === 0) continue;
    out.push({ ch, ...style });
    if (cells === 2) out.push({ ch: '', ...style });
  }
  return out;
}

const gap = (n) => new Array(Math.max(0, n)).fill(null);
// Cuts to `width` cells, ending in `…` when anything was lost; a wide character is never split.
function cut(cells, width) {
  if (cells.length <= width) return cells;
  if (width <= 0) return [];
  let end = width - 1;
  if (cells[end]?.ch === '') end -= 1;
  return [...cells.slice(0, end), { ch: '…', fg: DIM }, ...gap(width - end - 1)];
}
const spread = (left, right, width) => {
  if (!right.length) return cut(left, width);
  const room = width - right.length - 2;
  if (room < 12) return cut(left, width);
  const kept = cut(left, room);
  return [...kept, ...gap(width - kept.length - right.length), ...right];
};
const dot = () => say(' · ', { fg: DIM });
const joined = (parts) => parts.filter((p) => p?.length).flatMap((p, i) => (i ? [...dot(), ...p] : p));

// A pill: round caps in the fill, or a cell of the fill on each side.
function pill(text, stops, round, { fg = DARK, bold = true, light = null } = {}) {
  const inner = say(text, { fg, bold });
  const last = Math.max(1, inner.length - 1);
  const fill = (i) => {
    const hue = sample(stops.length > 1 ? stops : [stops[0], stops[0]], Math.min(1, Math.max(0, i) / last));
    const near = light === null ? 1 : Math.abs(i / last - light);
    return near < 0.2 ? mix(hue, '#ffffff', (1 - near / 0.2) * 0.6) : hue;
  };
  const body = inner.map((cell, i) => ({ ...cell, bg: fill(cell.ch === '' ? i - 1 : i) }));
  return round
    ? [{ ch: CAP_LEFT, fg: fill(0) }, ...body, { ch: CAP_RIGHT, fg: fill(last) }]
    : [{ ch: ' ', bg: fill(0) }, ...body, { ch: ' ', bg: fill(last) }];
}

// A gauge of `size` cells, ends included, on one smooth track.
function bar(done, total, size, stops, round) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = done <= 0 ? 0 : ratio === 1 ? size : Math.min(size - 1, Math.max(1, Math.round(ratio * size)));
  const tint = (i) => (i < filled ? sample(stops, size > 1 ? i / (size - 1) : 0) : TRACK);
  return Array.from({ length: size }, (_, i) => {
    if (round && i === 0) return { ch: CAP_LEFT, fg: tint(0) };
    if (round && i === size - 1) return { ch: CAP_RIGHT, fg: tint(i) };
    return { ch: ' ', bg: tint(i) };
  });
}
const pulse = (size, t, offset) => {
  const head = t === null ? -1 : Math.floor((((t / 1.4 + offset) % 1) + 1) % 1 * size);
  return Array.from({ length: size }, (_, i) => ({ ch: '━', fg: i === head ? '#d7dde4' : RAIL }));
};
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const two = (n) => String(n).padStart(2, '0');
  return m < 60 ? `${m}:${two(s % 60)}` : `${Math.floor(m / 60)}:${two(m % 60)}:${two(s % 60)}`;
};
const tokens = (n) => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}m` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const fraction = (done, total) => [...say(done, { fg: WHITE, bold: true }), ...say(`/${total}`, { fg: DIM })];

/** The state the whole card takes: its word, its colours and its light. */
export function cardState(card, facts, working) {
  const done = burstOf(card, card.now ?? Date.now()) !== null;
  const failed = (card.lanes ?? []).some((lane) => lane.status === 'failed');
  const tight = (facts.ctx?.percent ?? 0) >= 85;
  if (!card.active) return done ? { id: 'done' } : card.idle ? { id: 'idle', dim: true } : { id: 'ready', dim: true };
  if (done) return { id: 'done' };
  if (failed) return { id: 'error', look: 'turn' };
  if (waitingOf(card)) return { id: 'turn', look: 'turn' };
  if (tight) return { id: 'warning', look: 'turn' };
  if (card.route === 'lit-adhd') return { id: 'rewind', look: 'rainbow' };
  if (card.route === 'review-work') return { id: 'review' };
  return { id: working ? 'working' : 'rest', dim: false };
}

export function composeCard(card, facts, { width, round, working = false, version }) {
  const state = cardState(card, facts, working);
  const { id } = state;
  const inner = width - 4;
  const frames = facts.frames ?? [];
  const frame = frames.findLast((f) => f.status === 'active') ?? frames.at(-1) ?? null;
  const stages = STAGES[frame?.family] ?? null;
  const at = stages ? stages.indexOf(frame.stage) : -1;
  const allDone = id === 'done' && card.active;
  const verdicts = frame?.skill === 'review-work' ? frame.verdicts ?? {} : null;
  const reported = verdicts ? REVIEW_LANES.filter(({ id: lane }) => ['pass', 'fail'].includes(verdicts[lane])).length : 0;
  const lanes = card.lanes ?? [];
  const running = lanes.filter((l) => l.status === 'running');
  const rows = card.threads?.rows ?? [];
  const accent = { turn: AMBER, warning: AMBER, error: RED, done: GREEN }[id] ?? ACCENT;
  const breath = (t) => (t === null ? 0 : 0.5 + 0.5 * Math.sin((t / 2.4) * Math.PI * 2));
  const turning = (k, t) => sample(RAINBOW, (((k + (t ?? 0) / 4.8) % 1) + 1) % 1);

  const title = card.active ? [...new Set([...frames.map((f) => f.skill).filter(Boolean), ...(frames.length ? [] : [card.route])])].join(' › ') || card.route : id === 'done' ? 'done' : id === 'idle' && frame ? frame.skill : 'ready';
  const word = {
    ready: 'READY', idle: 'idle', done: 'DONE ✓', error: 'LANE FAILED ✗', turn: 'YOUR TURN', warning: 'CONTEXT', rewind: 'REWIND <<',
    review: `REVIEW ${reported}/${REVIEW_LANES.length}`,
  }[id] ?? (frame?.stage ? frame.stage.toUpperCase() : 'LIVE');

  const brand = (t) => (state.dim
    ? pill('🔥 LIT', BRAND.map((c) => mix(c, MUTED, 0.25)), round)
    : pill('🔥 LIT', id === 'rewind' ? [0, 0.2, 0.4].map((k) => mix(turning(k, t), '#ffffff', 0.25)) : id === 'turn' ? [ORANGE, AMBER] : BRAND.map((c) => mix(c, '#ffffff', 0.2 * breath(t))), round));

  const stateCells = (t) => {
    if (id === 'rewind') return [...word].flatMap((ch, i) => say(ch, { fg: mix(turning(i / 9, t), '#ffffff', 0.35), bold: true }));
    if (state.dim) return say(id === 'ready' ? 'READY ○' : word, { fg: DIM });
    const hue = mix(accent, '#ffffff', 0.35 * breath(t));
    const tail = ['done', 'error'].includes(id) ? '' : id === 'rest' ? ' ○' : ' ●';
    return [...say(word, { fg: accent, bold: true }), ...say(tail, { fg: hue })];
  };

  // Stage map: done stages and the rail behind are warm, the current stage is a pill, the rest is dim.
  const count = frame && Number.isInteger(frame.n) && Number.isInteger(frame.total) ? { done: frame.n, total: frame.total, unit: frame.skill === 'review-work' ? 'lane' : frame.unit ?? UNIT[frame.family] } : null;
  const mapCells = (t) => {
    if (!stages || at < 0) return null;
    const stops = [ORANGE, PINK, accent];
    const tone = (k) => sample(stops, Math.min(1, k / Math.max(1, stages.length - 1)));
    const build = ({ rail, short, near }) => stages.flatMap((stage, i) => {
      if (near && Math.abs(i - at) > 1) return [];
      const label = short ? stage.slice(0, 3) : stage;
      const first = near ? i === Math.max(0, at - 1) : i === 0;
      const isDone = i < at || allDone;
      const lead = first ? [] : rail === 0 ? gap(1) : [...gap(1), ...Array.from({ length: rail }, (_, k) => {
        if (i <= at || allDone) return { ch: '━', fg: tone(i - 1 + (k + 0.5) / rail) };
        if (i === at + 1) return { ch: '━', fg: t !== null && Math.floor(t / 0.35) % rail === k ? '#d7dde4' : RAIL };
        return { ch: '─', fg: RAIL };
      }), ...gap(1)];
      if (i === at && !allDone) {
        const light = t === null || id === 'turn' ? null : ((t % 2.4) / 1.2) - 0.2;
        const stop = id === 'turn' || id === 'warning' ? [mix(AMBER, '#ffffff', 0.2), AMBER] : id === 'error' ? ['#ff9aa2', RED] : [VIOLET, accent];
        return [...lead, ...(state.dim ? pill(label, [MUTED], round, { fg: MUTED_TEXT }) : pill(label, stop, round, { light }))];
      }
      return [...lead, ...say(label, { fg: isDone ? tone(i) : DIM, bold: false }), ...gap(1), ...say(isDone ? '✓' : '·', { fg: isDone ? WARM : DIM })];
    });
    const forms = [{ rail: 2 }, { rail: 1 }, { rail: 0 }, { rail: 0, short: true }, { rail: 0, short: true, near: true }].map(build);
    const room = inner - (running.length ? 18 : 0);
    return forms.find((form) => form.length <= room) ?? forms.find((form) => form.length <= inner) ?? forms.at(-1);
  };

  const laneCells = (t) => {
    if (!running.length) return [];
    const dots = running.slice(0, 4).flatMap((_, i) => {
      const walk = t === null ? 0 : Math.max(0, 1 - Math.abs(((t / 1.6) % 1) * (Math.min(4, running.length) + 1) - 0.5 - i));
      return say('●', { fg: mix(GREEN, '#ffffff', 0.7 * walk) });
    });
    const longest = Math.max(...running.map((l) => l.elapsedMs));
    return [...dots, ...gap(1), ...say(running.length, { fg: WHITE, bold: true }), ...say(` ${running.length === 1 ? 'lane' : 'lanes'} ${clock(longest)}`, { fg: DIM })];
  };
  const toolCells = () => {
    const { tool } = facts;
    if (!tool) return [];
    return [...say(tool.ok ? '✓ ' : '✗ ', { fg: tool.ok ? GREEN : RED, bold: true }), ...say(tool.name, { fg: tool.ok ? WHITE : RED, bold: true }), ...say(` · ${clock(tool.ms)} ago`, { fg: DIM })];
  };

  // The task lines: the plan, then the goal, each with its gauge and what is next.
  const tasks = [];
  const nextUp = (text) => [...say('next ▸ ', { fg: DIM }), ...say(text, { fg: WHITE })];
  const meter = (done, total) => bar(done, total, Math.max(6, Math.min(8, total) + 2), done >= total ? [GREEN, GREEN] : [ORANGE, PINK], round);
  if (card.plan) {
    const { done, total, next } = card.plan;
    tasks.push(joined([
      [...say('task ', { fg: DIM }), ...fraction(done, total), ...gap(1), ...meter(done, total)],
      next ? nextUp(`${next.row}. ${next.text}`) : say('every row ticked', { fg: GREEN }),
    ]));
  } else if (count && !card.goal) {
    tasks.push([...say(`${count.unit} `, { fg: DIM }), ...fraction(count.done, count.total), ...gap(1), ...meter(count.done, count.total)]);
  }
  if (card.goal) {
    const { met, total, objective, open } = card.goal;
    tasks.push(joined([
      [...say('criterion ', { fg: DIM }), ...fraction(met, total), ...gap(1), ...meter(met, total)],
      open.length ? nextUp(`${open[0].id} ${open[0].text}`) : say(objective, { fg: GREEN }),
    ]));
  }
  if (id === 'ready' && !tasks.length) tasks.push(joined([say('no active route in this workspace', { fg: DIM }), [...say('type ', { fg: DIM }), ...say('lit', { fg: ACCENT, bold: true }), ...say(' and what you want', { fg: DIM })]]));
  if (id === 'idle') tasks.push([...say('back? type ', { fg: DIM }), ...say('lit adhd', { fg: ACCENT, bold: true }), ...say(' to catch up', { fg: DIM })]);

  // Thread and lane rows share one name column and one gauge column.
  const list = [];
  for (const row of rows) {
    const own = !row.sibling;
    const [, done, total] = /(\d+)\/(\d+)$/.exec(row.gauge ?? '') ?? [];
    const finished = allDone && own;
    list.push({
      name: row.pane ? `${row.skill} · ${row.pane}` : row.skill, stage: row.stage, bold: own && row.status === 'active',
      mark: finished || row.status === 'done' ? ['✓', GREEN] : row.status === 'paused' ? ['‖', AMBER] : row.status === 'idle' ? ['-', DIM] : ['●', GREEN],
      word: finished ? 'done' : row.status === 'active' ? 'running' : row.status,
      count: total ? { done: Number(done), total: Number(total) } : null,
      moving: ['active', 'running'].includes(row.status) && !finished,
      note: own || row.pane ? '' : `other session ${String(row.session).slice(0, 8)}`,
      own,
    });
  }
  const laneRows = lanes.map((lane) => ({
    name: String(lane.type).replace(/^litmuse\//, ''), stage: null, bold: lane.status === 'running', lane: true,
    mark: lane.status === 'running' ? ['●', GREEN] : lane.status === 'failed' ? ['✗', RED] : ['✓', GREEN],
    word: lane.status === 'running' ? 'running' : lane.status, time: clock(lane.elapsedMs), moving: lane.status === 'running', count: null, note: '',
  }));
  const shownLanes = laneRows.filter((l) => l.moving || l.word === 'failed').concat(laneRows.filter((l) => !l.moving && l.word !== 'failed')).slice(0, 8);
  const order = [...list.filter((l) => l.own)];
  if (shownLanes.length >= 2) order.push({ fork: `┬ ${running.length >= 2 ? `${running.length} lanes in parallel` : `${shownLanes.length} lanes`}${laneRows.length > 8 ? ` · +${laneRows.length - 8} more` : ''}` });
  shownLanes.forEach((lane, i) => order.push({ ...lane, lead: `${i === shownLanes.length - 1 ? '└─' : '├─'} ` }));
  order.push(...list.filter((l) => !l.own));
  const widest = (pick) => Math.max(0, ...order.filter((l) => !l.fork).map(pick));
  const nameCol = Math.min(inner >= 90 ? 30 : 22, widest((l) => (l.lead ? 3 : 0) + 2 + say(l.name).length));
  const stageCol = Math.min(10, widest((l) => (l.stage ? say(l.stage).length : 0)));
  const barCol = 7;
  const countCol = widest((l) => (l.count ? `${l.count.done}/${l.count.total}`.length : 0));
  const threadCells = (l, i, t) => {
    if (l.fork) return say(l.fork, { fg: DIM });
    const hue = l.mark[1];
    const name = cut([...say(l.lead ?? '', { fg: DIM }), ...say(`${l.mark[0]} `, { fg: hue }), ...say(l.name, { fg: l.bold ? WHITE : MUTED_TEXT, bold: l.bold })], nameCol);
    const stage = cut(say(l.stage ?? '', { fg: DIM }), stageCol);
    const gauge = l.count ? bar(l.count.done, l.count.total, barCol, [mix(hue, '#ffffff', 0.05), mix(hue, '#ffffff', 0.25)], round) : l.moving ? pulse(barCol, t, i * 0.17) : [];
    const cells = [...name, ...gap(nameCol - name.length + 1)];
    if (stageCol) cells.push(...stage, ...gap(stageCol - stage.length + 1));
    cells.push(...gauge, ...gap(barCol - gauge.length + 1));
    const numbers = l.count ? fraction(l.count.done, l.count.total) : [];
    if (countCol) cells.push(...numbers, ...gap(countCol - numbers.length + 1));
    cells.push(...say(l.word, { fg: hue }));
    if (l.time) cells.push(...gap(1), ...say(l.time, { fg: DIM }));
    if (l.note) cells.push(...dot(), ...say(l.note, { fg: DIM }));
    // The gaps between columns belong to the row: no star falls into them.
    return cells.map((cell) => cell ?? { ch: ' ' });
  };

  const verdictCells = verdicts && REVIEW_LANES.flatMap(({ id: lane }, i) => {
    const mark = { pass: ['✓', GREEN], fail: ['✗', RED], running: ['●', AMBER], pending: ['·', DIM] }[verdicts[lane]] ?? ['·', DIM];
    return [...(i ? gap(2) : []), ...say(`${REVIEW_LANE_LABELS[lane]} `, { fg: mark[1] === DIM ? DIM : WHITE }), ...say(mark[0], { fg: mark[1], bold: true })];
  });
  const chips = (t) => {
    if (!facts.skills.length) return null;
    const light = t === null || state.dim ? null : ((t % 2.4) / 1.2) - 0.2;
    return [...say('skills ', { fg: DIM }), ...facts.skills.flatMap((skill, i) => [...(i ? gap(1) : []), ...(i === 0
      ? pill(`⚡ ${skill}`, [VIOLET, accent], round, { light })
      : pill(`· ${skill}`, [MUTED], round, { fg: MUTED_TEXT, bold: false }))])];
  };

  const bodyAt = (t) => {
    const body = [];
    const map = mapCells(t);
    const laneSide = laneCells(t);
    const toolSide = toolCells();
    const sides = [laneSide, toolSide].filter((s) => s.length);
    if (map) body.push(spread(map, laneSide, inner));
    const branch = (i, n) => say(`${i === n - 1 ? '└' : '├'} `, { fg: DIM });
    const lines = [...tasks, ...(verdictCells ? [verdictCells] : [])];
    lines.forEach((cells, i) => {
      const side = i === 0 ? (map ? toolSide : sides.flat().length ? joined(sides) : []) : [];
      body.push(spread([...branch(i, lines.length), ...cells], side, inner));
    });
    if (!lines.length && toolSide.length) body.push(spread(say('└', { fg: DIM }), toolSide, inner));
    if (card.restartTo) body.push(cut([...say('↻ ', { fg: AMBER, bold: true }), ...say(`restart to ${card.restartTo}`, { fg: AMBER, bold: true }), ...say(' · LitMuse was updated after this session loaded it', { fg: DIM })], inner));
    order.forEach((l, i) => body.push(cut(threadCells(l, i, t), inner)));
    if (card.threads?.omitted) body.push(say(`+${card.threads.omitted} more`, { fg: DIM }));
    const skills = chips(t);
    if (skills) body.push(cut(skills, inner));
    return body.slice(0, MAX_BODY).map((cells) => [...cells, ...gap(inner - cells.length)]);
  };

  const ctxCells = () => {
    const { ctx } = facts;
    if (!ctx) return [];
    const label = say('ctx ', { fg: DIM });
    if (ctx.percent === null) return [...label, ...say(`~${tokens(ctx.used)}`, { fg: ACCENT, bold: true })];
    const hue = ctx.percent >= 85 ? RED : ctx.percent >= 70 ? AMBER : ACCENT;
    return [...label, ...say(`~${ctx.percent}%`, { fg: hue, bold: true }), ...gap(1), ...bar(ctx.percent, 100, 7, ctx.percent >= 85 ? [AMBER, RED] : [VIOLET, VIOLET], round)];
  };
  const footLeft = joined([ctxCells(), facts.branch ? [...say('⎇ ', { fg: DIM }), ...say(facts.branch, { fg: ACCENT })] : [], card.plan ? say(card.plan.file.replace(/^plans\//, ''), { fg: MUTED_TEXT }) : []]);
  const footRight = joined([card.activeMs !== null && card.activeMs !== undefined ? [...say('active ', { fg: DIM }), ...say(clock(card.activeMs), { fg: MUTED_TEXT })] : [], say(`v${version}`, { fg: DIM })]);

  // Height is free, so a body with no room for the sun grows a little sky under it. The layout is the resting body's;
  // what moves keeps its cells.
  const base = bodyAt(null);
  while (base.length < SUN_ROWS) base.push(gap(inner));
  let spot = place(base, inner);
  for (let n = 0; n < SUN_ROWS && spot.top === null; n += 1) {
    base.push(gap(inner));
    spot = place(base, inner);
  }
  const height = base.length;
  const sunMid = 2 + spot.at + SUN_W / 2;
  const underSun = spot.top !== null && spot.sea === height - 1;

  const edgeHue = (x, y, t) => {
    const k = Math.floor(x / 4) * 4;
    let hue = id === 'rewind' ? turning(k / width + y * 0.04, t) : id === 'turn' || id === 'warning' ? mix(AMBER, mix(AMBER, FAINT, 0.5), t === null ? 0 : 1 - breath(t)) : id === 'error' ? mix(RED, AMBER, 0.2) : neon(Math.min(1, k / (width - 4)));
    if (!['turn', 'warning', 'error'].includes(id)) hue = mix(hue, '#ffffff', 0.3 * breath(t));
    if (y === 2 && underSun) {
      const far = Math.abs(k - sunMid);
      const near = Math.max(0, 1 - far / 26);
      hue = mix(hue, near > 0.6 ? '#ffd24a' : ORANGE, Math.min(1, near * (0.45 + 0.85 * (0.5 + 0.5 * Math.sin(far * 0.55 - (t ?? 0) * 2.6)))));
    }
    return state.dim ? mix(hue, FAINT, 0.45) : hue;
  };
  // `╭─ left ──── right ─╮`, the right part dropped first, then the left part cut.
  const edgeRow = ([open, close], left, right, y, t) => {
    const rule = (x, ch) => ({ ch, fg: edgeHue(x, y, t) });
    const room = width - 6;
    const keepRight = right.length && left.length + right.length + 5 <= room ? right : [];
    const keepLeft = cut(left, keepRight.length ? left.length : room - 1);
    const cells = [rule(0, open), rule(1, '─'), null, ...keepLeft, ...(keepLeft.length ? [null] : [])];
    const tail = keepRight.length ? [null, ...keepRight, null] : [];
    for (let x = cells.length; x < width - 2 - tail.length; x += 1) cells.push(rule(x, '─'));
    return [...cells, ...tail, rule(width - 2, '─'), rule(width - 1, close)];
  };
  const head = (t) => [...brand(t), ...dot(), ...say(title, state.dim ? { fg: DIM } : { fg: accent, bold: true })];

  const light = { look: state.look ?? 'sunset', dim: Boolean(state.dim) };
  return {
    state: id,
    height: height + 2,
    grid: (t) => {
      const body = t === null ? base.map((r) => [...r]) : bodyAt(t);
      while (body.length < height) body.push(gap(inner));
      const scene = paint(spot, { ...light, t });
      const wall = (x, t2) => ({ ch: '│', fg: edgeHue(x, 1, t2) });
      return [
        edgeRow(['╭', '╮'], head(t), stateCells(t), 0, t),
        ...body.map((cells, r) => {
          const over = scene.get(r);
          const row = over ? cells.map((cell, x) => cell ?? over[x]) : cells;
          return [wall(0, t), null, ...row, null, wall(width - 1, t)];
        }),
        edgeRow(['╰', '╯'], footLeft, footRight, 2, t),
      ];
    },
  };
}

/** Rows of cells as text; the right wall is placed by column, so a character drawn wider than expected bends nothing. */
export const cardLines = (grid, width) => grid.map((row) => `${ink(row.slice(0, -1).filter((c) => c === null || c.ch !== ''))}\u001b[${width}G${ink(row.slice(-1))}`);
