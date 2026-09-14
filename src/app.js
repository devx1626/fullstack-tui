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
import { curriculum, nextLesson, allLessons, totals } from './content/index.js';
import { Store } from './core/store.js';
import { evaluate, review } from './core/grade.js';
import { saveArtifact, writePreview, openExternally, artifactPath } from './core/workspace.js';
import { completionsFor, smartInsert, pairBackspace, normaliseLang } from './core/complete.js';
import { emptyEditor, emptyEditors, editorText, editorTexts, insertChar, insertNewline, backspace, del, move, moveToLineEnd, moveToLineStart, setText, offsetOf, setTextAt } from './views/editor.js';

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
import renderSettings from './views/settings.js';
import { Settings } from './ui/settings.js';
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
      paletteScroll: 0,
    };
    this.quitRequested = false;

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

  flushSession() {
    const elapsed = Math.round((Date.now() - this.sessionStart) / 1000);
    if (elapsed < 5) return;
    this.sessionStart = Date.now();
    this.store.addTime(elapsed);
    this.store.save();
  }

  quit() {
    this.flushSession();
    this.store.save();
    clearInterval(this.timer);
    stopTerminal();
    this.quitRequested = true;
    process.exit(0);
  }

  note(text, kind = 'muted', bold = false) {
    this.state.notice = { text, kind, bold };
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

  /** Resume wherever the learner left off. */
  resumeTarget() {
    for (const { module: mod, lesson } of allLessons()) {
      for (const ch of lesson.challenges) {
        if (!this.store.isPassed(`${lesson.id}.${ch.id}`)) {
          return { lessonId: lesson.id, moduleId: mod.id };
        }
      }
    }
    return null;
  }

  // -- input ----------------------------------------------------------------

  onKey(key) {
    if (key.name === 'ctrl-p') {
      // Inside a challenge Ctrl+P is the documented preview key; everywhere
      // else it opens the command palette.
      if (this.current.name === 'challenge') {
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
      case 'stats':
      case 'help':
      case 'resources':
      case 'workspace':
      case 'settings':
        if (['up', 'down', 'pageup', 'pagedown'].includes(key.name)) {
          const step = key.name === 'pagedown' ? 10 : key.name === 'pageup' ? -10 : key.name === 'up' ? -1 : 1;
          this.state.cursor = Math.max(0, this.state.cursor + step);
          this.render();
        }
        break;
      default:
        break;
    }
  }

  paletteKey(key) {
    if (key.name === 'escape') {
      this.pop();
      return;
    }
    if (key.name === 'enter') {
      const items = this.getPaletteItems();
      const selected = items[this.state.cursor];
      if (!selected) return;
      // Close the palette first so the target screen replaces it on the stack.
      this.pop();
      if (selected.type === 'module') this.openModule(selected.index);
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
    const items = [];
    this.curriculum.forEach((mod, i) => {
      const modSearch = `${mod.title} ${mod.id}`.toLowerCase();
      if (modSearch.includes(query)) {
        items.push({ label: mod.title, type: 'module', index: i });
      }
      mod.lessons.forEach((lesson, li) => {
        const lessonSearch = `${mod.title} ${lesson.title} ${lesson.id}`.toLowerCase();
        if (lessonSearch.includes(query)) {
          items.push({ label: lesson.title, type: 'lesson', moduleIndex: i, lessonIndex: li });
        }
        (lesson.challenges || []).forEach((ch, ci) => {
          const chSearch = `${mod.title} ${lesson.title} ${ch.id}`.toLowerCase();
          if (chSearch.includes(query)) {
            items.push({ label: `${lesson.title} > ${ch.id}`, type: 'challenge', moduleIndex: i, lessonIndex: li, challengeIndex: ci });
          }
        });
      });
    });
    return items;
  }

  /** Q6: dismiss today's at-risk banner ('x' on home). */
  dismissBanner() {
    this.settings.dismissBanner();
    this.note('Banner dismissed for today.', 'muted');
    this.render();
  }

  menuKey(key, length, onEnter) {
    if (length <= 0) return;
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
        return [['j/k', 'move'], ['Enter', 'open'], ['p', 'projects'], ['s', 'settings'], ['?', 'help'], ['q', 'quit']];
      case 'module':
        return [['j/k', 'move'], ['Enter', 'open'], ['Esc', 'back'], ['?', 'help'], ['q', 'quit']];
      case 'lesson':
        return [['j/k', 'scroll'], ['Tab', 'challenges'], ['m', 'mark read'], ['Esc', 'back'], ['q', 'quit']];
      case 'challenge':
        return [['^S', 'check'], ['^Space', 'suggest'], ['^B', 'browser'], ['^R', 'reset'], ['^H', 'hint'], ['^G', 'solution'], ['^P', 'preview'], ['Esc', 'back']];
      case 'projects':
        return [['j/k', 'move'], ['Space', 'tick'], ['Esc', 'back'], ['q', 'quit']];
      case 'stats':
        return [['Esc', 'back'], ['?', 'help'], ['q', 'quit']];
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
    // way an editor's suggestion widget does.
    if (this.state.completion && this.state.pane !== 'brief' && !this.state.showSolution) {
      if (key.name === 'up') return this.moveCompletion(-1);
      if (key.name === 'down') return this.moveCompletion(1);
      if (key.name === 'pageup') return this.moveCompletion(-5);
      if (key.name === 'pagedown') return this.moveCompletion(5);
      if (key.name === 'tab' || key.name === 'enter') return this.acceptCompletion();
      if (key.name === 'escape') {
        this.state.completion = null;
        this.render();
        return;
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
    if (key.name === 'ctrl-r') return this.resetChallenge();
    if (key.name === 'ctrl-h') return this.revealHint();
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
    switch (key.name) {
      case 'char':
        this.typeChar(ed, key.char);
        break;
      case 'space':
        this.typeChar(ed, ' ');
        break;
      case 'enter':
        insertNewline(ed);
        this.state.completion = null;
        break;
      case 'tab':
        insertChar(ed, ' ');
        insertChar(ed, ' ');
        break;
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
        move(ed, 'up');
        break;
      case 'down':
        this.state.completion = null;
        move(ed, 'down');
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

  challengeSolutionLines() {
    const ch = this.state.challenge?.challenge;
    if (!ch) return 0;
    return String(ch.solution || '').split('\n').length;
  }

  // -- completion (IDE-like input) -----------------------------------------

  /** Apply one typed character, with auto-pairing and auto-closed tags. */
  typeChar(ed, ch) {
    const lang = this.activeLang();
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
    else backspace(ed);
    this.refreshCompletion(false);
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

  async checkChallenge() {
    const { challenge, lesson } = this.state.challenge;
    const code = this.state.editors 
      ? editorTexts(this.state.editors) 
      : editorText(this.getActiveEditor());
    const activeEd = this.getActiveEditor();
    this.note('Running your code...', 'muted');
    this.render();
    const result = await evaluate(challenge, code);
    if (this.current.name !== 'challenge' || !this.state.challenge) return;
    result.review = review(code, challenge.lang || 'js');
    this.state.results = result;
    this.store.recordAttempt(`${lesson.id}.${challenge.id}`, code, result.passed);
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
      this.note(`All checks passed. Saved to your workspace - press Ctrl+P to see it.${milestoneText}`, 'good', true);
    } else {
      const failed = result.results.filter((r) => !r.ok).length;
      this.notifyDone(`${failed} check(s) failing in ${challenge.title}`);
      this.note(`${failed} check(s) still failing - read the messages on the left.`, 'bad', true);
    }
    this.state.pane = this.w >= 104 ? 'both' : 'brief';
    this.render();
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
    this.state.pane = this.w >= 104 ? 'both' : 'code';
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