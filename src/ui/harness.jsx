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

export { render, useInput, useApp, useState };
export { Header, Panel, List, ScrollPane, Footer, Badge, Meter } from './components/chrome.jsx';
export { Palette } from './components/palette.jsx';

/** createElement shorthand for tests. */
export const el = (Component, props) => React.createElement(Component, props);
