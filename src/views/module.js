import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, meter, prose } from '../tui/widgets.js';

function lessonStatus(app, lesson) {
  const ids = (lesson.challenges || []).map((c) => `${lesson.id}.${c.id}`);
  const passed = ids.filter((id) => app.store.isPassed(id)).length;
  if (passed === 0 && !app.store.isLessonRead(lesson.id)) return { mark: '○', color: 'faint', passed };
  if (passed === ids.length && ids.length > 0) return { mark: '✓', color: 'good', passed };
  return { mark: '●', color: 'warn', passed };
}

export default function renderModule(app, w, h) {
  const t = app.theme;
  const mod = app.curriculum[app.state.moduleIndex];
  if (!mod) return clampRows([], w, h, t);

  const rows = [];
  const stats = app.stats.perModule.find((m) => m.id === mod.id) || { challengesPassed: 0, challenges: 0, percent: 0, lessonsRead: 0, lessons: mod.lessons.length };

  rows.push(fit([
    seg('  ', {}),
    seg(` ${mod.badge} `, { fg: t.bg, bg: t[mod.color] || t.accent, bold: true }),
    seg('  ' + mod.title, { fg: t.text, bold: true }),
    seg('   ' + mod.tagline, { fg: t.muted }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    seg(mod.source.course, { fg: t.faint }),
    seg(`   ~${mod.hours}h of source material`, { fg: t.faint }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  for (const line of prose(t, w - 4, mod.why)) {
    rows.push(fit([seg('  ', {}), ...line], w, { bg: t.bg }));
  }
  rows.push(fit([], w, { bg: t.bg }));

  rows.push(fit([
    seg('  ', {}),
    ...meter(t, Math.max(16, Math.floor(w * 0.35)), stats.challengesPassed, stats.challenges),
    seg(`   ${stats.challengesPassed}/${stats.challenges} challenges`, { fg: t.muted }),
    seg(`   ${stats.lessonsRead}/${stats.lessons} lessons read`, { fg: t.faint }),
    seg(`   ${stats.percent}%`, { fg: stats.percent === 100 ? t.good : t.accent, bold: true }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  rows.push(sectionLabel(t, w, 'Lessons', 'Enter opens the highlighted row'));

  const entries = mod.lessons.length + (mod.project ? 1 : 0);
  const listStart = rows.length;
  mod.lessons.forEach((lesson, i) => {
    const st = lessonStatus(app, lesson);
    const active = i === app.state.cursor;
    const bg = active ? t.panelAlt : t.bg;
    rows.push(fit([
      seg(active ? ' ▸ ' : '   ', { fg: active ? t.accent : t.faint, bg, bold: active }),
      seg(st.mark + ' ', { fg: t[st.color], bg, bold: true }),
      seg(String(i + 1).padStart(2, '0') + '  ', { fg: t.faint, bg }),
      seg(lesson.title.padEnd(38).slice(0, 38), { fg: active ? t.text : t.text, bg, bold: active }),
      seg(`${lesson.minutes} min`, { fg: t.faint, bg }),
      seg(`   ${(lesson.challenges || []).length} challenges`, { fg: t.muted, bg }),
      seg(`   ${st.passed}/${(lesson.challenges || []).length} done`, { fg: st.passed === (lesson.challenges || []).length ? t.good : t.faint, bg }),
    ], w, { bg }));
  });

  if (mod.project) {
    const i = mod.lessons.length;
    const active = i === app.state.cursor;
    const bg = active ? t.panelAlt : t.bg;
    const done = app.store.projectProgress(mod.project.id, mod.project.checks || []);
    rows.push(fit([
      seg(active ? ' ▸ ' : '   ', { fg: active ? t.secondary : t.faint, bg, bold: active }),
      seg('★ ', { fg: t.star, bg, bold: true }),
      seg('CP  ', { fg: t.faint, bg }),
      seg(mod.project.title.slice(0, 38).padEnd(38), { fg: active ? t.text : t.text, bg, bold: active }),
      seg(`${mod.project.minutes} min`, { fg: t.faint, bg }),
      seg('   capstone', { fg: t.secondary, bg }),
      seg(`   ${done}/${(mod.project.checks || []).length} ticked`, { fg: done === (mod.project.checks || []).length && done ? t.good : t.faint, bg }),
    ], w, { bg }));
  }

  const used = rows.length - listStart;
  const free = h - rows.length - 6;
  for (let i = 0; i < Math.max(0, free - 0); i += 1) rows.push(fit([], w, { bg: t.bg }));

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Study plan for this module'));
  rows.push(fit([
    seg('  ', {}),
    seg('1. ', { fg: t.accent, bold: true }),
    seg('Read the lesson. ', { fg: t.muted }),
    seg('2. ', { fg: t.accent, bold: true }),
    seg('Fix the debug challenge. ', { fg: t.muted }),
    seg('3. ', { fg: t.accent, bold: true }),
    seg('Write the code challenge from scratch. ', { fg: t.muted }),
    seg('4. ', { fg: t.accent, bold: true }),
    seg('Push the artefact into your real project.', { fg: t.muted }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Sources'));
  rows.push(fit([
    seg('  course  ', { fg: t.faint }),
    seg(mod.source.url, { fg: t.accent }),
    seg('   roadmap ', { fg: t.faint }),
    seg(mod.source.roadmap, { fg: t.secondary }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  docs    ', { fg: t.faint }),
    seg(mod.source.docs, { fg: t.accent }),
  ], w, { bg: t.bg }));

  return clampRows(rows, w, h, t);
}
