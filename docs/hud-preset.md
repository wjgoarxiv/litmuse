# LitMuse /hud preset

Muse Code draws its own status bar at the bottom of the screen. In Muse Code 1.4.10 the bar is a fixed list of
nine fields that you switch on or off with `/hud`, and `/theme` picks one of seventeen color themes. Plugins
cannot add fields or text to the bar, so LitMuse ships this preset as a recommendation that you apply by hand.
While a lit route runs, LitMuse tells the model about it through the session context instead.

<!-- TODO(cover): preview image of the bar with this preset, made by the art task -->

## The preset

| Field | LitMuse preset | Why |
|---|---|---|
| Model | on | You see which model ran the lit route. |
| Effort | on | Reasoning effort changes cost and depth; lit-loop and lit-plan read better at medium or high. |
| Context | on | Long lit loops fill context; the bar warns you before compaction. |
| Branch | on | lit-commit and start-work act on the current branch. |
| Quota | on | Shows the current usage window and week, so a long autoresearch budget stays visible. |
| Tokens | on | Session tokens including finished subagents, useful when review-work fans out. |
| Path | off | The prompt line already shows the workspace. |
| Permissions | off | Muse keeps YOLO visible on its own. |
| Cost | off | Turn it on if you pay per use and want the estimate. |

Compact variant: Model, Effort and Context on, everything else off. Full variant: every field on.

Theme: **Tokyo Night** on a dark terminal, **Default** on a light one. Leave "Terminal background" on auto.

## Apply it

1. In Muse, type `/hud`. Move with the arrow keys, press space or enter on a field to switch it, type to filter, and press esc when the list matches the table.
2. Type `/theme`, choose the theme, and press enter to save.
3. Inside a session you can also type `/lit-hud` to see this preset again.

Muse saves both choices in its own settings. The LitMuse installer leaves those settings alone.
