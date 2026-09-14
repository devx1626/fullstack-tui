/**
 * Screenshot preview (M1, docs/multimedia.md §3.1).
 *
 * Renders the learner's HTML/CSS/JS to a PNG via headless Chromium and emits
 * it as an inline terminal image (kitty or iTerm2 protocol). Playwright is a
 * HARD-OPTIONAL dependency: never imported at module load, never shipped in
 * the bundle graph — dynamic import only, with a friendly fallback when
 * missing (`FULLSTACK_SCREENSHOT=playwright` opts the feature in).
 *
 * The classic UI stays untouched (spec decision); the next-UI browser screen
 * consumes these functions in Phase 1.
 */

/** The playwright module loader — injectable for tests. */
let loadPlaywright = () => import('playwright');

/** Cached browser/context so repeated screenshots don't relaunch Chromium. */
let cachedBrowser = null;
let cachedContext = null;

export function setPlaywrightLoader(fn) {
  loadPlaywright = fn;
  cachedBrowser = null;
  cachedContext = null;
}

/**
 * True when Playwright is importable. Result is memoized; pass `force` to
 * re-probe (e.g. after the user installs it mid-session).
 */
export async function isPlaywrightAvailable({ force = false } = {}) {
  if (force) delete isPlaywrightAvailable._memo;
  if (isPlaywrightAvailable._memo === undefined) {
    try {
      await loadPlaywright();
      isPlaywrightAvailable._memo = true;
    } catch {
      isPlaywrightAvailable._memo = false;
    }
  }
  return isPlaywrightAvailable._memo;
}

/** Guidance shown when the feature is requested but Playwright is missing. */
export function notAvailableMessage() {
  return [
    'Screenshots need Playwright (headless Chromium), which is not installed.',
    'Enable it with:  npm i -D playwright && npx playwright install chromium',
    'Then restart with FULLSTACK_SCREENSHOT=playwright.',
  ];
}

async function getContext() {
  if (cachedContext) return cachedContext;
  const pw = await loadPlaywright();
  cachedBrowser = await pw.chromium.launch({ args: ['--no-sandbox'] });
  cachedContext = await cachedBrowser.newContext({ viewport: { width: 480, height: 360 }, deviceScaleFactor: 2 });
  return cachedContext;
}

/** Close the cached browser (call on app exit; safe to call repeatedly). */
export async function closeScreenshotBrowser() {
  try { await cachedContext?.close(); } catch { /* already gone */ }
  try { await cachedBrowser?.close(); } catch { /* already gone */ }
  cachedContext = null;
  cachedBrowser = null;
}

/**
 * Render preview parts to a PNG (base64).
 * @param {{ html: string, css?: string, js?: string, title?: string }} parts
 * @returns {Promise<string>} base64 PNG
 */
export async function renderPreviewPng(parts, { timeoutMs = 4000 } = {}) {
  const context = await getContext();
  const page = await context.newPage();
  try {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:#fff}
      ${parts.css || ''}
      </style></head><body>${parts.html || ''}
      <script>${parts.js || ''}<\/script></body></html>`;
    await page.setContent(doc, { waitUntil: 'load', timeout: timeoutMs });
    const buf = await page.screenshot({ type: 'png', timeout: timeoutMs });
    return buf.toString('base64');
  } finally {
    await page.close();
  }
}

/**
 * One-shot: parts → inline-image escape string for the terminal's protocol.
 * Returns null when the terminal has no graphics or Playwright is missing
 * (caller shows notAvailableMessage() / falls back to the ASCII preview).
 */
export async function renderInlineImage(parts, graphics, opts = {}) {
  if (!graphics || (!graphics.kitty && !graphics.iterm2 && !graphics.sixel)) return null;
  if (!(await isPlaywrightAvailable())) return null;
  const b64 = await renderPreviewPng(parts, opts);
  const { kittyImage } = await import('./multimedia.js');
  if (graphics.kitty) return kittyImage(b64);
  const { iterm2Image } = await import('./multimedia.js');
  return iterm2Image(b64);
}
