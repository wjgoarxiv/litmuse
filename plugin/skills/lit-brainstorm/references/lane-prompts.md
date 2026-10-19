# Idea lane prompts

Lanes are optional and read-only. Use `subagent_spawn` with `subagent_type: "litmuse/librarian-researcher"` or `"litmuse/lit-planner"`. Never spawn without `subagent_type`: that child is general-purpose with write-capable tools.

Give every lane the frame block:

```
Frame: <problem sentence>
How might we: <chosen HMW>
Hard constraints: <list>
Do not edit any file. Do not run installs or builds.
```

## Prior-art lane (librarian-researcher)

```
Find how others have approached this problem. Return 6 to 10 named approaches. For each: a one-line mechanism, where it is used, a source link, and what it costs. Do not recommend one. Label anything you could not verify as unverified.
```

## Repo-structure lane (lit-planner)

```
Using only read_file and search, propose 5 to 8 alternatives that fit this repo's structure. For each: the surface it touches, the files involved, and what it would replace. Do not propose a plan.
```

## Contrarian lane (lit-planner)

```
Assume the obvious direction is wrong. Propose 5 ideas that solve the same problem without the obvious mechanism. For each, say which assumption it drops.
```

## Output contract

Each lane returns a numbered list: `idea | mechanism | source or file | confidence (high, medium, unverified)`. The parent merges onto the board with `[lane:<name>]`. A lane's confidence is a fact about the lane, not a score.
