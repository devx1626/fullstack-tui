/**
 * Motion tests (overhaul §7.3, Phase 4 animation touch).
 *
 * The contract the spec sets:
 *   - `animationAllowed` is the single gate: `NO_ANIMATION`, CI, tiers C/D and
 *     non-TTY all disable motion; tiers A/B with unicode allow it;
 *   - disabled motion renders the SAME text the animation settles on (static,
 *     deterministic, tier-D-safe);
 *   - the shared animator never stacks intervals (StrictMode double-mount);
 *   - frames are cycle-safe for any index.
 *
 * Structure note: subtests via `await t.test(...)` inside one parent (see
 * CONTRIBUTING). Run: node --test tests/unit/animation.test.js  (render tests
 * need dist/harness.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { animationAllowed, framesFor, frameAt, createAnimator } from '../../src/ui/animation.js';
import { detectCapabilities } from '../../src/ui/capabilities.js';
import { ICON_SETS } from '../../src/ui/theme/icons.js';
import { waitFor } from '../helpers/snapshot.js';

const capsA = { isTTY: true, tty: true, unicode: true, colorDepth: 24, tier: 'A' };
const capsB = { isTTY: true, tty: true, unicode: true, colorDepth: 8, tier: 'B' };
const capsC = { isTTY: true, tty: true, unicode: true, colorDepth: 8, tier: 'C' };
const capsD = { isTTY: true, tty: true, unicode: false, colorDepth: 0, tier: 'D' };

test('motion: gate, frames, animator and components', async (t) => {
  await t.test('animationAllowed gates on tier, NO_ANIMATION, CI and TTY', () => {
    const prev = { NO_ANIMATION: process.env.NO_ANIMATION, CI: process.env.CI };
    try {
      delete process.env.NO_ANIMATION;
      delete process.env.CI;
      assert.equal(animationAllowed(capsA, {}), true, 'tier A runs motion');
      assert.equal(animationAllowed(capsB, {}), true, 'tier B runs motion');
      assert.equal(animationAllowed(capsC, {}), false, 'tier C is static');
      assert.equal(animationAllowed(capsD, {}), false, 'tier D is static');
      assert.equal(animationAllowed({ ...capsA, tty: false }, {}), false, 'no TTY → static');
      assert.equal(animationAllowed({ ...capsA, unicode: false }, {}), false, 'no unicode → static');
      process.env.NO_ANIMATION = '1';
      assert.equal(animationAllowed(capsA, process.env), false, 'NO_ANIMATION wins over everything');
      delete process.env.NO_ANIMATION;
      process.env.CI = '1';
      assert.equal(animationAllowed(capsA, process.env), false, 'CI stays deterministic');
    } finally {
      if (prev.NO_ANIMATION === undefined) delete process.env.NO_ANIMATION;
      else process.env.NO_ANIMATION = prev.NO_ANIMATION;
      if (prev.CI === undefined) delete process.env.CI;
      else process.env.CI = prev.CI;
    }
  });

  await t.test('framesFor picks the ASCII ladder for the ascii set', () => {
    assert.equal(framesFor(ICON_SETS.unicode).spinner.includes('⠋'), true);
    assert.equal(framesFor(ICON_SETS.ascii).spinner.includes('.'), true, 'ascii spinner is 7-bit');
    for (const f of framesFor(ICON_SETS.ascii).spinner) {
      assert.ok(f.codePointAt(0) < 0x7f, `ascii frame ${f} is not 7-bit`);
    }
  });

  await t.test('frameAt is cycle-safe for any index', () => {
    const frames = ['a', 'b', 'c'];
    assert.equal(frameAt(frames, 0), 'a');
    assert.equal(frameAt(frames, 2), 'c');
    assert.equal(frameAt(frames, 3), 'a');
    assert.equal(frameAt(frames, 7), 'b');
    assert.equal(frameAt(frames, -1), 'c', 'negative indices wrap too');
  });

  await t.test('createAnimator holds ONE interval across start() calls', async () => {
    const a = createAnimator();
    let firstCalls = 0;
    a.start(20, () => { firstCalls += 1; });
    await waitFor(() => a.value >= 2);
    const beforeRestart = a.value;
    assert.ok(firstCalls >= 2, 'the first listener saw frames');
    // A restart (hook remount / StrictMode double-mount) replaces the listener
    // instead of stacking a second interval: the old listener stops being
    // called, and the value still advances at one frame per tick.
    a.start(20, () => {});
    const callsAtRestart = firstCalls;
    await new Promise((r) => { setTimeout(r, 70); });
    assert.equal(firstCalls, callsAtRestart, 'restart replaced the listener — no stacked interval');
    assert.ok(a.value > beforeRestart, 'the single interval keeps ticking');
    a.stop();
    assert.equal(a.running, false);
    const after = a.value;
    await new Promise((r) => { setTimeout(r, 60); });
    assert.equal(a.value, after, 'stop() clears the interval');
    a.reset(0);
    assert.equal(a.value, 0);
  });

  // -- component renders (need the built harness) ---------------------------
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  if (!existsSync(harnessPath)) {
    await t.test('BusyLine/CelebrateLine render statically when motion is off', (st) => {
      st.skip('needs built harness (npm run build)');
    });
    return;
  }
  const harness = await import(pathToFileURL(harnessPath).href);
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const renderToText = (el, opts) => helper.renderToText(el, { render: harness.render, ...opts });

  await t.test('BusyLine/CelebrateLine render statically when motion is off', async () => {
    const prev = process.env.NO_ANIMATION;
    process.env.NO_ANIMATION = '1'; // deterministic: same text motion would settle on
    try {
      const busy = await renderToText(harness.el(harness.BusyLine, { label: 'running' }));
      assert.match(busy, /\u280b running/, 'the static busy line shows the first frame of the active set + label');
      // Tier D resolves the ASCII icon set: the static frame must degrade with it.
      const asciiBusy = await renderToText(harness.el(
        harness.IconsProvider,
        { icons: harness.ICON_SETS.ascii },
        harness.el(harness.BusyLine, { label: 'running' }),
      ));
      assert.match(asciiBusy, /\. running/, 'the ASCII set renders a 7-bit static frame');
      assert.equal(/\u2800-\u28ff/.test(asciiBusy), false, 'no braille frame leaks with the ascii set');
      const a = await renderToText(harness.el(harness.CelebrateLine, { label: 'solved' }));
      const b = await renderToText(harness.el(harness.CelebrateLine, { label: 'solved' }));
      assert.equal(a, b, 'static renders are deterministic');
      assert.match(a, /solved/, 'the static celebration still shows the label');
    } finally {
      if (prev === undefined) delete process.env.NO_ANIMATION;
      else process.env.NO_ANIMATION = prev;
    }
  });

  // -- Motion is allowed ONLY where the design allows it (no CI, TTY, tiers
  //    A/B): forcing it by deleting CI raced a 2 s wall on loaded runners
  //    (P0-1) and tested the environment override, not the product. Where the
  //    gate says static, this subtest skips — the deterministic-frame contract
  //    is what the render test above pins. Where motion runs, the CI-aware
  //    waitFor default (8 s) outlasts any runner's first-frame latency, and
  //    TWO distinct frames prove the interval advances (the old assert passed
  //    on the static first frame alone, verifying neither motion nor the
  //    unmount stop).
  await t.test('the animator advances a mounted BusyLine and stops on unmount', async (st) => {
    if (!animationAllowed(detectCapabilities(), process.env)) {
      st.skip('motion is disabled by design in this environment (CI / TTY-less) — static contract is pinned above');
      return;
    }
    const prev = process.env.NO_ANIMATION;
    delete process.env.NO_ANIMATION;
    try {
      const out = helper.fakeStdout(80, 10);
      const inst = harness.render(harness.el(harness.BusyLine, { label: 'running' }), {
        stdout: out,
        stdin: helper.fakeStdin(),
        exitOnCtrlC: false,
        patchConsole: false,
      });
      try {
        const painted = () => out.chunks.join('');
        const distinct = (s) => framesFor(ICON_SETS.unicode).spinner.filter((f) => s.includes(f)).length;
        await waitFor(() => distinct(painted()) >= 2, 'two distinct spinner frames');
        const frameCount = distinct(painted());
        // Absence-of-effect assertions get an explicit short window — long
        // enough that a still-running animator (20 ms tick) cannot hide.
        inst.unmount();
        await new Promise((r) => { setTimeout(r, 120); });
        const afterUnmount = distinct(painted());
        await new Promise((r) => { setTimeout(r, 240); });
        assert.equal(distinct(painted()), afterUnmount, 'unmount stops the animator — no frames after');
        assert.ok(frameCount >= 2, 'the interval painted more than one frame before unmount');
      } finally {
        inst.unmount();
      }
    } finally {
      if (prev === undefined) delete process.env.NO_ANIMATION;
      else process.env.NO_ANIMATION = prev;
    }
  });
});
