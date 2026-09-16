/**
 * Replay driver (spec §11: "replay drives a scripted key sequence").
 *
 * Pairs a fake stdout/stdin with the real InputDispatcher so tests can inject
 * raw byte scripts (keys, mouse SGR, bracketed paste — split across chunks
 * exactly like SSH would) and collect what the app writes. The next-UI
 * equivalent of tools/check.js's classic-UI replays.
 *
 * Distinct from tests/helpers/snapshot.js, which renders single elements:
 * this drives the INPUT side end to end.
 */
import { Readable, Writable } from 'node:stream';
import { InputDispatcher } from '../../src/ui/input/dispatcher.js';

export function createDriver({ columns = 80, rows = 24 } = {}) {
  const chunks = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
  });
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = true;
  stdout.chunks = chunks;
  stdout.frames = () => chunks.join('');

  let feedFn = null;
  const stdin = new Readable({
    read() { feedFn = () => {}; }, // never pushes; scripts inject manually
  });
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};
  stdin.ref = () => {};
  stdin.unref = () => {};
  feedFn = (text) => stdin.emit('data', Buffer.from(text));

  const events = [];
  const dispatcher = new InputDispatcher({
    stdout,
    stdin,
    getRoute: () => ({
      onKey: (ev) => { events.push(ev); return screenRoute.onKey?.(ev) ?? false; },
      onMouse: (ev) => { events.push(ev); return screenRoute.onMouse?.(ev) ?? false; },
      onPaste: (ev) => { events.push(ev); return screenRoute.onPaste?.(ev) ?? false; },
    }),
    globalHandler: () => false,
    onQuit: () => { events.push({ type: 'quit' }); },
  });

  const screenRoute = {};

  return {
    stdout,
    stdin,
    dispatcher,
    events,
    screenRoute,
    start: () => dispatcher.start(),
    stop: () => dispatcher.stop(),
    /** Inject raw bytes as one stdin chunk (accepts strings or arrays). */
    feed: (script) => { for (const piece of Array.isArray(script) ? script : [script]) feedFn(piece); },
    /** Wait until a predicate over collected events passes, or timeout. */
    waitFor: (predicate, ms = 200) => new Promise((resolve) => {
      const t0 = Date.now();
      const poll = setInterval(() => {
        if (predicate(events)) { clearInterval(poll); resolve(true); }
        else if (Date.now() - t0 > ms) { clearInterval(poll); resolve(false); }
      }, 5);
    }),
    /** The terminal-visible output as one string. */
    output: () => stdout.frames(),
  };
}
