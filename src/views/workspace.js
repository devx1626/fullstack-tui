import { seg, fit } from '../tui/canvas.js';
import { clampRows, sectionLabel, prose } from '../tui/widgets.js';
import { WORKSPACE, listWorkspace } from '../core/workspace.js';

export default function renderWorkspace(app, w, h) {
  const t = app.theme;
  const rows = [];
  const files = listWorkspace();

  rows.push(sectionLabel(t, w, 'Workspace', WORKSPACE.replace(process.env.HOME || '', '~')));
  for (const line of prose(t, w - 2, 'Every challenge you check gets written here as a normal file. This is your portfolio, accumulating one exercise at a time - `cd` into it, open it in a browser, or `git init` it.')) {
    rows.push(fit([seg('  ', {}), ...line], w, { bg: t.bg }));
  }
  rows.push(fit([], w, { bg: t.bg }));

  if (!files.length) {
    rows.push(fit([seg('  Empty so far. Solve a challenge and press Ctrl+O to write it out.', { fg: t.faint })], w, { bg: t.bg }));
    return clampRows(rows, w, h, t);
  }

  rows.push(sectionLabel(t, w, 'Files', `${files.length} artefacts`));
  
  const treeRows = [];
  const dirs = new Set();
  const leafFiles = [];

  files.forEach(file => {
    const parts = file.split('/');
    const name = parts.pop();
    const path = parts.join('/');
    
    if (path) {
      dirs.add(path);
    }
    leafFiles.push({ name, path, full: file });
  });

  // Simple visual tree representation
  const sortedDirs = Array.from(dirs).sort();
  sortedDirs.forEach(dir => {
    treeRows.push(fit([
      seg('  ', {}),
      seg('📁 ', { fg: t.accent }),
      seg(dir, { fg: t.text, bold: true }),
    ], w, { bg: t.bg }));
  });

  leafFiles.forEach(file => {
    const indent = file.path ? '    ' : '  ';
    const prefix = file.path ? '📄 ' : '📄 ';
    treeRows.push(fit([
      seg(indent, {}),
      seg(prefix, { fg: t.faint }),
      seg(file.name, { fg: t.text, bold: file.name.endsWith('.preview.html') ? false : true }),
      seg('  ', { bg: t.bg }),
      seg(file.path, { fg: t.faint }),
    ], w, { bg: t.bg }));
  });

  const room = Math.max(0, h - rows.length - 2);
  const offset = Math.max(0, Math.min(app.state.cursor, Math.max(0, treeRows.length - room)));
  
  rows.push(...treeRows.slice(offset, offset + room));

  if (treeRows.length > room) {
    rows.push(fit([seg(`  ... ${treeRows.length - room} more (scroll with j/k)`, { fg: t.faint })], w, { bg: t.bg }));
  }

  return clampRows(rows, w, h, t);
}
