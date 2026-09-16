/**
 * Overlay stack + dispatcher priority tests (overhaul Phase 1, task 0.8/1.1b).
 * Run: node --test tests/unit/overlayStack.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasOverlays, topOverlay, overlayDepth, openOverlay, closeOverlay,
  clearOverlays, routeToOverlays, _resetOverlays,
} from '../../src/ui/input/overlayStack.js';
import { InputDispatcher } from '../../src/ui/input/dispatcher.js';

const ev = (name, extra = {}) => ({ type: 'key', name, ...extra });

test('overlayStack: LIFO routing, drop semantics, idempotent closers', () => {
  _resetOverlays();
  assert.equal(hasOverlays(), false);

  const seen = [];
  const closeBottom = openOverlay({ id: 'bottom', onKey: (e) => { seen.push('bottom'); return true; } });
  const closeTop = openOverlay({ id: 'top', onKey: (e) => { seen.push('top'); return e.name === 'y'; } });

  assert.equal(overlayDepth(), 2);
  assert.equal(topOverlay().id, 'top');

  // Top consumes.
  assert.equal(routeToOverlays(ev('y')), true);
  // Top declines → the layer reports false and the DISPATCHER must drop.
  assert.equal(routeToOverlays(ev('x')), false);
  assert.deepEqual(seen, ['top', 'top'], 'lower overlay must never be consulted');

  closeTop();
  closeTop(); // idempotent
  assert.equal(overlayDepth(), 1);

  // Now the bottom overlay is top and still works after its sibling closed.
  assert.equal(routeToOverlays(ev('z')), true);
  assert.deepEqual(seen, ['top', 'top', 'bottom']);

  closeOverlay('bottom');
  assert.equal(hasOverlays(), false);
  closeBottom(); // closer after manual close: no-op, no throw
});

test('dispatcher: overlay intercepts keys and DROPS declined events (screen never sees them)', () => {
  _resetOverlays();
  const screenKeys = [];
  const d = new InputDispatcher({
    stdout: { isTTY: false, write: () => {} },
    stdin: { on() {}, removeListener() {}, pause() {}, resume() {}, isTTY: false, setRawMode: undefined },
    getRoute: () => ({ onKey: (e) => { screenKeys.push(e.name); return true; } }),
    globalHandler: () => false,
    onQuit: () => {},
  });

  const close = openOverlay({ id: 'modal', onKey: (e) => e.name === 'y' });
  try {
    assert.equal(d.route(ev('y')), true, 'top overlay consumes y');
    assert.deepEqual(screenKeys, [], 'screen must not see keys while modal is open');

    assert.equal(d.route(ev('j')), false, 'declined by overlay');
    assert.deepEqual(screenKeys, [], 'declined event must be DROPPED, not forwarded');
  } finally {
    close();
    _resetOverlays();
  }
});

test('dispatcher: ctrl-c quits even with an overlay open (never consumable)', () => {
  _resetOverlays();
  let quit = 0;
  let overlaySawIt = false;
  const d = new InputDispatcher({
    stdout: { isTTY: false, write: () => {} },
    stdin: { on() {}, removeListener() {}, pause() {}, resume() {}, isTTY: false, setRawMode: undefined },
    getRoute: () => ({ onKey: () => true }),
    globalHandler: () => false,
    onQuit: () => { quit += 1; },
  });
  openOverlay({ id: 'modal', onKey: (e) => { overlaySawIt = true; return true; } });
  try {
    d.route(ev('ctrl-c'));
    assert.equal(quit, 1, 'ctrl-c must reach onQuit');
    assert.equal(overlaySawIt, false, 'overlay must never be offered ctrl-c');
  } finally {
    _resetOverlays();
  }
});

test('dispatcher: closing the overlay restores normal screen routing', () => {
  _resetOverlays();
  const screenKeys = [];
  const d = new InputDispatcher({
    stdout: { isTTY: false, write: () => {} },
    stdin: { on() {}, removeListener() {}, pause() {}, resume() {}, isTTY: false, setRawMode: undefined },
    getRoute: () => ({ onKey: (e) => { screenKeys.push(e.name); return true; } }),
    globalHandler: () => false,
    onQuit: () => {},
  });

  const close = openOverlay({ id: 'modal', onKey: () => false });
  d.route(ev('k')); // dropped
  assert.deepEqual(screenKeys, []);
  close();
  d.route(ev('k'));
  assert.deepEqual(screenKeys, ['k'], 'screen routing resumes after close');
  _resetOverlays();
});
