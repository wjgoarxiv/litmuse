export function scene() {
  return {
    base: { w: 60, h: 8, d: 40, at: [0, 0, 0], tone: 'concrete' },
    vessel: { tag: 'E-101', x: 30, y: 20, r: 12, h: 40, tone: 'stainless' },
    pipes: [[[[30, 20, 44], [30, 20, 60], [60, 20, 60]], 1, 'painted-steel']],
    callouts: [['shell', 30, 20], ['saddle', 8, 8], ['channel', 30, 42]],
  };
}
