# Kit API

All helpers live under `scripts/lib/` and load by relative import from the build script.
Import the kit root and construct sheets, figures, and views from it.

`createSheet(opts)` returns a sheet with A-series size, zone frame, and title block. Options:
`size` (A3 default), `plant`, `unit`, `sheetNo`, `rev`. Methods: `add(symbol)`,
`pipe(from, to, opts)`, `signal(from, to, kind)`, `inline(line, item)`, `equipmentInfo(tag,
info)`.

P&ID sheet methods that place parts (coordinates in sheet mm):
- `pipe(points, { cls, number, at })` routes orthogonally; `number` rides above a horizontal run
  or, rotated, 8 mm right of a vertical one, `at` along the longest segment.
- `arrow(x, y, clear = true, dir = 'right')` draws an open flow chevron with its tip at
  (x, y); `dir` is `right`, `left`, `up` or `down` and must match the flow on that run.
- `valve(body, actuator, id, x, y, fail = 'FC', orient = 'h', tagSide = 'left')`: with
  `orient: 'v'` the actuator points right and the tag goes beside the pipe, left by default or
  right of the actuator with `tagSide: 'right'`.
- `strainer(id, x, y, orient = 'h', tagSide = 'left')`: same rule on a vertical pipe.
- `psv(tag, x, y, set, { outlet = 'right', inlet })`: angle body, spring opposite the inlet,
  tag opposite the outlet; inlet and outlet pipes connect 10 from the center.
- `instrument(tag, x, y, { dcs })`: the bubble holds the tag (letters over number); no side tag.
- `pump(tag, x, y, side)`, `tank(tag, x, y, side)` (side `below` or `right`; its roof nozzle top is `y - 46`), `orifice`, `offpage(label, x, y, dir, w)`, `drain`, `vent`,
  `signal(points, kind)`, `hop`, `callout`, `notes`, `legend()`, `toSVG()`.

`createFigure(opts)` returns a journal figure with column width (`85`, `120`, `178`).
`panel.canvas()` opens a 2D panel; `panel.iso(view)` opens a 3D panel with the isometric
camera. `fig.key(roles, at)` draws the stream key. `stream({ role })` colours a stream from
the safe set.

`createIsoView(opts)` returns an isometric scene. `lathe(profile, opts)` turns a profile;
`box(w, h, d)` and `prism(points)` place flat parts; `pipe(points, r)` routes piping;
`cut(window, { into })` opens a window revealing named internals; `callout({ part, text })`
places a callout; `group(name, parts)` names an assembly for pages and films.

`createLegendSheet(symbols)` builds the legend sheet from the drawn set. `parseLineNumber(s)`
parses a line number through the grammar. `isaTag(letters)` validates tag letter order.
`material(name)` resolves a MATERIAL tone to fill and stroke.

Router: orthogonal runs with waypoint hints (`via: [[x, y]]`). Unroutable lines throw with the
reason and the blocked span. Exports: the build script writes `drawing.svg`; the render script
derives PNG and PDF.
