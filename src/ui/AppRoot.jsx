/**
 * AppRoot (overhaul task 0.9 remainder) — the next-UI application shell.
 *
 * Composition (providers outermost → screens innermost):
 *
 *   <ThemeProvider>            tier + theme from capabilities (task 0.5)
 *     <RouterProvider>         screen stack (router.jsx)
 *       <AppRoot>              window size, chrome
 *         <CommandHost>        cursor, navigation, command table (host.jsx)
 *           <RouterView/>      the focused screen (registers its useKeymap)
 *
 * The InputDispatcher (main.jsx) stays the stdin owner; AppRoot only mounts
 * the React tree. Ctrl+C quit semantics are main.jsx's (E4-verified); `q`
 * reaches it through CommandHost → onQuit.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useWindowSize } from './useWindowSize.js';
import { RouterProvider, RouterView, useRouter } from './router.jsx';
import { CommandHost } from './host.jsx';
import { useServices } from './services.jsx';
import { themeForCapabilities } from './theme/index.js';
import { ThemeProvider, ThemeControlProvider, IconsProvider, IconsControlProvider, useIcons } from './theme/context.jsx';
import { themes } from './theme/themes.js';
import { iconsFor, resolveIconSet, normalizeIconSet } from './theme/icons.js';
import { detectCapabilities } from './capabilities.js';

function ScreenFrame({ children, theme, size }) {
  // useWindowSize returns { w, h } — reading `width`/`height` here pinned the
  // next UI to a hard-coded 80×24 and ignored every resize. The status line
  // uses the active icon set, so tier D stays 7-bit.
  const ic = useIcons();
  const w = Math.max(20, Math.min(size.w || 80, 400));
  const h = Math.max(10, Math.min(size.h || 24, 200));
  return (
    <Box flexDirection="column" width={w} height={h}>
      {children}
      <Text color={theme.faint}> {w}x{h} {ic.bullet} ctrl+c quit </Text>
    </Box>
  );
}

/**
 * @param {{screens: object, onQuit: () => void, initial?: {name: string, params: object}}} props
 *   `initial` is the bottom of the route stack — main.jsx uses it to open the
 *   welcome tour on a first launch (task 1.6) instead of the dashboard.
 */
export function AppRoot({ screens, onQuit, initial, caps: capsOverride = null }) {
  const size = useWindowSize();
  // `caps` is injectable so the check tool can render every screen at each
  // degrade tier (spec §13.2): the real probe reads process.stdout.isTTY, which
  // is always false under a piped check run.
  const caps = capsOverride || detectCapabilities();
  const services = useServices();
  const settings = services && services.settings;

  // Theme picker state (overhaul §7.2). `chosen === undefined` means "nothing
  // picked this session" — follow the resolved default (FULLSTACK_THEME env →
  // saved settings → heuristic). `null` is an explicit Auto; a name is an
  // explicit palette. The settings screen calls `setTheme` for a live preview
  // that also persists, so changing the row re-themes the whole tree without a
  // remount (this component is above the router).
  const [chosen, setChosen] = useState(undefined);
  const savedTheme = settings && settings.data ? settings.data.theme : null;
  const resolvedDefault = process.env.FULLSTACK_THEME || savedTheme || null;
  const requested = chosen === undefined ? resolvedDefault : chosen;
  const theme = themeForCapabilities(caps, requested);

  const setTheme = useCallback((name) => {
    const next = name && Object.prototype.hasOwnProperty.call(themes, name) ? name : null;
    setChosen(next);
    // Persist through the store so a picker change survives a restart; the
    // toggle/arrow helpers already wrote it in the common path, so skip the
    // second write when the value is unchanged.
    if (settings && typeof settings.setTheme === 'function' && settings.data.theme !== next) {
      settings.setTheme(next);
    }
  }, [settings]);

  const control = useMemo(() => ({ name: theme.name, setTheme }), [theme.name, setTheme]);

  // Icons (overhaul §7.1): FULLSTACK_ICONS env → saved setting → capability
  // heuristic. The picker (`icons.setIcons`) re-resolves live, like the theme.
  const [chosenIcons, setChosenIcons] = useState(undefined);
  const envIcons = normalizeIconSet(process.env.FULLSTACK_ICONS);
  const savedIcons = normalizeIconSet(settings && settings.data ? settings.data.icons : 'auto');
  const requestedIcons = chosenIcons !== undefined
    ? chosenIcons
    : (envIcons !== 'auto' ? envIcons : savedIcons);
  const iconSet = resolveIconSet(requestedIcons, caps);
  const icons = iconsFor(iconSet);

  const setIcons = useCallback((name) => {
    const next = normalizeIconSet(name);
    setChosenIcons(next);
    if (settings && typeof settings.setIcons === 'function' && normalizeIconSet(settings.data.icons) !== next) {
      settings.setIcons(next);
    }
  }, [settings]);

  const iconControl = useMemo(() => ({ set: iconSet, setIcons }), [iconSet, setIcons]);

  return (
    <ThemeControlProvider value={control}>
      <IconsControlProvider value={iconControl}>
        <IconsProvider icons={icons}>
          <ThemeProvider theme={theme}>
            <RouterProvider screens={screens} initial={initial}>
              <ScreenFrame theme={theme} size={size}>
                <CommandHost onQuit={onQuit}>
                  <RouterView />
                </CommandHost>
              </ScreenFrame>
            </RouterProvider>
          </ThemeProvider>
        </IconsProvider>
      </IconsControlProvider>
    </ThemeControlProvider>
  );
}

export { RouterProvider, RouterView, useRouter };
