# Verification

QA codes (`qa.mjs --codes` lists all): TITLEBLOCK.FIELDS, LEGEND.COVERAGE, TAG.ORDER,
LINE.NUMBER, LINE.WEIGHT, LINE.ARROW_IN_SYMBOL, LINE.BEND_ON_LINE, LEADER.SPACING,
LABEL.CLEARANCE, EXPORT.DPI, EXPORT.PDF_SIZE.

Fixes: TITLEBLOCK gains the missing fields in the build. LEGEND rebuilds from the drawn set
through `createLegendSheet`. TAG reorders letters per `references/pid-symbols.md`.
LINE.NUMBER parses through the line grammar. LINE.WEIGHT remaps roles to 0.7/0.5/0.35/0.18.
Arrows slide to open pipe. Hop arcs shrink to 2 mm or less. Leaders respread per
`references/pid-drafting.md`. Labels move clear of lines and art.

Render loop: build, QA, render PNG, read the PNG, sweep dense sheets in a 3x2 tile, fix in
the build, rebuild. Rebuilds stay byte-identical for unchanged inputs.

Close-up sweep order: lines through symbols, crossings and hops, labels on lines, leader dots
on the wrong face, painter order, nozzles on removed shell, empty regions calling for parts.

Raster guard: the renderer caps output at 80 Mpx, renders a small reference of the same page,
compares ink across 36 regions, steps the dpi down until each inked region paints, prints the
dpi used, and halts with `RENDER_INCOMPLETE` when regions stay blank.

Review checklist: open engineering questions listed, invented values labelled, exports at size,
page console clean, motion seam matching, PDF vector.
