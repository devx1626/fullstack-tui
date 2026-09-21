/**
 * Theme context tests (task 2.11 remainder).
 *
 * The bug these pin: the resolved theme (`themeForCapabilities`) used to reach
 * only AppRoot's own frame, because every screen and chrome component asked ink
 * for color NAMES — `"cyan"`, `"gray"`. So `FULLSTACK_THEME=paper` never
 * repainted a screen, and a colorless tier (`colorDepth: 0`) still emitted
 * color. Components must ask for a ROLE and get it from here.
 *
 * Run: node --test tests/unit/themeContext.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// chalk resolves its color level when ink's module graph first initializes, so
// this has to be set before the harness is imported below (a fake stdout is not
// a TTY and would otherwise silence every color).
process.env.FORCE_COLOR = '3';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath)
  ? await import(pathToFileURL(harnessPath).href)
  : null;
const helper = await import(
  pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname)
);

if (harness) {
  const renderToText = (element) => helper.renderToText(element, { render: harness.render });
  const { el, Text, ThemeProvider, useTheme, Toast, Footer } = harness;

  /** Reads the resolved theme and prints one token as text (no color needed). */
  const Probe = ({ token = 'accent' }) => el(Text, null, String(useTheme()[token]));

  const sgr = (hex) => `\u001b[38;2;${[1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16))
    .join(';')}m`;

  test('useTheme falls back to the midnight tokens outside a provider', async () => {
    const text = await renderToText(el(Probe, { token: 'accent' }));
    assert.ok(text.includes('#39c5cf'), `expected the default accent, got ${JSON.stringify(text)}`);
  });

  test('ThemeProvider hands its tokens to nested components', async () => {
    const theme = { name: 'test', accent: '#123456', muted: '#654321' };
    const text = await renderToText(
      el(ThemeProvider, { theme }, el(Probe, { token: 'accent' })),
    );
    assert.ok(text.includes('#123456'), `provider tokens did not reach the child: ${JSON.stringify(text)}`);
  });

  test('a shipped component paints with the provider tokens, not an Ink color name', async () => {
    // Toast maps `ok` → theme.good; before this pass it was the literal 'green'
    // (SGR 32), which is what the tier-C/D smoke kept catching on screen.
    const frame = await renderToText(
      el(ThemeProvider, { theme: { name: 'test', good: '#00ff00', accent: '#123456' } },
        el(Toast, { message: 'saved', kind: 'ok' })),
    );
    assert.ok(frame.includes(sgr('#00ff00')), `theme.good did not reach the frame: ${JSON.stringify(frame)}`);
  });

  test('the footer renders uncolored when the theme strips its tokens (tier D)', async () => {
    // themeForCapabilities sets every token to undefined at colorDepth 0; the
    // components must degrade to plain text rather than to a color name.
    const theme = { name: 'tier-d', accent: undefined, muted: undefined, text: undefined, good: undefined, bad: undefined };
    const frame = await renderToText(
      el(ThemeProvider, { theme },
        el(Footer, { hints: [['j/k', 'move']], notice: { text: 'Saved', kind: 'good' } })),
    );
    assert.ok(!/\u001b\[[0-9;]*3[0-9]m/.test(frame), `color leaked at tier D: ${JSON.stringify(frame)}`);
  });
}
