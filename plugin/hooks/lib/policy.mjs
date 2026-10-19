// What a lit-plan (planning) turn may do. Everything here is an allowlist: a tool, program or flag that is not
// listed is refused, so new host tools, MCP tools and unfamiliar flags fail closed.

// Tools that only read, or only manage children and sessions that are already limited.
export const LIT_PLAN_READ_ONLY_TOOLS = [
  'read_file', 'search', 'read_skill', 'web_search', 'web_fetch', 'read_memory', 'work_status', 'work_list',
  'subagent_status', 'subagent_wait', 'subagent_read_result', 'subagent_cancel', 'request_user_input', 'get_goal',
  'cron_list',
];

// Tools allowed with a check: file writers (plans/ and .litmuse/ only), shell (read-only commands only) and
// child agents (read-only LitMuse agents only).
export const FILE_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'delete_file']);
export const SHELL_TOOLS = new Set(['bash', 'bash_input', 'exec_command', 'shell']);
export const READ_ONLY_AGENTS = new Set([
  'litmuse/lit-planner', 'litmuse/librarian-researcher', 'litmuse/lit-verifier', 'litmuse/quality-reviewer',
  'litmuse/korean-style-analyzer', 'litmuse/korean-prose-editor', 'litmuse/meaning-preservation-auditor',
  'litmuse/native-flow-reviewer', 'litmuse/polish-orchestrator',
]);

// Any of these characters makes a command compound, redirected, substituted or escaped: refused outright.
const SHELL_META = /[;&|<>`$\\\n\r(){}]/;

// Per-program flag allowlists. `flags` take no value; `valueFlags` take the next word; `prefixFlags` carry their
// value after `=`; `numeric` allows `-<digits>`.
const PROGRAMS = {
  ls: { flags: /^-[laRh1FdtrSA]+$/ },
  cat: { flags: /^-n$/ },
  head: { flags: /^$/, valueFlags: ['-n', '-c'], numeric: true },
  tail: { flags: /^$/, valueFlags: ['-n', '-c'], numeric: true },
  wc: { flags: /^-[lwcm]+$/ },
  rg: {
    flags: /^(-[nilcwFSsv]+|--(files|hidden|no-heading|line-number|count|ignore-case|fixed-strings|word-regexp|files-with-matches|smart-case|case-sensitive|invert-match))$/,
    valueFlags: ['-g', '--glob', '-t', '--type', '-A', '-B', '-C', '-m', '--max-count'],
  },
};
const GIT = {
  subcommands: new Set(['log', 'status', 'diff', 'show']),
  flags: /^(--(oneline|stat|shortstat|numstat|summary|name-only|name-status|short|porcelain|cached|staged|patch|graph|decorate|all|no-color|abbrev-commit|branch)|-[sp])$/,
  valueFlags: ['-n', '--max-count'],
  prefixFlags: /^--(format|pretty|since|until|author|grep|max-count|stat)=[^\s]*$/,
  numeric: true,
};

// Splits on spaces with plain single or double quotes; anything unusual returns null (refused).
function words(command) {
  const out = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === ' ' || ch === '\t') {
      if (started) out.push(cur);
      cur = '';
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  if (quote) return null;
  if (started) out.push(cur);
  return out;
}

function argsAllowed(args, spec) {
  let positional = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (positional || !a.startsWith('-') || a === '-') continue;
    if (a === '--') { positional = true; continue; }
    if (spec.flags.test(a)) continue;
    if (spec.numeric && /^-\d+$/.test(a)) continue;
    if (spec.prefixFlags && spec.prefixFlags.test(a)) continue;
    if (spec.valueFlags && spec.valueFlags.includes(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('-')) return false;
      i += 1;
      continue;
    }
    return false;
  }
  return true;
}

export function shellReadOnly(command) {
  if (typeof command !== 'string' || !command.trim() || SHELL_META.test(command)) return false;
  const argv = words(command.trim());
  if (!argv || !argv.length) return false;
  const [program, ...args] = argv;
  if (program === 'git') {
    const [sub, ...rest] = args;
    return GIT.subcommands.has(sub) && argsAllowed(rest, GIT);
  }
  const spec = PROGRAMS[program];
  return Boolean(spec) && argsAllowed(args, spec);
}
