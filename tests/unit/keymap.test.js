/**
 * Keymap loader tests (task 0.7 remainder).
 * Run: node --test tests/unit/keymap.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readKeymapFile, loadKeymap } from '../../src/ui/keymap.js';
import { resolveKey } from '../../src/ui/commands.js';

function tmpFile(json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-'));
  const file = path.join(dir, 'keymap.json');
  if (json !== undefined) fs.writeFileSync(file, typeof json === 'string' ? json : JSON.stringify(json));
  return file;
}

test('missing file → defaults, no problems', () => {
  const { map, error } = readKeymapFile(tmpFile(undefined));
  assert.deepEqual(map, {});
  assert.equal(error, null);
  const { keymap, problems } = loadKeymap(tmpFile(undefined));
  assert.ok(keymap.get('app.quit') === '<C-c>' || keymap.get('app.quit') === 'q');
  assert.ok(problems.every((p) => !p.startsWith('keymap:')), 'unexpected problems: ' + JSON.stringify(problems));
});

test('user override wins over default', () => {
  const file = tmpFile({ 'app.quit': '<C-x>' });
  const { keymap, problems } = loadKeymap(file);
  assert.equal(keymap.get('app.quit'), '<C-x>');
  assert.ok(problems.length === 0, JSON.stringify(problems));
});

test('unknown command id is reported, not applied', () => {
  const file = tmpFile({ 'no.such.command': 'x' });
  const { keymap, problems } = loadKeymap(file);
  assert.ok(problems.some((p) => p.includes('no.such.command')));
  assert.ok(!keymap.has('no.such.command'));
});

test('invalid binding string is reported', () => {
  const file = tmpFile({ 'app.quit': '<not-a-key!' });
  const { problems } = loadKeymap(file);
  assert.ok(problems.some((p) => p.includes('app.quit')));
});

test('corrupt file → defaults plus one diagnostic', () => {
  const file = tmpFile('{broken json');
  const { map, error } = readKeymapFile(file);
  assert.deepEqual(map, {});
  assert.ok(error && error.includes('corrupt'));
  const { problems } = loadKeymap(file);
  assert.equal(problems.length, 1);
});

test('non-object file (array) is rejected', () => {
  const { error } = readKeymapFile(tmpFile(['x']));
  assert.ok(error && error.includes('not an object'));
});

test('loaded map drives resolveKey (user rebinding takes effect)', () => {
  const file = tmpFile({ 'app.help': 'h' }); // rebind help to plain h
  const { keymap } = loadKeymap(file);
  const ev = { name: 'char', char: 'h' };
  assert.equal(resolveKey(ev, 'home', keymap), 'app.help');
});

test('defaults lint stays clean (repo bindings have no new conflicts)', () => {
  const { problems } = loadKeymap(tmpFile(undefined));
  const conflicts = problems.filter((p) => p.includes('conflict'));
  assert.deepEqual(conflicts, []);
});
