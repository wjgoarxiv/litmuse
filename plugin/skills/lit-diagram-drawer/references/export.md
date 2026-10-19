# Exporting diagrams

Export only after the HTML/SVG source passes verification. Export the diagram itself, not the page gallery, editor controls, or a full-editorial browser frame.

## PNG

Use scripts/export.mjs with a source HTML or SVG and a requested scale of 1, 2, or 3. The script drives agent-browser 0.38.1 or newer against Chrome. It waits for document.fonts.ready, confirms the local Pretendard face is loaded and computed, and captures a static state. The renderer is resolved by scripts/diagram-runtime.mjs: a copy already on PATH at 0.38.1 or newer is used, otherwise the pinned agent-browser installs into the LitMuse runtime cache (`${XDG_DATA_HOME:-$HOME/.local/share}/litmuse/runtime/diagram`, override `LITMUSE_DIAGRAM_RUNTIME`) on the first export, and every agent-browser child runs with `HOME=<cache>/home`, so its state and any downloaded browser stay in the cache (control sockets use `/tmp/lmd-<uid>` because socket paths are length-limited). A Chrome or Chromium already installed is used first (`LITMUSE_DIAGRAM_CHROME`, `CHROME_PATH`, `AGENT_BROWSER_EXECUTABLE_PATH`, the macOS Google Chrome or Chromium app, `google-chrome` or `chromium` on `PATH`); only when none exists does `agent-browser install` fetch Chrome for Testing 154 into `<cache>/home/.agent-browser/browsers`. Rendering is not pixel-pinned when a system Chrome is used, so note its version in the evidence. Nothing is installed globally and the real home directory is untouched. `--allow-font-fallback` is reserved for rendering the explicitly labeled constructed-naive foils for comparison; it never makes a source pass verification.

Inside Muse the sandbox network is proxy-only, so a failed first-use install is a `BLOCKED:` result: report the error line and give the pre-warm command to run in a terminal, `npx @litfamily/litmuse runtime install diagram`. `node scripts/diagram-runtime.mjs status --json` reports readiness without installing. If the font is unavailable, stop and say so; do not fetch fonts from the skill. The default output folder is `docs/diagrams/exports/` under the current directory; pass `--out` to choose another.

For `tree-block-decomposition`, pass `--registry` only when a traceability sidecar was requested. The exporter writes `<diagram-basename>.registry.json` beside the other exports. It projects `data-block-id`, `data-block-parent`, `data-block-name`, `data-block-input`, `data-block-output`, `data-block-constraint`, `data-block-assumption`, and `data-block-impl` in source-document order. It omits absent values and a root parent, and rejects blank or duplicate IDs, missing parents, multiple roots, and cycles. It never infers missing fields or creates this sidecar by default.

## Standalone SVG

- Preserve the root viewBox, title, description, and referenced IDs.
- Add the SVG namespace when absent.
- Use explicit hexadecimal fill and stroke values. Convert supported alpha colors to a hex value plus fill-opacity or stroke-opacity.
- Convert transparent paint to none.
- Keep IDs unique and local. Reject external images, fonts, stylesheets, scripts, CSS imports, and every CSS `url()` reference except a local fragment such as `url(#marker)`. Scheme URLs (`file:`, `ftp:`, `https:`, and others), protocol-relative URLs, relative resource URLs, escaped URL tokens, and malformed URL functions fail closed. Office mode injects its own embedded Pretendard data URL only after this input check.
- Office-safe mode uses only conservative SVG elements and embeds the bundled Pretendard font when the source contains Korean text.
- Do not claim text has been outlined unless the exported SVG contains paths in place of those text nodes.

## Office proof

For an Office check, place the exported SVG or PNG in the intended PowerPoint or Word document, open it in the target Office renderer, and inspect Korean text, mono labels, geometry, colors, and margins at the final page or slide size. The skill does not generate a PPTX/DOCX container or claim Office rendering from SVG validation alone. If an Office renderer is unavailable, say exactly which part remains unverified.

## Failure behavior

Reject a missing source, an SVG without viewBox, an unsupported scale, a malformed HTML file without an SVG, or a PNG request without the required renderer. Do not write partial outputs on a failed preflight. Report actual paths and byte sizes after successful export.
