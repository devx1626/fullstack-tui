import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, meter, statChips, sparkline } from '../tui/widgets.js';
import { allLessons } from '../content/index.js';

function moduleRow(theme, w, mod, stats, active) {
  const bg = active ? theme.panelAlt : theme.bg;
  const meterW = 14;
  const counts = `${String(stats.challengesPassed).padStart(2)}/${String(stats.challenges).padEnd(2)}`;
  const pct = `${String(stats.percent).padStart(3)}%`;
  const fixed = 3 + 4 + 2 + meterW + 2 + counts.length + 2 + pct.length + 1;
  const tagW = Math.max(0, w - fixed - 14);
  const tag = mod.tagline && tagW > 12 ? mod.tagline.slice(0, tagW - 1) : '';

  const segs = [
    seg(active ? ' ▸ ' : '   ', { fg: active ? theme.accent : theme.faint, bg, bold: active }),
    seg(mod.badge.padEnd(3), { fg: theme[mod.color] || theme.accent, bg, bold: true }),
    seg(' ' + mod.title, { fg: active ? theme.text : theme.text, bg, bold: active }),
  ];
  const titleUsed = 4 + 1 + mod.title.length;
  if (tag) {
    segs.push(seg(' '.repeat(Math.max(1, 14 - mod.title.length)) + tag, { fg: theme.faint, bg }));
  } else {
    segs.push(seg(' '.repeat(Math.max(1, w - fixed - titleUsed)), { bg }));
  }
  segs.push(seg(' ', { bg }));
  segs.push(...meter(theme, meterW, stats.challengesPassed, stats.challenges));
  segs.push(seg('  ' + counts + '  ' + pct, { fg: stats.percent === 100 ? theme.good : theme.muted, bg }));
  return fit(segs, w, { bg });
}

export default function renderHome(app, w, h) {
  const t = app.theme;
  const rows = [];
  const { totals: t2, perModule } = app.stats;
  const overall = app.totals;
  const statsById = Object.fromEntries(perModule.map((m) => [m.id, m]));

  rows.push(fit([
    seg("  Let's build. ", { fg: t.text, bold: true }),
    seg(`${overall.modules} modules from HTML to deployment, `, { fg: t.muted }),
    seg(`${overall.challenges} graded challenges`, { fg: t.accent }),
    seg(' - most of them are bugs to hunt.', { fg: t.muted }),
  ], w, { bg: t.bg }));

  const resume = app.resumeTarget();
  if (resume) {
    const entry = allLessons().find((e) => e.lesson.id === resume.lessonId);
    const lesson = entry.lesson;
    const ch = (lesson.challenges || []).find((c) => !app.store.isPassed(`${lesson.id}.${c.id}`));
    rows.push(fit([
      seg('  Next up: ', { fg: t.faint }),
      seg(`${entry.module.title}`, { fg: t.secondary, bold: true }),
      seg('  >  ', { fg: t.faint }),
      seg(lesson.title, { fg: t.text }),
      seg(`  >  ${ch ? ch.id : ''}`, { fg: t.accent }),
      seg(ch ? `  (${ch.kind})` : '', { fg: t.faint }),
    ], w, { bg: t.bg }));
  } else {
    rows.push(fit([seg('  Every challenge is solved. Go build something nobody asked you to build.', { fg: t.good, bold: true })], w, { bg: t.bg }));
  }

  rows.push(fit([], w, { bg: t.bg }));

  const streak = app.stats.streak || t2.streak || { current: 0, best: 0 };
  rows.push(statChips(t, w, [
    ['day streak', streak.current, streak.current > 0 ? 'good' : 'muted'],
    ['best', streak.best, 'muted'],
    ['minutes today', app.store.todayMinutes(), 'accent'],
    ['this week', `${app.store.weekMinutes()}m`, 'muted'],
    ['solved', `${t2.challengesPassed}/${t2.challenges}`, t2.challengesPassed === t2.challenges ? 'good' : 'accent'],
    ['debug fixes', `${t2.debugPassed}/${t2.debug}`, 'secondary'],
    ['files written', `${t2.writePassed}`, 'star'],
  ]));
  rows.push(sparkline(t, w, app.store.activity(21)));
  rows.push(fit([], w, { bg: t.bg }));

  const boxHeight = Math.max(4, h - rows.length);
  const inner = [sectionLabel(t, w - 2, 'Modules', 'j/k to move, Enter to open')];
  const listHeight = Math.max(1, boxHeight - 3);
  const visible = app.curriculum.slice(0, listHeight);
  visible.forEach((mod, i) => {
    inner.push(moduleRow(t, w - 2, mod, statsById[mod.id] || { challengesPassed: 0, challenges: 0, percent: 0 }, i === app.state.cursor));
  });
  rows.push(...box(t, w, inner, { title: 'Curriculum', focused: true, minHeight: boxHeight - 2 }));

  return clampRows(rows, w, h, t);
}
