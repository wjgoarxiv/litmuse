# Cutaway output choice

Static (SVG, PDF, 600 dpi PNG) is the default and ships always. Page words (HTML,
interactive, page) add a self-contained page. Motion words (animation, motion, video, MP4,
GIF, loop) add a motion loop. A bare request stays static; ask one short question about page
or loop with a user present and a use that suits it.

Interactive page: one offline file. Preset views on keys 1-9, explode on E in fitter order,
layers toggled by visibility, callouts as focusable buttons with `aria-live` narration,
reduced motion landing moves at once, state held in the URL hash. The file fetches from
limited sources: the SVG namespace alone travels over the wire.

Motion loop: kit frames become MP4 (H.264, yuv420p), animated WebP, and GIF. The loop holds
start-equals-end across the seam, parts moving along their axes, all parts inside the frame.
Encoders come from the machine; a missing encoder halts with `ENCODER_REQUIRED` and the
setup line. Installation stays a user step.

Scene functions power page and loop from the static geometry: write the machine once as a
scene, then derive the assembled view, exploded positions, layer sets, and frame timeline
from it. Explode slides parts along assembly axes in fitter order, outer parts before inner
parts.

Route guard: a `lit` prompt asking for a cutaway or piping diagram as animation or video
lands here. A narrated or titled film of a machine hands off to `lit-typographic-motion`
after the static drawing passes.
