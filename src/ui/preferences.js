/**
 * Preferences shared by both UIs (overhaul task 1.4 — the settings port).
 *
 * The classic canvas settings view (`src/views/settings.js`), the classic App's
 * Space handler (`App.toggleSetting`) and the next-UI Ink settings screen
 * (`src/ui/screens/settings.jsx`) all read their rows and mutate
 * `.data/settings.json` through THIS module. A port can therefore never
 * disagree with the original about which rows exist, what they say, or what a
 * toggle does — the same single-source rule `src/core/help.js` applies to the
 * key list.
 *
 * Everything here is pure except `togglePreference`, which mutates the passed
 * Settings instance and saves it (identical behavior to the classic handler).
 */
import { WORKSPACE } from '../core/workspace.js';
import { themes } from './theme/themes.js';
import { ICON_CHOICES, ICON_SETS, iconSetLabel, nextIconSet, normalizeIconSet } from './theme/icons.js';

/** Selectable indent widths, cycled in order (classic: {2:4, 4:8, 8:2}). */
export const TAB_SIZES = [2, 4, 8];

// ---------------------------------------------------------------------------
// Theme picker (overhaul §7.2 / Phase 4 theme set)
// ---------------------------------------------------------------------------

/** The built-in palettes, in cycle order, from the single source of truth. */
export const THEME_NAMES = Object.keys(themes);

/** `null` (Auto) is the leading stop of the picker, then each palette. */
export const THEME_CYCLE = [null, ...THEME_NAMES];

/** Canonical lowercase theme name, or null when unset/unknown (i.e. Auto). */
export function normalizeTheme(name) {
  const n = String(name || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(themes, n) ? n : null;
}

/** Display label: the palette name, or "Auto" when following the terminal. */
export function themeLabel(name) {
  const n = normalizeTheme(name);
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Auto';
}

/** The next stop from `name`, wrapping Auto → first palette → … → Auto. */
export function nextTheme(name) {
  const at = THEME_CYCLE.indexOf(normalizeTheme(name));
  return THEME_CYCLE[(at + 1) % THEME_CYCLE.length];
}

function themeMessage(next) {
  // Deliberately does not claim "live preview": the Ink UI re-themes instantly
  // (its row hint says so), but the classic canvas UI only persists the choice.
  return next
    ? `Theme: ${themeLabel(next)} — saved to settings.json.`
    : 'Theme: Auto — follows the terminal background.';
}

function persist(settings) {
  if (settings && typeof settings.save === 'function') settings.save();
}

/**
 * Step the picker by `dir` (+1 next, -1 previous) and persist. Shares the
 * cycling table with Space, so the arrow keys and the toggle can never land on
 * different themes. Returns the same shape as `togglePreference`.
 */
export function stepTheme(settings, dir = 1) {
  const at = THEME_CYCLE.indexOf(normalizeTheme(settings && settings.data && settings.data.theme));
  const next = THEME_CYCLE[(at + dir + THEME_CYCLE.length) % THEME_CYCLE.length];
  if (settings && settings.data) {
    settings.data.theme = next;
    persist(settings);
  }
  return { changed: true, kind: 'good', theme: next, message: themeMessage(next) };
}

// ---------------------------------------------------------------------------
// Icon-set picker (overhaul §7.1, Phase 4 icon pass)
// ---------------------------------------------------------------------------

/** Picker stops: 'auto', then the three glyph sets. */
export const ICON_CYCLE = ICON_CHOICES;

function iconMessage(next) {
  return next === 'auto'
    ? 'Icons: Auto — follows the terminal font.'
    : `Icons: ${iconSetLabel(next)} glyphs — saved to settings.json.`;
}

/** Step the icon picker (Space and the arrows share this table). */
export function stepIcons(settings, dir = 1) {
  const order = ICON_CYCLE;
  const at = order.indexOf(normalizeIconSet(settings && settings.data && settings.data.icons));
  const next = order[(at + dir + order.length) % order.length];
  if (settings && settings.data) {
    settings.data.icons = next;
    persist(settings);
  }
  return { changed: true, kind: 'good', icons: next, message: iconMessage(next) };
}

/** Indent width from settings, clamped so a hand-edited file can't wedge the editor. */
export function clampTabSize(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(2, Math.min(8, Math.round(v))) : 2;
}

/** The next width Space lands on from `n` (wraps 8 → 2). */
export function nextTabSize(n) {
  const at = TAB_SIZES.indexOf(clampTabSize(n));
  return TAB_SIZES[(at + 1) % TAB_SIZES.length];
}

const editorPrefs = (settings) => (settings && settings.data && settings.data.editor) || {};

/**
 * Rows for the settings screen, in display order — the single source of truth
 * for both renderers and both key handlers (which act on `key`, never a magic
 * index, so inserting rows can never rewire the toggles).
 *
 * `value` is the display string (the classic view puts it in a right column);
 * `hint` is the same affordance separated out for the Ink screen; `toggleable`
 * tells a renderer whether Space does anything on this row.
 */
export function preferenceRows({ settings, env = process.env, workspace = WORKSPACE, icons = ICON_SETS.unicode } = {}) {
  const data = (settings && settings.data) || {};
  const editor = editorPrefs(settings);
  const theme = themeLabel(data.theme);
  const sound = (data.sound ?? 'bell') === 'off' ? 'Off' : 'Bell';
  const wrap = editor.wrap === true ? 'On' : 'Off';
  const tabSize = clampTabSize(editor.tabSize);
  const home = env.HOME || '';
  return [
    { key: 'theme', label: 'Theme', value: `${theme}  (Space to cycle)`, hint: `Space or ${icons.arrowLeft}/${icons.arrowRight} cycles ${icons.bullet} live preview ${icons.bullet} saved to settings.json`, toggleable: true },
    { key: 'icons', label: 'Icons', value: `${iconSetLabel(data.icons)}  (Space to cycle)`, hint: `Space or ${icons.arrowLeft}/${icons.arrowRight} cycles ${icons.bullet} live preview ${icons.bullet} nerd/unicode/ascii glyphs`, toggleable: true },
    { key: 'sound', label: 'Sound', value: `${sound}  (Space to toggle)`,    hint: 'Space to toggle', toggleable: true },
    { key: 'wrap', label: 'Soft wrap', value: `${wrap}  (Space to toggle)`, hint: 'Space to toggle', toggleable: true },
    { key: 'tabSize', label: 'Tab size', value: `${tabSize} spaces  (Space to cycle)`, hint: 'Space to cycle', toggleable: true },
    { key: 'workspace', label: 'Workspace', value: String(workspace).replace(home, '~'), hint: 'set by the environment', toggleable: false },
    { key: 'editor', label: 'Editor', value: env.EDITOR || env.VISUAL || 'vi', hint: 'set by $EDITOR', toggleable: false },
  ];
}

/**
 * The Vim row the next UI adds on top of the shared rows: the classic canvas
 * editor has no modes, so showing it there would be a lie.
 */
export function vimPreferenceRow({ settings, icons = ICON_SETS.unicode } = {}) {
  const on = editorPrefs(settings).vimMode !== false;
  return {
    key: 'vimMode',
    label: 'Vim keys',
    value: `${on ? 'On' : 'Off'}  (Space to toggle)`,
    hint: `Space to toggle ${icons.bullet} used by the Phase 2 editor`,
    toggleable: true,
  };
}

/**
 * Act on the focused row's key. Mutates `settings.data` and saves, exactly like
 * the classic handler (same messages, same kinds), and reports what happened so
 * the caller only has to display it.
 *
 * @returns {{ changed: boolean, message: string, kind: 'good'|'muted' }}
 */
export function togglePreference(settings, key) {
  const data = (settings && settings.data) || {};
  data.editor = data.editor || {};
  // Test doubles and the piped path have no save(); never let persistence kill
  // a toggle (same policy as Settings.save itself).
  const save = () => persist(settings);
  switch (key) {
    case 'theme': {
      const next = nextTheme(data.theme);
      data.theme = next;
      save();
      return { changed: true, kind: 'good', theme: next, message: themeMessage(next) };
    }
    case 'icons': {
      const next = nextIconSet(data.icons);
      data.icons = next;
      save();
      return { changed: true, kind: 'good', icons: next, message: iconMessage(next) };
    }
    case 'sound': {
      data.sound = (data.sound ?? 'bell') === 'off' ? 'bell' : 'off';
      save();
      return {
        changed: true,
        kind: 'good',
        message: data.sound === 'off'
          ? 'Sound notifications off.'
          : 'Sound notifications on (bell + desktop notify).',
      };
    }
    case 'wrap': {
      data.editor.wrap = !(data.editor.wrap === true);
      save();
      return {
        changed: true,
        kind: 'good',
        message: data.editor.wrap
          ? 'Soft wrap on — long lines fold to the editor width.'
          : 'Soft wrap off — long lines scroll horizontally.',
      };
    }
    case 'tabSize': {
      const next = nextTabSize(data.editor.tabSize);
      data.editor.tabSize = next;
      save();
      return { changed: true, kind: 'good', message: `Indent is now ${next} spaces.` };
    }
    case 'vimMode': {
      data.editor.vimMode = data.editor.vimMode === false;
      save();
      return {
        changed: true,
        kind: 'good',
        message: data.editor.vimMode
          ? 'Vim keys on — the Phase 2 editor starts in normal mode.'
          : 'Vim keys off — the Phase 2 editor uses the simpler modeless keys.',
      };
    }
    default:
      return {
        changed: false,
        kind: 'muted',
        message: 'This row is set by the environment, not by a toggle - see ? for the key list.',
      };
  }
}
