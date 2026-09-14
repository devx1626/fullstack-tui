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

  feed(text) {
    for (const ev of this.mouse.feed(text)) this.route(ev);
    for (const ev of this.paste.feed(text)) this.route(ev);
    // Remaining bytes go through the coalescer (keys, split-sequence repair).
    for (const ev of this.coalescer.feed(text)) this.route(ev);
  }

  route(ev) {
    if (this.stopped) return;

    // Ctrl+C is ours in raw mode (E4): arrive as byte 0x03 → key 'ctrl-c'.
    if (ev.type === 'key' && ev.name === 'ctrl-c') {
      this.stop();
      this.onQuit('ctrl-c');
      return;
    }

    // Mode wins: focused screen first, then global (palette/quit/help).
    const route = this.getRoute ? this.getRoute() : null;
    if (route) {
      if (ev.type === 'key' && typeof route.onKey === 'function' && route.onKey(ev)) return;
      if (ev.type === 'mouse' && typeof route.onMouse === 'function' && route.onMouse(ev)) return;
      if (ev.type === 'paste' && typeof route.onPaste === 'function' && route.onPaste(ev)) return;
    }
    if (this.globalHandler && this.globalHandler(ev)) return;
    // Unconsumed events are dropped by design (spec: registry logs unknowns).
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
