# P&ID symbols

ISA-5.1 letters name every instrument: first letter the measured variable (F flow, L level,
P pressure, T temperature), succeeding letters the function (I indicate, C control, T transmit,
V valve). Tag order follows the letter table; the QA gate flags letter-order breaks.

Bubbles carry function plus location: a plain circle for field instruments, a horizontal bar
for panel-board mounting, a dashed outline for computer-resident functions. Every bubble shows
its loop tag beside it.

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

Line numbers parse through a small grammar (size, fluid code, class, sequence) with a dedicated
QA check. Signal marks follow ISA-5.1 Table 5.3.2 for pneumatic, electric, capillary, and
software links.
