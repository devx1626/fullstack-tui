/**
 * Capability detection tests (spec §7.1) — the tier decision is the contract
 * the visual system depends on. Detector signature: (env, isTTY).
 *
 * Verified tier matrix:
 *   A = TTY + 24-bit + unicode
 *   B = TTY + 256-color + unicode
 *   C = TTY + unicode (color stripped: NO_COLOR / FORCE_COLOR=0)
 *   D = everything else (non-TTY, dumb TERM, no unicode)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities } from '../../src/ui/capabilities.js';

/** Build a fake env: defaults are a modern Linux TTY. */
function baseEnv(overrides = {}) {
  return {
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    NO_COLOR: '',
    FORCE_COLOR: '',
    NO_UNICODE: '',
    ...overrides,
  };
}

test('truecolor TTY → Tier A, colorDepth 24', () => {
  const caps = detectCapabilities(baseEnv(), true);
  assert.equal(caps.tier, 'A');
  assert.equal(caps.colorDepth, 24);
  assert.equal(caps.tty, true);
  assert.equal(caps.unicode, true);
});

test('256-color TERM without COLORTERM → Tier B', () => {
  const caps = detectCapabilities(baseEnv({ COLORTERM: '' }), true);
  assert.equal(caps.tier, 'B');
  assert.equal(caps.colorDepth, 8);
});

test('NO_COLOR strips color but keeps structure → Tier C', () => {
  const caps = detectCapabilities(baseEnv({ NO_COLOR: '1' }), true);
  assert.equal(caps.tier, 'C');
  assert.equal(caps.colorDepth, 0);
  assert.equal(caps.unicode, true);
});

test('FORCE_COLOR=0 behaves like NO_COLOR → Tier C', () => {
  const caps = detectCapabilities(baseEnv({ FORCE_COLOR: '0' }), true);
  assert.equal(caps.tier, 'C');
});

test('non-TTY (piped) → Tier D one-shot; color depth stays for fake streams', () => {
  const caps = detectCapabilities(baseEnv(), false);
  assert.equal(caps.isTTY, false);
  assert.equal(caps.tty, false);
  assert.equal(caps.tier, 'D');
  // Depth is TTY-independent by design: tests render truecolor into buffers.
  assert.equal(caps.colorDepth, 24);
});

test('dumb TERM → Tier D (no unicode, no color)', () => {
  const caps = detectCapabilities(baseEnv({ TERM: 'dumb', COLORTERM: '' }), true);
  assert.equal(caps.tier, 'D');
  assert.equal(caps.colorDepth, 0);
  assert.equal(caps.unicode, false);
});

test('NO_UNICODE → Tier D (unicode is structural; C is color-only)', () => {
  const caps = detectCapabilities(baseEnv({ NO_UNICODE: '1' }), true);
  assert.equal(caps.tier, 'D');
  assert.equal(caps.unicode, false);
  assert.equal(caps.colorDepth, 24);
});

test('windows TERM prefixes keep unicode via WT_SESSION, else drop to D', () => {
  const wt = detectCapabilities(baseEnv({ TERM: 'windows-xterm', WT_SESSION: '1' }), true);
  assert.equal(wt.unicode, true);
  const noWt = detectCapabilities(baseEnv({ TERM: 'cygwin', COLORTERM: '' }), true);
  assert.equal(noWt.unicode, false);
  assert.equal(noWt.tier, 'D');
});

test('capabilities are pure: same env → same result', () => {
  const env = baseEnv();
  assert.deepEqual(detectCapabilities(env, true), detectCapabilities(env, true));
});
