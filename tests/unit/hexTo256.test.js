/**
 * E1 regression (errors-and-qol-spec.md §3.1): the grey-ramp scan in
 * hexTo256 must consider every grey entry, not stop at the first improvement.
 * Run with: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexTo256 } from '../../src/ui/theme/index.js';

// The 24-entry grey ramp starts at #080808 (232) and ends at #eeeeee (255).
const greys = Array.from({ length: 24 }, (_, i) => 8 + i * 10);

function nearestGreyIndex(r, g, b) {
  let best = -1;
  let bestDist = Infinity;
  greys.forEach((v, i) => {
    const d = (r - v) ** 2 + (g - v) ** 2 + (b - v) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return 232 + best;
}

test('dark panel grey maps to the nearest grey-ramp entry (E1)', () => {
  // midnight.panel #1a1a20 → r=26,g=26,b=32: nearest ramp grey is 8+2*10=28 (index 2)
  assert.equal(hexTo256('#1a1a20'), nearestGreyIndex(26, 26, 32));
  assert.equal(hexTo256('#1a1a20'), 234); // 232+2 — was wrong before the fix
});

test('mid-grey and light greys also land on the ramp', () => {
  assert.equal(hexTo256('#808080'), nearestGreyIndex(128, 128, 128));
  assert.equal(hexTo256('#d8d8de'), nearestGreyIndex(216, 216, 222));
});

test('pure greys prefer the ramp over the color cube', () => {
  // #101010: cube offers e.g. 16+0*36+0*6+1 (#00005f-ish mismatch); the ramp
  // entry 232 (#080808) or 233 (#121212) must win.
  const idx = hexTo256('#101010');
  assert.ok(idx >= 232 && idx <= 234, `expected grey ramp, got ${idx}`);
});

test('saturated colors stay on the cube', () => {
  assert.equal(hexTo256('#39c5cf') >= 16, true);
  assert.equal(hexTo256('#39c5cf') < 232, true);
});

test('invalid input maps to null', () => {
  assert.equal(hexTo256('nope'), null);
});
