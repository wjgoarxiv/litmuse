// The static rainbow for a headline on a real terminal: no animation, no blinking, no full-field luminance swing, so it
// stays flash-safe on any terminal. It lives inside plugin/ because the installed bundle holds
// plugin/ only; lib/stage-card.mjs re-exports it for the status card.
const RAINBOW = [196, 208, 226, 46, 51, 21, 201];

export function rainbowLine(text) {
  let color = 0;
  let out = '';
  for (const ch of String(text)) {
    out += ch === ' ' ? ch : `\u001b[38;5;${RAINBOW[color++ % RAINBOW.length]}m${ch}`;
  }
  return `${out}\u001b[0m`;
}
