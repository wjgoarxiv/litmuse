import { spawnSync } from 'node:child_process';

// Calls the Muse CLI with stdin closed, the equivalent of `< /dev/null`, so no command can wait on a prompt.
export function muse(env, args, { timeoutMs = 120000 } = {}) {
  const bin = env.LITMUSE_MUSE_BIN || 'muse';
  const r = spawnSync(bin, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
  let json = null;
  if (args.includes('--json') && r.stdout) {
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = null;
    }
  }
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    json,
    missing: r.error?.code === 'ENOENT',
    command: ['muse', ...args].join(' '),
  };
}

export function museVersion(env) {
  const r = muse(env, ['--version'], { timeoutMs: 30000 });
  return r.ok ? r.stdout.trim() : null;
}

export function installedPlugin(env) {
  const r = muse(env, ['plugins', 'list', '--json']);
  const list = r.json?.plugins ?? [];
  if (!Array.isArray(list)) return null;
  // Muse 1.4.10 wraps each entry as { record: {...}, warning, plugin }; accept a bare record too.
  return list.map((p) => p.record ?? p).find((p) => p.id === 'litmuse') ?? null;
}
