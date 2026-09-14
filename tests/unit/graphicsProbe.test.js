/**
 * Graphics probe tests (M1) — simulated terminal responses, no pty needed.
 * Run: node --test tests/unit/graphicsProbe.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { probeGraphics } from '../../src/ui/graphicsProbe.js';

function harness(responses = [], env = {}) {
  const written = [];
  const handlers = [];
  return {
    written,
    handlers,
    write: (s) => {
      written.push(s);
      // Deliver simulated terminal responses after the writes.
      for (const r of responses) setTimeout(() => handlers.forEach((h) => h(Buffer.from(r))), 5);
    },
    onData: (fn) => handlers.push(fn),
    removeOnData: (fn) => { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); },
    env,
  };
}

test('kitty graphics ack → kitty protocol', async () => {
  const io = harness(['\x1b_Gi=31;OK\x1b\\']);
  const result = await probeGraphics({ ...io, timeoutMs: 500 });
  assert.equal(result.kitty, true);
  assert.equal(result.protocol, 'kitty');
  // The probe wrote the query and DA1.
  assert.equal(io.written.filter((s) => s.includes('\x1b_G')).length, 1);
  assert.ok(io.written.some((s) => s.includes('\x1b[c')));
});

test('DA1 with sixel attribute (4) → sixel', async () => {
  const io = harness(['\x1b[?62;4;6;9;15;22c']);
  const result = await probeGraphics({ ...io, timeoutMs: 500 });
  assert.equal(result.sixel, true);
  assert.equal(result.protocol, 'sixel');
  assert.equal(result.kitty, false);
});

test('DA1 without attribute 4 → no graphics claimed', async () => {
  const io = harness(['\x1b[?62;6;9;15;22c']);
  const result = await probeGraphics({ ...io, timeoutMs: 500 });
  assert.equal(result.sixel, false);
  assert.equal(result.protocol, null);
});

test('timeout → env heuristic fallback, probed:false', async () => {
  const io = harness([], { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' });
  const result = await probeGraphics({ ...io, timeoutMs: 30 });
  assert.equal(result.protocol, 'kitty'); // from env, not the probe
  assert.equal(result.probed, false);
});

test('handler is removed after resolution (no listener leak)', async () => {
  const io = harness(['\x1b_Gi=31;OK\x1b\\']);
  await probeGraphics({ ...io, timeoutMs: 500 });
  assert.equal(io.handlers.length, 0);
});
