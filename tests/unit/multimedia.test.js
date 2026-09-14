/**
 * Multimedia primitives tests (docs/multimedia.md feasibility layer).
 * Pure string builders — no terminal needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  osc8, mdnLink, BEL, cursorShape, notify, squiggle,
  graphicsFromEnv, iterm2Image,
} from '../../src/ui/multimedia.js';

test('osc8 wraps label in the 8; preamble/closing with params BEFORE the URI', () => {
  const out = osc8('https://x', 'label', 'id1');
  assert.ok(out.startsWith('\x1b]8;id=id1;https://x\x1b\\'), `got: ${JSON.stringify(out.slice(0, 30))}`);
  assert.ok(out.endsWith('\x1b]8;;\x1b\\'));
  assert.ok(out.includes('label'));
  // No id → empty params field, URI untouched.
  assert.ok(osc8('https://y', 'l').startsWith('\x1b]8;;https://y\x1b\\'));
});

test('mdnLink builds developer-doc links', () => {
  const out = mdnLink('Web/HTML', 'HTML docs');
  assert.ok(out.includes('https://developer.mozilla.org/en-US/docs/Web/HTML'));
  assert.ok(out.includes('HTML docs'));
});

test('BEL is the literal bell byte', () => {
  assert.equal(BEL, '\x07');
});

test('cursorShape sequences are DECSCUSR', () => {
  assert.equal(cursorShape.bar, '\x1b[6 q');
  assert.equal(cursorShape.block, '\x1b[2 q');
  assert.equal(cursorShape.reset, '\x1b[0 q');
});

test('notify strips control chars and emits OSC 9 (+777 body)', () => {
  const out = notify('Check done', 'passed\x1b]9;injection');
  assert.ok(out.startsWith('\x1b]9;Check done\x07'));
  // ESC is stripped (cannot start a new OSC); ']' and ';' remain as inert text.
  assert.ok(out.includes('\x1b]777;notify;Check done;passed]9;injection\x07'));
  assert.ok(!/\x1b/.test(out.slice(out.indexOf('777'))));
});

test('squiggle wraps text in SGR 4:3 curly underline with color', () => {
  const out = squiggle('err', 196);
  assert.ok(out.startsWith('\x1b[4:3;58:5:196m'));
  assert.ok(out.endsWith('\x1b[24;59m'));
  assert.ok(out.includes('err'));
});

test('graphicsFromEnv: kitty wins in kitty', () => {
  const g = graphicsFromEnv({ KITTY_WINDOW_ID: '1', TERM: 'xterm-kitty' });
  assert.equal(g.protocol, 'kitty');
  assert.equal(g.kitty, true);
});

test('graphicsFromEnv: iTerm2 → iterm2 protocol, sixel too', () => {
  const g = graphicsFromEnv({ TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' });
  assert.equal(g.protocol, 'iterm2');
  assert.equal(g.sixel, true);
});

test('graphicsFromEnv: Windows Terminal → sixel only (no graphics protocol)', () => {
  const g = graphicsFromEnv({ WT_SESSION: '1', TERM: 'xterm-256color' });
  assert.equal(g.sixel, true);
  assert.equal(g.kitty, false);
  assert.equal(g.protocol, 'sixel');
});

test('graphicsFromEnv: plain xterm → nothing claimed', () => {
  const g = graphicsFromEnv({ TERM: 'xterm-256color' });
  assert.equal(g.protocol, null);
  assert.equal(g.sixel, false);
});

test('iterm2Image: small payload inline, sized variants included', () => {
  const b64 = Buffer.from('tiny').toString('base64');
  const out = iterm2Image(b64, { width: '10', height: '5' });
  assert.ok(out.startsWith('\x1b]1337;File='));
  assert.ok(out.includes('inline=1'));
  assert.ok(out.includes('width=10;height=5'));
  assert.ok(out.endsWith('\x1b\\'));
});

test('iterm2Image: large payloads use the size-delimited chunked form', () => {
  const b64 = 'A'.repeat(5000);
  const out = iterm2Image(b64);
  assert.ok(out.includes(';size=5000:\n'));
});
