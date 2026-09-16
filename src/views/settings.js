import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, prose, listRows } from '../tui/widgets.js';
import { WORKSPACE } from '../core/workspace.js';

/**
 * The preference rows, in order — the single source of truth for both the
 * renderer and the key handler, which acts on `key` instead of a magic index
 * (and clamps the cursor to this list's length).
 */
export function settingsRows(app) {
  const home = process.env.HOME || '';
  const sound = (app.settings?.data?.sound ?? 'bell') === 'off' ? 'Off' : 'Bell';
  const wrap = (app.settings?.data?.editor?.wrap ?? false) ? 'On' : 'Off';
  const tabSize = app.tabSize ? app.tabSize() : 2;
  return [
    { label: 'Theme', value: 'Auto-detected', key: 'theme' },
    { label: 'Sound', value: `${sound}  (Space to toggle)`, key: 'sound' },
    { label: 'Soft wrap', value: `${wrap}  (Space to toggle)`, key: 'wrap' },
    { label: 'Tab size', value: `${tabSize} spaces  (Space to cycle)`, key: 'tabSize' },
    { label: 'Workspace', value: WORKSPACE.replace(home, '~'), key: 'workspace' },
    { label: 'Editor', value: process.env.EDITOR || process.env.VISUAL || 'vi', key: 'editor' },
  ];
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
