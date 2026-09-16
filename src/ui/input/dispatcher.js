/**
 * Input dispatcher (overhaul task 0.4, spec §A.3) — the runtime half of the
 * input pipeline. Owns stdin in raw mode, feeds bytes through the byte-level
 * parser chain, and routes normalized events to the active screen's handler.
 *
 *   stdin ──► MouseParser (raw)  ──► PasteBuffer (raw) ──► EscapeCoalescer ──► route()
 *             mouse events          paste events           keys/bytes
 *
 * Key routing rule (overhaul §10 "mode wins"): the focused screen's handler
 * gets the event first; if it returns false/undefined the event falls through
 * to the global handler (palette, quit, help).
 *
 * Mouse and paste are enabled via mode-set sequences written to stdout; both
 * are restored on stop() so the shell is never left in a weird mode.
 */
import { MouseParser, PasteBuffer, EscapeCoalescer, mouseSeq, pasteSeq } from './index.js';
import { hasOverlays, routeToOverlays } from './overlayStack.js';

export class InputDispatcher {
  /**
   * @param {object} opts
   * @param {() => object} getRoute { onKey, onMouse, onPaste } of the focused screen
   * @param {(ev: object) => boolean} globalHandler returns true if consumed
   * @param {NodeJS.WriteStream} stdout
   * @param {NodeJS.ReadStream} stdin
   * @param {(reason?: string) => void} onQuit requested app exit
   */
  constructor({ getRoute, globalHandler, stdout = process.stdout, stdin = process.stdin, onQuit }) {
    this.stdout = stdout;
    this.stdin = stdin;
    this.getRoute = getRoute;
    this.globalHandler = globalHandler;
    this.onQuit = onQuit;
    this.stopped = false;

    // Byte-level chain: mouse/paste run before key parsing so their control
    // sequences never leak into the editor as garbage chars.
    this.mouse = new MouseParser({ rawPassThrough: true });
    this.paste = new PasteBuffer({ rawPassThrough: true });
    this.coalescer = new EscapeCoalescer(50);
    this.coalescer.onEvent = (ev) => this.route(ev);

    this.onData = (buf) => this.feed(buf.toString());
  }

  start() {
    if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
      this.stdin.setRawMode(true);
    }
    this.enableModes();
    this.stdin.on('data', this.onData);
    this.stdin.resume();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.stdin.removeListener('data', this.onData);
    this.disableModes();
    this.stdin.pause();
    if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
      this.stdin.setRawMode(false);
    }
  }

  /**
   * Sequential parser chain: mouse → paste → keys/coalescer. Each stage
   * (rawPassThrough) hands its UNCONSUMED bytes to the next, so a mouse
   * sequence can never leak into the key parser as phantom Escape+chars —
   * feeding all stages the full chunk in parallel did exactly that.
   */
  feed(text) {
    const rest1 = [];
    for (const ev of this.mouse.feed(text)) {
      if (ev.type === 'bytes') rest1.push(ev.text);
      else this.route(ev);
    }
    const rest2 = [];
    for (const ev of this.paste.feed(rest1.join(''))) {
      if (ev.type === 'bytes') rest2.push(ev.text);
      else this.route(ev);
    }
    for (const ev of this.coalescer.feed(rest2.join(''))) this.route(ev);
  }

  /**
   * Route one event; returns true when a handler CONSUMED it, false when it
   * was dropped (overlay declined it, or nothing handled it). Purely
   * informational — callers may ignore it.
   */
  route(ev) {
    if (this.stopped) return false;

    // Ctrl+C is ours in raw mode (E4): arrive as byte 0x03 → key 'ctrl-c'.
    // Deliberately FIRST — quit is never consumable by an overlay or screen
    // (task 0.8 acceptance: "Ctrl+C always quits").
    if (ev.type === 'key' && ev.name === 'ctrl-c') {
      this.stop();
      this.onQuit('ctrl-c');
      return true;
    }

    // Overlays (modal dialogs) outrank the screen: while one is open the top
    // overlay gets every key, and anything it declines is DROPPED — never
    // forwarded to the screen underneath (a modal must not leak `j`/`k` into
    // the learner's editor).
    if (hasOverlays()) {
      // Declined events are dropped here — never forwarded to the screen.
      return routeToOverlays(ev);
    }

    // Mode wins: focused screen first, then global (palette/quit/help).
    const route = this.getRoute ? this.getRoute() : null;
    if (route) {
      if (ev.type === 'key' && typeof route.onKey === 'function' && route.onKey(ev)) return true;
      if (ev.type === 'mouse' && typeof route.onMouse === 'function' && route.onMouse(ev)) return true;
      if (ev.type === 'paste' && typeof route.onPaste === 'function' && route.onPaste(ev)) return true;
    }
    if (this.globalHandler && this.globalHandler(ev)) return true;
    // Unconsumed events are dropped by design (spec: registry logs unknowns).
    return false;
  }

  enableModes() {
    if (this.stdout.isTTY) {
      this.stdout.write(mouseSeq.on);
      this.stdout.write(pasteSeq.on);
    }
  }

  disableModes() {
    if (this.stdout.isTTY) {
      this.stdout.write(mouseSeq.off);
      this.stdout.write(pasteSeq.off);
    }
  }
}
