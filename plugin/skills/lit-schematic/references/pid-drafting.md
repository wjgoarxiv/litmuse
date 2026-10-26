# P&ID drafting

Sheet: ISO A-series with a zone frame, a title block (plant, unit, sheet number, revision,
drawn/checked dates), an equipment header per tagged vessel, and a legend built from the drawn
set. The legend covers every symbol the sheet uses; the gate checks coverage.

Routing: orthogonal runs with the kit router. Feed enters left, products leave right. Mains run
horizontally with vertical drops to equipment. Signal lines run in reserved lanes clear of
process piping. A line that cannot route throws with the reason; move a symbol or add
waypoints, and route around symbols.

Inline items (valves, filters, flow elements, reducers) sit on the line through `sheet.inline`.
Branches leave through `line.tap` at straight runs. Asked-for flow arrows slide along open
pipe to clear spans; a span shorter than 30 mm takes a warn flag.

Line hops: arcs of radius 2 mm or less mark crossings; larger arcs read as bends and fail the
bend check. Leaders keep 1.2 mm at print size between leaders and between leaders and dots,
ordered by violation count then total length, opening a blank row up or down where needed.

Control loops: each loop shows its measurement tap, transmitter, controller function, and final
element. Cascade loops draw set-point signals between controllers. Relief devices show set
pressure and a discharge destination; a path awaiting a destination appears in the reply as an
open engineering question.

Review order: lines through symbols, crossings and hops, labels on lines, leader dots on the
wrong face, painter order, nozzles on removed shell, empty regions calling for parts.
