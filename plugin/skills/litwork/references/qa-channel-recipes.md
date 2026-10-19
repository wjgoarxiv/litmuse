# QA channel recipes

Load this when writing a SURFACE scenario or its cleanup. Every recipe names the invocation, the observable and the
teardown, so the receipt can prove absence. Commands run through `bash` in the sandbox; replace the placeholders
with literal values before running. Evidence goes under `.litmuse/evidence/<slug>/`.

## HTTP service

```bash
# start (long-running: use monitor, or background with a pid file)
node server.mjs > .litmuse/evidence/<slug>/server.log 2>&1 & echo $! > /tmp/lit-qa-<id>.pid
# wait for readiness with a bounded loop, then probe
curl -i --max-time 10 -X POST http://127.0.0.1:8080/items -H 'content-type: application/json' -d '{"name":"x"}' \
  > .litmuse/evidence/<slug>/<id>-surface.log
# observable: first line is `HTTP/1.1 201`, body contains "id"
# teardown
kill "$(cat /tmp/lit-qa-<id>.pid)"; sleep 1; kill -0 "$(cat /tmp/lit-qa-<id>.pid)" 2>/dev/null || echo "gone"
lsof -i :8080 || echo "port free"; rm -f /tmp/lit-qa-<id>.pid
```

Probe the failure path too: a malformed body returns the documented 4xx and writes no record.

## CLI or script

```bash
node bin/tool.mjs status --json > .litmuse/evidence/<slug>/<id>-surface.log 2>&1; echo "exit=$?" >> .litmuse/evidence/<slug>/<id>-surface.log
# observable: exit=0, stdout parses as JSON, field `ok` is true
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").split("\nexit=")[0])' .litmuse/evidence/<slug>/<id>-surface.log
```

Add one failing invocation (bad flag, missing file) and assert the documented exit code.

## Terminal UI

```bash
tmux new-session -d -s lit-qa-<id> -x 120 -y 30 'node bin/tool.mjs ui'
tmux send-keys -t lit-qa-<id> 'q' Enter
tmux capture-pane -t lit-qa-<id> -pS -E - > .litmuse/evidence/<slug>/<id>-surface.log
# teardown
tmux kill-session -t lit-qa-<id>; tmux ls 2>&1 | grep -c lit-qa-<id> || echo "session gone"
```

A pane dump is a boot smoke test. Color, layout and CJK width need a rendered screenshot through `visual-qa`.

## Muse-facing behavior

```bash
printf '%s\n' 'Say hello' > /tmp/lit-qa-<id>.prompt
muse exec --json --prompt-file /tmp/lit-qa-<id>.prompt < /dev/null > .litmuse/evidence/<slug>/<id>-surface.json
rm -f /tmp/lit-qa-<id>.prompt
```

The observable is a field in the JSON line. A model-free run with the echo provider cannot call tools, so a
criterion about tool use or a blocking hook needs a real-model run (it costs quota; the user approves it) and
is otherwise `BLOCKED:` with that reason.

## Installed package

```bash
npm pack --silent --pack-destination /tmp/lit-qa-<id>   # prints the tarball name
mkdir -p /tmp/lit-qa-<id>/prefix && npm install --prefix /tmp/lit-qa-<id>/prefix /tmp/lit-qa-<id>/<tarball>
/tmp/lit-qa-<id>/prefix/node_modules/.bin/<bin> --version
# teardown
rm -rf /tmp/lit-qa-<id>; test ! -e /tmp/lit-qa-<id> && echo "removed"
```

`npm install` needs a network approval when the package has dependencies, so record the answer as a `decision`.

## Hook replay

```bash
printf '%s' '{"hook_event_name":"UserPromptSubmit","prompt":"lit plan x","session_id":"qa1","cwd":"'"$PWD"'"}' \
  | node plugin/hooks/user-prompt-submit.mjs > .litmuse/evidence/<slug>/<id>-surface.json
```

Replay a malformed payload too (`printf '{'`); the observable is the documented fail-open or refusal.

## Cleanup receipt

One line per criterion, written after the checks: what was stopped, what was removed, how absence was verified.

```text
cleanup: killed 12345 (kill -0 fails); tmux kill-session lit-qa-parser (tmux ls clean); removed /tmp/lit-qa-parser
(test ! -e); port 8080 free (lsof empty); work_status shows no background work
```

Append it as a ledger `note` and next to the artifact. A resource that was already running before the run is not the
run's to stop.
