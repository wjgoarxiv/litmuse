# Lane 2: qa

Question: does it work when run, on the surface a user touches?

Agent: `litmuse/qa-runner` (shell through `bash`, `bash_input`, `monitor`; no file-editing tools). It writes output
only by shell redirection into the evidence path the brief names. The lane tests behavior; code review belongs to
lane 3.

## Scenario method (follow in order)

1. **Brainstorm.** Before touching the surface, write every scenario you can think of, each as a one-liner with its
   expected behavior. Cover:
   - happy paths: the main thing the user wanted;
   - boundaries: empty input, maximum length, zero, negative numbers, special characters, unicode, very large data;
   - error paths: invalid input, missing files, permission denied, timeouts, unavailable dependency;
   - regressions: existing features that share the changed code paths;
   - state transitions: out-of-order actions, rapid repeats, concurrent use, interrupted runs, rerun after a partial
     run;
   - interface cases when applicable: widths, keyboard use, loading and error states, wide glyphs;
   - integration points: other services, databases, modules, installed copies.
   Aim for fifteen to thirty.
2. **Augment.** Ask what a careless or malicious user would do and what the environment could do (disk full, slow
   network, expired token, dirty working tree, stale cache). Add at least five scenarios.
3. **Prioritize.** P0 must pass, P1 should pass, P2 nice to pass. Each has steps and a binary expected result.
4. **Execute** in priority order. Record actual versus expected. On failure capture the transcript, output or
   screenshot path. When the surface fails to start, the lane is FAIL immediately.
5. **Compile.** Counts per priority and per-test results.

## Choosing the surface

| Subject | Drive it with | Artifact |
| --- | --- | --- |
| CLI | the built command with arguments, stdin and each documented flag | transcript with exit code |
| Library or SDK | a throwaway script importing the public API | script plus output |
| HTTP service | `curl -i` against the live endpoint | status line, headers, body |
| Muse-facing behavior | `muse exec --json --prompt-file <f> < /dev/null`; the echo provider cannot call tools, so tool-dependent claims need a real-model run or a stated limitation | JSON line |
| Installer or package | `npm pack`, then install the tarball into a temporary directory and run the command from there | file listing plus command output |
| Hook or plugin component | replay a recorded stdin payload through the registered hook command | stdout, stderr, exit status |
| Built interface | `visual-qa`: several widths, states, screenshots; fold its verdict into this lane | screenshots, action log |
| Data or migration | before/after state diff, invariants, rollback check | parsed diff |

A pane dump from a terminal session degrades color and wide-glyph width, so use it for boot smoke tests and use a
rendered screenshot for color or CJK layout. A dry run proves preview behavior only; it does not prove that files
landed.

## Automated evidence

Run the repo's gates and record command, working directory, exit status and pass/fail counts: tests, typecheck,
lint, build, scanners, version-lockstep checks, pack listings. Start with the narrow command for the changed
surface, then widen when the change crosses package boundaries. Claiming a failure is pre-existing needs a detached
checkout of the base revision where the same command fails the same way. A test that cannot fail for the regression
it names is no evidence: mock-call assertions, pinned constants and expected values re-derived from the output
under test are all tautologies.

## Stale state and misleading success

When generated artifacts, caches or digests are involved, regenerate them or prove the verifying command reads only
source. Check the decisive observable (exit code, assertion text, file field, parsed JSON) because a summary line
can say success while an error sits in the output.

## Adversarial classes

Probe the classes whose trigger holds, and give a one-line reason for the others: malformed input, prompt
injection, cancel and resume, stale state, dirty working tree, hung or long commands, flaky tests (run the targeted
test three times), misleading success output, repeated interruptions.

## Cleanup receipt

Register every process, server, port, tmux session, browser context, container, worktree, tarball and temp path at
creation. Before returning, stop each one and prove it is gone (`kill -0 <pid>` fails, `tmux ls` lacks the session,
the port is free, the path does not exist). Remove only what the lane created. A missing receipt makes the lane
BLOCKED.

## Return shape

```text
verdict: PASS | FAIL | BLOCKED
confidence: HIGH | MEDIUM | LOW
scenario_coverage: total N; P0 x/y; P1 x/y; P2 x/y
findings:
  - [PASS|FAIL] test name (priority) - steps - expected - actual - evidence path
gates:
  - command - cwd - exit - counts
cleanup: what was stopped or removed, and how absence was checked
blocking_issues: P0 or P1 failures only
```

## Sample brief

```text
TASK: Review lane 2 (qa). Run the surface and verify behavior; do not review code.
RUN_COMMAND: node bin/tool.mjs status
SCOPE: shell only; write output to .litmuse/evidence/<slug>/review/qa/ by redirection; edit no source file.
DELIVERABLE: the return shape, with 15 or more scenarios and the repo gates.
VERIFY: each FAIL has an artifact path; the cleanup receipt lists every process and temp path you created.
STOP WHEN: every P0 and P1 scenario has a result.
```
