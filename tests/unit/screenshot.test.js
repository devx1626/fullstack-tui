/**
 * Screenshot module tests (M1) — playwright loader is mocked, so no browser
 * is needed. Focus: lazy loading, graceful unavailability, kitty/iterm2
 * emitter selection, and that load failure never throws.
 * Run: node --test tests/unit/screenshot.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setPlaywrightLoader, isPlaywrightAvailable, notAvailableMessage,
  renderInlineImage, closeScreenshotBrowser,
} from '../../src/ui/screenshot.js';

test('playwright missing → available=false, message explains install', async () => {
  setPlaywrightLoader(() => Promise.reject(new Error('Cannot find package')));
  assert.equal(await isPlaywrightAvailable({ force: true }), false);
  const msg = notAvailableMessage();
  assert.ok(msg.join(' ').includes('npx playwright install'));
});

test('memoization: loader called once for repeated probes', async () => {
  let calls = 0;
  setPlaywrightLoader(() => { calls += 1; return Promise.reject(new Error('no')); });
  await isPlaywrightAvailable({ force: true });
  await isPlaywrightAvailable();
  await isPlaywrightAvailable();
  assert.equal(calls, 1);
});

test('renderInlineImage returns null on graphics-less terminals (no load attempt)', async () => {
  let calls = 0;
  setPlaywrightLoader(() => { calls += 1; return Promise.reject(new Error('no')); });
  const out = await renderInlineImage({ html: '<p>x</p>' }, { kitty: false, iterm2: false, sixel: false });
  assert.equal(out, null);
  assert.equal(calls, 0, 'must not even try to load playwright without graphics');
});

test('renderInlineImage returns null when playwright missing, even with graphics', async () => {
  setPlaywrightLoader(() => Promise.reject(new Error('no')));
  const out = await renderInlineImage({ html: '<p>x</p>' }, { kitty: true, iterm2: false, sixel: true });
  assert.equal(out, null);
});

test('kitty path emits a chunked kitty image (mocked png bytes)', async () => {
  setPlaywrightLoader(() => Promise.resolve({
    chromium: {
      async launch() {
        return {
          async newContext() {
            return {
              async newPage() {
                return {
                  async setContent() {},
                  async screenshot() { return Buffer.from('fakepng-'.repeat(1200)); }, // >4096 b64
                  async close() {},
                };
              },
            };
          },
          async close() {},
        };
      },
    },
  }));
  // Reset the availability memo poisoned by earlier tests' failing loaders.
  await isPlaywrightAvailable({ force: true });
  const out = await renderInlineImage({ html: '<p>hi</p>' }, { kitty: true, iterm2: false, sixel: false });
  assert.ok(out, 'expected an image payload');
  assert.ok(out.startsWith('\x1b_Gf=100,a=T'));
  assert.ok(out.includes('m=1'), 'large payloads must be chunked');
  assert.ok(out.endsWith('\x1b\\'));
  await closeScreenshotBrowser();
});

test('iterm2 path emits the 1337 sequence (mocked png bytes)', async () => {
  setPlaywrightLoader(() => Promise.resolve({
    chromium: {
      async launch() {
        return {
          async newContext() {
            return {
              async newPage() {
                return {
                  async setContent() {},
                  async screenshot() { return Buffer.from('png'); },
                  async close() {},
                };
              },
            };
          },
          async close() {},
        };
      },
    },
  }));
  await isPlaywrightAvailable({ force: true });
  const out = await renderInlineImage({ html: '<p>hi</p>' }, { kitty: false, iterm2: true, sixel: false });
  assert.ok(out.startsWith('\x1b]1337;File='));
  await closeScreenshotBrowser();
});
