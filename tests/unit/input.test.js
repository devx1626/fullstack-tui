/**
 * Input pipeline tests (overhaul task 0.3 DoD).
 * Run: node --test tests/unit/input.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys, MouseParser, PasteBuffer, EscapeCoalescer, mouseSeq, pasteSeq } from '../../src/ui/input/index.js';

const names = (events) => events.map((e) => (e.type === 'key' ? e.name : e.type));

test('parseKeys: plain chars and named keys', () => {
  assert.deepEqual(names(parseKeys('hi')), ['char', 'char']);
  assert.deepEqual(names(parseKeys('\r')), ['enter']);
  assert.deepEqual(names(parseKeys('\x1b[A')), ['up']);
  assert.deepEqual(names(parseKeys('\x1b[Z')), ['shift-tab']);
});

test('parseKeys: ctrl letters are surfaced, never swallowed', () => {
  assert.deepEqual(names(parseKeys('\x13')), ['ctrl-s']);
  assert.deepEqual(names(parseKeys('\x03')), ['ctrl-c']);
});

test('parseKeys: longest sequence wins (CSI vs Esc)', () => {
  assert.deepEqual(names(parseKeys('\x1b[5~')), ['pageup']);
  assert.deepEqual(names(parseKeys('\x1bOH')), ['home']);
});

test('mouse: SGR press, release, motion, wheel with modifiers', () => {
  const m = new MouseParser();
  const evs = m.feed('\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<32;20;8M\x1b[<64;4;2M\x1b[<65;4;2M');
  assert.deepEqual(evs.map((e) => e.action), ['down', 'up', 'motion', 'wheel-up', 'wheel-down']);
  assert.equal(evs[0].x, 10);
  assert.equal(evs[0].y, 5);
  const withMods = m.feed('\x1b[<16;1;1M'); // button 4 bits: ctrl
  assert.equal(withMods[0].ctrl, true);
});

test('mouse: a sequence split across two chunks parses as ONE event', () => {
  const m = new MouseParser();
  const first = m.feed('\x1b[<0;1');
  assert.equal(first.length, 0); // held, not emitted as Esc+garbage
  const second = m.feed('0;1M');
  assert.equal(second.length, 1);
  assert.equal(second[0].action, 'down');
});

test('mouse: plain keys pass through untouched', () => {
  const m = new MouseParser();
  assert.deepEqual(names(m.feed('jk\r')), ['char', 'char', 'enter']);
});

test('paste: bracketed text arrives as one event, CRLF normalized', () => {
  const p = new PasteBuffer();
  const evs = p.feed('\x1b[200~const a = 1;\r\nconst b = 2;\x1b[201~');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].type, 'paste');
  assert.equal(evs[0].text, 'const a = 1;\nconst b = 2;');
});

test('paste: split across chunks stays grouped', () => {
  const p = new PasteBuffer();
  p.feed('\x1b[200~hello ');
  const evs = p.feed('world\x1b[201~');
  assert.deepEqual(evs.map((e) => e.type), ['paste']);
  assert.equal(evs[0].text, 'hello world');
});

test('paste: keys before the intro still parse', () => {
  const p = new PasteBuffer();
  const evs = p.feed('x\x1b[200~ab\x1b[201~');
  assert.equal(evs[0].name, 'char');
  assert.equal(evs[1].type, 'paste');
});

test('coalescer: a lone Esc emits after the window', async () => {
  const c = new EscapeCoalescer(20);
  let got = [];
  c.onEvent = (e) => got.push(e);
  const now = c.feed('\x1b');
  assert.equal(now.length, 0);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(names(got), ['escape']);
});

test('coalescer: a split arrow key resolves to ONE event, not Esc+[A', async () => {
  const c = new EscapeCoalescer(20);
  const now = c.feed('\x1b');
  assert.equal(now.length, 0);
  const done = c.feed('[A'); // completes the sequence → flush immediately
  assert.deepEqual(names(done), ['up']);
  await new Promise((r) => setTimeout(r, 60));
  // No delayed duplicate escape afterwards.
  assert.equal(c.buf, '');
});

test('coalescer: ESC+char is ambiguous (Alt-q vs Esc,q) → held, then both flush', async () => {
  const c = new EscapeCoalescer(15);
  let got = [];
  c.onEvent = (e) => got.push(e);
  c.feed('\x1b');
  const now = c.feed('q'); // could be Alt-q: must wait for the window
  assert.deepEqual(names(now), []);
  await new Promise((r) => setTimeout(r, 40));
  // After the window with nothing further, both events flush in order.
  assert.deepEqual(names(got), ['escape', 'char']);
  c.flush();
});

test('sequence constants exist for enable/disable', () => {
  assert.match(mouseSeq.on, /\x1b\[\?1006h/);
  assert.match(pasteSeq.on, /\x1b\[\?2004h/);
});
