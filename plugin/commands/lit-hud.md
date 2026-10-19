---
description: "Show the LitMuse /hud and /theme preset and how to apply it"
argument-hint: "[compact|full]"
---
Show the user the LitMuse status-bar preset. Variant requested: $ARGUMENTS (empty means the default preset).

Muse's `/hud` is a list of on/off fields, and `/theme` picks a color theme. LitMuse ships no HUD code; the preset is a recommendation the user applies by hand.

Default preset: Model on, Effort on, Context on, Branch on, Quota on, Tokens on; Path off, Permissions off, Cost off. Compact preset: Model, Effort, Context on; everything else off. Full preset: every field on.
Theme: Tokyo Night for dark terminals, Default for light ones.

Tell the user: type `/hud`, move with the arrow keys, press space or enter to toggle each field to match the preset, then esc; type `/theme`, pick the theme, press enter. Point to `docs/hud-preset.md` in the LitMuse package for the picture and the reasoning. Change no settings file yourself.
