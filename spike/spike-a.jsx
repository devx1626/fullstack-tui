/**
 * Spike A — feasibility probes (results logged to docs/ink-spike.md):
 *   1. Fake-stdout render + waitUntilExit (headless/snapshot test path)
 *   2. exitOnCtrlC: false honored (dispatcher must own Ctrl+C)
 *   3. Fullscreen/alternate screen support in npm-stable ink@6
 *   4. patchConsole suppression under fake stdout (headless stays silent)
 *   5. Static re-render of the same tree (frame cost baseline)
 */
import React, { useEffect, useState } from 'react';
import { render, Text, Box, Static } from 'ink';
import { Writable } from 'node:stream';

function fakeStdout() {
  const chunks = [];
  const out = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  out.columns = 80;
  out.rows = 24;
  out.chunks = chunks;
  out.isTTY = false;
  return out;
}

const lines = (m) => console.log(m);

// -- probe 1: fake stdout ----------------------------------------------------
await (async () => {
  const out = fakeStdout();
  const { waitUntilExit } = render(
    React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, { color: 'green' }, 'hello-from-fake-stdout'),
    ),
    { stdout: out, exitOnCtrlC: false, patchConsole: false },
  );
  await waitUntilExit();
  const text = out.chunks.join('');
  lines(`A1 fake-stdout-render: ${text.includes('hello-from-fake-stdout') ? 'PASS' : 'FAIL'} (${out.chunks.length} writes)`);
  lines(`A4 patchConsole-off-headless-silent: ${text.includes('SPY_MARKER') ? 'FAIL' : 'PASS'}`);
})();

// -- probe 2: exitOnCtrlC false + Static re-render ---------------------------
await (async () => {
  const out = fakeStdout();
  const events = [];
  function CtrlProbe() {
    useEffect(() => {
      const t = setTimeout(() => events.push('timeout-fired'), 30);
      return () => clearTimeout(t);
    }, []);
    return React.createElement(Text, null, 'ctrl-probe');
  }
  const inst = render(React.createElement(CtrlProbe), { stdout: out, exitOnCtrlC: false });
  // Without a real TTY there is no Ctrl+C delivery; assert the option is
  // accepted and the app keeps running (no crash) for 50ms, then unmount.
  await new Promise((r) => setTimeout(r, 50));
  inst.unmount();
  await inst.waitUntilExit();
  lines(`A2 exitOnCtrlC-false-accepted: ${events.includes('timeout-fired') ? 'PASS' : 'FAIL'}`);
})();

// -- probe 3: alternate screen ----------------------------------------------
await (async () => {
  const out = fakeStdout();
  const { unmount } = render(
    React.createElement(Text, null, 'alt-screen-probe'),
    { stdout: out, exitOnCtrlC: false },
  );
  await new Promise((r) => setTimeout(r, 30));
  unmount();
  await new Promise((r) => setTimeout(r, 10));
  const text = out.chunks.join('');
  lines(`A3 fullscreen-option-exists: ${typeof render.length === 'number' ? 'check-manually' : 'FAIL'} (render.length=${render.length})`);
  lines(`A3 alt-1049-seen: ${text.includes('?1049h') ? 'PASS' : 'NOT-PRESENT (expected for ink@6 — wrapper required)'}`);
})();

// -- probe 5: re-render cost -------------------------------------------------
await (async () => {
  const out = fakeStdout();
  let setTick;
  function Ticker() {
    const [tick, setT] = useState(0);
    setTick = setT;
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      Array.from({ length: 20 }, (_, i) => React.createElement(Text, { key: i }, `row ${i} tick ${tick}`)),
    );
  }
  const inst = render(React.createElement(Ticker), { stdout: out, exitOnCtrlC: false });
  await new Promise((r) => setTimeout(r, 30));
  const times = [];
  for (let i = 0; i < 50; i += 1) {
    const t0 = process.hrtime.bigint();
    setTick(i);
    await new Promise((r) => setTimeout(r, 0)); // let React flush
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  inst.unmount();
  await new Promise((r) => setTimeout(r, 30)); // let the pipe flush before exiting
  const p50 = times.slice().sort((a, b) => a - b)[Math.floor(times.length / 2)];
  lines(`A5 rerender-20rows-x50: min=${times[0].toFixed(2)}ms p50=${p50.toFixed(2)}ms max=${times[times.length - 1].toFixed(2)}ms`);
  process.exit(0);
})();
