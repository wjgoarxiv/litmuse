# P&ID symbols

ISA-5.1 letters name every instrument: first letter the measured variable (F flow, L level,
P pressure, T temperature), succeeding letters the function (I indicate, C control, T transmit,
V valve). Tag order follows the letter table; the QA gate flags letter-order breaks.

Bubbles carry function plus location: a plain circle for field instruments, a horizontal bar
for panel-board mounting, a dashed outline for computer-resident functions. The bubble itself
is the tag: letters on the upper line, loop number on the lower. `sheet.instrument` prints no
second copy beside it; its old `tag` placement option is accepted and ignored.

Line types: process lines heavy (0.7), utility lines medium (0.5), instrument connections and
signal lines light (0.35), with leader dots at 0.18. Process, utility, and signal lines stay
visually distinct at print size.

Valves use `valve.<body>.<actuator>` kinds: gate, globe, ball, butterfly, diaphragm, angle
bodies; hand, solenoid, pneumatic, motor actuators. Each actuated valve exposes an actuator
port and a fail letter (FO, FC, FL, FI) validated by the gate.

Specialties in the library: DCS and PLC bubbles with location lines, computer hexagon,
tray-column and packed-column forms, U-tube and fixed-sheet exchanger forms, plate exchanger
form, eccentric reducer, flange pair, venturi and magnetic/Coriolis/vortex flow elements,
figure-8 spectacle blind, line-size breaks, strainers, traps, rupture disks, PSVs with
discharge destinations.

The PSV is an angle body: an inlet triangle and an outlet triangle meet at the body center, the
spring rises from the center on the side opposite the inlet (never over the inlet stem), and the
tag plus set pressure sit on the side opposite the outlet. `sheet.psv(tag, x, y, set, { outlet,
inlet })` takes `outlet` right (default), left, up or down; `inlet` defaults to down for a
sideways outlet and left for a vertical one, and must sit at a right angle to the outlet. Pipes
connect 10 mm from the center along each direction.

Line numbers parse through a small grammar (size, fluid code, class, sequence) with a dedicated
QA check. Signal marks follow ISA-5.1 Table 5.3.2 for pneumatic, electric, capillary, and
software links.
