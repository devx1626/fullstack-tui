import { seg, fit } from '../tui/canvas.js';
import { clampRows, sectionLabel, prose } from '../tui/widgets.js';
import { totals } from '../content/index.js';

export default function renderResources(app, w, h) {
  const t = app.theme;
  const rows = [];
  const overall = totals();

  rows.push(sectionLabel(t, w, 'Primary sources', 'the curriculum below is a re-sequencing of these'));
  for (const line of prose(t, w - 2, '**Dave Gray, Full Course Programming Tutorials** - 88 hours across 14 complete courses, the spine of every module here.')) {
    rows.push(fit([seg('  ', {}), ...line], w, { bg: t.bg }));
  }
  rows.push(fit([
    seg('  ', {}),
    seg('playlist', { fg: t.faint }),
    seg('  https://www.youtube.com/playlist?list=PL0Zuz27SZ-6M1Uopt6_VL3gf3cpMnwavm', { fg: t.accent }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    seg('channel ', { fg: t.faint }),
    seg('  https://www.youtube.com/@DaveGrayTeachesCode', { fg: t.accent }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    seg('roadmaps', { fg: t.faint }),
    seg('  https://roadmap.sh/full-stack', { fg: t.secondary }),
    seg('  (plus the per-topic roadmaps listed below)', { fg: t.muted }),
  ], w, { bg: t.bg }));

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Per module', `${overall.hours} hours of source material`));

  for (const mod of app.curriculum) {
    rows.push(fit([
      seg('  ', {}),
      seg(mod.badge.padEnd(4), { fg: t[mod.color] || t.accent, bold: true }),
      seg(mod.title.padEnd(14), { fg: t.text, bold: true }),
      seg(mod.source.course, { fg: t.muted }),
    ], w, { bg: t.bg }));
    rows.push(fit([
      seg('      ', {}),
      seg(`${mod.source.url || ''}`, { fg: t.accent }),
    ], w, { bg: t.bg }));
    rows.push(fit([
      seg('      ', {}),
      seg(`roadmap ${mod.source.roadmap}`, { fg: t.secondary }),
      seg(`   docs ${mod.source.docs}`, { fg: t.faint }),
    ], w, { bg: t.bg }));
    const extras = (mod.lessons.flatMap((l) => l.resources || [])).slice(0, 3);
    if (extras.length) {
      rows.push(fit([
        seg('      ', {}),
        seg('further: ', { fg: t.faint }),
        seg(extras.map((r) => r.label).join(' | '), { fg: t.muted }),
      ], w, { bg: t.bg }));
    }
    rows.push(fit([], w, { bg: t.bg }));
  }

  rows.push(sectionLabel(t, w, 'Tools worth installing'));
  const tools = [
    ['VS Code + Live Server', 'instant browser reload while you write'],
    ['Chrome / Firefox DevTools', 'the real CSS and JS debugger - press F12'],
    ['Node.js 18+', 'runs the backend modules and this TUI'],
    ['Git', 'version control, module 04'],
    ['DB Browser for SQLite or psql', 'module 07'],
    ['Postman or curl', 'poke your own APIs, module 06'],
  ];
  for (const [tool, why] of tools) {
    rows.push(fit([
      seg('  ', {}),
      seg(tool.padEnd(30), { fg: t.text, bold: true }),
      seg(why, { fg: t.faint }),
    ], w, { bg: t.bg }));
  }

  return clampRows(rows, w, h, t);
}
