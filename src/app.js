/**
 * The application shell.
 *
 * Owns the screen stack, interprets keys, keeps the study timer honest and
 * asks the views for rows to draw. Views are pure: they read state off the app
 * and return an array of segment-rows exactly `h` tall.
 */

import { Screen, seg, fit } from './tui/canvas.js';
import { header, footer } from './tui/widgets.js';
import { seq } from './tui/ansi.js';
import { startTerminal, stopTerminal, dimensions, withTerminalReleased } from './tui/term.js';
import { curriculum, nextLesson, totals } from './content/index.js';
import { Store } from './core/store.js';
import { evaluate, review } from './core/grade.js';
import { saveArtifact, writePreview, openExternally, artifactPath } from './core/workspace.js';
import { completionsFor, smartInsert, pairBackspace, normaliseLang } from './core/complete.js';
import { expandAt } from './core/emmet.js';
import { formatCodeAt, formatCode } from './core/format.js';
import { emptyEditor, emptyEditors, editorText, editorTexts, insertChar, insertNewline, backspace, del, move, moveToLineEnd, moveToLineStart, setText, offsetOf, rowColOf, setTextAt } from './views/editor.js';
import { buildWrapDoc, moveVertical } from './core/softwrap.js';
import { firstUnpassed } from './core/targets.js';
import { checkNotes } from './core/checkNotes.js';
import { buildRecap } from './core/recap.js';
import { matchBracket } from './core/brackets.js';
import { snapshotLabel } from './core/history.js';
import { commandsForScreen } from './ui/commands.js';
import renderHome from './views/home.js';
import renderModule from './views/module.js';
import renderLesson from './views/lesson.js';
import renderChallenge from './views/challenge.js';
import renderProjects from './views/projects.js';
import renderStats from './views/stats.js';
import renderHelp from './views/help.js';
import renderResources from './views/resources.js';
import renderWorkspace from './views/workspace.js';
import renderBrowser, { BROWSER_TABS } from './views/browser.js';
import renderPalette from './views/palette.js';
import renderSettings, { settingsRows } from './views/settings.js';
import { Settings } from './ui/settings.js';
import { togglePreference } from './ui/preferences.js';
import { notify, BEL } from './ui/multimedia.js';
import { runJs, stringify } from './core/runner.js';
import { elementTree, previewParts as buildPreviewParts, synthesisParts } from './core/browser.js';

const VIEWS = {
  home: renderHome,
  module: renderModule,
  lesson: renderLesson,
  challenge: renderChallenge,
  projects: renderProjects,
  stats: renderStats,
  help: renderHelp,
  resources: renderResources,
  workspace: renderWorkspace,
  browser: renderBrowser,
  palette: renderPalette,
  settings: renderSettings,
};

const isChar = (key, ch) => key.name === 'char' && key.char === ch;

/** Palette-only registry commands the classic app implements (Q2, Q9, Q12). */
const PALETTE_ACTIONS = ['nav.nextUp', 'history.restore', 'editor.bracketMatch'];

/** How many element rows the Elements pane will show for the current code. */
const elementCount = (app) => {
  try {
    let parts;
    if (app.isMultiFile()) parts = synthesisParts(editorTexts(app.state.editors));
    else {
      const code = editorText(app.getActiveEditor());
      parts = buildPreviewParts(app.state.challenge.challenge, code);
    }
    return elementTree(parts.html).length;
  } catch {
    return 0;
  }
};

/** Console values are shown the way a REPL would show them. */
function formatConsoleValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return stringify(value);
  } catch {
    return String(value);
  }
}
const isDown = (key) => key.name === 'down' || isChar(key, 'j');
const isUp = (key) => key.name === 'up' || isChar(key, 'k');
const isNext = (key) => key.name === 'pagedown' || key.name === 'tab' || isChar(key, 'l');
const isPrev = (key) => key.name === 'pageup' || key.name === 'shift-tab' || isChar(key, 'h');

export class App {
  constructor({ theme, store = new Store(), settings = null } = {}) {
    this.theme = theme;
    this.store = store;
    this.settings = settings || new Settings();
    this.curriculum = curriculum;
    this.screen = new Screen(process.stdout);
    // M0 feedback gate: notifications/bell only on a real TTY (never in the
    // check tool, tests, or piped output). FULLSTACK_HEADLESS forces it off.
    this.isTTY = !!process.stdout.isTTY && !process.env.FULLSTACK_HEADLESS;
    const { w, h } = dimensions();
    this.w = w;
    this.h = h;

    this.stack = [{ name: 'home', params: {} }];
    this.state = {
      cursor: 0,
      moduleIndex: 0,
      lessonIndex: 0,
      challengeIndex: 0,
      lessonScroll: 0,
      lessonFocus: -1,
      projectIndex: 0,
      projectCheckCursor: 0,
      focus: 'menu',
      editor: null,
      challenge: null,
      results: null,
      hintsShown: 0,
      showSolution: false,
      showDiff: false,
      solutionCursor: 0,
      pane: 'brief',
      briefScroll: 0,
      editorTab: 0,
      notice: null,
      showLogs: false,
      editorCursorPos: null,
      completion: null,
      browser: null,
      paletteQuery: '',
      paletteMode: 'jump', // 'jump' (curriculum + actions) | 'history' (Q9 restore)
      paletteSnapshots: [],
      wrapDoc: null, // soft-wrap screen-line model (built at render; Q11)
      paletteScroll: 0,
      formatHint: null, // Q10 suggest-only format note for the last run
    };
    this.quitRequested = false;

    // Q13 session accounting — the recap reads these, nothing else does.
    this.sessionSeconds = 0;
    this.sessionPassed = new Set();
    this.sessionFailures = 0;
    this.recapPrinted = false;

    this.store.touch();
    this.store.save();
    this.sessionStart = Date.now();
    this.timer = setInterval(() => this.flushSession(), 30000);
    // A headless App (tests, the self-check) must be able to let the process
    // exit; only the interactive terminal keeps it alive.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  // -- lifecycle ------------------------------------------------------------

  start() {
    startTerminal({
      onKey: (key) => this.onKey(key),
      onResize: ({ w, h }) => this.resize(w, h),
    });
    this.render();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.screen.resize(w, h);
    this.render();
  }

  /**
   * Bank the time since the last flush. The same elapsed value feeds the
   * lifetime study timer and the Q13 session recap, so the two can never
   * disagree.
   */
  flushSession() {
    const elapsed = Math.round((Date.now() - this.sessionStart) / 1000);
    if (elapsed < 5) return;
    this.sessionStart = Date.now();
    this.sessionSeconds += elapsed;
    this.store.addTime(elapsed);
    this.store.save();
  }

  /**
   * Q13 session recap. Pure data in, plain lines out, so tests and the
   * self-check can read it without quitting anything.
   */
  recapLines() {
    const stats = this.store.stats(this.curriculum);
    const target = this.resumeTarget();
    const nextUp = target ? `${target.lesson.id} · ${target.challenge.id}` : null;
    return buildRecap({
      seconds: this.sessionSeconds,
      passed: [...this.sessionPassed],
      failures: this.sessionFailures,
      totalPassed: stats.totals.challengesPassed,
      totalChallenges: stats.totals.challenges,
      streak: stats.streak || 0,
      todayCount: this.store.passedToday(),
      dailyGoal: this.settings?.data?.goal?.daily || 0,
      nextUp,
    });
  }

  /**
   * Print the recap after the alt screen is gone: on the normal screen these
   * lines scroll away like ordinary output, which is the whole point of
   * putting them on quit rather than in a frame nobody sees.
   */
  printRecap(out = process.stdout) {
    if (this.recapPrinted || !this.isTTY) return;
    this.recapPrinted = true;
    // `seq.dim` is the bare SGR prefix, so it is wrapped rather than called.
    const dim = (s) => `${seq.dim}${s}${seq.reset}`;
    try {
      out.write(`\n${dim('Session recap')}\n${this.recapLines().map(dim).join('\n')}\n\n`);
    } catch {
      /* a closed stdout must never break quitting */
    }
  }

  quit() {
    this.flushSession();
    this.store.save();
    clearInterval(this.timer);
    stopTerminal();
    this.quitRequested = true;
    this.printRecap();
    process.exit(0);
  }

  note(text, kind = 'muted', bold = false) {
    this.state.notice = { text, kind, bold };
  }

  /**
   * Q12 visible bell: some keys are genuinely ignored on a screen, and a BEL
   * is both inaudible with sound off and invisible on most terminals while
   * the alt screen is up. So the rejection also shows up as a notice — the
   * same reason `x`/`g` give feedback when they do not apply.
   */
  visibleBell(text) {
    this.note(text, 'warn');
    this.render();
  }

  /**
   * Space in the settings screen: act on the focused row's key. Unknown rows
   * (Theme, Workspace, Editor) are informational, so they say how to change
   * instead of doing nothing silently.
   */
  toggleSetting(key) {
    // The rows AND their toggles live in src/ui/preferences.js so the next-UI
    // settings screen cannot drift from this one; the classic view only
    // supplies its Settings instance and shows the returned message.
    const { message, kind } = togglePreference(this.settings, key);
    this.note(message, kind);
    this.render();
  }

  // -- routing --------------------------------------------------------------

  get current() {
    return this.stack[this.stack.length - 1];
  }

  push(name, params = {}) {
    this.stack.push({ name, params });
    this.state.cursor = 0;
    this.state.focus = 'menu';
    this.state.notice = null;
    this.render();
  }

  pop() {
    if (this.stack.length > 1) this.stack.pop();
    this.state.notice = null;
    this.render();
  }

  goHome() {
    this.stack = [{ name: 'home', params: {} }];
    this.state.cursor = 0;
    this.render();
  }

  // -- helpers used by views ------------------------------------------------

  get stats() {
    return this.store.stats(this.curriculum);
  }

  get totals() {
    return totals();
  }

  openModule(index) {
    this.state.moduleIndex = index;
    this.push('module', { moduleId: this.curriculum[index].id });
  }

  openLesson(moduleIndex, lessonIndex, challengeIndex = 0) {
    this.state.moduleIndex = moduleIndex;
    this.state.lessonIndex = lessonIndex;
    this.state.challengeIndex = challengeIndex;
    const mod = this.curriculum[moduleIndex];
    const lesson = mod.lessons[lessonIndex];
    this.state.lessonScroll = this.store.getLessonScroll(lesson.id);
    this.state.lessonFocus = -1;
    this.push('lesson', { lessonId: lesson.id });
  }

  openChallenge(moduleIndex, lessonIndex, challengeIndex) {
    const mod = this.curriculum[moduleIndex];
    const lesson = mod.lessons[lessonIndex];
    const challenge = lesson.challenges[challengeIndex];
    if (!challenge) return;
    const id = `${lesson.id}.${challenge.id}`;
    const rec = this.store.challengeRecord(id);
    this.state.moduleIndex = moduleIndex;
    this.state.lessonIndex = lessonIndex;
    this.state.challengeIndex = challengeIndex;
    this.state.challenge = { module: mod, lesson, challenge, id };
    
    if (challenge.kind === 'synthesis') {
      const files = challenge.files || {};
      const lastCode = rec.lastCode || {};
      const combined = {};
      for (const [name, starter] of Object.entries(files)) {
        combined[name] = lastCode[name] ?? starter ?? '';
      }
      this.state.editors = emptyEditors(combined);
    } else {
      this.state.editors = { [challenge.lang || 'js']: emptyEditor(rec.lastCode ?? challenge.starter ?? '') };
    }
    
    this.state.results = null;
    this.state.formatHint = null;
    this.state.hintsShown = 0;
    this.state.showSolution = false;
    this.state.pane = this.w >= 104 ? 'both' : 'code';
    this.state.briefScroll = 0;
    this.state.showLogs = false;
    this.state.editorCursorPos = null;
    this.state.completion = null;
    this.state.editorTab = 0;
    this.push('challenge', { challengeId: id });
  }

  /**
   * Resume wherever the learner left off (Q1) — the first unpassed challenge,
   * resolved by the same pure helper the next UI uses (core/targets.js).
   */
  resumeTarget() {
    return firstUnpassed(this.curriculum, (id) => this.store.isPassed(id));
  }

  /**
   * Q2 `nav.nextUp` (palette-only): jump straight to the first unpassed
   * challenge, or celebrate when the curriculum is finished.
   */
  nextUp() {
    const target = this.resumeTarget();
    if (!target) {
      this.note('Every challenge is passed - the capstone projects are next.', 'good', true);
      this.render();
      return;
    }
    this.openChallenge(target.moduleIndex, target.lessonIndex, target.challengeIndex);
  }

  /**
   * Q3 list endpoints: `g`/`G` jump to the first/last row of the focused list.
   * Returns true when the key was one of them.
   */
  listJump(key, length, cursorKey = 'cursor') {
    if (length <= 0) return false;
    if (isChar(key, 'g')) {
      this.state[cursorKey] = 0;
      this.render();
      return true;
    }
    if (isChar(key, 'G')) {
      this.state[cursorKey] = length - 1;
      this.render();
      return true;
    }
    return false;
  }

  /** `g` on a scrolling screen: back to the top (Q3, the 'first' half). */
  scrollTop(key, cursorKey = 'cursor') {
    if (!isChar(key, 'g')) return false;
    this.state[cursorKey] = 0;
    this.render();
    return true;
  }

  // -- input ----------------------------------------------------------------

  onKey(key) {
    // Ctrl+P: inside a challenge it is the documented preview key, everywhere
    // else it opens the command palette. Ctrl+K opens the palette from ANY
    // screen — the next UI's registry binding (`app.palette`), accepted here so
    // the shared help text (core/help.js) is true in both UIs.
    if (key.name === 'ctrl-p' || key.name === 'ctrl-k') {
      if (key.name === 'ctrl-p' && this.current.name === 'challenge') {
        this.challengeKey(key);
        return;
      }
      this.state.paletteQuery = '';
      this.state.cursor = 0;
      this.state.paletteScroll = 0;
      this.push('palette');
      return;
    }
    if (key.name === 'ctrl-c') {
      this.quit();
      return;
    }
    if (key.name === 'ctrl-l') {
      this.screen.invalidate();
      this.render();
      return;
    }

    if (this.current.name === 'palette') {
      this.paletteKey(key);
      return;
    }
    if (this.current.name === 'challenge') {
      this.challengeKey(key);
      return;
    }
    if (this.current.name === 'browser') {
      this.browserKey(key);
      return;
    }

    if (key.name === 'escape') {
      if (this.stack.length > 1) this.pop();
      else this.quit();
      return;
    }
    if (isChar(key, '?')) {
      this.push('help');
      return;
    }
    // 'q' quits everywhere the footer advertises it (the editor, the palette
    // and the browser console type letters instead).
    if (isChar(key, 'q') && !['challenge', 'palette', 'browser'].includes(this.current.name)) {
      this.quit();
      return;
    }
    if (this.current.name === 'lesson') {
      this.lessonKey(key);
      return;
    }

    switch (this.current.name) {
      case 'home':
        if (isChar(key, 'x') && this.settings.bannerVisible(this.stats.streak)) {
          this.dismissBanner();
          return;
        }
        this.menuKey(key, this.curriculum.length, (i) => this.openModule(i));
        break;
      case 'module':
        this.moduleKey(key);
        break;
      case 'projects':
        this.projectsKey(key);
        break;
      case 'settings': {
        // Sound toggle (M0, docs/multimedia.md §5): Space on the Sound row.
        // Space acts on the focused row's KEY (settingsRows), not a magic
        // index, so inserting rows can never rewire the toggles.
        const settingsRow = settingsRows(this)[this.state.cursor];
        if (isChar(key, ' ') && settingsRow) {
          this.toggleSetting(settingsRow.key);
          return;
        }
        if (['up', 'down', 'pageup', 'pagedown'].includes(key.name)) {
          const step = key.name === 'pagedown' ? 10 : key.name === 'pageup' ? -10 : key.name === 'up' ? -1 : 1;
          this.state.cursor = Math.max(0, Math.min(settingsRows(this).length - 1, this.state.cursor + step));
          this.render();
        }
        break;
      }
      case 'stats':
      case 'help':
      case 'resources':
      case 'workspace':
        // Scroll screens have no known length, so only `g` (top) applies (Q3).
        if (this.scrollTop(key)) return;
        if (['up', 'down', 'pageup', 'pagedown'].includes(key.name)) {
          const step = key.name === 'pagedown' ? 10 : key.name === 'pageup' ? -10 : key.name === 'up' ? -1 : 1;
          this.state.cursor = Math.max(0, this.state.cursor + step);
          this.render();
        } else if (key.name === 'char') {
          // Q12 visible bell: the key is genuinely ignored here, so say so
          // instead of redrawing an identical frame.
          this.visibleBell(`'${key.char}' does nothing on this screen - 'q' goes back, '?' lists the keys.`);
        }
        break;
      default:
        break;
    }
  }

  paletteKey(key) {
    if (key.name === 'escape') {
      // Leaving the palette always returns it to its default mode.
      this.state.paletteMode = 'jump';
      this.state.paletteSnapshots = [];
      this.pop();
      return;
    }
    if (key.name === 'enter') {
      const items = this.getPaletteItems();
      const selected = items[this.state.cursor];
      if (!selected) return;
      // Close the palette first so the target screen replaces it on the stack.
      this.pop();
      this.state.paletteMode = 'jump';
      this.state.paletteSnapshots = [];
      if (selected.type === 'command') this.runPaletteAction(selected.id);
      else if (selected.type === 'snapshot') this.restoreSnapshot(selected.snapshot);
      else if (selected.type === 'module') this.openModule(selected.index);
      else if (selected.type === 'lesson') this.openLesson(selected.moduleIndex, selected.lessonIndex);
      else if (selected.type === 'challenge') this.openChallenge(selected.moduleIndex, selected.lessonIndex, selected.challengeIndex);
      return;
    }
    if (isUp(key)) {
      this.state.cursor = Math.max(0, this.state.cursor - 1);
      this.scrollPalette();
      this.render();
      return;
    }
    if (isDown(key)) {
      const items = this.getPaletteItems();
      this.state.cursor = Math.min(items.length - 1, this.state.cursor + 1);
      this.scrollPalette();
      this.render();
      return;
    }
    if (key.name === 'char' && this.state.paletteMode === 'history') {
      // The checkpoint list is a picker, not a search: ignore printable keys.
      return;
    }
    if (key.name === 'char') {
      if (key.char === '\r' || key.char === '\n') {
        // treat as enter
        this.paletteKey({ name: 'enter' });
        return;
      }
      if (key.char === '\u007f') { // backspace
        this.state.paletteQuery = this.state.paletteQuery.slice(0, -1);
        this.state.cursor = 0;
        this.state.paletteScroll = 0;
        this.render();
        return;
      }
      this.state.paletteQuery += key.char;
      this.state.cursor = 0;
      this.state.paletteScroll = 0;
      this.render();
      return;
    }
    if (key.name === 'space') {
      this.state.paletteQuery += ' ';
      this.state.cursor = 0;
      this.state.paletteScroll = 0;
      this.render();
    }
  }

  /** Keep the highlighted palette row inside the visible list window. */
  scrollPalette() {
    const listH = Math.max(1, this.h - 6);
    const c = this.state.cursor;
    const offset = this.state.paletteScroll || 0;
    if (c < offset) this.state.paletteScroll = c;
    else if (c >= offset + listH) this.state.paletteScroll = c - listH + 1;
  }

  getPaletteItems() {
    const query = (this.state.paletteQuery || '').toLowerCase();

    // Q9 restore list: the sidecar's snapshots for the challenge underneath.
    if (this.state.paletteMode === 'history') {
      return (this.state.paletteSnapshots || []).map((snap) => ({
        label: snapshotLabel(snap),
        type: 'snapshot',
        snapshot: snap,
        marker: snap.kind === 'daily-best' ? '★' : '·',
        markerColor: snap.kind === 'daily-best' ? 'star' : 'faint',
        right: snap.id,
      }));
    }

    // Palette-only registry commands (no key of their own): Q2 next-up and the
    // Q9 restore entry point. Availability mirrors the keymap lint's rule: the
    // screen UNDER the palette decides what is offered.
    const under = this.stack.length > 1 ? this.stack[this.stack.length - 2].name : 'home';
    const actions = commandsForScreen(under)
      .filter((c) => PALETTE_ACTIONS.includes(c.id) && !c.keys.default.length)
      .filter((c) => `${c.title} ${c.id}`.toLowerCase().includes(query))
      .map((c) => ({ label: c.title, type: 'command', id: c.id, marker: '⌘', markerColor: 'accent', right: 'palette' }));

    // One source of truth for what the palette offers: the VIEW renders this
    // exact array, so the highlighted row and the executed row can never
    // drift apart (they did: the view built its own list without the action
    // commands, so Enter ran the wrong row whenever one was on screen).
    const items = [...actions];
    this.curriculum.forEach((mod, i) => {
      const modSearch = `${mod.title} ${mod.id}`.toLowerCase();
      if (modSearch.includes(query)) {
        items.push({ label: mod.title, type: 'module', index: i, marker: 'M', markerColor: 'secondary' });
      }
      mod.lessons.forEach((lesson, li) => {
        const lessonSearch = `${mod.title} ${lesson.title} ${lesson.id}`.toLowerCase();
        if (lessonSearch.includes(query)) {
          items.push({ label: lesson.title, type: 'lesson', moduleIndex: i, lessonIndex: li, marker: 'L', markerColor: 'accent' });
        }
        (lesson.challenges || []).forEach((ch, ci) => {
          const chSearch = `${mod.title} ${lesson.title} ${ch.id}`.toLowerCase();
          if (chSearch.includes(query)) {
            items.push({ label: `${lesson.title} > ${ch.id}`, type: 'challenge', moduleIndex: i, lessonIndex: li, challengeIndex: ci, marker: 'C', markerColor: 'star' });
          }
        });
      });
    });
    return items;
  }

  /**
   * Registry commands with no key of their own (Appendix B: `keys: []`) are
   * reachable from the palette. Only implemented ones are advertised.
   */
  runPaletteAction(id) {
    if (id === 'nav.nextUp') {
      this.nextUp();
      return;
    }
    if (id === 'history.restore') {
      this.openHistoryPalette();
      return;
    }
    if (id === 'editor.bracketMatch') {
      this.jumpToMatchingBracket();
      return;
    }
    this.note(`"${id}" has no palette handler yet.`, 'warn', true);
    this.render();
  }

  /**
   * Q9: open the checkpoint list for the challenge underneath the palette.
   * Sidecars are per challenge, so this only makes sense inside one.
   */
  openHistoryPalette() {
    const ctx = this.state.challenge;
    if (!ctx) {
      this.note('Open a challenge first - checkpoints belong to a challenge.', 'warn', true);
      this.render();
      return;
    }
    const snapshots = this.store.checkpoints(`${ctx.lesson.id}.${ctx.challenge.id}`);
    if (!snapshots.length) {
      this.note('No checkpoints yet - one is taken every time you run a check (Ctrl+S).', 'muted', true);
      this.render();
      return;
    }
    this.state.paletteMode = 'history';
    this.state.paletteSnapshots = snapshots;
    this.state.paletteQuery = '';
    this.state.cursor = 0;
    this.state.paletteScroll = 0;
    this.push('palette');
    this.render();
  }

  /**
   * Q9 restore: put a snapshot's buffers back, tab by tab. Restoring never
   * touches attempts, streaks or lastCode (Appendix A), and files the current
   * challenge no longer has are reported instead of invented.
   */
  restoreSnapshot(snapshot) {
    const ctx = this.state.challenge;
    if (!ctx || !snapshot || !this.state.editors) return;
    const files = snapshot.files || {};
    let restored = 0;
    const absent = [];
    for (const [name, text] of Object.entries(files)) {
      const ed = this.state.editors[name];
      if (ed) {
        setText(ed, text);
        restored += 1;
      } else {
        absent.push(name);
      }
    }
    if (!restored) {
      this.note('That checkpoint only holds files this challenge no longer has.', 'warn', true);
      this.render();
      return;
    }
    const extra = absent.length ? ` (${absent.join(', ')} skipped - not in this challenge)` : '';
    this.note(`Restored ${snapshotLabel(snapshot)}${extra}`, 'good', true);
    this.render();
  }

  /** Q6: dismiss today's at-risk banner ('x' on home). */
  dismissBanner() {
    this.settings.dismissBanner();
    this.note('Banner dismissed for today.', 'muted');
    this.render();
  }

  menuKey(key, length, onEnter) {
    if (length <= 0) return;
    if (this.listJump(key, length)) return;
    if (isUp(key)) {
      this.state.cursor = (this.state.cursor - 1 + length) % length;
      this.render();
      return;
    }
    if (isDown(key)) {
      this.state.cursor = (this.state.cursor + 1) % length;
      this.render();
      return;
    }
    if (key.name === 'enter') {
      onEnter(this.state.cursor);
      return;
    }
    if (isChar(key, 's')) {
      this.push('settings');
      return;
    }
    if (isChar(key, 'p')) {
      this.push('projects');
      return;
    }
  }

  projectList() {
    return this.curriculum.filter((m) => m.project);
  }

  projectsKey(key) {
    const list = this.projectList();
    if (list.length <= 0) return;
    const mod = list[Math.min(this.state.cursor, list.length - 1)];
    const checks = mod.project.checks || [];
    const inChecks = this.state.focus === 'checks';
    if (this.listJump(key, inChecks ? checks.length : list.length, inChecks ? 'projectCheckCursor' : 'cursor')) return;

    if (key.name === 'tab') {
      this.state.focus = inChecks ? 'menu' : 'checks';
      this.render();
      return;
    }
    if (key.name === 'space' && inChecks) {
      const id = `${mod.project.id}.${this.state.projectCheckCursor}`;
      const now = this.store.toggleProjectCheck(mod.project.id, id);
      this.note(`${now ? 'Ticked' : 'Unticked'}: ${checks[this.state.projectCheckCursor]}`, now ? 'good' : 'warn');
      this.render();
      return;
    }
    if (isUp(key)) {
      if (inChecks) this.state.projectCheckCursor = (this.state.projectCheckCursor - 1 + checks.length) % checks.length;
      else this.state.cursor = (this.state.cursor - 1 + list.length) % list.length;
      this.render();
      return;
    }
    if (isDown(key)) {
      if (inChecks) this.state.projectCheckCursor = (this.state.projectCheckCursor + 1) % checks.length;
      else this.state.cursor = (this.state.cursor + 1) % list.length;
      this.render();
      return;
    }
  }

  getBreadcrumbs() {
    const { moduleIndex, lessonIndex, challengeIndex } = this.state;
    const crumbs = [];
    
    if (this.current.name === 'home') return crumbs;

    const mod = this.curriculum[moduleIndex];
    if (mod) {
      crumbs.push(mod.title);
      
      if (this.current.name === 'lesson' || this.current.name === 'challenge') {
        const lesson = mod.lessons[lessonIndex];
        if (lesson) {
          crumbs.push(lesson.title);
          
          if (this.current.name === 'challenge') {
            const ch = lesson.challenges[challengeIndex];
            if (ch) crumbs.push(ch.id);
          }
        }
      }
    }
    return crumbs;
  }


  getActiveEditor() {
    if (this.state.editors) {
      const files = Object.keys(this.state.editors);
      return files.length ? this.state.editors[files[this.state.editorTab || 0]] : null;
    }
    return this.state.editor;
  }

  /** File name of the editor tab in focus (synthesis challenges only). */
  activeFileName() {
    if (!this.state.editors) return null;
    const files = Object.keys(this.state.editors);
    return files[this.state.editorTab || 0] || files[0] || null;
  }

  /** True when the challenge edits several named files at once. */
  isMultiFile() {
    const ch = this.state.challenge && this.state.challenge.challenge;
    return !!(ch && (ch.kind === 'synthesis' || ch.files));
  }

  /** The language of the file in focus - per-file for synthesis challenges. */
  activeLang() {
    const name = this.activeFileName();
    if (name) {
      const ext = name.split('.').pop();
      if (['html', 'htm', 'css', 'js', 'ts', 'jsx', 'sql', 'sh'].includes(ext)) return ext;
    }
    return this.state.challenge?.challenge.lang || 'js';
  }

  /** Switch editor tab for a synthesis challenge. Returns true when it moved. */
  switchEditorTab(delta) {
    if (!this.state.editors) return false;
    const files = Object.keys(this.state.editors);
    if (files.length <= 1) return false;
    const at = files.indexOf(this.activeFileName());
    const next = (at + delta + files.length) % files.length;
    this.state.editorTab = next;
    this.state.completion = null;
    this.render();
    return true;
  }
  render() {
    const { w, h } = this;
    const bodyH = Math.max(4, h - 6);
    const view = VIEWS[this.current.name] || renderHome;
    const body = view(this, w, bodyH);
    // Views return one segment-row per line; pad each to the full width before
    // splicing it under the header. (Passing the whole row list to `fit` would
    // treat every row as a segment and crash.)
    const bodyRows = (Array.isArray(body) ? body : []).map((row) => fit(row, w, { bg: this.theme.bg }));

    const tabs = ['Dashboard', 'Projects', 'Progress', 'Resources', 'Workspace'];
    const tabForRoute = { home: 0, projects: 1, stats: 2, resources: 3, workspace: 4 };
    const activeTab = this.current.name in tabForRoute ? tabForRoute[this.current.name] : -1;
    const t = this.totals;
    const overall = this.stats.totals;
    const rows = [
      ...header(this.theme, w, {
        title: 'fullstack-tui',
        subtitle: `${t.modules} modules | ${t.lessons} lessons | ${t.challenges} challenges`,
        right: `${overall.challengesPassed}/${overall.challenges} solved (${overall.percent}%)`,
        tabs: activeTab === -1 ? null : tabs,
        activeTab: activeTab === -1 ? 0 : activeTab,
        breadcrumbs: this.getBreadcrumbs(),
      }),
      ...bodyRows,
      ...footer(this.theme, w, this.footerHints(), this.state.notice),
    ];

    this.screen.resize(w, h);
    this.screen.present(rows, { bg: this.theme.bg }, this.linkAnnotations(rows));

    // Keep the terminal cursor parked at the editor caret so hardware cursors
    // and IMEs behave, but keep it hidden otherwise. Writes go through the
    // screen's output handle so a headless App (the self-check) stays silent.
    if (this.current.name === 'challenge' && this.getActiveEditor() && this.state.editorCursorPos) {
      const { row, col } = this.state.editorCursorPos;
      this.screen.out.write(seq.cursorShow + seq.moveTo(row, col));
    } else {
      this.screen.out.write(seq.cursorHide);
    }
  }

  footerHints() {
    switch (this.current.name) {
      case 'home':
        return [['j/k', 'move'], ['g/G', 'first/last'], ['Enter', 'open'], ['p', 'projects'], ['s', 'settings'], ['^P', 'palette'], ['?', 'help'], ['q', 'quit']];
      case 'module':
        return [['j/k', 'move'], ['g/G', 'first/last'], ['Enter', 'open'], ['Esc', 'back'], ['?', 'help'], ['q', 'quit']];
      case 'lesson':
        return [['j/k', 'scroll'], ['Tab', 'challenges'], ['m', 'mark read'], ['Esc', 'back'], ['q', 'quit']];
      case 'challenge':
        return [['^S', 'check'], ['^F', 'format'], ['^J', 'jump'], ['^Space', 'suggest'], ['^B', 'browser'], ['^R', 'reset'], ['^H', 'hint'], ['^G', 'solution'], ['^P', 'preview'], ['Esc', 'back']];
      case 'projects':
        return [['j/k', 'move'], ['Space', 'tick'], ['Esc', 'back'], ['q', 'quit']];
      case 'stats':
        return [['Esc', 'back'], ['?', 'help'], ['q', 'quit']];
      case 'settings':
        return [['j/k', 'move'], ['Space', 'toggle setting'], ['Esc', 'back'], ['q', 'quit']];
      case 'browser':
        return [['Tab', 'pane'], ['1-5', 'jump'], ['j/k', 'move'], ['Ctrl+B', 'editor'], ['Esc', 'back']];
      case 'workspace':
        return [['j/k', 'scroll'], ['Esc', 'back'], ['q', 'quit']];
      case 'resources':
        return [['j/k', 'scroll'], ['Esc', 'back'], ['q', 'quit']];
      default:
        return [['Esc', 'back'], ['q', 'quit']];
    }
  }

  // -- module screen --------------------------------------------------------

  moduleKey(key) {
    const mod = this.moduleAt(this.state.moduleIndex);
    if (!mod) return;
    const entries = mod.lessons.length + (mod.project ? 1 : 0);
    if (this.listJump(key, entries)) return;
    if (isUp(key)) {
      this.state.cursor = (this.state.cursor - 1 + entries) % entries;
      this.render();
      return;
    }
    if (isDown(key)) {
      this.state.cursor = (this.state.cursor + 1) % entries;
      this.render();
      return;
    }
    if (key.name === 'enter') {
      if (this.state.cursor < mod.lessons.length) {
        this.openLesson(this.state.moduleIndex, this.state.cursor);
      } else if (mod.project) {
        this.push('projects', { projectId: mod.project.id });
      }
    }
  }

  moduleAt(index) {
    return this.curriculum[index] || null;
  }

  // -- lesson screen --------------------------------------------------------

  lessonKey(key) {
    const mod = this.curriculum[this.state.moduleIndex];
    const lesson = mod.lessons[this.state.lessonIndex];
    const count = (lesson.challenges || []).length;

    if (isChar(key, 'm')) {
      this.store.markLessonRead(lesson.id);
      this.note(`Marked "${lesson.title}" as read`, 'good', true);
      this.render();
      return;
    }
    if (key.name === 'tab' || key.name === 'shift-tab') {
      const dir = key.name === 'tab' ? 1 : -1;
      const next = this.state.lessonFocus + dir;
      this.state.lessonFocus = next >= count ? -1 : next < -1 ? count - 1 : next;
      this.render();
      return;
    }
    if (key.name === 'enter' && this.state.lessonFocus >= 0) {
      this.openChallenge(this.state.moduleIndex, this.state.lessonIndex, this.state.lessonFocus);
      return;
    }
    if (key.name === 'enter') {
      const idx = (lesson.challenges || []).findIndex((c) => !this.store.isPassed(`${lesson.id}.${c.id}`));
      this.openChallenge(this.state.moduleIndex, this.state.lessonIndex, idx === -1 ? 0 : idx);
      return;
    }
    if (isChar(key, 'n')) {
      const target = nextLesson(lesson.id);
      if (!target) {
        this.note('That was the last lesson. Time for the capstone projects.', 'warn');
        this.render();
        return;
      }
      const mi = this.curriculum.indexOf(target.module);
      const li = target.module.lessons.indexOf(target.lesson);
      this.stack.pop();
      this.openLesson(mi, li);
      return;
    }
    const step = key.name === 'pagedown' ? Math.max(3, Math.floor((this.h - 8) / 2)) : key.name === 'pageup' ? -Math.max(3, Math.floor((this.h - 8) / 2)) : 0;
    if (step) {
      this.state.lessonScroll = Math.max(0, this.state.lessonScroll + step);
      this.store.setLessonScroll(lesson.id, this.state.lessonScroll);
      this.render();
      return;
    }
    if (isChar(key, 'g')) {
      // Q3: `g` returns to the top of the lesson prose.
      this.state.lessonScroll = 0;
      this.store.setLessonScroll(lesson.id, 0);
      this.render();
      return;
    }
    if (isDown(key)) {
      this.state.lessonScroll += 1;
      this.store.setLessonScroll(lesson.id, this.state.lessonScroll);
      this.render();
      return;
    }
    if (isUp(key)) {
      this.state.lessonScroll = Math.max(0, this.state.lessonScroll - 1);
      this.store.setLessonScroll(lesson.id, this.state.lessonScroll);
      this.render();
    }
  }

  // -- challenge screen -----------------------------------------------------

  challengeKey(key) {
    const ed = this.getActiveEditor();
    if (!ed) {
      this.pop();
      return;
    }

    // While the completion popup is open it owns a handful of keys, the same
    // way an editor's suggestion widget does. Tab is deliberately NOT taken:
    // the editor's Tab = Emmet expansion, with suggestion-accept moving to
    // Enter (VS Code's split), so `div.card*2<Tab>` works mid-popup.
    if (this.state.completion && this.state.freeCompletion !== true && this.state.pane !== 'brief' && !this.state.showSolution) {
      if (key.name === 'up') return this.moveCompletion(-1);
      if (key.name === 'down') return this.moveCompletion(1);
      if (key.name === 'pageup') return this.moveCompletion(-5);
      if (key.name === 'pagedown') return this.moveCompletion(5);
      if (key.name === 'enter') return this.acceptCompletion();
      if (key.name === 'escape') {
        this.state.completion = null;
        this.render();
      }
    }
    if (key.name === 'ctrl-space') {
      this.refreshCompletion(true);
      this.render();
      return;
    }
    if (key.name === 'ctrl-b' && !this.state.showSolution) {
      this.openBrowser();
      return;
    }

    if (key.name === 'escape') {
      // Esc from the solution view goes back to the editor first.
      if (this.state.showSolution) {
        this.state.showSolution = false;
        this.render();
        return;
      }
      if (this.state.pane === 'both') {
        this.render();
      }
      this.pop();
      return;
    }

    if (key.name === 'ctrl-s') {
      this.checkChallenge();
      return;
    }
    if (key.name === 'ctrl-f') return this.formatEditor();
    if (key.name === 'ctrl-r') return this.resetChallenge();
    if (key.name === 'ctrl-h') return this.revealHint();
    if (key.name === 'ctrl-j') return this.jumpToFailedCheck();
    if (key.name === 'ctrl-g') {
      if (this.state.showSolution) {
        this.state.showDiff = !this.state.showDiff;
        this.render();
        return;
      }
      this.state.showSolution = !this.state.showSolution;
      this.state.showDiff = false;
      this.state.solutionCursor = 0;
      if (this.state.showSolution && this.state.challenge) this.store.markSolutionSeen(this.state.challenge.id);
      this.render();
      return;
    }
    if (key.name === 'ctrl-q') return this.switchEditorTab(-1) || undefined;
    if (key.name === 'ctrl-w') return this.switchEditorTab(1) || undefined;
    if (key.name === 'ctrl-e') return this.openInEditor();
    if (key.name === 'ctrl-p') return this.openPreview();
    if (key.name === 'ctrl-o') return this.saveToWorkspace(true);
    if (key.name === 'ctrl-t') {
      this.state.showLogs = !this.state.showLogs;
      this.render();
      return;
    }
    if (this.state.showSolution) {
      if (isChar(key, 'y')) {
        const { challenge } = this.state.challenge;
        setText(this.getActiveEditor(), challenge.solution || '');
        this.state.showSolution = false;
        this.note('Solution copied into the editor. Now change it to make it yours.', 'warn', true);
        this.render();
        return;
      }
      const total = this.challengeSolutionLines();
      const page = Math.max(3, this.h - 12);
      if (isDown(key)) {
        this.state.solutionCursor = Math.min(total, this.state.solutionCursor + 1);
        this.render();
      } else if (isUp(key)) {
        this.state.solutionCursor = Math.max(0, this.state.solutionCursor - 1);
        this.render();
      } else if (key.name === 'pagedown') {
        this.state.solutionCursor = Math.min(total, this.state.solutionCursor + page);
        this.render();
      } else if (key.name === 'pageup') {
        this.state.solutionCursor = Math.max(0, this.state.solutionCursor - page);
        this.render();
      }
      return;
    }

    // Pane switching when the terminal is too narrow for a split view.
    if (this.state.pane !== 'both' && key.name === 'tab') {
      this.state.pane = this.state.pane === 'code' ? 'brief' : 'code';
      this.state.briefScroll = this.state.briefScroll || 0;
      this.state.completion = null;
      this.render();
      return;
    }

    if (this.state.pane === 'brief') {
      if (key.name === 'up' || key.name === 'down' || key.name === 'pageup' || key.name === 'pagedown') {
        const step = isUp(key) ? -1 : isDown(key) ? 1 : key.name === 'pageup' ? -8 : 8;
        this.state.briefScroll = Math.max(0, (this.state.briefScroll || 0) + step);
        this.render();
      }
      if (key.name === 'enter') {
        this.state.pane = 'code';
        this.render();
      }
      return;
    }

    // -- the editor itself --
    if (this.state.completion && key.name === 'tab' && this.state.pane !== 'brief' && !this.state.showSolution) {
      // Tab with a live popup: expand emmet if there is an abbreviation,
      // otherwise accept the top suggestion (the common quick path).
      if (this.tryEmmetExpand(ed, {})) { this.render(); return; }
      return this.acceptCompletion();
    }
    switch (key.name) {
      case 'char':
        this.typeChar(ed, key.char);
        break;
      case 'space':
        this.typeChar(ed, ' ');
        break;
      case 'enter':
        insertNewline(ed, this.tabSize());
        this.state.completion = null;
        break;
      case 'tab': {
        // Emmet first: `div.card*2` + Tab expands; plain Tab inserts one
        // indent, whose width is the Q12 setting (2 by default).
        if (this.tryEmmetExpand(ed, {})) break;
        const width = this.tabSize();
        for (let i = 0; i < width; i += 1) insertChar(ed, ' ');
        break;
      }
      case 'backspace':
        this.smartBackspace(ed);
        break;
      case 'delete':
        del(ed);
        break;
      case 'left':
      case 'right':
      case 'home':
      case 'end':
        this.state.completion = null;
        if (key.name === 'left') move(ed, 'left');
        else if (key.name === 'right') move(ed, 'right');
        else if (key.name === 'home') moveToLineStart(ed);
        else moveToLineEnd(ed);
        break;
      case 'up':
        this.state.completion = null;
        this.editorVertical(ed, -1);
        break;
      case 'down':
        this.state.completion = null;
        this.editorVertical(ed, 1);
        break;
      case 'pageup':
        for (let i = 0; i < 10; i += 1) move(ed, 'up');
        break;
      case 'pagedown':
        for (let i = 0; i < 10; i += 1) move(ed, 'down');
        break;
      default:
        return;
    }
    this.render();
  }

  /**
   * Emmet expansion at the caret. `requireStructure` restricts markup
   * expansions to tokens with structural operators so Tab on a plain tag
   * word stays an indent. Returns true when the document changed.
   */
  tryEmmetExpand(ed, opts) {
    const lang = this.activeLang();
    const text = editorText(ed);
    const offset = offsetOf(ed);
    const res = expandAt(lang, text, offset, opts);
    if (!res) return false;
    setTextAt(ed, res.text, res.offset);
    this.state.completion = null; // the popup is now stale
    return true;
  }

  /** Prettier-style format (Ctrl+F): CSS formats the enclosing rule; other languages the whole buffer. */
  formatEditor() {
    const ed = this.getActiveEditor();
    if (!ed) return;
    const lang = this.activeLang();
    const text = editorText(ed);
    const offset = offsetOf(ed);
    // `formatCodeAt` is the CSS-enclosing-rule path and answers null for every
    // other language, so the documented whole-buffer behaviour needs the
    // fallback: without it Ctrl+F said "couldn't format safely" on valid JS
    // and markup, which is the bug the feature is supposed to fix.
    let res = formatCodeAt(lang, text, offset);
    if (!res) {
      const whole = formatCode(lang, text);
      if (whole) res = { text: whole.text, offset: Math.min(offset, whole.text.length) };
    }
    if (!res) {
      this.note("Couldn't format safely - fix the syntax first.", 'bad');
      this.render();
      return;
    }
    setTextAt(ed, res.text, res.offset);
    // Q10: the suggest-only note has served its purpose once the buffer is
    // formatted, so it goes away with the reformat.
    if (!formatCode(lang, editorText(ed))?.changed) this.state.formatHint = null;
    this.note(res.text !== text ? 'Formatted.' : 'Already formatted.', 'muted');
    this.render();
  }

  challengeSolutionLines() {
    const ch = this.state.challenge?.challenge;
    if (!ch) return 0;
    return String(ch.solution || '').split('\n').length;
  }

  // -- completion (IDE-like input) -----------------------------------------

  /** Apply one typed character, with auto-pairing and auto-closed tags. */
  typeChar(ed, ch) {
    const lang = this.activeLang();
    // Emmet CSS shorthand: `m10` + `;` completes to `margin: 10px;` —
    // the expansion supplies the semicolon, so the typed one is skipped.
    // The `;` is simulated into the document first, exactly the contract
    // `expandAt(…, { trigger: ';' })` is tested against.
    if (ch === ';' && normaliseLang(lang) === 'css') {
      const text = editorText(ed);
      const offset = offsetOf(ed);
      const res = expandAt(lang, text.slice(0, offset) + ';' + text.slice(offset), offset + 1, { trigger: ';' });
      if (res) {
        setTextAt(ed, res.text, res.offset);
        this.state.completion = null;
        return;
      }
    }
    const text = editorText(ed);
    const offset = offsetOf(ed);
    const smart = smartInsert(text, offset, ch, lang);
    if (smart) setTextAt(ed, smart.text, smart.offset);
    else insertChar(ed, ch);
    this.refreshCompletion(false);
  }

  /** Backspacing an empty pair removes both halves. */
  smartBackspace(ed) {
    const text = editorText(ed);
    const paired = pairBackspace(text, offsetOf(ed));
    if (paired) setTextAt(ed, paired.text, paired.offset);
    else backspace(ed, this.tabSize());
    this.refreshCompletion(false);
  }

  /**
   * Q12 indent width from settings, clamped to a sane range so a hand-edited
   * `.data/settings.json` can't wedge the editor.
   */
  tabSize() {
    const n = Number(this.settings?.data?.editor?.tabSize);
    return Number.isFinite(n) ? Math.max(2, Math.min(8, Math.round(n))) : 2;
  }

  /** Recompute the suggestion popup. `force` is Ctrl+Space. */
  refreshCompletion(force) {
    const ed = this.getActiveEditor();
    const { challenge } = this.state.challenge || {};
    if (!ed || !challenge || this.state.pane === 'brief') {
      this.state.completion = null;
      return;
    }
    const lang = this.activeLang();
    const text = editorText(ed);
    const offset = offsetOf(ed);
    const res = completionsFor(lang, text, offset);
    if (!res) {
      this.state.completion = null;
      return;
    }
    if (!force && !this.autoTriggerCompletion(normaliseLang(lang), text, offset, res)) {
      this.state.completion = null;
      return;
    }
    const previous = this.state.completion;
    const prevLabel = previous && previous.items[previous.index] ? previous.items[previous.index].label : null;
    const index = prevLabel ? Math.max(0, res.items.findIndex((i) => i.label === prevLabel)) : 0;
    this.state.completion = { items: res.items, index, from: res.from, to: res.to, prefix: res.prefix };
  }

  /**
   * Auto-open only when it helps: a real prefix, or the punctuation that starts
   * a new construct (`<` in markup, `:` in CSS).
   */
  autoTriggerCompletion(family, text, offset, res) {
    if (res.prefix && res.prefix.length >= 2) return true;
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const before = text.slice(lineStart, offset);
    const charBefore = res.from > 0 ? text[res.from - 1] : '';
    if (family === 'markup') {
      const lt = before.lastIndexOf('<');
      const gt = before.lastIndexOf('>');
      return charBefore === '<' || (lt !== -1 && lt > gt);
    }
    if (family === 'css') return charBefore === ':' || charBefore === '@' || charBefore === '-';
    return false;
  }

  moveCompletion(delta) {
    const c = this.state.completion;
    if (!c) return;
    const n = c.items.length;
    c.index = (((c.index + delta) % n) + n) % n;
    this.render();
  }

  acceptCompletion() {
    const c = this.state.completion;
    const ed = this.getActiveEditor();
    this.state.completion = null;
    if (!c || !ed) {
      this.render();
      return;
    }
    const item = c.items[c.index];
    const text = editorText(ed);
    const next = text.slice(0, c.from) + item.insert + text.slice(c.to);
    setTextAt(ed, next, c.from + item.caret);
    this.render();
  }

  // -- internal browser / dev tools ----------------------------------------

  openBrowser() {
    if (!this.state.challenge) return;
    const id = this.state.challenge.id;
    const previous = this.state.browser;
    this.state.browser = previous && previous.challengeId === id
      ? { ...previous, tab: 'render', busy: false }
      : {
          challengeId: id,
          tab: 'render',
          scroll: 0,
          elementIndex: 0,
          follow: true,
          busy: false,
          input: '',
          history: [],
          historyIndex: 0,
          output: [],
        };
    this.push('browser', { challengeId: id });
  }

  browserKey(key) {
    const b = this.state.browser;
    if (!b) {
      this.pop();
      return;
    }
    if (key.name === 'escape' || (key.name === 'ctrl-b' && b.tab !== 'console')) {
      this.pop();
      return;
    }
    if (key.name === 'tab' || key.name === 'shift-tab') {
      const dir = key.name === 'tab' ? 1 : -1;
      const at = BROWSER_TABS.indexOf(b.tab);
      b.tab = BROWSER_TABS[(at + dir + BROWSER_TABS.length) % BROWSER_TABS.length];
      b.scroll = 0;
      this.render();
      return;
    }
    if (key.name === 'char' && /^[1-5]$/.test(key.char)) {
      b.tab = BROWSER_TABS[Number(key.char) - 1];
      b.scroll = 0;
      this.render();
      return;
    }
    if (b.tab === 'console') {
      this.consoleKey(key);
      return;
    }

    const page = Math.max(4, this.h - 12);
    const up = key.name === 'up' || key.name === 'pageup' || isChar(key, 'k');
    const down = key.name === 'down' || key.name === 'pagedown' || isChar(key, 'j');
    if (!up && !down) return;
    const stepRaw = key.name === 'pageup' || key.name === 'pagedown' ? page : 1;
    const step = (up ? -1 : 1) * stepRaw;

    if (b.tab === 'elements' || b.tab === 'styles') {
      if (stepRaw > 1) {
        b.follow = false;
        b.scroll = Math.max(0, b.scroll + step);
      } else {
        const count = elementCount(this);
        b.elementIndex = Math.max(0, Math.min(count - 1, b.elementIndex + (up ? -1 : 1)));
        if (b.tab === 'elements') {
          const listHeight = Math.max(1, this.h - 9);
          if (b.elementIndex < b.scroll) b.scroll = b.elementIndex;
          if (b.elementIndex >= b.scroll + listHeight) b.scroll = b.elementIndex - listHeight + 1;
        }
      }
      this.render();
      return;
    }

    b.follow = false;
    b.scroll = Math.max(0, b.scroll + step);
    this.render();
  }

  consoleKey(key) {
    const b = this.state.browser;
    if (key.name === 'enter') {
      this.runConsole();
      return;
    }
    if (key.name === 'backspace') {
      b.input = b.input.slice(0, -1);
      this.render();
      return;
    }
    if (key.name === 'ctrl-l') {
      b.output = [];
      b.scroll = 0;
      this.render();
      return;
    }
    if (key.name === 'ctrl-u') {
      b.input = '';
      this.render();
      return;
    }
    if (key.name === 'up') {
      if (b.history.length) {
        b.historyIndex = Math.max(0, b.historyIndex - 1);
        b.input = b.history[b.historyIndex] || '';
      }
      this.render();
      return;
    }
    if (key.name === 'down') {
      if (b.history.length) {
        b.historyIndex = Math.min(b.history.length, b.historyIndex + 1);
        b.input = b.history[b.historyIndex] || '';
      }
      this.render();
      return;
    }
    if (key.name === 'pageup' || key.name === 'pagedown') {
      b.follow = false;
      b.scroll = Math.max(0, b.scroll + (key.name === 'pagedown' ? 5 : -5));
      this.render();
      return;
    }
    if (key.name === 'char') {
      b.input += key.char;
      this.render();
      return;
    }
    if (key.name === 'space') {
      b.input += ' ';
      this.render();
    }
  }

  /**
   * Evaluate one console expression against the current editor contents.
   *
   * The DOM comes from the markup the learner is editing (or the challenge's
   * fixture), and the JS is their own code, so `document.querySelector('#x')`
   * and their own functions both work - a read-only preview of the page as it
   * stands, exactly like a browser console.
   */
  async runConsole() {
    const b = this.state.browser;
    if (!b || b.busy) return;
    const expr = b.input.trim();
    if (!expr) return;
    const { challenge } = this.state.challenge;
    const lang = this.activeLang();
    let code;
    let parts;
    if (this.isMultiFile()) {
      // Synthesis: the console sees the assembled page and all of the scripts.
      const texts = editorTexts(this.state.editors);
      code = texts;
      parts = synthesisParts(texts);
    } else {
      code = editorText(this.getActiveEditor());
      parts = this.previewParts(code);
    }
    const isMarkup = lang === 'html' || lang === 'html+css' || lang === 'css' || this.isMultiFile();

    b.output.push({ kind: 'input', text: expr });
    b.history.push(expr);
    b.historyIndex = b.history.length;
    b.input = '';
    b.busy = true;
    b.follow = true;
    this.render();

    const scriptCode = isMarkup ? parts.js || '' : editorText(this.getActiveEditor());
    const sandboxCode = `${scriptCode}\n__consoleResult = { value: await (${expr}) };`;
    let outcome = null;
    try {
      outcome = await runJs(sandboxCode, {
        tests: [],
        capture: ['__consoleResult'],
        timeout: 2000,
        domHtml: isMarkup ? parts.html : challenge.fixture ?? null,
        async: true,
        mockFetch: challenge.mockFetch || null,
        prelude: challenge.prelude || '',
        sourceText: sandboxCode,
      });
    } catch (err) {
      outcome = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    if (this.state.browser !== b) return;
    b.busy = false;
    if (outcome.error) {
      b.output.push({ kind: 'error', text: outcome.error });
    } else {
      const captured = outcome.captured ? outcome.captured.__consoleResult : undefined;
      const value = captured && typeof captured === 'object' && 'value' in captured ? captured.value : captured;
      b.output.push({ kind: 'result', text: formatConsoleValue(value) });
    }
    for (const line of outcome.logs || []) b.output.push({ kind: 'log', text: String(line) });
    b.follow = true;
    this.render();
  }

  /**
   * M0 multimedia (docs/multimedia.md §3): desktop notification + BEL when a
   * check run completes — the learner has often switched windows while the
   * sandbox runs. OSC 9/777 and BEL are no-ops on terminals that ignore them;
   * suppressed when piped, in tests, or when settings.sound is 'off'.
   */
  notifyDone(title) {
    if (!this.isTTY) return;
    if ((this.settings.data.sound ?? 'bell') === 'off') return;
    try {
      process.stdout.write(notify(title, 'fullstack-tui'));
      process.stdout.write(BEL);
    } catch {
      /* never let feedback crash the check path */
    }
  }

  /**
   * M0: OSC 8 hyperlink annotations for the current frame (docs/multimedia.md
   * §3). Only visible curriculum-source URLs become clickable; positions are
   * located by scanning the plain row text, so any future layout shift stays
   * correct automatically. Suppressed when the terminal is headless/piped.
   */
  linkAnnotations(rows) {
    if (!this.isTTY) return [];
    const mod = this.curriculum[this.state.moduleIndex];
    const src = mod && mod.source ? mod.source : null;
    if (!src || this.current.name !== 'module') return [];
    const links = [];
    for (let i = 0; i < rows.length && i < 5; i += 1) {
      const text = rows[i].map((s) => s && s.text ? s.text : '').join('');
      for (const url of [src.url, src.roadmap, src.docs]) {
        if (!url) continue;
        const col = text.indexOf(url);
        if (col !== -1) {
          links.push({ row: i + 1, col, len: url.length, url, id: `src-${mod.id}` });
          break; // one link per row is plenty; first URL wins the row
        }
      }
    }
    return links;
  }

  /**
   * Q9: capture the pre-check state into the challenge's sidecar. Both single
   * and multi-file challenges go through the editor map, so a checkpoint holds
   * every tab byte-exact.
   */
  snapshotCheckpoint() {
    const ctx = this.state.challenge;
    if (!ctx || !this.state.editors) return null;
    const id = `${ctx.lesson.id}.${ctx.challenge.id}`;
    const attempts = this.store.challengeRecord(id).attempts || 0;
    return this.store.saveCheckpoint(id, editorTexts(this.state.editors), {
      kind: 'check',
      passed: null,
      meta: { attemptNo: attempts + 1, checksTotal: (ctx.challenge.checks || []).length },
    });
  }

  async checkChallenge() {
    const { challenge, lesson } = this.state.challenge;
    const challengeId = `${lesson.id}.${challenge.id}`;
    const code = this.state.editors 
      ? editorTexts(this.state.editors) 
      : editorText(this.getActiveEditor());
    // `code` is per-file ({ name: text }) for graded runs; the Q7/Q10 helpers
    // work on text, so flatten it once here.
    const codeText = typeof code === 'string' ? code : Object.values(code).join('\n');
    const activeEd = this.getActiveEditor();
    // Q9: snapshot BEFORE the run — this is the state the learner would want
    // back, and it is what the outcome below annotates.
    const checkpoint = this.snapshotCheckpoint();
    this.note('Running your code...', 'muted');
    this.render();
    const started = Date.now();
    const result = await evaluate(challenge, code);
    result.durationMs = Date.now() - started;
    if (this.current.name !== 'challenge' || !this.state.challenge) return;
    result.review = review(code, challenge.lang || 'js');
    // Q7: mentor-style micro-notes derived from this run (pure helper).
    result.notes = checkNotes({
      results: result.results,
      logs: result.logs,
      code: codeText,
      starter: this.isMultiFile() ? null : challenge.starter,
      hintsShown: this.state.hintsShown,
      solutionShown: this.state.showSolution,
    });
    // Q10 suggest-only formatting: the buffer is left exactly as typed; this
    // note just tells the learner the formatter has work to do.
    const formatted = formatCode(this.activeLang(), codeText);
    this.state.formatHint = formatted && formatted.changed
      ? 'The formatter would rewrite this file - Ctrl+F reformats it in place.'
      : null;
    this.state.results = result;
    this.store.recordAttempt(challengeId, code, result.passed);
    if (checkpoint) {
      const checksPassed = result.results.filter((r) => r.ok).length;
      this.store.updateSnapshot(challengeId, checkpoint.id, {
        passed: result.passed,
        meta: { checksPassed, checksTotal: result.results.length },
      });
      // First passing state of the day becomes the sidecar's ★ entry.
      if (result.passed) this.store.promoteDailyBest(challengeId, checkpoint);
    }
    if (result.passed) {
      // Q5: celebrate streak milestones exactly once (7/30/100 days, new best).
      const milestones = this.settings.takeMilestones(this.stats);
      const milestoneText = milestones.length
        ? ` ★ ${milestones[0].startsWith('streak-')
          ? `${milestones[0].split('-')[1]}-day streak!`
          : milestones[0].startsWith('best-')
            ? `new best streak: ${milestones[0].split('-')[1]} days`
            : milestones[0].replace('module-', '').replace(/-(\d+)$/, ' $1%')}`
        : '';
      this.saveToWorkspace(false);
      this.notifyDone(`Passed: ${challenge.title}`);
      this.sessionPassed.add(challengeId); // Q13
      this.note(`All checks passed. Saved to your workspace - press Ctrl+P to see it.${milestoneText}`, 'good', true);
    } else {
      const failed = result.results.filter((r) => !r.ok).length;
      this.sessionFailures += failed; // Q13
      this.notifyDone(`${failed} check(s) failing in ${challenge.title}`);
      this.note(`${failed} check(s) still failing - read the messages on the left.`, 'bad', true);
    }
    this.state.pane = this.w >= 104 ? 'both' : 'brief';
    this.render();
  }

  /**
   * Vertical caret movement with soft-wrap support (Q11).
   * When settings.editor.wrap is on, up/down move by SCREEN rows (a long
   * logical line occupies several) and the goal column is preserved; the
   * wrap doc comes from the last render. Off = classic line-wise move.
   */
  editorVertical(ed, delta) {
    const wrapOn = this.settings?.data?.editor?.wrap === true;
    // Rebuild from the live buffer every move: the model is derived state and
    // the buffer may have changed since the last render (small files, so the
    // O(n) rebuild is cheaper than staleness bugs).
    const fresh = buildWrapDoc(ed.lines, this.editorWrapWidth());
    if (wrapOn && fresh.totalRows !== fresh.lines.length) {
      moveVertical(ed, fresh, delta);
      this.state.wrapDoc = fresh;
      return;
    }
    move(ed, delta > 0 ? 'down' : 'up');
  }

  /** Wrap column: the editor pane's text width from the last render. */
  editorWrapWidth() {
    return Math.max(20, Math.min(this.state.editorPaneWidth || 80, 120) - 6);
  }

  resetChallenge() {
    const { challenge } = this.state.challenge;
    const ed = this.getActiveEditor();
    if (this.isMultiFile()) {
      // Multi-file: reset only the file in focus, like an editor would.
      const name = this.activeFileName();
      const starters = challenge.files || {};
      setText(ed, starters[name] ?? '');
      this.note(`Reset ${name} to its starting code.`, 'warn');
    } else {
      setText(ed, challenge.starter || '');
      this.note('Editor reset to the starting code.', 'warn');
    }
    this.state.results = null;
    this.state.formatHint = null;
    this.state.pane = this.w >= 104 ? 'both' : 'code';
    this.render();
  }

  /**
   * Q4 caret jump: move the caret to the first failing check's annotated line
   * (results carry `line` via the grade.js seam) and switch to the editor pane.
   * Ctrl+J — a no-op when there is nothing to jump to.
   */
  jumpToFailedCheck() {
    if (this.current?.name !== 'challenge') return;
    const res = this.state.results;
    if (!res || !Array.isArray(res.results)) return;
    const failed = res.results.find((r) => !r.ok && Number.isFinite(r.line) && r.line >= 1);
    if (!failed) {
      this.note('No failing check points at a line.', 'muted');
      this.render();
      return;
    }
    const ed = this.getActiveEditor();
    const row = Math.max(0, Math.min(failed.line - 1, ed.lines.length - 1));
    ed.row = row;
    ed.col = 0;
    ed.goalCol = null;
    if (this.state.pane === 'brief') this.state.pane = this.w >= 104 ? 'both' : 'code';
    this.note(`Jumped to line ${failed.line}.`, 'good');
    this.render();
  }

  /**
   * Q12 bracket match (`editor.bracketMatch`, palette-only for now).
   *
   * `%` itself stays unbound in the classic editor because the editor is
   * modeless: `width: 50%` has to keep typing a percent sign. The vim
   * binding arrives with the Phase 2 editor; the command is here, tested and
   * reachable from the palette in the meantime.
   */
  jumpToMatchingBracket() {
    if (this.current?.name !== 'challenge') {
      this.visibleBell('Bracket matching works inside a challenge.');
      return;
    }
    const ed = this.getActiveEditor();
    if (!ed) return;
    const res = matchBracket(editorText(ed), offsetOf(ed));
    if (!res) {
      this.note('The caret is not on a bracket - put it on or just after one.', 'muted');
      this.render();
      return;
    }
    if (res.unmatched) {
      this.note(`No matching '${res.partner}' for this '${res.char}'.`, 'warn');
      this.render();
      return;
    }
    const { row, col } = rowColOf(ed, res.index);
    ed.row = row;
    ed.col = col;
    ed.goalCol = null;
    if (this.state.pane === 'brief') this.state.pane = this.w >= 104 ? 'both' : 'code';
    this.note(`Matched '${res.char}' with '${res.partner}' on line ${row + 1}.`, 'good');
    this.render();
  }

  revealHint() {
    const { challenge } = this.state.challenge;
    const hints = challenge.hints || [];
    if (this.state.hintsShown >= hints.length) {
      this.note('No more hints - try the solution with Ctrl+G if you are stuck.', 'warn');
      this.render();
      return;
    }
    this.state.hintsShown += 1;
    this.store.useHint(this.state.challenge.id);
    this.state.pane = this.w >= 104 ? 'both' : 'brief';
    
    const currentHint = hints[this.state.hintsShown - 1];
    const level = this.state.hintsShown;
    const label = level === 1 ? 'Conceptual' : level === 2 ? 'Strategic' : 'Code';
    
    this.note(`${label} Hint ${level}/${hints.length}`, 'warn');
    this.render();
  }

  artifactRelPath() {
    const { module, lesson, challenge } = this.state.challenge;
    // Multi-file challenges keep their real file names on disk.
    if (this.isMultiFile()) {
      const name = this.activeFileName() || 'index.html';
      return `${module.id}/${lesson.id}/${challenge.id}/${name}`;
    }
    const ext = { html: 'html', css: 'css', js: 'js', ts: 'ts', sql: 'sql', sh: 'sh', jsx: 'jsx' }[challenge.lang] || 'txt';
    return `${module.id}/${lesson.id}/${challenge.id}.${ext}`;
  }

  saveToWorkspace(notify) {
    const { challenge } = this.state.challenge;
    const rel = this.artifactRelPath();
    let path = artifactPath(rel);
    try {
      if (this.isMultiFile()) {
        // Multi-file: write every file so the folder is runnable on its own.
        const texts = editorTexts(this.state.editors);
        const base = this.artifactRelPath().replace(/[^/]*$/, '');
        for (const [name, text] of Object.entries(texts)) {
          path = saveArtifact(`${base}${name}`, text);
        }
        if (notify) this.note(`Saved ${Object.keys(texts).length} file(s) under ${path.replace(process.cwd() + '/', '')}`, 'good');
      } else {
        const code = editorText(this.getActiveEditor());
        if (challenge.preview) {
          const parts = this.previewParts(code);
          path = writePreview(rel.replace(/\.\w+$/, '.preview.html'), { ...parts, title: challenge.id });
        } else {
          path = saveArtifact(rel, code);
        }
        if (notify) this.note(`Saved to ${path.replace(process.cwd() + '/', '')}`, 'good');
      }
    } catch (err) {
      this.note(`Could not save: ${err.message}`, 'bad');
    }
    if (notify) this.render();
    return path;
  }

  async openInEditor() {
    const rel = this.artifactRelPath();
    const code = editorText(this.getActiveEditor());
    let file;
    try {
      file = saveArtifact(rel, code);
    } catch (err) {
      this.note(`Could not write a temp file: ${err.message}`, 'bad');
      this.render();
      return;
    }
    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    await withTerminalReleased(async () => {
      const { spawn } = await import('node:child_process');
      await new Promise((resolve) => {
        const child = spawn(editor, [file], { stdio: 'inherit' });
        child.on('exit', resolve);
        child.on('error', resolve);
      });
    });
    try {
      const fs = await import('node:fs');
      const updated = fs.readFileSync(file, 'utf8');
      setText(this.getActiveEditor(), updated);
      this.note(`Reloaded from ${editor}.`, 'good');
    } catch {
      this.note('Could not read the file back.', 'bad');
    }
    this.screen.invalidate();
    this.render();
  }

  /** Split the current editor contents into the parts a preview document needs. */
  previewParts(code) {
    return buildPreviewParts(this.state.challenge.challenge, code);
  }

  openPreview() {
    const { challenge } = this.state.challenge;
    const rel = `${this.artifactRelPath().replace(/\.\w+$/, '')}.preview.html`;
    try {
      let parts;
      if (this.isMultiFile()) {
        parts = synthesisParts(editorTexts(this.state.editors));
      } else {
        parts = this.previewParts(editorText(this.getActiveEditor()));
      }
      const path = writePreview(rel, { ...parts, title: challenge.id });
      const opened = openExternally(path);
      this.note(opened ? `Opening ${path.split('/').pop()} in your browser` : `Preview written to ${path}`, opened ? 'good' : 'warn');
    } catch (err) {
      this.note(`Preview failed: ${err.message}`, 'bad');
    }
    this.render();
  }
}