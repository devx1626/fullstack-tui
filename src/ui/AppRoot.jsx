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
import React from 'react';
import { Box, Text } from 'ink';
import { useWindowSize } from './useWindowSize.js';
import { RouterProvider, RouterView, useRouter } from './router.jsx';
import { CommandHost } from './host.jsx';
import { themeForCapabilities } from './theme/index.js';
import { detectCapabilities } from './capabilities.js';

function ScreenFrame({ children, theme, size }) {
  // useWindowSize returns { w, h } — reading `width`/`height` here pinned the
  // next UI to a hard-coded 80×24 and ignored every resize.
  const w = Math.max(20, Math.min(size.w || 80, 400));
  const h = Math.max(10, Math.min(size.h || 24, 200));
  return (
    <Box flexDirection="column" width={w} height={h}>
      {children}
      <Text color={theme.faint}> {w}×{h} · ctrl+c quit </Text>
    </Box>
  );
}

export function AppRoot({ screens, onQuit }) {
  const size = useWindowSize();
  const caps = detectCapabilities();
  const theme = themeForCapabilities(caps, process.env.FULLSTACK_THEME);

  return (
    <RouterProvider screens={screens}>
      <ScreenFrame theme={theme} size={size}>
        <CommandHost onQuit={onQuit}>
          <RouterView />
        </CommandHost>
      </ScreenFrame>
    </RouterProvider>
  );
}

export { RouterProvider, RouterView, useRouter };
