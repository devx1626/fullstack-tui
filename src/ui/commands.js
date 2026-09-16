/**
 * Command registry skeleton (overhaul task 0.7a, Appendix C wiring table).
 *
 * Every user-invokable action gets a stable id here so that:
 *   - `.data/keymap.json` overrides and the Phase 1 palette have data day one,
 *   - footer/help keys can be linted against real bindings (E2/S3),
 *   - the Phase 1 dispatcher resolves keys without re-plumbing handlers.
 *
 * `screen`/`when` mirror today's availability, which is exactly what the
 * keymap lint enforces. `run` is a plain descriptor of what the command does
 * in the classic UI (a method name, or an expression such as
 * `switchEditorTab(1)`); commands with `keys.default: []` are palette-only
 * until a key is bound — nothing dispatches `run` itself.
 */

// ---------------------------------------------------------------------------
// Binding notation → normalized key tokens (subset needed for lint + palette)
// ---------------------------------------------------------------------------

/** Parse "<C-s>", "j", "G", "<Esc>", "<CR>", "<C-A-up>" → { ctrl, alt, shift, key } */
export function parseBinding(binding) {
  const norm = {
    escape: 'esc', enter: 'cr', tab: 'tab', backspace: 'bs', delete: 'del',
    pageup: 'pageup', pagedown: 'pagedown', home: 'home', end: 'end',
  };
  // Bare single character ("s", "G", "4") — case-sensitive for letters.
  if (/^[A-Za-z0-9]$/.test(binding)) return { ctrl: false, alt: false, shift: false, key: binding };
  const m = /^<([ACAS]-)*([A-Za-z0-9]+|space|CR|Esc|Tab|BS|Del|up|down|left|right|home|end|pageup|pagedown|enter|escape|tab|backspace|delete)>$/.exec(binding);
  if (!m) return null;
  const mods = m[1] || '';
  const named = m[2].toLowerCase();
  const key = norm[named] || (named.length === 1 ? named : named);
  return {
    ctrl: mods.includes('C-'),
    alt: mods.includes('A-'),
    shift: mods.includes('S-'),
    key,
  };
}

/** Canonical display string for hints and docs: "j", "<C-s>", "<Esc>". */
export function displayBinding(binding) {
  const p = parseBinding(binding);
  if (!p) return binding;
  const pre = (p.ctrl ? 'C-' : '') + (p.alt ? 'A-' : '') + (p.shift ? 'S-' : '');
  return pre ? `<${pre}${p.key}>` : p.key;
}

// ---------------------------------------------------------------------------
// The registry — data mirror of Appendix C
// ---------------------------------------------------------------------------

/**
 * `screen` values mirror App.onKey/`footerHints()` routing today; `null` means
 * globally available. `run` names the App method (or 'quit'/'palette') — the
 * Phase 1 dispatcher replaces this with real functions.
 */
export const COMMANDS = [
  // Global
  { id: 'app.quit', title: 'Quit', screen: null, keys: { default: ['<C-c>', 'q'] }, run: 'quit' },
  { id: 'app.back', title: 'Go back', screen: null, keys: { default: ['<Esc>'] }, run: 'pop' },
  { id: 'app.help', title: 'Help manual', screen: null, keys: { default: ['?'] }, run: "push('help')" },
  { id: 'app.repaint', title: 'Repaint screen', screen: null, keys: { default: ['<C-l>'] }, run: 'repaint' },
  { id: 'app.palette', title: 'Command palette', screen: null, keys: { default: ['<C-p>'] }, run: 'palette' },

  // Navigation & home
  { id: 'nav.up', title: 'Move up', screen: null, keys: { default: ['<up>', 'k'] }, run: 'nav.up' },
  { id: 'nav.down', title: 'Move down', screen: null, keys: { default: ['<down>', 'j'] }, run: 'nav.down' },
  { id: 'nav.pageUp', title: 'Page up', screen: null, keys: { default: ['<pageup>'] }, run: 'nav.pageup' },
  { id: 'nav.pageDown', title: 'Page down', screen: null, keys: { default: ['<pagedown>'] }, run: 'nav.pagedown' },
  { id: 'nav.first', title: 'Jump to first item', screen: null, keys: { default: ['g'] }, run: 'nav.first' },
  { id: 'nav.last', title: 'Jump to last item', screen: null, keys: { default: ['G'] }, run: 'nav.last' },
  // Enter/arrows on specific screens are owned by the screen's open/scroll
  // commands (home.openModule, lesson.openChallenge, …) — no global duplicate.
  { id: 'home.openModule', title: 'Open module', screen: 'home', keys: { default: ['<CR>'] }, run: 'openModule' },
  { id: 'home.openProjects', title: 'Projects', screen: 'home', keys: { default: ['p'] }, run: "push('projects')" },
  { id: 'home.openSettings', title: 'Settings', screen: 'home', keys: { default: ['s'] }, run: "push('settings')" },
  { id: 'home.dismissBanner', title: 'Dismiss the streak banner', screen: 'home', keys: { default: ['x'] }, run: 'dismissBanner' },
  { id: 'nav.resume', title: 'Resume where you left off', screen: 'home', keys: { default: ['r'] }, run: 'resume' },

  // Module & lesson
  { id: 'module.openLesson', title: 'Open lesson', screen: 'module', keys: { default: ['<CR>'] }, run: 'openLesson' },
  // Lesson scrolling IS nav.up/nav.down on that screen — no separate ids.
  { id: 'lesson.focusNext', title: 'Focus next challenge', screen: 'lesson', keys: { default: ['<Tab>'] }, run: 'lesson.focusNext' },
  { id: 'lesson.focusPrev', title: 'Focus previous challenge', screen: 'lesson', keys: { default: ['<S-Tab>'] }, run: 'lesson.focusPrev' },
  { id: 'lesson.openChallenge', title: 'Open challenge', screen: 'lesson', keys: { default: ['<CR>'] }, run: 'openChallenge' },
  { id: 'lesson.markRead', title: 'Mark lesson read', screen: 'lesson', keys: { default: ['m'] }, run: 'lesson.markRead' },
  { id: 'lesson.next', title: 'Next lesson', screen: 'lesson', keys: { default: ['n'] }, run: 'lesson.next' },
  { id: 'nav.nextUp', title: 'Go to next unpassed challenge', screen: null, keys: { default: [] }, run: 'nextUp' },

  // Challenge & editor
  { id: 'challenge.check', title: 'Check my code', screen: 'challenge', keys: { default: ['<C-s>'] }, run: 'checkChallenge' },
  { id: 'challenge.reset', title: 'Reset to starter code', screen: 'challenge', keys: { default: ['<C-r>'] }, run: 'resetChallenge' },
  { id: 'challenge.hint', title: 'Reveal a hint', screen: 'challenge', keys: { default: ['<C-h>'] }, run: 'revealHint' },
  { id: 'challenge.solution', title: 'Show / hide solution', screen: 'challenge', keys: { default: ['<C-g>'] }, run: 'toggleSolution' },
  { id: 'challenge.copySolution', title: 'Copy solution into editor', screen: 'challenge', keys: { default: ['y'] }, run: 'copySolution' },
  { id: 'challenge.preview', title: 'Open preview in browser', screen: 'challenge', keys: { default: ['<C-p>'] }, run: 'openPreview' },
  { id: 'challenge.browser', title: 'Open built-in browser', screen: 'challenge', keys: { default: ['<C-b>'] }, run: 'openBrowser' },
  { id: 'challenge.save', title: 'Save to workspace', screen: 'challenge', keys: { default: ['<C-o>'] }, run: 'saveToWorkspace' },
  { id: 'challenge.externalEditor', title: 'Edit in $EDITOR', screen: 'challenge', keys: { default: ['<C-e>'] }, run: 'openInEditor' },
  { id: 'challenge.logs', title: 'Toggle console logs', screen: 'challenge', keys: { default: ['<C-t>'] }, run: 'toggleLogs' },
  { id: 'editor.tabNext', title: 'Next file tab', screen: 'challenge', keys: { default: ['<C-w>'] }, run: 'switchEditorTab(1)' },
  { id: 'editor.tabPrev', title: 'Previous file tab', screen: 'challenge', keys: { default: ['<C-q>'] }, run: 'switchEditorTab(-1)' },
  { id: 'editor.completionTrigger', title: 'Show completions', screen: 'challenge', keys: { default: ['<C-space>'] }, run: 'refreshCompletion' },
  { id: 'history.restore', title: 'Restore a checkpoint', screen: 'challenge', keys: { default: [] }, run: 'history.restore' },
  { id: 'editor.format', title: 'Format code (Prettier-style; CSS formats the enclosing rule)', screen: 'challenge', keys: { default: ['<C-f>'] }, run: 'formatEditor' },
  { id: 'editor.jumpToLine', title: 'Jump to the failing check\'s line (Q4)', screen: 'challenge', keys: { default: ['<C-j>'] }, run: 'jumpToFailedCheck' },

  // Browser
  { id: 'browser.close', title: 'Back to editor', screen: 'browser', keys: { default: ['<C-b>'] }, run: 'pop' }, // Esc is app.back
  { id: 'browser.tabNext', title: 'Next browser pane', screen: 'browser', keys: { default: ['<Tab>'] }, run: 'browser.tabNext' },
  { id: 'browser.tabPrev', title: 'Previous browser pane', screen: 'browser', keys: { default: ['<S-Tab>'] }, run: 'browser.tabPrev' },
  { id: 'browser.jumpTab1', title: 'Render pane', screen: 'browser', keys: { default: ['1'] }, run: 'browser.tab(0)' },
  { id: 'browser.jumpTab2', title: 'Elements pane', screen: 'browser', keys: { default: ['2'] }, run: 'browser.tab(1)' },
  { id: 'browser.jumpTab3', title: 'Styles pane', screen: 'browser', keys: { default: ['3'] }, run: 'browser.tab(2)' },
  { id: 'browser.jumpTab4', title: 'Console pane', screen: 'browser', keys: { default: ['4'] }, run: 'browser.tab(3)' },
  { id: 'browser.jumpTab5', title: 'Issues pane', screen: 'browser', keys: { default: ['5'] }, run: 'browser.tab(4)' },
  { id: 'browser.consoleRun', title: 'Evaluate expression', screen: 'browser', keys: { default: ['<CR>'] }, run: 'runConsole' },
];

// ---------------------------------------------------------------------------
// Keymap merge + conflict lint + resolution
// ---------------------------------------------------------------------------

/**
 * Merge user `.data/keymap.json` over defaults; unknown ids are reported.
 *
 * Returns both views of the same data:
 *   `keymap`   id → PRIMARY binding (display, footer hints, conflict lint)
 *   `bindings` id → every binding that triggers the command. A command's
 *              default list holds alternates (`<down>` AND `j`, `<C-c>` AND
 *              `q`); resolution must honour all of them, otherwise half the
 *              documented keys are dead — `j`/`k`/`q` were exactly that.
 * A user override replaces the whole list for that command.
 */
export function mergeKeymap(userMap = {}) {
  const overrides = {};
  const unknown = [];
  for (const [id, binding] of Object.entries(userMap)) {
    const cmd = COMMANDS.find((c) => c.id === id);
    if (!cmd || !parseBinding(binding)) {
      unknown.push(id);
      continue;
    }
    overrides[id] = binding;
  }
  const keymap = new Map();
  const bindings = new Map();
  for (const cmd of COMMANDS) {
    const list = overrides[cmd.id] ? [overrides[cmd.id]] : cmd.keys.default.slice();
    keymap.set(cmd.id, list[0] || null);
    bindings.set(cmd.id, list);
  }
  return { keymap, bindings, unknown };
}

/**
 * id → binding list, accepting either a merged keymap object or a plain
 * Map/object of id → binding (the shape callers passed before `bindings`
 * existed). Keeps every existing call site working.
 */
function bindingsOf(keymapLike) {
  if (keymapLike && keymapLike.bindings instanceof Map) return keymapLike.bindings;
  const entries = keymapLike instanceof Map
    ? keymapLike.entries()
    : Object.entries(keymapLike instanceof Object ? keymapLike : {});
  const out = new Map();
  for (const [id, b] of entries) {
    if (b == null) continue;
    out.set(id, Array.isArray(b) ? b : [b]);
  }
  return out;
}

/**
 * Find bindings claimed by two commands with overlapping availability.
 * Overlap = same screen (or either is global) — the same rule the dispatcher
 * will use in Phase 1.
 */
export function findConflicts(keymapLike = mergeKeymap()) {
  const bindings = bindingsOf(keymapLike);
  const byBinding = new Map();
  const conflicts = [];
  for (const cmd of COMMANDS) {
    for (const b of bindings.get(cmd.id) || []) {
      const p = parseBinding(b);
      if (!p) continue;
      const token = `${p.ctrl ? 'C+' : ''}${p.alt ? 'A+' : ''}${p.shift ? 'S+' : ''}${p.key}`;
      if (!byBinding.has(token)) byBinding.set(token, []);
      byBinding.get(token).push(cmd);
    }
  }
  for (const [token, cmds] of byBinding) {
    if (cmds.length < 2) continue;
    for (let i = 0; i < cmds.length; i += 1) {
      for (let j = i + 1; j < cmds.length; j += 1) {
        const a = cmds[i];
        const b = cmds[j];
        const overlaps = a.screen === null || b.screen === null || a.screen === b.screen;
        if (overlaps) conflicts.push({ binding: token, commands: [a.id, b.id] });
      }
    }
  }
  return conflicts;
}

/**
 * Known intentional collisions (spec Appendix B.8 conflict register).
 * Keys are `<mods+key>:<id1>|<id2>` with ids in alphabetical order.
 */
const ALLOWED_CONFLICTS = new Set([
  // <C-p>: palette (global) vs preview (challenge) — "mode wins" (overhaul §10.3).
  'C+p:app.palette|challenge.preview',
  // <C-b>: browser open (challenge) vs close (browser) — different screens.
  'C+b:browser.close|challenge.browser',
]);

function conflictKey(binding, ids) {
  return `${binding}:${ids.slice().sort().join('|')}`;
}

/**
 * Lint entry point for tools/check.js: throws nothing, returns problems.
 * Accepts a pre-merged keymap (src/ui/keymap.js passes the user-merged one);
 * defaults-only lint checks the repo's shipped bindings.
 */
export function lintKeymap(keymapArg = null) {
  const merged = keymapArg
    ? (keymapArg.bindings instanceof Map ? keymapArg : { keymap: keymapArg, bindings: bindingsOf(keymapArg), unknown: [] })
    : mergeKeymap();
  const problems = [];
  for (const id of merged.unknown) problems.push(`keymap: unknown command id "${id}"`);
  for (const c of findConflicts(merged)) {
    const key = conflictKey(c.binding, c.commands);
    const sameScreen = c.commands.every((id) => COMMANDS.find((x) => x.id === id)?.screen !== null)
      && new Set(c.commands.map((id) => COMMANDS.find((x) => x.id === id)?.screen)).size === 1;
    const allowed = sameScreen
      ? ALLOWED_SAME_SCREEN.has(key)
      : ALLOWED_CONFLICTS.has(key);
    if (!allowed) problems.push(`keymap conflict: <${c.binding}> claimed by ${c.commands.join(' + ')}`);
  }
  return problems;
}

/** Commands available on a screen — the palette's data source in Phase 1. */
export function commandsForScreen(screen) {
  return COMMANDS.filter((c) => c.screen === null || c.screen === screen);
}

/**
 * Resolve one App key event (term.js parseChunk shape: `{ name, char? }`,
 * ctrl keys named `ctrl-x`) to a command id on `screen`, or null.
 */
export function resolveKey(keyEvent, screen, keymapLike = mergeKeymap()) {
  const isChar = keyEvent.name === 'char';
  const ctrlMod = keyEvent.name.startsWith('ctrl-');
  // Letter case matters (vim g/G): compare chars exactly as typed.
  const rawName = isChar ? keyEvent.char : keyEvent.name.replace(/^ctrl-/, '');
  const NAME_NORM = { escape: 'esc', enter: 'cr', backspace: 'bs', delete: 'del' };
  const key = isChar ? rawName : (NAME_NORM[rawName] || rawName);
  const bindings = bindingsOf(keymapLike);

  for (const cmd of COMMANDS) {
    if (cmd.screen !== null && cmd.screen !== screen) continue;
    for (const b of bindings.get(cmd.id) || []) {
      const p = parseBinding(b);
      if (!p || p.alt || p.shift) continue;
      if (p.ctrl !== ctrlMod) continue;
      if (p.key !== key) continue;
      return cmd.id;
    }
  }
  return null;
}
