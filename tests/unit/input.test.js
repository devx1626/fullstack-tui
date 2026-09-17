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

// Task 1.2's pane-nudge bindings are unusable if the modified-arrow sequences
// fall through to the Alt branch, so the CSI 1;<mod> forms are pinned here.
test('parseKeys: modified arrows are named, not read as Alt+[', () => {
  assert.deepEqual(names(parseKeys('\x1b[1;2C')), ['shift-right']);
  assert.deepEqual(names(parseKeys('\x1b[1;3D')), ['alt-left']);
  assert.deepEqual(names(parseKeys('\x1b[1;5C')), ['ctrl-right']);
  assert.deepEqual(names(parseKeys('\x1b[1;5D')), ['ctrl-left']);
  assert.deepEqual(names(parseKeys('\x1b[1;6C')), ['ctrl-shift-right']);
  assert.deepEqual(names(parseKeys('\x1b[1;6D')), ['ctrl-shift-left']);
  // The plain arrows are untouched.
  assert.deepEqual(names(parseKeys('\x1b[C')), ['right']);
  assert.deepEqual(names(parseKeys('\x1b[D')), ['left']);
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

test('coalescer: ESC+char is held for the window, then flushes as Alt+char', async () => {
  const c = new EscapeCoalescer(15);
  const got = [];
  c.onEvent = (e) => got.push(e);
  c.feed('\x1b');
  const now = c.feed('q'); // could still be a split CSI sequence: must wait
  assert.deepEqual(names(now), []);
  await new Promise((r) => setTimeout(r, 40));
  // Nothing further arrived, so it is an Alt combination rather than a
  // sequence — the standard terminal reading (Esc-then-letter inside the
  // window is Alt+letter, as in vim/readline). Pressing Esc on its own sends
  // just \x1b, which still flushes as 'escape'.
  assert.deepEqual(names(got), ['alt-q']);
  assert.equal(got[0].char, 'q');
  c.flush();
});

test('sequence constants exist for enable/disable', () => {
  assert.match(mouseSeq.on, /\x1b\[\?1006h/);
  assert.match(pasteSeq.on, /\x1b\[\?2004h/);
});
