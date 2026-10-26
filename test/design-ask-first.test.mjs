// Addendum D: every design skill asks the theme/preset first. Each skill below names its
// ask-first step with `request_user_input` (2–4 options, recommended first), skips only when
// the brief names it or says "you choose", logs the headless default as a `decision` line, and
// places that step before any drafting or building step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'plugin', 'skills');
const text = (skill) => readFileSync(join(ROOT, skill, 'SKILL.md'), 'utf8');

const SKILLS = {
  'lit-pptx': { ask: 'the first, one-click option', build: 'never patch the `.pptx` by hand' },
  'lit-docx': { ask: 'as the first option', build: 'never patch the `.docx`' },
  'lit-schematic': { ask: 'Ask the form first', build: '5. Build.' },
  'frontend-ui-ux': { ask: 'Ask the look first', build: 'Feature-first build order' },
  'lit-diagram-drawer': { ask: 'Ask the type first', build: '## Mode matrix' },
  'readme-studio': { ask: 'the first question is always the cover direction', build: '9. **Cover' },
};

for (const [skill, markers] of Object.entries(SKILLS)) {
  test(`ask-first: ${skill} chooses the theme before building`, () => {
    const body = text(skill);
    for (const required of ['request_user_input', 'recommended first', 'Headless']) {
      assert.ok(body.includes(required), `${skill} names ${required}`);
    }
    assert.ok(body.toLowerCase().includes('you choose') || body.includes('알아서'),
      `${skill} names the you-choose skip`);
    const askAt = body.indexOf(markers.ask);
    const buildAt = body.indexOf(markers.build);
    assert.ok(askAt !== -1, `${skill} has its ask-first step`);
    assert.ok(buildAt !== -1, `${skill} has its build step`);
    assert.ok(askAt < buildAt, `${skill} asks before it builds`);
  });
}
