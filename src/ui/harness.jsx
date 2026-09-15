/**
 * Test harness entry (built with `npm run build -- --spike`).
 * Re-exports ink's render, input hooks, and the UI components so node:test
 * files can render JSX components from plain .js test files.
 *
 * Everything React/ink-flavored must come from THIS bundle — importing react
 * from node_modules in a test file while rendering bundled components mixes
 * two React copies and crashes with the useContext null-dispatcher error.
 */
import React, { useState } from 'react';
import { render, useInput, useApp } from 'ink';
import { useKeymap, getCurrentRoute, setCurrentRoute, clearRoute } from './useKeymap.js';

export { render, useInput, useApp, useState, useKeymap, getCurrentRoute, setCurrentRoute, clearRoute };
export { Header, Panel, List, ScrollPane, Footer, Badge, Meter } from './components/chrome.jsx';
export { Palette } from './components/palette.jsx';
export { SplitPane } from './components/splitPane.jsx';
export { Modal, Toast } from './components/overlays.jsx';
export { RouterProvider, RouterView, useRouter } from './router.jsx';
export { ChallengeScreen } from './screens/challenge.jsx';
export { cursorShape } from './multimedia.js';
export { Text, Box } from 'ink';

/** createElement shorthand for tests (children variadic). */
export const el = (Component, props, ...children) => React.createElement(Component, props, ...children);
