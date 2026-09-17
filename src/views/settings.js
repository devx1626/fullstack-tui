import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, prose, listRows } from '../tui/widgets.js';
import { WORKSPACE } from '../core/workspace.js';
import { preferenceRows } from '../ui/preferences.js';

/**
 * The preference rows, in order — the single source of truth for both the
 * renderer and the key handler, which acts on `key` instead of a magic index
 * (and clamps the cursor to this list's length).
 *
 * The rows themselves now live in `src/ui/preferences.js` so the next-UI
 * settings screen cannot document different rows or different toggles; this
 * wrapper only supplies the classic app's own Settings instance.
 */
export function settingsRows(app) {
  return preferenceRows({ settings: app.settings, workspace: WORKSPACE });
}

export default function renderSettings(app, w, h) {
  const t = app.theme;
  const rows = [];

  // 1. Navigation Help Section
  rows.push(sectionLabel(t, w, 'How to Navigate', 'The TUI Guide'));
  
  const guide = [
    ['Ctrl + P', 'Open Command Palette (Quick Jump to any lesson/challenge)', 'accent'],
    ['Ctrl + S', 'Run checks on your current code', 'good'],
    ['Ctrl + H', 'Reveal the next tier of hints', 'warn'],
    ['Ctrl + G', 'Toggle Solution view (press again for Diff mode)', 'secondary'],
    ['Ctrl + B', 'Open the built-in Browser/Console', 'accent'],
    ['Ctrl + Space', 'Trigger code completions', 'muted'],
    ['Ctrl + E', 'Open current file in your system editor', 'muted'],
    ['Ctrl + O', 'Save current attempt to workspace', 'muted'],
    ['Ctrl + T', 'Toggle console logs in editor', 'muted'],
    ['Esc', 'Go back to previous screen', 'muted'],
    ['j / k', 'Move cursor / Scroll', 'muted'],
    ['Enter', 'Select / Open', 'muted'],
  ];

  // Render guide as a list of rows
  guide.forEach(([key, desc, color]) => {
    rows.push(fit([
      seg(key.padEnd(12), { fg: t[color] || t.accent, bold: true }),
      seg('  ', {}),
      seg(desc, { fg: t.text }),
    ], w, { bg: t.bg }));
  });

  rows.push(fit([], w, { bg: t.bg }));

  // 2. Settings Options Section
  rows.push(sectionLabel(t, w, 'App Settings', 'Preferences'));
  
  const settings = settingsRows(app);

  const rows2 = listRows(t, w - 2, 10, settings.map(s => ({
    label: s.label,
    right: s.value,
    marker: '⚙',
    markerColor: 'accent'
  })), app.state.cursor);

  rows.push(...box(t, w, rows2, { title: 'Configuration', focused: false, minHeight: 5 }));

  return clampRows(rows, w, h, t);
}
