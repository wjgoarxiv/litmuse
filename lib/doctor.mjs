import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findOnPath } from '../plugin/lib/host-process.mjs';
import { hostPython } from '../plugin/lib/office-runtime.mjs';
import { paths } from './paths.mjs';
import { muse, museVersion, installedPlugin } from './muse.mjs';
import { stageState, packageVersion, PLUGIN_DIR } from './bundle.mjs';
import { approvalStates } from './approvals.mjs';
import { checkUpdate } from './update-check.mjs';
import { runtimeModules, callRuntime } from './runtime.mjs';

const CATALOG_CAP = 32 * 1024;

// Built from the skill folders, independently of the manifest that Muse reads, so a skill missing from the
// manifest shows up as missing in Muse.
export function expectedSkillIds(dir = PLUGIN_DIR) {
  const root = join(dir, 'skills');
  return readdirSync(root).filter((d) => existsSync(join(root, d, 'SKILL.md'))).sort().map((d) => `plugin:litmuse:${d}`);
}

// Host binaries the engines and skills call; a missing one is reported, never installed. Python and Node packages
// come from the pinned engine runtimes below instead. A spec is found when every `all` program is on PATH, or an
// `any` program is, or one of `files` exists, or its `env` variable is set. PATH is searched without a shell so the
// same specs work with PATHEXT on Windows.
export const RUNTIMES = [
  { label: 'python3', python: true, fix: 'install Python 3.10 to 3.14 (python.org or your package manager); a newer python3 alone has no wheels for the pinned engines', skills: 'lit-docx, lit-pptx, lit-scientific-visualization, autoresearch' },
  { label: 'Poppler (pdftoppm, pdftotext)', all: ['pdftoppm', 'pdftotext'], fix: 'brew install poppler (or your package manager\'s poppler-utils)', skills: 'lit-docx, lit-pptx' },
  { label: 'LibreOffice (soffice)', any: ['soffice'], files: ['/Applications/LibreOffice.app/Contents/MacOS/soffice', 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'], fix: 'install LibreOffice so documents can be rendered for checking', skills: 'lit-docx, lit-pptx' },
  { label: 'pandoc', all: ['pandoc'], fix: 'brew install pandoc (or your package manager)', skills: 'lit-docx' },
  { label: 'xelatex (optional)', all: ['xelatex'], fix: 'install a TeX distribution only if you want publisher-styled PDF', skills: 'lit-docx' },
  { label: 'Chrome or Chromium', env: 'CHROME_PATH', files: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'], any: ['google-chrome', 'chromium', 'chromium-browser'], fix: 'install Google Chrome or Chromium, or set CHROME_PATH', skills: 'frontend-ui-ux, visual-qa, browser-drive, lit-diagram-drawer, lit-typographic-motion' },
  { label: 'ffmpeg', all: ['ffmpeg'], fix: 'brew install ffmpeg (or your package manager)', skills: 'lit-typographic-motion' },
  { label: 'libwebp (img2webp, dwebp)', all: ['img2webp', 'dwebp'], fix: 'brew install webp (or your package manager\'s webp tools); gifski also works for covers', skills: 'lit-typographic-motion' },
  { label: 'ast-grep', any: ['ast-grep', 'sg'], fix: 'npm i -g @ast-grep/cli', skills: 'structural-search' },
];

export function runtimeFound(spec, { env = process.env, platform = process.platform, exists } = {}) {
  const look = (name) => findOnPath(name, { env, platform, ...(exists ? { exists } : {}) });
  if (spec.python) {
    return hostPython(env).ok;
  }
  if (spec.all) return spec.all.every((name) => look(name));
  const fileExists = exists ?? existsSync;
  return Boolean((spec.env && env[spec.env]) || (spec.files ?? []).some((file) => fileExists(file)) || (spec.any ?? []).some((name) => look(name)));
}

function engineRows(env) {
  return runtimeModules().map((m) => {
    const r = callRuntime(m, 'status', env);
    const fix = `npx @litfamily/litmuse runtime install ${m.name}`;
    if (r.error) return { status: 'INFO', label: `engine ${m.name}`, detail: `status check failed: ${r.error}`, fix };
    if (r.ready) return { status: 'INFO', label: `engine ${m.name}`, detail: `ready${r.cache ? ` (${r.cache})` : ''}` };
    // A pre-warm engine (motion) never installs from a session, so its fix is the terminal command, not a first use.
    const when = r.prewarm ? 'run the fix from a terminal before first use' : 'the first use installs it';
    return { status: 'INFO', label: `engine ${m.name}`, detail: `not installed yet${r.missing?.length ? `: ${r.missing.join(', ')}` : ''}; ${when}`, fix };
  });
}

function runtimeRows(env) {
  return [...RUNTIMES.map((r) => (runtimeFound(r, { env })
    ? { status: 'INFO', label: `runtime ${r.label}`, detail: 'found' }
    : { status: 'INFO', label: `runtime ${r.label}`, detail: `missing (used by ${r.skills})`, fix: r.fix })), ...engineRows(env)];
}

function baseName(skill) {
  return String(skill.name ?? skill.id ?? '').replace(/^plugin:[^:]+:/, '').replace(/^bundled:/, '');
}

export async function doctor({ env = process.env, flags = {}, print = console.log }) {
  const p = paths(env);
  const rows = [];
  const add = (status, label, detail, fix) => rows.push({ status, label, detail, ...(fix ? { fix } : {}) });

  add('PASS', 'node', process.versions.node);
  const mv = museVersion(env);
  if (!mv) add('FAIL', 'muse', 'not found on PATH', 'install Muse Code: https://dev.meta.ai/docs/muse-code');
  else add('PASS', 'muse', mv);

  const st = stageState(p);
  if (st.state === 'owned') add('PASS', 'bundle', `${p.stage} (LitMuse ${st.version}, unmodified)`);
  else if (st.state === 'absent') add('FAIL', 'bundle', 'not installed', 'npx @litfamily/litmuse install');
  else if (st.state === 'modified') add('FAIL', 'bundle', `modified: ${st.detail}`, `keep edits: mv "${p.stage}" "${p.stage}.saved"; or discard: npx @litfamily/litmuse uninstall --discard-modified; then install`);
  else add('FAIL', 'bundle', `${st.state}: ${st.detail}`, `move it aside: mv "${p.stage}" "${p.stage}.saved"; then npx @litfamily/litmuse install`);

  const plugin = mv ? installedPlugin(env) : null;
  if (mv && !plugin) add('FAIL', 'plugin', 'LitMuse is not installed in Muse', 'npx @litfamily/litmuse install');
  if (plugin) {
    if (plugin.enabled === false) add('FAIL', 'plugin', 'installed but disabled', 'muse plugins enable litmuse');
    else if (plugin.version && plugin.version !== packageVersion()) add('WARN', 'plugin', `Muse has LitMuse ${plugin.version}; this package is ${packageVersion()}`, 'npx @litfamily/litmuse install');
    else add('PASS', 'plugin', `litmuse ${plugin.version ?? ''} installed and enabled`.trim());

    for (const s of approvalStates(muse(env, ['plugins', 'inspect', 'litmuse', '--json']).json)) {
      if (s.status === 'trusted_enabled') add('PASS', s.label, 'approved');
      else if (s.status === 'review_needed') add('APPROVAL NEEDED', s.label, `run: muse plugins approve ${s.id}`, `muse plugins approve ${s.id}`);
      else add('FAIL', s.label, `${s.status}${s.diagnostic ? `: ${JSON.stringify(s.diagnostic)}` : ''}`, `muse plugins approve ${s.id}`);
    }

    const list = muse(env, ['skills', 'list', '--json']).json?.skills ?? [];
    const expected = expectedSkillIds();
    const present = new Map(list.map((s) => [s.id, s]));
    const missing = expected.filter((id) => present.get(id)?.activation !== 'on');
    if (missing.length) add('FAIL', 'skills', `${expected.length - missing.length}/${expected.length} enrolled; missing or off: ${missing.join(', ')}`, 'npx @litfamily/litmuse install');
    else add('PASS', 'skills', `${expected.length}/${expected.length} enrolled`);

    const bytes = (s) => s.context_cost?.startup_bytes ?? 0;
    const ours = list.filter((s) => String(s.id).startsWith('plugin:litmuse:')).reduce((n, s) => n + bytes(s), 0);
    const whole = list.filter((s) => s.activation === 'on').reduce((n, s) => n + bytes(s), 0);
    add('INFO', 'catalog', `LitMuse descriptions ${ours} B for ${expected.length} skills; whole catalog ${whole} B of ${CATALOG_CAP} B`);
    if (whole > CATALOG_CAP) {
      add('WARN', 'catalog', 'over the 32 KB cap: Muse keeps bundled descriptions, fills plugin descriptions in id order while they fit, and shortens the rest to id and path, so some LitMuse descriptions may be shortened; lit routes still load every LitMuse skill by id');
    }

    const ourIds = new Set(expected.map((id) => id.replace('plugin:litmuse:', '')));
    for (const s of list) {
      if (s.scope !== 'user' && s.scope !== 'project') continue;
      if (ourIds.has(baseName(s))) add('WARN', 'overlap', `personal skill ${baseName(s)} (${s.path}) shares a name with a LitMuse skill; LitMuse routes load plugin:litmuse:${baseName(s)}`);
      if (/\.claude\/plugins\//.test(String(s.path)) || /litclaude/i.test(`${s.id} ${s.path}`)) {
        add('WARN', 'overlap', `${s.path} comes from another tool's plugin folder; LitMuse steers lit routes to its own skills`);
      }
    }
  }

  if (existsSync(p.foreignRules)) {
    add('INFO', 'foreign rules', '~/.claude/CLAUDE.md is loaded by Muse as personal rules (Muse setting "Personal rules fallback"); LitMuse leaves it on and steers lit routes through its SessionStart context');
  }

  if (!flags.skipRuntimes && env.LITMUSE_SKIP_RUNTIMES !== '1') rows.push(...runtimeRows(env));

  if (!flags.offline) {
    const u = await checkUpdate(env);
    if (u.latest) add('INFO', 'update', u.latest === packageVersion() ? `latest ${u.latest}` : `npm has ${u.latest}; run npx @litfamily/litmuse@latest install`);
    else if (u.error) add('INFO', 'update', `not checked (${u.error})`);
    else if (!u.skipped) add('INFO', 'update', 'no published version yet');
  }

  const fails = rows.filter((r) => r.status === 'FAIL').length;
  const needed = rows.filter((r) => r.status === 'APPROVAL NEEDED').length;
  const warns = rows.filter((r) => r.status === 'WARN').length;
  const summary = fails
    ? `LitMuse doctor: FAIL (${fails} failing check${fails === 1 ? '' : 's'}${needed ? `, ${needed} approvals needed` : ''})`
    : needed
      ? `LitMuse: installed, ${needed} approvals needed. Run the commands above or \`npx @litfamily/litmuse install --approve\`.`
      : `LitMuse doctor: PASS${warns ? ` (${warns} warning${warns === 1 ? '' : 's'})` : ''}`;

  if (flags.json) {
    print(JSON.stringify({ rows, summary: { text: summary, fails, approvalsNeeded: needed, warnings: warns } }, null, 2));
  } else {
    for (const r of rows) {
      const sep = r.status === 'APPROVAL NEEDED' ? ' — ' : ': ';
      print(`${r.status} ${r.label}${sep}${r.detail}${r.fix && r.status === 'INFO' ? ` (fix: ${r.fix})` : ''}`);
    }
    print('');
    print(summary);
  }
  return fails || needed ? 1 : 0;
}
