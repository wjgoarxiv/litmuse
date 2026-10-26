export const WEIGHTS = {
  process: 0.7,
  utility: 0.5,
  signal: 0.35,
  leader: 0.18,
};

export const ALLOWED_WIDTHS = new Set([0.7, 0.5, 0.35, 0.18]);

export const MATERIAL = {
  'painted-steel': { fill: '#5b7fa6', stroke: '#2e4a62' },
  stainless: { fill: '#b9c2c9', stroke: '#6d757c' },
  copper: { fill: '#c47b4a', stroke: '#7d4a24' },
  brass: { fill: '#c9a227', stroke: '#7a5f14' },
  'cast-iron': { fill: '#55565a', stroke: '#2b2b2e' },
  concrete: { fill: '#c9c5bb', stroke: '#8a867c' },
  glass: { fill: '#cfe3ea', stroke: '#7fa3b0' },
  quiet: { fill: '#9aa0a6', stroke: '#5f6368' },
};

export const STREAMS = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#f0e442', '#56b4e9'];

export function material(name) {
  return MATERIAL[name] ?? MATERIAL['painted-steel'];
}
