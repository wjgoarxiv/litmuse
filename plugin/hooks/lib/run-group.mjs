// `node run-group.mjs <timeoutMs> <cwd> <capture 0|1> <cmd> [args...]`: the start-work run's process runner. It
// starts the command as the leader of a new process group, kills the whole group (background children included)
// when the timeout is reached and again once the command ends, and prints one JSON line:
// {"status", "signal", "timedOut", "out"} with at most 64 KiB of output when capture is 1.
import { spawn } from 'node:child_process';

const [ms, cwd, capture, cmd, ...args] = process.argv.slice(2);
const timeout = Math.max(1, Number.parseInt(ms, 10) || 1);
const LIMIT = 64 * 1024;
let out = '';
let timedOut = false;
const child = spawn(cmd, args, { cwd, detached: true, stdio: ['ignore', capture === '1' ? 'pipe' : 'ignore', capture === '1' ? 'pipe' : 'ignore'] });
const keep = (chunk) => { out = (out + chunk).slice(-LIMIT); };
child.stdout?.setEncoding('utf8').on('data', keep);
child.stderr?.setEncoding('utf8').on('data', keep);
const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group is already gone */ } };
const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeout);
let done = false;
const finish = (status, signal) => {
  if (done) return;
  done = true;
  clearTimeout(timer);
  process.stdout.write(`${JSON.stringify({ status, signal, timedOut, out })}\n`);
  process.exit(0);
};
child.on('error', () => finish(127, null));
// A background child can hold the output pipes open after the command exits, so the end is `exit`, not `close`:
// the group is killed at once, and the output gets a moment to drain.
child.on('exit', (status, signal) => {
  killGroup();
  const drained = setTimeout(() => finish(status, signal), 200);
  child.on('close', () => { clearTimeout(drained); finish(status, signal); });
});
