/**
 * Challenge screen slice tests (Phase 1 start).
 * Run: node --test tests/unit/challengeScreen.test.js  (needs dist/harness.js)
 *
 * Structure note: subtests are declared via `await t.test(...)` inside one
 * parent. The earlier flat file registered tests after a top-level await,
 * and the runner intermittently dropped registrations (collection race) —
 * individual tests passed with --test-name-pattern yet never ran in a full
 * pass. Awaited subtests are immune.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

test('challenge screen slice', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));

  if (!harness) {
    t.skip('needs built harness (npm run build -- --spike)');
    return;
  }

  const renderToText = (el) => helper.renderToText(el, { render: harness.render });
  const strip = helper.stripAnsi;

  await t.test('renders brief on the left and code on the right', async () => {
    const text = strip(await renderToText(
      harness.el(harness.ChallengeScreen, {
        title: 'first heading',
        brief: 'Wrap the text in an h1.',
        code: '<h1>hi</h1>',
        width: 80,
      }),
    ));
    assert.ok(text.includes('first heading'), 'title missing');
    assert.ok(text.includes('h1.'), 'brief missing');
    assert.ok(text.includes('<h1>hi</h1>'), 'code missing');
  });

  await t.test('keys resolve to command ids through the registry (mode wins)', async () => {
    const seen = [];
    const inst = harness.render(
      harness.el(harness.ChallengeScreen, { width: 80, onCommand: (id) => seen.push(id) }),
      { stdout: helper.fakeStdout(), exitOnCtrlC: false, patchConsole: false },
    );
    await new Promise((r) => setTimeout(r, 30));
    const route = harness.getCurrentRoute();
    assert.equal(route.screen, 'challenge', 'screen must register itself');
    route.onKey({ name: 'ctrl-s' });
    assert.ok(seen.includes('challenge.check'), 'check must resolve');
    route.onKey({ name: 'char', char: 'z' });
    assert.ok(!seen.includes('z'), 'unbound keys stay unresolved');
    inst.unmount();
  });

  await t.test('unmount restores the terminal cursor shape', async () => {
    const writes = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { writes.push(s); return true; };
    const inst = harness.render(
      harness.el(harness.ChallengeScreen, { width: 80, mode: 'normal' }),
      { stdout: helper.fakeStdout(), exitOnCtrlC: false, patchConsole: false },
    );
    await new Promise((r) => setTimeout(r, 30));
    inst.unmount();
    await new Promise((r) => setTimeout(r, 20));
    process.stdout.write = orig;
    assert.ok(writes.some((s) => s.includes('\x1b[2 q')), 'block cursor for normal mode');
    assert.ok(writes.some((s) => s.includes('\x1b[0 q')), 'cursor reset on unmount');
  });
});
