import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyCommand, classifyWrite, tokenize } from '../plugin/hooks/lib/shell-verdict.mjs';

// The port contract's security table (S-SEC-*) against the start-work run guard. LitMuse lets ordinary local work in
// the workspace run (Muse's own approval mode and sandbox decide it). A case the contract lists as X or B "when
// parked" is asserted where LitMuse parks it; tier B is a new path in a Scope root the plan grants for reading only.

function project() {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-sec-')));
  const out = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-sec-out-')));
  const shared = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-sec-shared-')));
  mkdirSync(join(ws, 'src'));
  mkdirSync(join(ws, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(ws, 'src', 'a.mjs'), 'x');
  writeFileSync(join(ws, 'ok.mjs'), 'x');
  symlinkSync(join(out, 'target'), join(ws, 'notes.txt'));
  symlinkSync(join(out, 'touched'), join(ws, 'dangling.txt'));
  symlinkSync(join(out, 'nowhere'), join(ws, 'dlink'));
  symlinkSync(join(ws, '.git'), join(ws, 'gitlink'));
  symlinkSync(out, join(ws, 'outlink'));
  const ctx = { cwd: ws, root: ws, roots: [{ path: shared, write: false }], grants: [], charter: [], check: 'node check.mjs', denied: { commands: [], paths: [] }, env: process.env };
  return { ws, out, shared, ctx };
}

const verdict = (ctx, cmd) => {
  const v = classifyCommand(cmd, ctx);
  if (v.action === 'park') return v.held ? 'held' : v.tier;
  return v.action;
};
const expectAll = (ctx, cmds, want) => { for (const c of cmds) assert.equal(verdict(ctx, c), want, c); };

test('S-A2-04 tier B: the allowlisted verbs on new paths in a read-only Scope root, joined only by &&', () => {
  const { ctx, shared } = project();
  expectAll(ctx, [`touch ${shared}/fresh.txt`, `mkdir -p ${shared}/out/dir`, `cp src/a.mjs ${shared}/copy.mjs`, `mv src/a.mjs ${shared}/renamed.mjs`,
    `cd ${shared} && touch later.txt`], 'B');
  assert.equal(verdict(ctx, `touch ${shared}/a.txt; touch ${shared}/b.txt`), 'X', 'a ; join is not B');
  assert.equal(verdict(ctx, `mkdir -m 700 ${shared}/x`), 'X', 'a flag off the B list');
  assert.equal(verdict({ ...ctx, roots: [{ path: shared, write: true }] }, `touch ${shared}/fresh.txt`), 'allow', 'a write grant runs it');
});

test('S-SEC-01..03 dangling links are never new paths inside: X', () => {
  const { ctx } = project();
  expectAll(ctx, ['cp src/a.mjs notes.txt', 'touch dangling.txt', 'mkdir -p dlink/x'], 'X');
});

test('S-SEC-04..06 .git targets, case-folded or through a link, are refused (never B)', () => {
  const { ctx } = project();
  const cases = ['touch .git/x', 'cp -r src .git', 'cd src && mv a.mjs ../.git/HEAD', 'cp src/a.mjs gitlink/hooks/pre-commit', 'mkdir -p gitlink/x'];
  if (process.platform === 'darwin' || process.platform === 'win32') cases.push('touch .GIT/hooks/pre-commit', 'cp src/a.mjs .Git/hooks/pre-commit');
  expectAll(ctx, cases, 'refuse');
});

test('S-SEC-07 / S-SEC-08 paths whose real location leaves every known root: X', () => {
  const { ctx, out } = project();
  expectAll(ctx, ['touch outlink/probe.txt', `touch ${out}/f2.txt`, 'cp src/a.mjs ../x'], 'X');
});

test('S-SEC-09 an overwrite by cp or mv is X, inside the workspace too', () => {
  const { ctx } = project();
  expectAll(ctx, ['mv src/a.mjs ok.mjs', 'cp src/a.mjs ok.mjs', 'cp ok.mjs src/a.mjs'], 'X');
  assert.equal(verdict(ctx, 'cp ok.mjs src/b.mjs'), 'B', 'a new path the shell makes in the workspace parks as B');
});

test('S-SEC-10..13 prefixes and verbs that run another verb or move the shell are held', () => {
  const { ctx } = project();
  expectAll(ctx, ['time pushd .. && touch s4b-time.txt', 'A=1 cd .. && touch s4b-assign.txt', '! touch x', 'nice cd .. && touch x',
    'nohup touch x', 'timeout 5 touch x', 'stdbuf -o0 touch x', 'ionice touch x', 'chroot / touch x', 'doas touch x',
    'pushd .. && touch x', 'popd', 'builtin cd .. && touch x', 'command touch x', 'exec touch x', "eval 'touch x'", 'source x.sh',
    '. x.sh', 'env X=1 touch x', 'sudo touch x', 'xargs touch', 'alias', 'set', 'shopt', 'trap', 'enable'], 'held');
});

test('S-SEC-14 globs, braces, escapes and ~ forms are held or refused; redirects are read as writes', () => {
  const { ctx, out } = project();
  expectAll(ctx, ['touch glob*.txt', 'touch {a,b}.txt', 'touch a\\ b', `cat ${homedir()}/.ss[h]/config`], 'held');
  assert.equal(verdict(ctx, 'cd ~someone && ls'), 'refuse');
  assert.equal(verdict(ctx, `touch x > ${out}/other.txt`), 'X', 'a redirect out of the workspace');
  assert.equal(verdict(ctx, 'echo x > other.txt'), 'X', 'a shell redirect inside the workspace parks; file tools write files');
});

test('S-SEC-15 / S-SEC-16 decode, nested shells, expansion, escaped bytes, unpaired quotes and empty steps are held', () => {
  const { ctx } = project();
  expectAll(ctx, ['echo dG91Y2g= | base64 -d | sh', 'xxd -r x.hex', 'openssl enc -d -in x', "sh -c 'x'", 'bash -lc x', 'echo $HOME',
    'echo `id`', 'printf \\x41', 'printf \\101', 'echo "unclosed', 'touch a &&  && touch b'], 'held');
});

test('S-SEC-17 cd: `cd -` held, bare cd refused, cd out of every root makes the step X', () => {
  const { ctx } = project();
  assert.equal(verdict(ctx, 'cd -'), 'held');
  assert.equal(verdict(ctx, 'cd'), 'refuse');
  assert.equal(verdict(ctx, 'cd .. && touch x'), 'X');
  assert.equal(verdict(ctx, 'cd src && cd .. && cd .. && ls'), 'X');
});

test('S-SEC-18 / S-SEC-19 runners and package scripts: outside scripts and non-check scripts are X, never B', () => {
  const { ctx, out } = project();
  expectAll(ctx, [`node ${out}/x.mjs`, `python3 ${out}/x.py`, `bash ${out}/run.sh`, `${out}/run.sh`], 'X');
  expectAll(ctx, ['node -e 1', 'python3 -c 1', 'perl -e 1'], 'held');
  expectAll(ctx, ['node ok.mjs --write x', 'npm test', 'npm run build', 'npm run check:version', 'pnpm run lint', 'yarn test', 'make test'], 'allow');
  expectAll(ctx, ['npm run clean', 'npm start', 'npm run-script x', 'make all', 'make ship', 'make', 'npx x', 'pnpm exec x', 'yarn dlx x', 'bun x y'], 'X');
});

test('S-SEC-20 / S-SEC-21 outward or irreversible steps are X', () => {
  const { ctx } = project();
  expectAll(ctx, ['gh pr merge 12', 'npm unpublish x', 'npm deprecate x old', 'curl -X POST https://example.invalid/a', 'wget https://example.invalid',
    'ssh host ls', 'scp a host:b', 'docker push x', 'aws s3 rm s3://x', 'rm -rf build', 'git push origin b', 'git tag v1', 'npm publish',
    'git reset --hard', 'git clean -fd', 'git config x y', 'npm version patch', 'npm install left-pad', 'pip install x', 'brew install x',
    'cargo publish', 'muse plugins approve litmuse:hook:stop'], 'X');
});

test('S-SEC-22 / S-SEC-23 unknown git subcommands are X', () => {
  const { ctx } = project();
  expectAll(ctx, ['git pu', 'git frobnicate', 'git ci -m x'], 'X');
});

test('S-SEC-24 every delete is X, inside the workspace too', () => {
  const { ctx } = project();
  expectAll(ctx, ['rm -rf ../dist-old', 'find src -delete', 'unlink /x', 'rm -rf src/tmp', 'rmdir src/empty'], 'X');
  assert.equal(verdict(ctx, 'find .. -delete'), 'refuse', 'deleting the parent would remove the workspace .litmuse run records');
});

test('S-SEC-25..28 secrets and host homes are refused, after quotes, links and cd are followed', () => {
  const { ctx, ws } = project();
  const home = homedir();
  writeFileSync(join(ws, '.env'), 'x');
  expectAll(ctx, [`cd ${home} && cat .aws/credentials`, `cat ${home}/.cl""aude/settings.json`, `cat ${home}/.c'l'aude/settings.json`,
    `cd ${home}/Desktop && cd .. && cat .ssh/config`, `cat ${home}/.ssh/id_ed25519`, `cat ${home}/.npmrc`, `cat ${home}/.zshrc`,
    `ls ${home}/.codex`, `cat ${home}/.config/muse/config.toml`, 'cat .env', 'cat .env.local', 'cat key.pem', 'cat .mcp.json', 'cat .envrc',
    `echo x > ${home}/.local/share/muse/x`], 'refuse');
  expectAll(ctx, ['cat .env.example', 'cat .env.sample', 'cat .env.template'], 'allow');
});

test('S-SEC-28 a replaced HOME still protects the account\'s real home', () => {
  const { ctx } = project();
  const fake = realpathSync(mkdtempSync(join(tmpdir(), 'litmuse-fake-home-')));
  const real = homedir();
  assert.equal(verdict({ ...ctx, env: { ...process.env, HOME: fake } }, `cat ${real}/.aws/credentials`), 'refuse');
  assert.equal(verdict({ ...ctx, env: { ...process.env, HOME: fake } }, `cat ${fake}/.ssh/config`), 'refuse');
});

test('S-A2-08 / S-A2-09 / S-SEC-36 a self-check held only for its shape is split; a forbidden part gets no hint', () => {
  const { ctx } = project();
  assert.equal(classifyCommand('node check.mjs; echo "exit=$?"', ctx).action, 'split');
  assert.equal(classifyCommand('node ok.mjs 2>&1; echo $?', ctx).action, 'split');
  assert.equal(classifyCommand('node ok.mjs || git push', ctx).tier, 'X');
  assert.equal(classifyCommand('node ok.mjs; rm -rf ../zz', ctx).tier, 'X');
  assert.equal(classifyCommand(`cd ${homedir()} && cat .aws/credentials`, ctx).action, 'refuse');
});

test('file tools: protected targets refused; outside and read-only roots become path boundaries a grant lifts', () => {
  const { ctx, out, shared } = project();
  assert.equal(classifyWrite('.git/hooks/pre-commit', ctx).action, 'refuse');
  assert.equal(classifyWrite(join(homedir(), '.ssh', 'config'), ctx).action, 'refuse');
  assert.equal(classifyWrite('src/b.mjs', ctx).action, 'allow');
  assert.equal(classifyWrite('docs/b.md', ctx).action, 'allow', 'the whole workspace is writable');
  assert.equal(classifyWrite(join(out, 'b.md'), ctx).action, 'park');
  assert.equal(classifyWrite(join(shared, 'b.md'), ctx).action, 'park');
  assert.equal(classifyWrite(join(out, 'b.md'), { ...ctx, roots: [{ path: out, write: true }] }).action, 'allow');
});

test('C-1 what runs unparked: readers, the Done-when check, the repo\'s own test and check commands, in-project scripts', () => {
  const { ctx } = project();
  expectAll(ctx, ['git status', 'ls -la', 'cat src/a.mjs || true', "grep -n a src/a.mjs", 'node check.mjs', 'npm test', 'npm run check',
    'npm run lint', 'npm run build', 'npm run typecheck', 'node --test', 'node ok.mjs', 'python3 -m pytest', 'cargo test', 'go test ./...',
    'make test', 'pytest -q', 'git diff --stat', 'echo done', 'printf x', 'pwd'], 'allow');
  assert.equal(verdict({ ...ctx, charter: [{ branch: 'main', repo: ctx.root }] }, 'git add src/a.mjs'), 'allow', 'git add under a charter');
});

test('C-1 default deny: unknown verbs and writing forms park, never run by default', () => {
  const { ctx } = project();
  expectAll(ctx, ['dd if=src/a.mjs of=copy.bin', 'tar -C out -xf x.tar', 'ln -s src/a.mjs link', 'chmod +x ok.mjs', 'truncate -s 0 src/a.mjs',
    'install -m 755 ok.mjs bin/ok', 'patch -p1 < fix.diff', 'go run ./cmd', 'cargo run', 'uv run x.py', 'deno run x.ts', 'awk 1 src/a.mjs',
    'python3 -m http.server', 'yarn', 'prettier --write .', 'frobnicate --now', 'echo x > log.txt', 'sed -i s/a/b/ src/a.mjs',
    'npm run deploy'], 'X');
  expectAll(ctx, ['touch fresh.txt', 'mkdir -p out/dir', 'cp src/a.mjs copy.mjs', 'git add src/a.mjs'], 'B');
});

test('C-2 a runner on a script outside the project parks as X; the in-project indirection residual is documented', () => {
  const { ctx, out } = project();
  writeFileSync(join(out, 'evil.mjs'), 'x');
  expectAll(ctx, [`node ${out}/evil.mjs`, `python3 ${out}/evil.py`, `sh ${out}/evil.sh`, `${out}/evil.mjs`], 'X');
  const doc = readFileSync(new URL('../docs/reference.md', import.meta.url), 'utf8');
  assert.match(doc, /A script inside the project can do anything its author wrote/);
});

test('C-3 name=value operands are checked as paths; git branch writing forms, find -fls and awk park', () => {
  const { ctx, out } = project();
  assert.equal(verdict(ctx, 'dd if=src/a.mjs of=.env'), 'refuse');
  assert.equal(verdict(ctx, `dd if=${homedir()}/.ssh/id_ed25519 of=x`), 'refuse');
  expectAll(ctx, ['git branch -d old', 'git branch -m a b', 'git branch -c a b', `find . -fls ${out}/x`, "awk '{print}' src/a.mjs"], 'X');
});

test('C-4 shell writes naming the run state, .git/hooks, .git/config or the real host home are refused, never parked', () => {
  const { ctx } = project();
  const state = join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'litmuse');
  expectAll(ctx, [`echo x > ${state}/seal.key`, `cp src/a.mjs ${state}/sessions/x.json`, 'echo x > .git/hooks/pre-commit',
    'echo x >> .git/config', `touch ${homedir()}/litmuse-probe.txt`, `echo x > ${homedir()}/notes.txt`], 'refuse');
});

test('C-5 link chains resolve fully: two hops into a protected root refuse, loops refuse', () => {
  const { ctx, ws, out } = project();
  symlinkSync(join(homedir(), '.ssh'), join(out, 'hop2'));
  symlinkSync(join(out, 'hop2'), join(ws, 'hop1'));
  symlinkSync(join(out, 'gone', 'deeper'), join(out, 'hop3'));
  symlinkSync(join(out, 'hop3'), join(ws, 'hopd'));
  symlinkSync(join(ws, 'loopb'), join(ws, 'loopa'));
  symlinkSync(join(ws, 'loopa'), join(ws, 'loopb'));
  expectAll(ctx, ['touch hop1/new_key', 'cat hop1/config', 'touch loopa', 'cat loopb/x'], 'refuse');
  assert.equal(classifyWrite('hop1/authorized_keys', ctx).action, 'refuse');
  assert.equal(classifyWrite('loopa', ctx).action, 'refuse');
  assert.equal(verdict(ctx, 'touch hopd'), 'X', 'a dangling two-hop chain leaving the workspace');
  symlinkSync(join(homedir(), '.ssh', 'litmuse-never-made'), join(out, 'hop4'));
  symlinkSync(join(out, 'hop4'), join(ws, 'hopk'));
  assert.equal(verdict(ctx, 'touch hopk'), 'refuse', 'a dangling two-hop chain whose final target is in a protected root');
  assert.equal(classifyWrite('hopk', ctx).action, 'refuse');
});

test('S-SEC-37 sed: only p/d/q/s scripts read; w, W, r, R, e and s///w, s///e are held; -f is held; -i writes', () => {
  const { ctx, out } = project();
  expectAll(ctx, ["sed -n '1,5p' src/a.mjs", "sed 's/a/b/g' src/a.mjs", "sed -e '/x/d' -e '3q' src/a.mjs"], 'allow');
  expectAll(ctx, [`sed 'w ${out}/x' src/a.mjs`, `sed -n 'W ${out}/x' src/a.mjs`, "sed '1e id' src/a.mjs", "sed 's/a/id/e' src/a.mjs",
    `sed 's/a/b/w ${out}/x' src/a.mjs`, `sed 'r ${out}/x' src/a.mjs`, "sed 'R /etc/hosts' src/a.mjs", 'sed -f script.sed src/a.mjs',
    `sed -e 'p' -e 'w ${out}/x' src/a.mjs`], 'held');
  assert.equal(verdict(ctx, `sed -i s/a/b/ ${out}/f.txt`), 'X', 'an in-place edit outside the workspace');
});

test('S-SEC-38 writing options and output operands of readers: sort -o, uniq OUT, tree -o, git --output, find -fprint', () => {
  const { ctx, out } = project();
  expectAll(ctx, [`sort -o ${out}/f src/a.mjs`, `sort --output=${out}/f src/a.mjs`, `sort -o${out}/f src/a.mjs`, `uniq src/a.mjs ${out}/f`,
    `tree -o ${out}/f .`, `git diff --output=${out}/f`, `git log --output ${out}/f`, `find . -fprint0 ${out}/f`, `find . -fprint ${out}/f`, 'sort -o sorted.txt src/a.mjs', 'uniq src/a.mjs copy.txt'], 'X');
  expectAll(ctx, ['sort src/a.mjs', 'uniq src/a.mjs', 'git diff --stat', 'find . -name a.mjs', 'grep -o a src/a.mjs'], 'allow');
});

test('S-SEC-39 readers that start a program are held: rg --pre, sort --compress-program, awk system/getline/>, git grep -O', () => {
  const { ctx } = project();
  expectAll(ctx, ['rg --pre ./x.sh a', 'rg --pre=./x.sh a', 'sort --compress-program=./x src/a.mjs', `awk '{system("id")}' src/a.mjs`,
    "awk '{print > \"/tmp/x\"}' src/a.mjs", "awk '{\"id\" | getline v}' src/a.mjs", 'awk -f prog.awk src/a.mjs', 'git grep -O a',
    'git diff --ext-diff'], 'held');
  assert.equal(verdict(ctx, "awk '{print $1}' src/a.mjs"), 'X', 'awk is never a reader');
  assert.equal(verdict(ctx, 'rg -n a src'), 'allow');
});

test('S-SEC-40 git branch -D/-f and other branch writes are X; listing is allowed', () => {
  const { ctx } = project();
  expectAll(ctx, ['git branch -D old', 'git branch -f main HEAD~1', 'git branch new', 'git branch -m a b'], 'X');
  expectAll(ctx, ['git branch --show-current', 'git branch -a'], 'allow');
});

test('S-SEC-41 a split hint never drops a mutating part', () => {
  const { ctx } = project();
  // Each is held for its `$?`; the hint may name only reading parts, so a writing part turns it into a parked step.
  assert.equal(classifyCommand('node check.mjs; echo "$?" > ../f', ctx).action, 'park');
  assert.equal(classifyCommand('node check.mjs; echo "exit=$?" >> notes.txt', ctx).action, 'park');
  assert.equal(classifyCommand('node check.mjs; echo $?; sort -o ../f src/a.mjs', ctx).action, 'park');
  assert.equal(classifyCommand('node check.mjs; echo $?; sed -i s/a/b/ src/a.mjs', ctx).action, 'park');
  // Outside a held shape, a shell write in the workspace parks too.
  assert.equal(classifyCommand('cat src/a.mjs; echo x >> log.txt', ctx).action, 'park');
  assert.equal(classifyCommand('node check.mjs; echo x > ../f', ctx).action, 'park');
  const ok = classifyCommand('node check.mjs; echo "exit=$?" 2>&1', ctx);
  assert.deepEqual([ok.action, ok.parts], ['split', ['node check.mjs']]);
});

test('tokenize keeps 2>&1, /dev/null and pipes readable', () => {
  assert.equal(tokenize('npm test 2>&1 | tail -5').segments.length, 2);
  assert.equal(tokenize('ls > /dev/null').segments[0].redirects[0].target, '/dev/null');
});

test('R7 readers that run code or print the environment are held: less/more +cmd, jq env/$ENV/input_filename, rg --hostname-bin', () => {
  const { ctx } = project();
  expectAll(ctx, ["less '+!id' src/a.mjs", 'more +/x src/a.mjs', "jq -n 'env' ", "jq -n '$ENV.HOME'", "jq -r '.a | env.PATH' x.json",
    "jq 'input_filename' x.json", "jq -n '$__loc__'", 'rg --hostname-bin=./x.sh a', 'rg --hostname-bin ./x.sh a'], 'held');
  expectAll(ctx, ["jq '.name' x.json", 'jq -r .version package.json', 'rg -n a src'], 'allow');
});

// --- round 9: cross-port checks -----------------------------------------------------------------------------

test('R9-1 a write, move or remove whose target is or contains the run state folder is refused', () => {
  const { ctx } = project();
  const state = join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'litmuse');
  expectAll(ctx, ['mv .litmuse x', 'rm -rf .litmuse', 'rm -rf .', 'mv . ../elsewhere', `rm -rf ${state}`, `rm -rf ${join(state, '..')}`,
    `mv ${state} ../x`, 'echo x > .litmuse/sessions/a.json', 'cp src/a.mjs .litmuse/sessions/a.json', 'mv .LITMUSE y'], 'refuse');
  assert.equal(classifyWrite('.litmuse/sessions/x.json', ctx).action, 'refuse');
});

test('R9-2 file-edit targets get the case-folded state and protected-path checks', () => {
  const { ctx } = project();
  for (const t of ['.LitMuse/Sessions/x.json', '.ENV', '.Env.local', 'ID_RSA', 'keys/Server.PEM']) assert.equal(classifyWrite(t, ctx).action, 'refuse', t);
  expectAll(ctx, ['cat .ENV', 'cat keys/ID_ED25519'], 'refuse');
  assert.equal(classifyWrite('.env.example', ctx).action, 'allow');
});

test('R9-3 leading ~/ operands are home paths and refused when protected', () => {
  const { ctx } = project();
  expectAll(ctx, ['cat ~/.ssh/config', 'cp src/a.mjs ~/.zshrc', 'head -5 ~/.npmrc', 'grep x ~/.aws/credentials'], 'refuse');
});

test('R9-4 git REV:path operands are secret-checked', () => {
  const { ctx } = project();
  expectAll(ctx, ['git show HEAD:.env', 'git show main:config/.env.local', 'git show HEAD~1:keys/id_rsa', 'git cat-file -p HEAD:.npmrc'], 'refuse');
  assert.equal(verdict(ctx, 'git show HEAD:src/a.mjs'), 'allow');
});

test('R9-5 grep -f with a pattern file outside the project is held; sort --compress-program is held', () => {
  const { ctx, out } = project();
  expectAll(ctx, [`grep -f ${out}/pats src/a.mjs`, `grep --file=${out}/pats src`, `rg -f ${out}/pats a`, `egrep -f${out}/p src`,
    'sort --compress-program=gzip src/a.mjs', 'sort --compress-program gzip src/a.mjs'], 'held');
  assert.equal(verdict(ctx, 'grep -f pats.txt src/a.mjs'), 'allow');
});

// --- round 10: OpenCode cross-port checks -------------------------------------------------------------------

test('R10-1 sort and file options are read from an allowlist: abbreviations and clusters are judged like full forms', () => {
  const { ctx, out } = project();
  expectAll(ctx, [`sort -uo ${out}/f src/a.mjs`, `sort --out=${out}/f src/a.mjs`, `sort --outp ${out}/f src/a.mjs`, 'sort -uo sorted.txt src/a.mjs',
    'sort -nro sorted.txt src/a.mjs', 'file --comp src/a.mjs', 'file -bC src/a.mjs'], 'X');
  expectAll(ctx, ['sort --compress-prog=sh src/a.mjs', 'sort --compress=sh src/a.mjs', 'sort --comp sh src/a.mjs', 'sort --frobnicate src/a.mjs',
    'sort -T /tmp src/a.mjs', 'file --frob src/a.mjs', 'file -m magic src/a.mjs'], 'held');
  expectAll(ctx, ['sort -u src/a.mjs', 'sort -k2,2 -t, -n src/a.mjs', 'sort --reverse --numeric-sort src/a.mjs', 'sort -k 2 src/a.mjs',
    'file -b src/a.mjs', 'file --mime-type src/a.mjs', 'file -bL src/a.mjs'], 'allow');
});

test('R10-2 the protected check follows cd across segments', () => {
  const { ctx } = project();
  expectAll(ctx, ['cd ~/.config && cat gh/hosts.yml', `cd ${homedir()} && cat .ssh/config`, 'cd ~ && ls .aws', 'cd ~/.config && cd gh && cat hosts.yml'], 'refuse');
});

test('R10-3 writes into any .git internal are refused, also a linked worktree git dir outside the workspace', () => {
  const { ctx, out } = project();
  mkdirSync(join(out, 'main', '.git', 'refs', 'heads'), { recursive: true });
  expectAll(ctx, ['echo x > .git/HEAD', 'cp src/a.mjs .git/refs/heads/main', 'touch .git/index', 'echo x > .git/packed-refs',
    `touch ${out}/main/.git/HEAD`, `cp src/a.mjs ${out}/main/.git/refs/heads/x`, `echo x >> ${out}/main/.git/config`], 'refuse');
  for (const t of ['.git/HEAD', '.git/packed-refs', `${out}/main/.git/config`, `${out}/main/.git/refs/heads/x`]) assert.equal(classifyWrite(t, ctx).action, 'refuse', t);
});

test('R10-4 recursive readers on an ancestor of a protected folder are refused', () => {
  const { ctx } = project();
  expectAll(ctx, ['grep -r x ~', `grep -R x ${homedir()}`, "find ~ -name 'id_*'", 'rg secret ~', 'ls -R ~', 'tree ~', 'du -a ~', 'find / -name x',
    'grep -r token ~/.config', 'grep --recursive x ~', 'rg -uu key /'], 'refuse');
  expectAll(ctx, ['grep -r x src', 'find . -name a.mjs', 'rg x', 'rg x src', 'ls ~', 'grep x src/a.mjs'], 'allow');
});

// --- review-final --------------------------------------------------------------------------------------------

test('RF-H unquoted reader globs in the workspace are expanded and every match is checked', () => {
  const { ctx, ws } = project();
  writeFileSync(join(ws, '.env'), 'x');
  writeFileSync(join(ws, '.env.local'), 'x');
  writeFileSync(join(ws, 'srv.pem'), 'x');
  expectAll(ctx, ['cat .env*', 'cat .e?v', 'cat *.pem', 'head .en[v]', 'grep x .env*'], 'refuse');
  expectAll(ctx, ['cat src/*.mjs', 'ls *.mjs', 'wc -l src/*'], 'allow');
  assert.equal(verdict(ctx, 'cat nodir/*'), 'held', 'a glob over a folder the guard cannot read');
  assert.equal(verdict(ctx, 'cat src/../.env*'), 'held', 'a glob that climbs with ..');
  assert.equal(verdict(ctx, "cat '.e'nv*"), 'held', 'a partly quoted glob');
  expectAll(ctx, ['cat .{env,x}', 'cat {.env,ok.mjs}'], 'refuse');
});

test('RF-M git index paths (:path, :0:path) are secret-checked', () => {
  const { ctx } = project();
  expectAll(ctx, ['git show :.env', 'git show :0:.env', 'git show :2:config/.env.local', 'git cat-file -p :id_rsa'], 'refuse');
});

test('RF-L recursive-root parsing: clusters, attached patterns, find -L, rg --files, diff -r, grep -d recurse', () => {
  const { ctx, out } = project();
  expectAll(ctx, [`grep -rf ${out}/pat .`, `grep -rf${out}/pat .`], 'held');
  expectAll(ctx, ['grep -re KEY ~', `grep -r -eKEY ${homedir()}`, 'grep --regexp=KEY -r ~', 'find -L ~ -name x', 'find -H / -name x',
    'rg --files ~', 'diff -r ~ src', 'grep -d recurse x ~', 'cd ~ && grep -r foo'], 'refuse');
  expectAll(ctx, ['grep -re KEY src', 'rg --files src', 'diff -r src src', 'find -L src -name x'], 'allow');
});

test('RF-CP a copy or move into the project root is tier B; sources and removals keep the run-state check', () => {
  const { ctx, ws } = project();
  mkdirSync(join(ws, '.litmuse', 'sessions'), { recursive: true });
  expectAll(ctx, ['cp src/a.mjs .', 'mv src/a.mjs .', `cp src/a.mjs ${ws}`, 'cd src && cp a.mjs ..', 'cp src/a.mjs .litmuse'], 'B');
  expectAll(ctx, ['mv .litmuse x', 'mv . ../x', 'cp -r .litmuse/sessions keep', 'cp src/a.mjs .litmuse/sessions/s.json',
    'mv src/a.mjs .litmuse/sessions', 'rm -rf .'], 'refuse');
  assert.equal(verdict(ctx, 'cp -r src .git'), 'refuse');
  assert.equal(verdict(ctx, 'cp ok.mjs src'), 'B', 'a new file inside an existing folder');
});

test('RF-G a workspace glob with no match, or with a bracket class the guard does not read, is held', () => {
  const { ctx, ws } = project();
  writeFileSync(join(ws, '.env'), 'x');
  expectAll(ctx, ['cat .en[[:alpha:]]', 'cat .en[[=v=]]', 'cat .en[[.v.]]', 'cat *.nomatch', 'cat src/*.none'], 'held');
  expectAll(ctx, ['cat src/*.mjs', 'cat ok.m[j]s'], 'allow');
});
