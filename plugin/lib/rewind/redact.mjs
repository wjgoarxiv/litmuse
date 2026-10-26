// Redaction for every string the lit-adhd collector emits. Credential shapes and URI userinfo come
// from the shared secret-shape set; `NAME=value` pairs with a secret-like name lose their value; any
// substring equal to a current environment value is replaced (compared here, never printed:
// 8+ characters, 24+ for URL-form values such as webhooks); the home directory becomes `~`.
// Plain filesystem paths and locale/terminal values are not credentials and stay, or every path
// in the brief would be blanked.

import { SECRET_SHAPE_PATTERNS, URI_USERINFO_PATTERN } from '../secret-shapes.mjs';

const MASK = '[redacted]';

// Terminal escape sequences never reach collected text: a commit subject or plan row
// carrying them could repaint the brief or smuggle in a hyperlink when printed. ESC
// opens an OSC run (to BEL or ST) or a CSI run (to its final byte); the remaining C0
// controls, DEL and C1 go, except the tab that joins multi-line subjects upstream.
const stripTerminalRuns = (text) => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 27) {
      index += 1;
      if (text[index] === ']' || text[index] === '[') {
        const osc = text[index] === ']';
        index += 1;
        if (osc) {
          while (index < text.length && text.charCodeAt(index) !== 7 && text.charCodeAt(index) !== 27) index += 1;
          if (text.charCodeAt(index) === 27) index += 2;
          else index += 1;
        } else {
          while (index < text.length && !/[A-Za-z]/.test(text[index])) index += 1;
          index += 1;
        }
      }
      continue;
    }
    if (code < 32 ? code !== 9 : code === 127 || (code >= 128 && code <= 159)) {
      index += 1;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
};
const SECRET_NAME = /KEY|TOKEN|SECRET|PASS|AUTH|COOKIE/iu;
const JSON_SECRET = /("[A-Za-z_][A-Za-z0-9_]*"|'[A-Za-z_][A-Za-z0-9_]*')\s*:\s*("[^"]*"|'[^']*'|[^\s"'`,}]+)/gu;
const ASSIGNMENT = /\b([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s"'`]+)/gu;
const PLAIN_ENV_NAMES = /^(?:PATH|HOME|PWD|OLDPWD|SHELL|USER|LOGNAME|LANG|LANGUAGE|TERM|TERM_PROGRAM|TERM_PROGRAM_VERSION|COLORTERM|EDITOR|VISUAL|PAGER|TMPDIR|SHLVL|LC_[A-Z]+|XPC_[A-Z_]+|__CF[A-Z_]*|COMMAND_MODE|_)$/u;
const globalOf = (pattern) => new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
const SHAPES = [...SECRET_SHAPE_PATTERNS.map(globalOf)];
const USERINFO = globalOf(URI_USERINFO_PATTERN);

const envSecrets = (env) =>
  Object.entries(env ?? {})
    .filter(([name, value]) => {
      if (typeof value !== 'string' || PLAIN_ENV_NAMES.test(name) || /^(?:true|false|\d+)$/iu.test(value)) return false;
      // URL-form values (webhooks, signed URLs) are masked from a higher bar; a lone
      // ':/' that is not '://' keeps the old exemption.
      if (value.includes('://')) return value.length >= 24;
      if (value.length < 8 || value.includes(':/')) return false;
      // Plain filesystem paths stay readable unless they carry a query string or userinfo.
      if (/^[~/]/u.test(value)) return value.includes('?') || value.includes('@');
      return true;
    })
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);

/** A redactor bound to one environment and home, so the env scan happens once per run. */
export const makeRedactor = ({ env = process.env, home = env?.HOME } = {}) => {
  const values = envSecrets(env);
  return (input) => {
    if (typeof input !== 'string' || input === '') return input;
    let text = input;
    for (const value of values) if (text.includes(value)) text = text.split(value).join(MASK);
    text = text.replace(USERINFO, (match) => match.replace(/\/\/[^/?#\s]+@/u, `//${MASK}@`));
    text = text.replace(ASSIGNMENT, (match, name) => (SECRET_NAME.test(name) ? `${name}=${MASK}` : match));
    text = text.replace(JSON_SECRET, (match, key) => (SECRET_NAME.test(key) ? `${key}: ${MASK}` : match));
    for (const pattern of SHAPES) text = text.replace(pattern, MASK);
    if (typeof home === 'string' && home.length > 1) text = text.split(home).join('~');
    return stripTerminalRuns(text);
  };
};
