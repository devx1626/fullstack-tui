import { seg, fit } from '../tui/canvas.js';
import { clampRows, sectionLabel, prose, codeBlock, meter } from '../tui/widgets.js';
import { nextLesson } from '../content/index.js';

const indent = (theme, w, rows) => rows.map((r) => fit([seg('  ', { bg: theme.bg }), ...r], w, { bg: theme.bg }));

/**
 * Build the full lesson document plus the row index of every challenge entry so
 * the app can scroll straight to a focused challenge.
 */
export function buildLesson(app, w) {
  const t = app.theme;
  const mod = app.curriculum[app.state.moduleIndex];
  const lesson = mod.lessons[app.state.lessonIndex];
  const rows = [];
  const challengeRows = [];

  rows.push(fit([
    seg('  ', {}),
    seg(` ${mod.badge} `, { fg: t.bg, bg: t[mod.color] || t.accent, bold: true }),
    seg(`  ${mod.title}`, { fg: t.muted }),
    seg('  /  ', { fg: t.faint }),
    seg(`${String(app.state.lessonIndex + 1).padStart(2, '0')} `, { fg: t.faint }),
    seg(lesson.title, { fg: t.text, bold: true }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    seg(`~${lesson.minutes} minutes`, { fg: t.faint }),
    seg(app.store.isLessonRead(lesson.id) ? '   ✓ marked read' : '   press m when you have finished reading', { fg: app.store.isLessonRead(lesson.id) ? t.good : t.faint }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  if (lesson.objectives && lesson.objectives.length) {
    rows.push(sectionLabel(t, w, 'What you will be able to do'));
    for (const o of lesson.objectives) {
      rows.push(fit([seg('    → ', { fg: t.accent }), seg(o, { fg: t.text })], w, { bg: t.bg }));
    }
    rows.push(fit([], w, { bg: t.bg }));
  }

  (lesson.sections || []).forEach((section, i) => {
    rows.push(sectionLabel(t, w, section.heading, i === (lesson.sections || []).length - 1 ? 'worked example' : ''));
    for (const chunk of String(section.body || '').split('\n\n')) {
      if (!chunk.trim()) continue;
      for (const line of prose(t, w - 4, chunk)) rows.push(fit([seg('  ', {}), ...line], w, { bg: t.bg }));
      rows.push(fit([], w, { bg: t.bg }));
    }
    if (section.code) {
      rows.push(...indent(t, w, codeBlock(t, w - 4, section.code.source, section.code.lang, { title: section.code.caption })));
      rows.push(fit([], w, { bg: t.bg }));
    }
  });

  if (lesson.pitfalls && lesson.pitfalls.length) {
    rows.push(sectionLabel(t, w, 'Common mistakes', 'every one of these has cost someone an afternoon'));
    for (const p of lesson.pitfalls) {
      for (const line of prose(t, w - 6, p)) rows.push(fit([seg('    ✗ ', { fg: t.bad }), ...line], w, { bg: t.bg }));
    }
    rows.push(fit([], w, { bg: t.bg }));
  }

  if (lesson.keyPoints && lesson.keyPoints.length) {
    rows.push(sectionLabel(t, w, 'Cheat sheet'));
    for (const k of lesson.keyPoints) {
      for (const line of prose(t, w - 6, k)) rows.push(fit([seg('    • ', { fg: t.secondary }), ...line], w, { bg: t.bg }));
    }
    rows.push(fit([], w, { bg: t.bg }));
  }

  rows.push(sectionLabel(t, w, 'Practice', 'Tab then Enter, or just press Enter'));
  const ids = (lesson.challenges || []).map((c) => `${lesson.id}.${c.id}`);
  const passed = ids.filter((id) => app.store.isPassed(id)).length;
  rows.push(fit([
    seg('  ', {}),
    ...meter(t, Math.max(14, Math.floor(w * 0.3)), passed, ids.length),
    seg(`   ${passed}/${ids.length} solved here`, { fg: t.muted }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  (lesson.challenges || []).forEach((ch, i) => {
    const id = `${lesson.id}.${ch.id}`;
    const solved = app.store.isPassed(id);
    const rec = app.store.challengeRecord(id);
    const active = i === app.state.lessonFocus;
    const bg = active ? t.panelAlt : t.bg;
    challengeRows.push(rows.length);
    rows.push(fit([
      seg(active ? ' ▸ ' : '   ', { fg: active ? t.accent : t.faint, bg, bold: active }),
      seg(solved ? '✓ ' : '· ', { fg: solved ? t.good : t.border, bg, bold: true }),
      seg(ch.kind === 'debug' ? 'DEBUG ' : 'WRITE ', { fg: ch.kind === 'debug' ? t.warn : t.accent, bg, bold: true }),
      seg(ch.id.padEnd(22).slice(0, 22), { fg: active ? t.text : t.text, bg, bold: active }),
      seg(ch.difficulty.padEnd(8), { fg: t.faint, bg }),
      seg(`${ch.minutes}m`, { fg: t.faint, bg }),
      seg(solved ? `   solved in ${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'}` : '   not solved yet', { fg: solved ? t.muted : t.faint, bg }),
    ], w, { bg }));
    const firstLine = String(ch.prompt).split('\n')[0].replace(/\*\*/g, '');
    for (const line of prose(t, w - 8, firstLine, { fg: t.faint })) {
      rows.push(fit([seg('       ', {}), ...line], w, { bg: t.bg }));
    }
    rows.push(fit([], w, { bg: t.bg }));
  });

  if (lesson.resources && lesson.resources.length) {
    rows.push(sectionLabel(t, w, 'Go deeper'));
    for (const r of lesson.resources) {
      rows.push(fit([
        seg('    ', {}),
        seg(r.label, { fg: t.text }),
        seg('   ' + r.url, { fg: t.faint }),
      ], w, { bg: t.bg }));
    }
    rows.push(fit([], w, { bg: t.bg }));
  }

  const next = nextLesson(lesson.id);
  if (next) {
    rows.push(fit([
      seg('  ', {}),
      seg('Next: ', { fg: t.faint }),
      seg(`${next.module.title} > ${next.lesson.title}`, { fg: t.secondary }),
      seg('   press n to jump straight there', { fg: t.faint }),
    ], w, { bg: t.bg }));
  }

  return { rows, challengeRows, lesson, mod };
}

export default function renderLesson(app, w, h) {
  const t = app.theme;
  const { rows } = buildLesson(app, w);
  const maxScroll = Math.max(0, rows.length - h);
  const offset = Math.max(0, Math.min(app.state.lessonScroll, maxScroll));
  app.state.lessonScroll = offset;

  const visible = rows.slice(offset, offset + h);
  const position = `${offset + 1}-${Math.min(rows.length, offset + h)} of ${rows.length}`;
  const header = fit([
    seg('  ', {}),
    seg(position, { fg: t.faint }),
    seg(`   ${maxScroll > 0 ? `${Math.round((offset / maxScroll) * 100)}%` : '100%'}`, { fg: t.border }),
  ], w, { bg: t.bg });

  return clampRows([header, ...visible.slice(0, h - 1)], w, h, t);
}
