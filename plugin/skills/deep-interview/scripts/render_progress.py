#!/usr/bin/env python3
"""Progress renderer for the deep-interview skill (standard library only).

Prints three surfaces to stdout: the kickoff banner, the per-round ambiguity
meter, and the clarity breakdown with readiness gates.

Color is off by default because the markdown reply channel shows escape codes
as literal text. Pass --color always to get 256-color ANSI output for a terminal
pane, or --color auto to color only when stdout is a terminal and NO_COLOR is
unset.

Examples
--------
  render_progress.py banner --profile Standard --context greenfield \
      --idea "add dark mode to settings" --threshold 20 --max-rounds 12 --ambiguity 100

  render_progress.py meter --round 3 --max-rounds 12 \
      --stage "1: Intent-first" --focus Scope --ambiguity 52 --threshold 20

  render_progress.py breakdown --threshold 20 --prev 60 --ambiguity 52 --next Scope \
      --scores "Intent=0.80,Outcome=0.60,Scope=0.40,Constraints=0.70,Success=0.30" \
      --gates "nongoals=1,boundaries=0,pressure=1"
"""
import argparse
import os
import sys

RED, AMBER, GREEN, GRAY, CYAN, WHITE = 203, 214, 78, 244, 80, 252
GATE_LABELS = {
    "nongoals": "Non-goals explicit",
    "boundaries": "Decision Boundaries",
    "pressure": "Pressure pass done",
}

use_color = False


def paint(code, text, bold=False):
    if not use_color:
        return text
    weight = "\033[1m" if bold else ""
    return f"{weight}\033[38;5;{code}m{text}\033[0m"


def ambiguity_color(value, threshold):
    """Red far from the target, amber approaching it, green at or under it."""
    if value <= threshold:
        return GREEN
    if value <= 2 * threshold:
        return AMBER
    return RED


def meter_bar(value, threshold, width=22):
    """Draining gauge: filled cells are the remaining ambiguity, the tick marks the target."""
    filled = round(width * value / 100)
    tick = round(width * threshold / 100)
    color = ambiguity_color(value, threshold)
    cells = []
    for i in range(width):
        if i < filled:
            cells.append(paint(color, "█"))
        elif i == tick:
            cells.append(paint(GREEN if value <= threshold else CYAN, "┊"))
        else:
            cells.append(paint(GRAY, "░"))
    return "".join(cells)


def dimension_bar(score, width=10):
    filled = round(width * score)
    color = GREEN if score >= 0.7 else AMBER if score >= 0.4 else RED
    return paint(color, "▓" * filled) + paint(GRAY, "░" * (width - filled))


def parse_pairs(raw, kind):
    pairs = {}
    for item in raw.split(","):
        if not item.strip():
            continue
        if "=" not in item:
            sys.exit(f"render_progress: bad {kind} entry {item!r}, expected name=value")
        key, value = item.split("=", 1)
        pairs[key.strip()] = value.strip()
    return pairs


def banner(args):
    idea = args.idea if len(args.idea) <= 52 else args.idea[:49] + "..."
    edge = paint(CYAN, "│")
    start_color = ambiguity_color(args.ambiguity, args.threshold)
    lines = [
        f" {paint(CYAN, '╭─')} {paint(WHITE, '🎯 Deep Interview', bold=True)} {paint(CYAN, '─' * 30)}",
        f" {edge}  {paint(GRAY, 'Profile ')}  {paint(WHITE, args.profile)} · {args.context}",
        f" {edge}  {paint(GRAY, 'Goal    ')}  turn \"{idea}\" into an execution-ready spec",
        f" {edge}  {paint(GRAY, 'Target  ')}  ambiguity {paint(GREEN, f'≤ {args.threshold}%')}   ·   Budget  up to {args.max_rounds} rounds",
        f" {edge}  {paint(GRAY, 'Start   ')}  ambiguity {paint(start_color, f'{args.ambiguity}%')}   ·   one question / round, intent before detail",
        f" {paint(CYAN, '╰' + '─' * 50)}",
    ]
    print("\n".join(lines))


def meter(args):
    head = (
        f"{paint(GRAY, 'Round')} {paint(WHITE, f'{args.round}/{args.max_rounds}', bold=True)}"
        f"  {paint(GRAY, '·')}  {paint(GRAY, 'Stage')} {args.stage}"
        f"  {paint(GRAY, '·')}  {paint(GRAY, 'Focus:')} {paint(CYAN, args.focus)}"
    )
    color = ambiguity_color(args.ambiguity, args.threshold)
    line = (
        f"{paint(GRAY, 'Ambiguity')} {paint(color, f'{args.ambiguity:>3}%', bold=True)} "
        f"[{meter_bar(args.ambiguity, args.threshold)}] {paint(GRAY, f'target ≤ {args.threshold}%')}"
    )
    print(head)
    print(line)


def breakdown(args):
    scores = {k: float(v) for k, v in parse_pairs(args.scores, "score").items()}
    gates = {k: v in ("1", "true", "yes") for k, v in parse_pairs(args.gates, "gate").items()}

    print(paint(WHITE, "Clarity", bold=True))
    weakest = min(scores, key=scores.get) if scores else None
    for name, score in scores.items():
        mark = paint(CYAN, "  ← weakest") if name == weakest else ""
        print(f"  {name:<12}{dimension_bar(score)}  {paint(WHITE, f'{score:.2f}')}{mark}")

    print()
    print(paint(WHITE, "Readiness gates", bold=True))
    cells, open_labels = [], []
    for key, label in GATE_LABELS.items():
        met = gates.get(key, False)
        cells.append(paint(GREEN, f"✅ {label}") if met else paint(GRAY, f"⬜ {label}"))
        if not met:
            open_labels.append(label)
    print("  " + "      ".join(cells))
    if open_labels:
        print(paint(AMBER, f"        → blocked by: {', '.join(open_labels)}"))
    elif args.ambiguity <= args.threshold:
        print(paint(GREEN, "        → all gates met - ready to crystallize"))

    print()
    arrow = paint(GREEN, "↓") if args.ambiguity < args.prev else paint(GRAY, "·")
    now = paint(ambiguity_color(args.ambiguity, args.threshold), f"{args.ambiguity}%", bold=True)
    print(
        f"{paint(GRAY, 'Ambiguity')} {args.prev}% {arrow} {now}"
        f"   {paint(GRAY, '·')}   {paint(GRAY, 'Next:')} {paint(CYAN, args.next)}"
    )


def build_parser():
    parser = argparse.ArgumentParser(description="deep-interview progress renderer")
    parser.add_argument("--color", choices=["auto", "always", "never"], default="never")
    sub = parser.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("banner")
    b.add_argument("--profile", required=True)
    b.add_argument("--context", default="greenfield")
    b.add_argument("--idea", default="")
    b.add_argument("--threshold", type=int, required=True)
    b.add_argument("--max-rounds", type=int, required=True)
    b.add_argument("--ambiguity", type=int, default=100)
    b.set_defaults(fn=banner)

    m = sub.add_parser("meter")
    m.add_argument("--round", type=int, required=True)
    m.add_argument("--max-rounds", type=int, required=True)
    m.add_argument("--stage", default="")
    m.add_argument("--focus", default="")
    m.add_argument("--ambiguity", type=int, required=True)
    m.add_argument("--threshold", type=int, required=True)
    m.set_defaults(fn=meter)

    d = sub.add_parser("breakdown")
    d.add_argument("--scores", required=True, help="Name=0.80,Name=0.60,...")
    d.add_argument("--gates", default="nongoals=0,boundaries=0,pressure=0")
    d.add_argument("--threshold", type=int, required=True)
    d.add_argument("--prev", type=int, default=100)
    d.add_argument("--ambiguity", type=int, required=True)
    d.add_argument("--next", default="")
    d.set_defaults(fn=breakdown)
    return parser


def main():
    global use_color
    args = build_parser().parse_args()
    if args.color == "always":
        use_color = True
    elif args.color == "auto":
        use_color = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
    if os.environ.get("NO_COLOR"):
        use_color = False
    args.fn(args)


if __name__ == "__main__":
    main()
