import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, prose } from '../tui/widgets.js';

import { HELP_SECTIONS, HELP_NOTES } from '../core/help.js';

/**
 * The manual's content lives in core/help.js so the next UI renders the same
 * sections (and neither can drift). This view only lays it out.
 */
function keyTable(theme, w, rows) {
  return rows.map(([key, label]) => fit([
    seg('  ', {}),
    seg(key.padEnd(12), { fg: theme.accent, bold: true }),
    seg(label, { fg: theme.text }),
  ], w, { bg: theme.bg }));
}

export default function renderHelp(app, w, h) {
  const t = app.theme;
  const rows = [];

  HELP_SECTIONS.forEach((s, i) => {
    if (i > 0) rows.push(fit([], w, { bg: t.bg }));
    rows.push(sectionLabel(t, w, s.title, s.hint || undefined));
    rows.push(...keyTable(t, w, s.rows));
  });

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'How this works'));
  for (const note of HELP_NOTES) {
    rows.push(...prose(t, w - 2, note).map((line) => fit([seg('  ', {}), ...line], w, { bg: t.bg })));
  }

  return clampRows(rows, w, h, t);
}
