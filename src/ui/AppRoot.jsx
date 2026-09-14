/**
 * AppRoot (overhaul task 0.9 remainder) — the next-UI application shell.
 *
 * Composition (providers outermost → screens innermost):
 *
 *   <ThemeProvider>            tier + theme from capabilities (task 0.5)
 *     <RouterProvider>         screen stack (router.jsx)
 *       <AppRoot>              window size, dispatcher lifecycle, chrome
 *         <RouterView/>        the focused screen (registers its useKeymap)
 *
 * The InputDispatcher (main.jsx) stays the stdin owner; AppRoot only mounts
 * the React tree. Ctrl+C quit semantics are main.jsx's (E4-verified).
 */
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useWindowSize } from './useWindowSize.js';
import { RouterProvider, RouterView, useRouter } from './router.jsx';
import { themeForCapabilities } from './theme/index.js';
import { detectCapabilities } from './capabilities.js';

/** Window size with a SIGWINCH-driven re-render (first-party hook). */
function useSize() {
  return useWindowSize();
}

function ScreenFrame({ children, theme, size }) {
  const w = Math.max(20, Math.min(size.width || 80, 400));
  const h = Math.max(10, Math.min(size.height || 24, 200));
  return (
    <Box flexDirection="column" width={w} height={h}>
      {children}
      <Text color={theme.faint}> {w}×{h} · ctrl+c quit </Text>
    </Box>
  );
}

export function AppRoot({ screens }) {
  const size = useSize();
  const caps = detectCapabilities();
  const theme = themeForCapabilities(caps, process.env.FULLSTACK_THEME);

  return (
    <RouterProvider screens={screens}>
      <ScreenFrame theme={theme} size={size}>
        <RouterView />
      </ScreenFrame>
    </RouterProvider>
  );
}

export { RouterProvider, RouterView, useRouter };
