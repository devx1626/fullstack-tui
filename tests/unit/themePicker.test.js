/**
 * Theme picker tests (overhaul §7.2, Phase 4 theme set).
 *
 * Two layers:
 *   1. the pure cycling table shared by Space and the ←/→ arrows (so the two
 *      affordances can never land on different palettes), and
 *   2. an end-to-end check through the REAL tree: pressing → on the Theme row
 *      persists the choice AND re-themes the mounted provider immediately.
 *
 * Structure note: subtests are declared with `await t.test(...)` inside one
 * parent (see CONTRIBUTING) so the runner cannot drop one registered after a
 * top-level await.
 *
 * Run: node --test tests/unit/themePicker.test.js  (integration needs dist/harness.js)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  THEME_NAMES, THEME_CYCLE, normalizeTheme, themeLabel, nextTheme, stepTheme,
  preferenceRows, togglePreference,
} from '../../src/ui/preferences.js';
import { waitFor } from '../helpers/snapshot.js';

test('theme picker: cycling, persistence and live preview', async (t) => {
  await t.test('the cycle table is Auto first, then every palette once', () => {
    assert.deepEqual(THEME_NAMES, ['midnight', 'paper', 'ember', 'dusk', 'sand']);
    assert.deepEqual(THEME_CYCLE, [null, ...THEME_NAMES]);
  });

  await t.test('normalizeTheme is case-insensitive and rejects unknown names', () => {
    assert.equal(normalizeTheme('EMBER'), 'ember');
    assert.equal(normalizeTheme('Dusk'), 'dusk');
    assert.equal(normalizeTheme('dracula'), null);
    assert.equal(normalizeTheme(undefined), null);
    assert.equal(normalizeTheme('constructor'), null, 'prototype keys are not themes');
  });

  await t.test('themeLabel names the palette, or "Auto" when following the terminal', () => {
    assert.equal(themeLabel(null), 'Auto');
    assert.equal(themeLabel('ember'), 'Ember');
    assert.equal(themeLabel('bogus'), 'Auto');
  });

  await t.test('nextTheme wraps through Auto → palettes → Auto', () => {
    assert.equal(nextTheme(null), 'midnight');
    assert.equal(nextTheme('midnight'), 'paper');
    assert.equal(nextTheme('sand'), null);
    assert.equal(nextTheme('paper'), 'ember');
  });

  await t.test('stepTheme steps both directions, wraps, and persists', () => {
    const writes = [];
    const settings = { data: { theme: 'paper' }, save: () => writes.push(1) };
    assert.equal(stepTheme(settings, 1).theme, 'ember');
    assert.equal(settings.data.theme, 'ember');
    // -1 from midnight falls back to Auto (index 0).
    settings.data.theme = 'midnight';
    assert.equal(stepTheme(settings, -1).theme, null);
    assert.equal(settings.data.theme, null, 'Auto is stored as null');
    assert.equal(writes.length, 2, 'every step persists');
    assert.match(stepTheme(settings, 1).message, /midnight/i, 'the notice names the palette');
  });

  await t.test('the Theme row shows the saved palette and is a toggle row', () => {
    const settings = { data: { theme: 'dusk' }, save: () => {} };
    const row = preferenceRows({ settings }).find((r) => r.key === 'theme');
    assert.equal(row.toggleable, true);
    assert.match(row.value, /^Dusk\s+\(Space to cycle\)$/);
    assert.match(row.hint, /live preview/);
  });

  await t.test('togglePreference cycles the theme and saves', () => {
    const writes = [];
    const settings = { data: {}, save: () => writes.push(1) };
    const first = togglePreference(settings, 'theme');
    assert.equal(first.changed, true);
    assert.equal(first.theme, 'midnight', 'unset (Auto) → first palette');
    assert.equal(writes.length, 1);
  });

  // -- integration through the real tree (needs the built harness) ------------
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  if (!existsSync(harnessPath)) {
    await t.test('→ on the Theme row persists and re-themes the live tree', (st) => {
      st.skip('needs built harness (npm run build)');
    });
    return;
  }
  const harness = await import(pathToFileURL(harnessPath).href);
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Settings } = await import('../../src/ui/settings.js');

  await t.test('→ on the Theme row persists and re-themes the live tree', async () => {
    const prevEnv = process.env.FULLSTACK_THEME;
    delete process.env.FULLSTACK_THEME; // the saved setting must decide
    const dir = path.join(process.cwd(), '.data', 'theme-picker');
    rmSync(dir, { recursive: true, force: true });
    const settings = new Settings(path.join(dir, 'settings.json'));
    settings.data.theme = 'paper';
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

    // A probe screen that prints the RESOLVED accent, so a re-theme is visible
    // as text rather than as a color SGR we would have to reconstruct.
    function ThemeProbe() {
      const theme = harness.useTheme();
      return harness.el(harness.Text, null, `accent=${theme.accent}`);
    }
    const SettingsWithProbe = () => harness.el(
      harness.Box,
      { flexDirection: 'column' },
      harness.el(harness.SettingsRoute, {}),
      harness.el(ThemeProbe, {}),
    );

    const out = helper.fakeStdout(100, 30);
    const inst = harness.render(
      harness.el(
        harness.ServicesProvider,
        { services },
        harness.el(harness.AppRoot, {
          screens: { settings: SettingsWithProbe },
          initial: { name: 'settings', params: {} },
          caps: { isTTY: true, tty: true, unicode: true, colorDepth: 24, tier: 'A' },
        }),
      ),
      { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false },
    );
    try {
      assert.ok(await waitFor(() => out.chunks.join('').includes('accent=#2874a2')), 'the saved paper theme is live at start');
      assert.ok(await waitFor(() => harness.getCurrentRoute().screen === 'settings'), 'settings is focused');

      harness.getCurrentRoute().onKey({ name: 'right' }); // paper → ember
      assert.ok(await waitFor(() => settings.data.theme === 'ember'), 'the step persisted to settings.json');
      assert.ok(
        await waitFor(() => out.chunks.join('').includes('accent=#e0913c')),
        'the mounted tree re-themed live (ember accent rendered)',
      );
    } finally {
      inst.unmount();
      if (typeof harness.clearRoute === 'function') harness.clearRoute();
      rmSync(dir, { recursive: true, force: true });
      if (prevEnv === undefined) delete process.env.FULLSTACK_THEME;
      else process.env.FULLSTACK_THEME = prevEnv;
    }
  });
});
