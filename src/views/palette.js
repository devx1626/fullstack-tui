import { seg, fit } from '../tui/canvas.js';
import { box, listRows } from '../tui/widgets.js';

/**
 * Command palette (overhaul §10; QoL spec Q2/Q9/Q12).
 *
 * The ITEM LIST comes from `app.getPaletteItems()` — the same array the key
 * handler selects from. A view that rebuilt its own list rendered a different
 * order than Enter acted on (the palette-only commands were missing from the
 * view), so the highlighted row and the executed row could disagree.
 */
export default function renderPalette(app, w, h) {
  const t = app.theme;
  const query = app.state.paletteQuery || '';
  const history = app.state.paletteMode === 'history';
  const items = app.getPaletteItems();

  // Header: a search box in jump mode, a fixed prompt in history mode
  // (Q9 — checkpoints are a short list, not a search problem).
  const searchBar = fit([
    seg(history ? ' ⟲ ' : ' 🔍 ', { fg: t.accent, bg: t.panel }),
    seg(history ? 'Restore a checkpoint - Enter applies it' : (query || 'Type to search...'), { fg: t.text, bg: t.panel }),
    seg(' ', { bg: t.panel }),
    seg(' (ESC to close)', { fg: t.muted, bg: t.panel }),
  ], w);

  const listH = h - 2;
  const results = listRows(t, w - 2, listH, items, app.state.cursor, {
    offset: app.state.paletteScroll || 0,
  });

  return [
    searchBar,
    ...box(t, w, results, { title: history ? 'Checkpoints' : 'Quick Jump', focused: true, minHeight: listH }),
  ];
}
