import './home.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iconFontInstalled, roundGlyphs } from '../lib/glyphs.mjs';

const yes = () => true;
const no = () => false;

test('round ends: the setting, then the terminal, then SSH, then an installed icon font', () => {
  for (const value of ['round', 'nerd', 'ROUND']) assert.equal(roundGlyphs({ LITMUSE_GLYPHS: value, SSH_CONNECTION: 'x' }, no), true, value);
  for (const value of ['basic', 'square', 'Basic']) assert.equal(roundGlyphs({ LITMUSE_GLYPHS: value, WT_SESSION: 'x' }, yes), false, value);
  for (const env of [{ WT_SESSION: 'x' }, { KITTY_WINDOW_ID: '1' }, { TERM: 'xterm-kitty' }, { TERM_PROGRAM: 'vscode' }, { TERM_PROGRAM: 'WezTerm' }, { TERM_PROGRAM: 'ghostty' }]) {
    assert.equal(roundGlyphs({ ...env, SSH_CONNECTION: 'x' }, no), true, JSON.stringify(env));
  }
  assert.equal(roundGlyphs({ SSH_CONNECTION: 'x' }, yes), false, 'the far machine\'s fonts say nothing about this screen');
  assert.equal(roundGlyphs({ TERM_PROGRAM: 'iTerm.app' }, yes), true);
  assert.equal(roundGlyphs({ TERM_PROGRAM: 'iTerm.app' }, no), false);
  assert.equal(roundGlyphs({ LITMUSE_GLYPHS: 'other' }, yes), true, 'an unknown value is no setting');
});

test('the font folders are asked only when nothing else decides', () => {
  const never = () => assert.fail('read the fonts');
  for (const env of [{ LITMUSE_GLYPHS: 'round' }, { LITMUSE_GLYPHS: 'basic' }, { WT_SESSION: 'x' }, { SSH_CONNECTION: 'x' }]) roundGlyphs(env, never);
});

test('icon fonts are found by file name, with bounds, and no link is followed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litmuse-fonts-'));
  const at = (...names) => join(dir, ...names);
  const found = (folder, over = {}) => iconFontInstalled({ folders: [at(folder)], ...over });
  const put = (folder, ...names) => {
    mkdirSync(at(folder), { recursive: true });
    for (const name of names) writeFileSync(at(folder, name), '');
  };
  put('plain', 'Arial.ttf', 'Confidential.otf', 'JetBrainsMonoNerdFont.txt', 'INFO.ttf', 'Snf-Regular.ttf');
  assert.equal(found('plain'), false);
  for (const [i, name] of ['JetBrainsMonoNerdFont-Regular.ttf', 'Symbols Nerd Font Mono.otf', 'Hack-NF-Bold.ttf', 'Iosevka NFM.ttc', 'x_NFP_.TTF'].entries()) {
    put(`f${i}`, name);
    assert.equal(found(`f${i}`), true, name);
  }
  put(join('deep', 'a', 'b', 'c'), 'SymbolsNerdFont.ttf');
  assert.equal(found('deep'), true, 'three folders down');
  put(join('deeper', 'a', 'b', 'c', 'd'), 'SymbolsNerdFont.ttf');
  assert.equal(found('deeper'), false, 'four folders down');
  put('many', 'a.ttf', 'b.ttf', 'zNerdFont.ttf');
  assert.equal(found('many', { limit: 2 }), false, 'too many names');
  assert.equal(found('missing'), false);
  if (process.platform !== 'win32') {
    mkdirSync(at('linked'));
    symlinkSync(at('deep', 'a'), at('linked', 'a'));
    symlinkSync(at('f0', 'JetBrainsMonoNerdFont-Regular.ttf'), at('linked', 'JetBrainsMonoNerdFont-Regular.ttf'));
    assert.equal(found('linked'), false);
  }
});

test('each platform reads its own font folders', () => {
  const home = mkdtempSync(join(tmpdir(), 'litmuse-fonts-'));
  const put = (...parts) => {
    mkdirSync(join(home, ...parts), { recursive: true });
    writeFileSync(join(home, ...parts, 'SymbolsNerdFont.ttf'), '');
  };
  put('xdg', 'fonts');
  put('local', 'Microsoft', 'Windows', 'Fonts');
  put('mac', 'Library', 'Fonts');
  assert.equal(iconFontInstalled({ platform: 'linux', env: { HOME: join(home, 'none'), XDG_DATA_HOME: join(home, 'xdg') } }), true);
  assert.equal(iconFontInstalled({ platform: 'win32', env: { LOCALAPPDATA: join(home, 'local') } }), true);
  assert.equal(iconFontInstalled({ platform: 'win32', env: {} }), false);
  assert.equal(iconFontInstalled({ platform: 'darwin', env: { HOME: join(home, 'mac') } }), true);
});
