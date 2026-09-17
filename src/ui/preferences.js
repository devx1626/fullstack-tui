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

/** Selectable indent widths, cycled in order (classic: {2:4, 4:8, 8:2}). */
export const TAB_SIZES = [2, 4, 8];

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
export function preferenceRows({ settings, env = process.env, workspace = WORKSPACE } = {}) {
  const data = (settings && settings.data) || {};
  const editor = editorPrefs(settings);
  const sound = (data.sound ?? 'bell') === 'off' ? 'Off' : 'Bell';
  const wrap = editor.wrap === true ? 'On' : 'Off';
  const tabSize = clampTabSize(editor.tabSize);
  const home = env.HOME || '';
  return [
    { key: 'theme', label: 'Theme', value: 'Auto-detected', hint: 'set by the terminal', toggleable: false },
    { key: 'sound', label: 'Sound', value: `${sound}  (Space to toggle)`, hint: 'Space to toggle', toggleable: true },
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
export function vimPreferenceRow({ settings } = {}) {
  const on = editorPrefs(settings).vimMode !== false;
  return {
    key: 'vimMode',
    label: 'Vim keys',
    value: `${on ? 'On' : 'Off'}  (Space to toggle)`,
    hint: 'Space to toggle · used by the Phase 2 editor',
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
  const save = () => { if (settings && typeof settings.save === 'function') settings.save(); };
  switch (key) {
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
