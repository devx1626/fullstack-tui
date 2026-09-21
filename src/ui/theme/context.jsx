/**
 * Theme context (spec §7.1/§7.2, task 2.11 remainder).
 *
 * Before this, only AppRoot's own frame saw the resolved theme: every screen
 * and chrome component hardcoded Ink color NAMES ("cyan", "gray", …). Two
 * consequences, both user-visible:
 *
 *   - `FULLSTACK_THEME=paper` never took effect — a light-background terminal
 *     got the dark palette's cyan-on-white chrome.
 *   - Tier D (`colorDepth: 0`, dumb terminals) still emitted color, because
 *     `themeForCapabilities` strips the token values but nothing consulted
 *     them; the tier-C/D smoke in tools/check.js reported this on all 11
 *     screens.
 *
 * `useTheme()` returns the resolved token map, whose values are hex (tier A),
 * `ansi256(n)` strings (B/C) or `undefined` (D). Chrome must therefore ask for
 * a ROLE (`theme.accent`, `theme.muted`, …) and never for a raw value.
 *
 * Default is the raw midnight theme so a component rendered outside a provider
 * (unit tests, isolated previews) still colors correctly.
 */
import React, { createContext, useContext } from 'react';
import { midnight } from './themes.js';
import { ICON_SETS } from './icons.js';

export const ThemeContext = createContext(midnight);

/**
 * Icon context (overhaul §7.1/§7.3). Holds the resolved glyph map for the
 * session; components read `useIcons().select` etc. Defaults to the unicode
 * set outside a provider so isolated component renders keep the shipped look.
 */
export const IconsContext = createContext(ICON_SETS.unicode);

export function IconsProvider({ icons = ICON_SETS.unicode, children }) {
  return <IconsContext.Provider value={icons || ICON_SETS.unicode}>{children}</IconsContext.Provider>;
}

/** The active glyph map (unicode set outside `<AppRoot>`). */
export function useIcons() {
  return useContext(IconsContext) || ICON_SETS.unicode;
}

/**
 * Theme CONTROL context (overhaul §7.2 live-preview picker).
 *
 * The ThemeProvider carries the resolved tokens; this carries the mutable
 * choice so a screen (the settings picker) can re-theme the whole tree without
 * owning the tokens itself. `AppRoot` owns the state — it sits above the router
 * and the screens — so calling `setTheme` there re-renders the provider and
 * every consumer instantly, with no screen remount.
 *
 * Shape: `{ name, setTheme(name) }` where `name` is the resolved palette name
 * and `setTheme(null)` means Auto. Null outside a provider (standalone tests).
 */
export const ThemeControlContext = createContext(null);

export function ThemeControlProvider({ value, children }) {
  return <ThemeControlContext.Provider value={value || null}>{children}</ThemeControlContext.Provider>;
}

/** The live theme control, or null when rendered outside `<AppRoot>`. */
export function useThemeControl() {
  return useContext(ThemeControlContext);
}

/**
 * Icon control (same shape as the theme control): `{ set, setIcons(name) }`.
 * Owned by `AppRoot` so the Settings picker re-renders the whole tree's glyphs
 * instantly. Null outside a provider.
 */
export const IconsControlContext = createContext(null);

export function IconsControlProvider({ value, children }) {
  return <IconsControlContext.Provider value={value || null}>{children}</IconsControlContext.Provider>;
}

/** The live icon control, or null when rendered outside `<AppRoot>`. */
export function useIconControl() {
  return useContext(IconsControlContext);
}

export function ThemeProvider({ theme = midnight, children }) {
  return <ThemeContext.Provider value={theme || midnight}>{children}</ThemeContext.Provider>;
}

/** The resolved theme tokens, or the default midnight theme outside a provider. */
export function useTheme() {
  return useContext(ThemeContext) || midnight;
}
