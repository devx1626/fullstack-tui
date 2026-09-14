/**
 * Test harness entry (built with `npm run build -- --spike`).
 * Re-exports ink's render and the chrome components so node:test files can
 * render JSX components from plain .js test files.
 */
import React from 'react';
import { render } from 'ink';

export { render };
export { Header, Panel, List, ScrollPane, Footer, Badge, Meter } from './components/chrome.jsx';

/** createElement shorthand for tests. */
export const el = (Component, props) => React.createElement(Component, props);
