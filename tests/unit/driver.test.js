/**
 * Replay driver tests — the scripted-input contract for next-UI screens.
 * Run: node --test tests/unit/driver.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriver } from '../helpers/driver.js';
import { mouseSeq, pasteSeq } from '../../src/ui/input/index.js';

test('driver: key script reaches the screen route in order', async () => {
  const d = createDriver();
  d.start();
  d.screenRoute.onKey = (ev) => { d.events.push({ type: 'seen', name: ev.name, char: ev.char }); return true; };
  d.feed('jj\x1b'); // down, down, escape
  const ok = await d.waitFor((evs) => evs.filter((e) => e.type === 'seen').length === 3);
  assert.ok(ok, 'expected 3 routed keys');
  const seen = d.events.filter((e) => e.type === 'seen');
  assert.deepEqual(seen.map((e) => e.char ?? e.name), ['j', 'j', 'escape']);
  d.stop();
});

test('driver: SGR mouse split across chunks resolves to ONE event', async () => {
  const d = createDriver();
  d.start();
  d.screenRoute.onMouse = (ev) => { d.events.push({ kind: 'seen-mouse', ...ev }); return true; };
  d.feed(['\x1b[<0;1', '0;5M']);
  const ok = await d.waitFor((evs) => evs.some((e) => e.kind === 'seen-mouse'));
  assert.ok(ok, 'mouse event never resolved from split chunks');
  const mice = d.events.filter((e) => e.kind === 'seen-mouse');
  assert.equal(mice.length, 1);
  assert.equal(mice[0].x, 10);
  assert.equal(mice[0].y, 5);
  // No phantom keys may leak from the mouse sequence.
  assert.equal(d.events.filter((e) => e.type === 'key').length, 0, 'mouse bytes leaked into key parser');
  d.stop();
});

test('driver: bracketed paste arrives as one paste event, CRLF normalized', async () => {
  const d = createDriver();
  d.start();
  d.screenRoute.onPaste = (ev) => { d.events.push({ type: 'seen-paste', text: ev.text }); return true; };
  d.feed('\x1b[200~<h1>hi</h1>\r\n\x1b[201~');
  const ok = await d.waitFor((evs) => evs.some((e) => e.type === 'seen-paste'));
  assert.ok(ok);
  const paste = d.events.find((e) => e.type === 'seen-paste');
  assert.equal(paste.text, '<h1>hi</h1>\n');
  d.stop();
});

test('driver: ctrl-c byte produces a quit (E4 contract at the driver level)', async () => {
  const d = createDriver();
  d.start();
  d.feed('\x03');
  const ok = await d.waitFor((evs) => evs.some((e) => e.type === 'quit'));
  assert.ok(ok, 'expected quit event');
  d.stop();
});

test('driver: mode sequences are written on start and restored on stop', () => {
  const d = createDriver();
  d.start();
  assert.ok(d.output().includes(mouseSeq.on));
  assert.ok(d.output().includes(pasteSeq.on));
  d.stop();
  assert.ok(d.output().includes(mouseSeq.off));
  assert.ok(d.output().includes(pasteSeq.off));
});
