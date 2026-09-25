/**
 * Screenshot action gating (P0-3, docs/multimedia.md §4): every branch of the
 * ladder — env opt-in, graphics protocol (probe > heuristic), Playwright
 * availability, final emission — as pure decisions over injected inputs, so no
 * terminal and no Playwright install is needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = await import(harnessPath);

test('screenshot gating: the env/probe/availability ladder', async (t) => {
  await t.test('the feature is opt-in via FULLSTACK_SCREENSHOT=playwright', () => {
    assert.equal(harness.screenshotEnvEnabled({}), false, 'off by default');
    assert.equal(harness.screenshotEnvEnabled({ FULLSTACK_SCREENSHOT: 'playwright' }), true);
    assert.equal(harness.screenshotEnvEnabled({ FULLSTACK_SCREENSHOT: 'yes' }), false, 'exact value only');
  });

  await t.test('a probed result outranks the env heuristic (probe, not guess)', () => {
    // Env claims sixel; the probe answered kitty — the probe wins.
    const probed = { graphics: { kitty: true, sixel: false, iterm2: false, protocol: 'kitty' }, probed: true };
    const env = { TERM_PROGRAM: 'WezTerm' };
    assert.equal(harness.screenshotProtocol(probed, env), 'kitty');
    // A probe that RAN and found nothing beats an optimistic env heuristic.
    const probedNone = { graphics: { kitty: false, sixel: false, iterm2: false, protocol: null }, probed: true };
    assert.equal(harness.screenshotProtocol(probedNone, env), null, 'probed-nothing is authoritative');
  });

  await t.test('without a probe the env heuristic answers (never worse than not probing)', () => {
    assert.equal(harness.screenshotProtocol(null, { KITTY_WINDOW_ID: '1' }), 'kitty');
    assert.equal(harness.screenshotProtocol({ probed: false }, { TERM_PROGRAM: 'iTerm.app' }), 'iterm2');
    assert.equal(harness.screenshotProtocol({ probed: false }, {}), null, 'no hints, no protocol');
  });

  await t.test('availability hides the action until env AND protocol agree', () => {
    assert.deepEqual(harness.screenshotAvailability(null, {}), { available: false, reason: 'disabled' });
    assert.deepEqual(
      harness.screenshotAvailability({ probed: false }, { FULLSTACK_SCREENSHOT: 'playwright' }),
      { available: false, reason: 'no-protocol' },
      'env on, no protocol → hidden',
    );
    const probed = { graphics: { kitty: true, sixel: false, iterm2: false, protocol: 'kitty' }, probed: true };
    assert.deepEqual(
      harness.screenshotAvailability(probed, { FULLSTACK_SCREENSHOT: 'playwright' }),
      { available: true, reason: 'ready' },
    );
  });
});

test('runScreenshotAction degrades to guidance, renders only when everything agrees', async (t) => {
  const parts = { html: '<h1>hi</h1>', css: 'h1{color:red}', js: '' };

  await t.test('disabled → opt-in guidance', async () => {
    const res = await harness.runScreenshotAction(parts, null, {});
    assert.equal(res.kind, 'disabled');
    assert.ok(res.lines[0].includes('FULLSTACK_SCREENSHOT=playwright'));
  });

  await t.test('no protocol → terminal guidance, Playwright never imported', async () => {
    const res = await harness.runScreenshotAction(parts, { probed: false }, { FULLSTACK_SCREENSHOT: 'playwright' });
    assert.equal(res.kind, 'no-protocol');
    assert.ok(res.lines[0].includes('no inline-image protocol'));
  });

  await t.test('not installed → the npx playwright install guidance', async () => {
    // Redirect the lazy loader at a module that does not exist: the memoized
    // availability probe must catch it and the action must return guidance.
    harness.setPlaywrightLoader(async () => { throw new Error('Cannot find package'); });
    const probed = { graphics: { kitty: true, sixel: false, iterm2: false, protocol: 'kitty' }, probed: true };
    const res = await harness.runScreenshotAction(parts, probed, { FULLSTACK_SCREENSHOT: 'playwright' });
    assert.equal(res.kind, 'not-installed');
    assert.ok(res.lines.join(' ').includes('npx playwright install chromium'), 'the install hint is present');
  });

  await t.test('ready end-to-end → the terminal image escape string', async () => {
    // Fake Playwright: a chromium page whose screenshot returns a tiny PNG.
    // setPlaywrightLoader keeps the availability memo on purpose (re-probe
    // needs force), so the forced re-probe re-runs it against the new loader.
    harness.setPlaywrightLoader(async () => ({
      chromium: {
        launch: async () => ({
          newContext: async () => ({
            newPage: async () => ({
              setContent: async () => {},
              screenshot: async () => Buffer.from('fake-png-bytes', 'utf8'),
              close: async () => {},
            }),
          }),
        }),
      },
    }));
    await harness.isPlaywrightAvailable({ force: true });
    const probed = { graphics: { kitty: true, sixel: false, iterm2: false, protocol: 'kitty' }, probed: true };
    const res = await harness.runScreenshotAction(parts, probed, { FULLSTACK_SCREENSHOT: 'playwright' });
    assert.equal(res.kind, 'rendered');
    assert.ok(res.image.startsWith('\x1b_G'), 'kitty graphics escape when the probe said kitty');
    assert.ok(res.image.length > 8, 'the base64 payload rides along');
  });
});
