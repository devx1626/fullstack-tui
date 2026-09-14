/**
 * Spike B — probe hook availability on npm-stable ink@6.8.0.
 * The upstream README documents usePaste/useBoxMetrics/contentOffset on the
 * "upcoming version"; this checks what the installed 6.8.0 actually exports.
 * Results logged to docs/ink-spike.md.
 */
import React from 'react';
import * as ink from 'ink';
import { Writable } from 'node:stream';

// Version verified out-of-band at spike time via `node -e` on node_modules/ink/package.json.
const INK_VERSION = '6.8.0';

const want = [
  'render',
  'Text',
  'Box',
  'Static',
  'Newline',
  'Spacer',
  'Transform',
  'useInput',
  'usePaste',
  'useApp',
  'useStdin',
  'useStdout',
  'useStderr',
  'useBoxMetrics',
  'useWindowSize',
  'useFocus',
  'useFocusManager',
  'useCursor',
  'useAnimation',
];

console.log(`ink version: ${INK_VERSION} (see comment)`);
for (const name of want) {
  console.log(`${name}: ${name in ink ? 'PRESENT' : 'MISSING'}`);
}

// contentOffset: is the prop accepted AND does it actually offset the render?
const { Box, Text, render } = ink;
const chunks = [];
const out = new Writable({
  write(c, _e, cb) { chunks.push(c.toString()); cb(); },
});
out.columns = 40;
out.rows = 10;

try {
  const el = React.createElement(
    Box,
    { height: 2, overflow: 'hidden', contentOffsetY: 1, flexDirection: 'column' },
    React.createElement(Text, null, 'row0'),
    React.createElement(Text, null, 'row1'),
    React.createElement(Text, null, 'row2'),
  );
  const inst = render(el, { stdout: out, exitOnCtrlC: false });
  await new Promise((r) => setTimeout(r, 30));
  inst.unmount();
  await new Promise((r) => setTimeout(r, 20));
  const text = chunks.join('');
  const offsets = !text.includes('row0') && text.includes('row1') && text.includes('row2');
  console.log(`contentOffsetY: ${offsets ? 'VERIFIED (row0 scrolled off)' : 'accepted but no offset effect'}`);
} catch (err) {
  console.log(`contentOffsetY: REJECTED (${err.message.split('\n')[0]})`);
}
await new Promise((r) => setTimeout(r, 30));
process.exit(0);
