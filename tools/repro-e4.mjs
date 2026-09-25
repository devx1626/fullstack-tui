/**
 * E4 harness (invoked by tools/repro-e4.sh): spawn the app under script(1),
 * wait until it has actually booted, THEN inject the raw 0x03 byte — the
 * contract is "clean exit from the running app", and injecting before the
 * app's handler exists only tests the kernel's default SIGINT (exit 130, no
 * restore) which is not the E4 bug. The original fixed 3s delay predated the
 * double-bundle boot of the pre-flip entry (~7s+ and variable), which made
 * the repro kill node mid-import every time.
 *
 * Readiness comes from the pty relay stream itself: either the AltScreen
 * engage (?1049h) or the first painted frame. Either proves main() ran past
 * the synchronous tail that installs the dispatcher and the SIGINT handler,
 * so the byte always lands on the app's own handling.
 *
 * script(1)'s typescript file is captured but NOT load-bearing: under some
 * spawn shapes (node parent, piped stdin) util-linux script leaves it empty
 * even while the relayed stdout streams fine — so the verdict reads the
 * relayed stdout, with the typescript as a fallback source.
 *
 * Verdict (exit code) — same table as the original script:
 *   0 = app exited within 2s of the ^C byte + alt-screen restore  (E4 CLEARED)
 *   1 = app still alive 2s after ^C, or restore missing           (E4 CONFIRMED/PARTIAL)
 *   2 = harness failure (script(1) missing, never ready, timeout)
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';

const LOG = `/tmp/e4-regression.${process.pid}.txt`;
const READY_RE = /\x1b\[\?1049h/;
const READY_FALLBACK = (text) => text.length > 200; // first painted frame
const RESTORE_RE = /\x1b\[\?1049l/;
const READY_TIMEOUT_MS = 300_000; // pre-flip boot double-loads the bundle; be patient
const SETTLE_MS = 1_500; // let the first frames paint before the byte
const ALIVE_CHECK_MS = 2_000; // the contract: gone within 2s of the byte

const die = (msg) => {
  console.error(`HARNESS: ${msg}`);
  try { rmSync(LOG, { force: true }); } catch { /* best effort */ }
  process.exit(2);
};

if (os.platform() === 'win32') die('script(1) unavailable on Windows');

const app = spawn('script', ['-q', '-c', 'env FULLSTACK_UI=next node bin/fullstack.js', LOG], {
  stdio: ['pipe', 'pipe', 'ignore'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Relay capture: script forwards the app's pty output to its stdout.
let relay = '';
app.stdout.setEncoding('utf8');
app.stdout.on('data', (chunk) => { relay += chunk; });
const logText = () => { try { return readFileSync(LOG, 'utf8'); } catch { return ''; } };
const seen = () => relay + logText(); // typescript is a fallback source only

let nodePids = [];
const lingeringNode = () => {
  try {
    const out = execFileSync('ps', ['-eo', 'pid,comm,args'], { encoding: 'utf8' });
    nodePids = out
      .split('\n')
      .filter((l) => !l.includes('repro-e4'))
      .filter((l) => /(?:^|\s)node(?:\s|$)/.test(l) && l.includes('fullstack'))
      .map((l) => Number(l.trim().split(/\s+/)[0]))
      .filter((pid) => pid && pid !== process.pid);
  } catch { nodePids = []; }
  return nodePids.length;
};

// 1. Wait for readiness on the relay stream — not a guessed delay.
let ready = false;
const t0 = Date.now();
while (Date.now() - t0 < READY_TIMEOUT_MS) {
  if (READY_RE.test(seen()) || READY_FALLBACK(relay)) { ready = true; break; }
  await sleep(100);
}
if (!ready) {
  try { app.kill('SIGKILL'); } catch { /* already gone */ }
  die(`app never booted (no output within ${READY_TIMEOUT_MS / 1000}s)`);
}

// 2. Inject the raw ^C byte, stdin stays open (the E4 scenario).
await sleep(SETTLE_MS);
app.stdin.write('\x03');

// 3. Mid-flight process check 2s after the byte, while stdin is STILL open.
await sleep(ALIVE_CHECK_MS);
const alive = lingeringNode();

// 4. Restore check, then let the pipeline drain and reap.
const restored = RESTORE_RE.test(seen());
app.stdin.end();
await sleep(500);
try { app.kill('SIGTERM'); } catch { /* already exited */ }
await new Promise((r) => { app.on('exit', r); setTimeout(r, 2000); });
rmSync(LOG, { force: true });

if (alive > 0) {
  console.log(`E4 CONFIRMED: app still alive 2s after ^C (pids ${nodePids.join(', ')})`);
  process.exit(1);
}
if (!restored) {
  console.log('E4 PARTIAL: exited but alt-screen restore missing (terminal left scrambled)');
  process.exit(1);
}
console.log('E4 CLEARED: clean exit on ^C with alt-screen restore');
process.exit(0);
