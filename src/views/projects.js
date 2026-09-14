import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, meter, prose, codeBlock } from '../tui/widgets.js';

export default function renderProjects(app, w, h) {
  const t = app.theme;
  const rows = [];
  const projects = app.curriculum.filter((m) => m.project);
  if (!projects.length) return clampRows([seg('No projects defined.', { fg: t.faint })], w, h, t);

  const index = Math.max(0, Math.min(app.state.cursor, projects.length - 1));
  const mod = projects[index];
  const project = mod.project;
  const checks = project.checks || [];
  const ticked = app.store.projectProgress(project.id, checks);
  const inChecks = app.state.focus === 'checks';

  rows.push(fit([
    seg('  ', {}),
    seg(`☆ `, { fg: t.star, bold: true }),
    seg(project.title, { fg: t.text, bold: true }),
    seg(`   from the ${mod.title} module`, { fg: t.faint }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    seg(`project ${index + 1} of ${projects.length}`, { fg: t.faint }),
    seg('   j/k switches project', { fg: t.faint }),
    seg('   Tab focuses the checklist, Space ticks an item', { fg: t.faint }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    ...meter(t, Math.max(16, Math.floor(w * 0.4)), ticked, checks.length),
    seg(`   ${ticked}/${checks.length} requirements ticked`, { fg: ticked === checks.length ? t.good : t.muted }),
    seg(`   ~${project.minutes} min`, { fg: t.faint }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  rows.push(sectionLabel(t, w, 'Brief'));
  for (const line of prose(t, w - 4, project.brief)) {
    rows.push(fit([seg('  ', {}), ...line], w, { bg: t.bg }));
  }
  rows.push(fit([], w, { bg: t.bg }));

  if (project.starter) {
    rows.push(sectionLabel(t, w, 'Suggested starting point'));
    rows.push(...codeBlock(t, w - 4, project.starter, 'text', { lineNumbers: false }).map((r) => fit([seg('  ', {}), ...r], w, { bg: t.bg })));
    rows.push(fit([], w, { bg: t.bg }));
  }

  rows.push(sectionLabel(t, w, 'Definition of done', inChecks ? 'Space to tick' : 'Tab to focus and tick'));
  checks.forEach((check, i) => {
    const id = `${project.id}.${i}`;
    const done = !!app.store.projectRecord(project.id).checks[id];
    const active = inChecks && i === app.state.projectCheckCursor;
    const bg = active ? t.panelAlt : t.bg;
    rows.push(fit([
      seg('  ', { bg }),
      seg(done ? '[✓] ' : '[ ] ', { fg: done ? t.good : t.border, bg, bold: true }),
      seg(check, { fg: done ? t.muted : t.text, bg, bold: active }),
    ], w, { bg }));
  });

  if (project.stretch && project.stretch.length) {
    rows.push(fit([], w, { bg: t.bg }));
    rows.push(sectionLabel(t, w, 'Stretch goals', 'optional, but this is where the learning compounds'));
    for (const s of project.stretch) {
      rows.push(fit([
        seg('    + ', { fg: t.secondary }),
        seg(s, { fg: t.muted }),
      ], w, { bg: t.bg }));
    }
  }

  return clampRows(rows, w, h, t);
}
