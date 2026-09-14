/**
 * Canvas link-overlay tests (M0 OSC 8 support in Screen).
 * Run: node --test tests/unit/canvasLinks.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Screen } from '../../src/tui/canvas.js';

const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

test('linkify wraps the target column range, preserving surrounding text', () => {
  const line = '  docs https://example.com/a   roadmap x';
  const out = Screen.linkify(line, [
    { row: 1, col: 7, len: 22, url: 'https://example.com/a', id: 'src-1' },
  ]);
  assert.ok(out.startsWith('  docs \x1b]8;id=src-1;https://example.com/a\x1b\\'), JSON.stringify(out.slice(0, 40)));
  assert.ok(out.includes('\x1b]8;;\x1b\\'));
  // Visible text is unchanged: peel the whole opener (params;URI + ST) and closer.
  const visible = out
    .replace(/\x1b\]8;[^;]*;[^\x1b]*\x1b\\/g, '')
    .replace(/\x1b\]8;;\x1b\\/g, '');
  assert.equal(visible, line);
});

test('linkify applies right-to-left so overlapping edits keep columns', () => {
  const line = 'aaaa https://b cccc';
  const out = Screen.linkify(line, [
    { row: 1, col: 5, len: 10, url: 'https://b' },
    { row: 1, col: 0, len: 4, url: 'https://a' },
  ]);
  assert.ok(out.includes('\x1b]8;;https://a\x1b\\'));
  assert.ok(out.includes('\x1b]8;;https://b\x1b\\'));
});

test('linkify with no params (no id) emits the empty params field', () => {
  const out = Screen.linkify('xx', [{ row: 1, col: 0, len: 2, url: 'https://z' }]);
  assert.ok(out.startsWith('\x1b]8;;https://z\x1b\\'));
});
