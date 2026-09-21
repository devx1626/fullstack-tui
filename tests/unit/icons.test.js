/**
 * Icon-set tests (overhaul §7.1/§7.3, Phase 4 icon pass).
 *
 * Covers the pure resolver (sets, heuristic, `FULLSTACK_ICONS` override), the
 * capability profile, the shared preference row, and an end-to-end check that
 * the Settings picker swaps the whole tree's glyphs live.
 *
 * Structure note: subtests via `await t.test(...)` inside one parent (see
 * CONTRIBUTING). Run: node --test tests/unit/icons.test.js  (integration needs
 * dist/harness.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ICON_SETS, ICON_CHOICES, iconsFor, normalizeIconSet, nextIconSet, iconSetLabel,
  autoIconSet, resolveIconSet,
} from '../../src/ui/theme/icons.js';
import { detectCapabilities } from '../../src/ui/capabilities.js';
import { preferenceRows, togglePreference, stepIcons } from '../../src/ui/preferences.js';
import { buildRenderRows, buildConsoleRows, buildNetworkRows, tabHint } from '../../src/ui/screens/browserModel.js';

async function waitFor(fn, { timeout = 2000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => { setTimeout(r, step); });
  }
}

test('icon sets: parity, heuristic, picker and live preview', async (t) => {
  await t.test('the three sets carry the same roles and real glyphs', () => {
    assert.deepEqual(Object.keys(ICON_SETS).sort(), ['ascii', 'nerd', 'unicode']);
    const roles = Object.keys(ICON_SETS.unicode).sort();
    for (const name of Object.keys(ICON_SETS)) {
      assert.deepEqual(Object.keys(ICON_SETS[name]).sort(), roles, `${name} token set differs`);
      for (const role of roles) {
        const v = ICON_SETS[name][role];
        assert.equal(typeof v, 'string', `${name}.${role} is not a string`);
        assert.ok(v.length > 0, `${name}.${role} is empty`);
      }
    }
    // ASCII must be 7-bit: no glyph above U+007E apart from the spark ramp.
    for (const role of roles.filter((r) => r !== 'spark')) {
      assert.ok(ICON_SETS.ascii[role].codePointAt(0) < 0x7f, `ascii.${role} is not 7-bit`);
    }
    assert.equal(ICON_SETS.ascii.borderStyle, 'classic', 'tier D panels use +--');
    assert.equal(ICON_SETS.unicode.borderStyle, 'round');
  });

  await t.test('iconsFor never throws on an unknown set', () => {
    assert.equal(iconsFor('ascii'), ICON_SETS.ascii);
    assert.equal(iconsFor('nope'), ICON_SETS.unicode);
    assert.equal(iconsFor(undefined), ICON_SETS.unicode);
  });

  await t.test('normalize / label / cycle', () => {
    assert.deepEqual(ICON_CHOICES, ['auto', 'nerd', 'unicode', 'ascii']);
    assert.equal(normalizeIconSet('NERD'), 'nerd');
    assert.equal(normalizeIconSet('dracula'), 'auto');
    assert.equal(iconSetLabel('auto'), 'Auto');
    assert.equal(iconSetLabel('ascii'), 'Ascii');
    assert.equal(nextIconSet('auto'), 'nerd');
    assert.equal(nextIconSet('nerd'), 'unicode');
    assert.equal(nextIconSet('ascii'), 'auto');
  });

  await t.test('autoIconSet: override wins, dumb/non-unicode → ascii, known fonts → nerd', () => {
    assert.equal(autoIconSet({ FULLSTACK_ICONS: 'nerd' }, true), 'nerd');
    assert.equal(autoIconSet({ FULLSTACK_ICONS: 'ascii' }, true), 'ascii');
    assert.equal(autoIconSet({ FULLSTACK_ICONS: 'ascii' }, true), 'ascii');
    assert.equal(autoIconSet({ TERM: 'dumb' }, false), 'ascii');
    assert.equal(autoIconSet({}, false), 'ascii', 'no unicode → ascii');
    assert.equal(autoIconSet({ KITTY_WINDOW_ID: '1' }, true), 'nerd');
    assert.equal(autoIconSet({ WEZTERM_VERSION: '1' }, true), 'nerd');
    assert.equal(autoIconSet({ TERM_PROGRAM: 'ghostty' }, true), 'nerd');
    assert.equal(autoIconSet({}, true), 'unicode', 'never auto-guess nerd from color alone');
  });

  await t.test('resolveIconSet: explicit request wins, auto defers to capabilities', () => {
    assert.equal(resolveIconSet('ascii', { icons: 'nerd' }), 'ascii');
    assert.equal(resolveIconSet('auto', { icons: 'nerd' }), 'nerd');
    assert.equal(resolveIconSet(undefined, { icons: 'unicode' }), 'unicode');
    assert.equal(resolveIconSet('auto', { unicode: false }), 'ascii');
    assert.equal(resolveIconSet('auto', {}), 'unicode');
  });

  await t.test('detectCapabilities folds the icon probe into the profile', () => {
    assert.equal(detectCapabilities({ TERM_PROGRAM: 'ghostty' }, true).icons, 'nerd');
    assert.equal(detectCapabilities({ FULLSTACK_ICONS: 'ascii' }, true).icons, 'ascii');
    assert.equal(detectCapabilities({ TERM: 'dumb' }, true).icons, 'ascii');
    assert.equal(detectCapabilities({}, true).icons, 'unicode');
  });

  await t.test('the Icons row shows the saved set and cycles like the theme row', () => {
    const writes = [];
    const settings = { data: {}, save: () => writes.push(1) };
    const row = preferenceRows({ settings }).find((r) => r.key === 'icons');
    assert.equal(row.toggleable, true);
    assert.match(row.value, /^Auto\s+\(Space to cycle\)$/);
    assert.equal(togglePreference(settings, 'icons').icons, 'nerd');
    assert.equal(settings.data.icons, 'nerd');
    assert.equal(stepIcons(settings, -1).icons, 'auto', 'stepping back wraps to Auto');
    assert.equal(writes.length, 2);
  });

  await t.test('browser pane rows degrade to ASCII with the ascii set', () => {
    const ic = ICON_SETS.ascii;
    const render = buildRenderRows(
      { rows: [], meta: null, issues: [{ text: 'x', line: 3 }], html: '', root: null }, 80, -1, ic,
    );
    const consoleRows = buildConsoleRows({
      output: [
        { kind: 'input', text: 'a' }, { kind: 'error', text: 'b' },
        { kind: 'log', text: 'c' }, { kind: 'result', text: 'd' },
      ],
      input: 'x', lines: 8, historyCount: 1, icons: ic,
    }).rows;
    const network = buildNetworkRows(
      { mockFetch: [{ method: 'GET', url: '/a', status: 200 }] },
      [{ url: '/b', status: 404 }], 80, ic,
    );
    const blob = [...render, ...consoleRows, ...network].map((r) => r.text).join('\n') + tabHint('console', ic);
    assert.ok(!/[\u0080-\uFFFF]/.test(blob), `ascii set emitted a non-ASCII glyph: ${JSON.stringify(blob)}`);
    assert.ok(blob.includes('! x (line 3)'), 'the issue row uses the ASCII warn glyph');
    assert.ok(blob.includes('-> /b  404'), 'the network row uses the ASCII direction glyph');
  });

  // -- integration through the real tree (needs the built harness) ------------
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  if (!existsSync(harnessPath)) {
    await t.test('→ on the Icons row swaps the live tree glyphs', (st) => {
      st.skip('needs built harness (npm run build)');
    });
    return;
  }
  const harness = await import(pathToFileURL(harnessPath).href);
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Settings } = await import('../../src/ui/settings.js');

  await t.test('→ on the Icons row swaps the live tree glyphs', async () => {
    const prevEnv = process.env.FULLSTACK_ICONS;
    delete process.env.FULLSTACK_ICONS;
    const dir = path.join(process.cwd(), '.data', 'icon-picker');
    rmSync(dir, { recursive: true, force: true });
    const settings = new Settings(path.join(dir, 'settings.json'));
    settings.data.icons = 'unicode';
    settings.save();

    const services = harness.createServices({
      store: {
        isPassed: () => false,
        stats: () => ({ totals: { challenges: 0, challengesPassed: 0 }, perModule: [], streak: { current: 0, best: 0 } }),
        data: { challenges: {} },
      },
      curriculum: [],
      settings,
      overall: {},
      lessonIndex: [],
    });

    function IconProbe() {
      const icons = harness.useIcons();
      const host = harness.useHost();
      return harness.el(harness.Text, null, `brand=${icons.brand} cursor=${host.cursor}`);
    }
    const SettingsWithProbe = () => harness.el(
      harness.Box,
      { flexDirection: 'column' },
      harness.el(harness.SettingsRoute, {}),
      harness.el(IconProbe, {}),
    );

    const out = helper.fakeStdout(100, 30);
    const inst = harness.render(
      harness.el(
        harness.ServicesProvider,
        { services },
        harness.el(harness.AppRoot, {
          screens: { settings: SettingsWithProbe },
          initial: { name: 'settings', params: {} },
          caps: { isTTY: true, tty: true, unicode: true, colorDepth: 24, tier: 'A', icons: 'unicode' },
        }),
      ),
      { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false },
    );
    try {
      assert.ok(await waitFor(() => out.chunks.join('').includes('brand=◈')), 'unicode glyphs are live at start');
      assert.ok(await waitFor(() => harness.getCurrentRoute().screen === 'settings'), 'settings is focused');

      // Theme is row 0; step down to the Icons row (row 1), then step right.
      harness.getCurrentRoute().onKey({ name: 'down' });
      assert.ok(await waitFor(() => out.chunks.join('').includes('cursor=1')), 'the Icons row is focused');
      harness.getCurrentRoute().onKey({ name: 'right' }); // unicode → ascii
      assert.ok(await waitFor(() => settings.data.icons === 'ascii'), 'the step persisted to settings.json');
      assert.ok(
        await waitFor(() => out.chunks.join('').includes('brand=*')),
        'the mounted tree swapped to ASCII glyphs live',
      );
    } finally {
      inst.unmount();
      if (typeof harness.clearRoute === 'function') harness.clearRoute();
      rmSync(dir, { recursive: true, force: true });
      if (prevEnv === undefined) delete process.env.FULLSTACK_ICONS;
      else process.env.FULLSTACK_ICONS = prevEnv;
    }
  });
});
