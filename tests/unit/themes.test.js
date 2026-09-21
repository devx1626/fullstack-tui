/**
 * Theme palette tests (Phase 4 theme set).
 *
 * The curated set ships five palettes behind one token contract. These tests
 * pin the two things a sixth palette could silently break:
 *
 *   1. every palette carries the SAME token roles (screens ask for
 *      `theme.accent` and must never get undefined-by-typo), and
 *   2. every palette is reachable by name through `themeForCapabilities`, so
 *      `FULLSTACK_THEME=ember` actually resolves (and down-maps at tier B/C,
 *      strips at tier D) instead of falling back to a default.
 *
 * Run: node --test tests/unit/themes.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themes, midnight, paper } from '../../src/ui/theme/themes.js';
import { themeForCapabilities } from '../../src/ui/theme/index.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const NAMES = ['midnight', 'paper', 'ember', 'dusk', 'sand'];
const TOKENS = Object.keys(midnight).filter((k) => k !== 'name');

const caps = (colorDepth) => ({ isTTY: true, tty: true, unicode: true, colorDepth, tier: 'A' });

test('the curated set ships exactly the five named palettes', () => {
  assert.deepEqual(Object.keys(themes).sort(), [...NAMES].sort());
  for (const name of NAMES) {
    assert.equal(themes[name].name, name, `${name}.name must match its key`);
  }
});

test('every palette carries the same token roles as midnight', () => {
  for (const name of NAMES) {
    assert.deepEqual(
      Object.keys(themes[name]).sort(),
      Object.keys(midnight).sort(),
      `${name} has a different token set than midnight`,
    );
  }
});

test('every token is a valid hex color (so hexTo256 never sees junk)', () => {
  for (const name of NAMES) {
    for (const token of TOKENS) {
      assert.ok(
        HEX_RE.test(themes[name][token]),
        `${name}.${token} is not a hex color: ${themes[name][token]}`,
      );
    }
  }
});

test('dark/light palettes keep readable contrast on their background', () => {
  // Cheap luminance check: text must be far from bg, and panel near bg.
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  for (const name of NAMES) {
    const t = themes[name];
    assert.ok(Math.abs(lum(t.text) - lum(t.bg)) > 100, `${name}: text barely differs from bg`);
    assert.ok(Math.abs(lum(t.panel) - lum(t.bg)) < 40, `${name}: panel is far from bg`);
  }
});

test('themeForCapabilities resolves every named palette at tier A (hex passthrough)', () => {
  for (const name of NAMES) {
    const res = themeForCapabilities(caps(24), name);
    assert.equal(res.name, name, `${name} did not resolve`);
    assert.equal(res.accent, themes[name].accent);
  }
});

test('selection is case-insensitive and trims to the name map', () => {
  assert.equal(themeForCapabilities(caps(24), 'EMBER').name, 'ember');
  assert.equal(themeForCapabilities(caps(24), 'Dusk').name, 'dusk');
});

test('named palettes down-map to ansi256 at tier B/C and strip at tier D', () => {
  for (const name of NAMES) {
    const b = themeForCapabilities(caps(8), name);
    assert.match(b.accent, /^ansi256\(\d+\)$/, `${name} did not down-map: ${b.accent}`);
    const d = themeForCapabilities(caps(0), name);
    for (const token of TOKENS) {
      assert.equal(d[token], undefined, `${name}.${token} leaked a color at tier D`);
    }
  }
});

test('an unknown theme name falls back to the auto heuristic, not a wrong palette', () => {
  const prev = process.env.COLORFGBG;
  try {
    delete process.env.COLORFGBG;
    assert.equal(themeForCapabilities(caps(24), 'dracula').name, 'midnight');
    process.env.COLORFGBG = '15;0'; // dark background
    assert.equal(themeForCapabilities(caps(24), 'dracula').name, 'midnight');
    process.env.COLORFGBG = '0;15'; // light background
    assert.equal(themeForCapabilities(caps(24), 'dracula').name, 'paper');
    assert.equal(themeForCapabilities(caps(24), undefined).name, 'paper');
  } finally {
    if (prev === undefined) delete process.env.COLORFGBG;
    else process.env.COLORFGBG = prev;
  }
});

test('prototype keys are not mistaken for palettes', () => {
  // `themes['constructor']` is truthy on a plain object; resolution must not
  // hand that to mapTheme (Object.entries on it yields nothing).
  const prev = process.env.COLORFGBG;
  delete process.env.COLORFGBG;
  try {
    const res = themeForCapabilities(caps(24), 'constructor');
    assert.equal(res.name, 'midnight');
    assert.equal(res.accent, midnight.accent);
  } finally {
    if (prev !== undefined) process.env.COLORFGBG = prev;
  }
});
