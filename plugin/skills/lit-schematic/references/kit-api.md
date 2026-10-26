# Kit API

All helpers live under `scripts/lib/` and load by relative import from the build script.
Import the kit root and construct sheets, figures, and views from it.

`createSheet(opts)` returns a sheet with A-series size, zone frame, and title block. Options:
`size` (A3 default), `plant`, `unit`, `sheetNo`, `rev`. Methods: `add(symbol)`,
`pipe(from, to, opts)`, `signal(from, to, kind)`, `inline(line, item)`, `equipmentInfo(tag,
info)`.

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
