// `litmuse install --agent`: the install guide a coding agent follows and its user can read. Plain text, the same bytes
// everywhere; printing it reads no setting and starts nothing. The READMEs carry the same steps as a prompt, and
// test/agent-guide.test.mjs binds the guide, the parser, the installer's questions and both prompts.
import { CAP_LEFT, CAP_RIGHT } from './glyphs.mjs';
import { FONT_FILES } from './guard.mjs';
import { NPX } from './flags.mjs';

export const AGENT_LINE = `Agent? See ${NPX} install --agent.`;
// For a card too narrow for the line above.
export const AGENT_LINE_SHORT = 'Agent? See install --agent.';
export const PILL = `${CAP_LEFT} LIT ${CAP_RIGHT}`;

export const COMMANDS = Object.freeze({
  preview: `${NPX} install --dry-run --round`,
  install: `${NPX} install --yes --round`,
  update: `${NPX} update --yes --round`,
  doctor: `${NPX} doctor`,
  card: `${NPX} status --card`,
  round: `${NPX} install --yes --glyphs round`,
  square: `${NPX} install --yes --glyphs square`,
  auto: `${NPX} install --yes --glyphs auto`,
});

// `card` is the title of the installer's own question card; the last two are choices the installer takes as flags only.
export const QUESTIONS = Object.freeze([
  { card: 'Rules file', ask: "Add the short LitFamily block to Muse's user rules file?", base: 'yes', other: 'For no, add --no-agent-file to every install and update command below; it lasts one run.', flag: '--no-agent-file' },
  { card: 'Approvals', ask: 'Approve the LitMuse hooks and agents?', base: 'no', other: 'Your user can choose it later with the "muse plugins approve" commands the install prints.' },
  { ask: 'Install for every project (user scope)?', base: 'yes', other: 'For the current project only, add --scope project to the install line.', flag: '--scope project' },
  { ask: 'Round or square ends on the status card?', base: 'auto', other: 'Add --glyphs round or --glyphs square; step 7 asks this again with a picture.', flag: '--glyphs round' },
]);

export const agentGuide = () => `LitMuse install guide for coding agents

If you are a coding agent and your user asked you to install LitMuse, follow these steps. They are written for your user to read too.

1. Preview. LitMuse needs Node.js 20 or newer and Muse Code ("muse --version").
   ${COMMANDS.preview}
   Show your user what it would change.

2. Ask. Show your user these questions and their defaults.
   - Keep every default? Default: yes.
${QUESTIONS.map((q) => `   - ${q.ask} Default: ${q.base}. ${q.other}`).join('\n')}
   - Icon font: --round adds ${FONT_FILES.font} and its licence file (${FONT_FILES.license}) to ~/Library/Fonts on macOS or \${XDG_DATA_HOME:-~/.local/share}/fonts on Linux, only when no icon font is here. On Windows it adds none.
   - What your user will see: the status card. It needs no flag: your user runs "${COMMANDS.card}" in their own terminal, with --watch to keep it open.

3. Wait for your user's yes. Use only this package; add no other source, and do not approve hooks, trust or sign-in for your user.

4. Install.
   ${COMMANDS.install}

5. Update, later.
   ${COMMANDS.update}

6. Check. The install must print a line that starts with ROUND_ENDS:. Then run
   ${COMMANDS.doctor}
   It passes with "LitMuse doctor: PASS". Until your user approves the hooks and agents it says "LitMuse: installed, <n> approvals needed" and exits 1; that is expected. A line that starts with FAIL is a failed step.
   If a step fails, show your user the lines and stop.

7. Rounded ends. Show your user this and ask if both ends are round: ${PILL}
   Ask for an answer from the terminal that will show the status card.
   - Round: ${COMMANDS.round}
   - Boxes or question marks: ${COMMANDS.square}
     An installed symbols font alone is no proof that a terminal uses it. For round ends your user sets the terminal's own font to a full Nerd Font, or adds Symbols Nerd Font Mono as its fallback font (iTerm2: Non-ASCII Font, VS Code: terminal.integrated.fontFamily, kitty: symbol_map). Terminal.app has no fallback setting, so it needs a full Nerd Font as its font.
   - Over SSH, on a phone, or no answer: leave it.
   - Undo: ${COMMANDS.auto}

8. Only your user can
   - approve: run the "muse plugins approve" commands the install printed, then run the doctor command again;
   - restart: quit Muse if it is open and start it again;
   - sign in to Muse, and trust a folder or Git repository when Muse or Git asks.
`;
