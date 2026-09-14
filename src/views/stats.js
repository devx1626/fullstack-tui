import { seg, fit, width } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, meter, sparkline, statChips } from '../tui/widgets.js';
import { allLessons } from '../content/index.js';

export default function renderStats(app, w, h) {
  const t = app.theme;
  const rows = [];
  const { totals, perModule } = app.stats;
  const overall = app.totals;
  const streak = app.stats.streak || totals.streak || { current: 0, best: 0 };

  rows.push(sectionLabel(t, w, 'Progress', 'everything is stored in .data/progress.json'));
  rows.push(fit([
    seg('  ', {}),
    ...meter(t, Math.max(20, w - 46), totals.challengesPassed, totals.challenges),
    seg(`   ${totals.challengesPassed}/${totals.challenges} challenges`, { fg: t.muted }),
    seg(`  ${totals.percent}%`, { fg: totals.percent === 100 ? t.good : t.accent, bold: true }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  rows.push(statChips(t, w, [
    ['streak', `${streak.current}d`, streak.current ? 'good' : 'muted'],
    ['best', `${streak.best}d`, 'muted'],
    ['today', `${app.store.todayMinutes()}m`, 'accent'],
    ['week', `${app.store.weekMinutes()}m`, 'muted'],
    ['debug', `${totals.debugPassed}/${totals.debug}`, 'secondary'],
    ['write', `${totals.writePassed}/${totals.write}`, 'star'],
  ]));
  rows.push(sparkline(t, w, app.store.activity(28)));
  rows.push(fit([], w, { bg: t.bg }));

  rows.push(sectionLabel(t, w, 'By module'));
  const all = allLessons();
  let solvedCount = 0;
  let totalChallenges = 0;
  for (const mod of app.curriculum) {
    for (const l of mod.lessons) {
      totalChallenges += (l.challenges || []).length;
      solvedCount += (l.challenges || []).filter((c) => app.store.isPassed(`${l.id}.${c.id}`)).length;
    }
  }

  app.curriculum.forEach((mod) => {
    const s = perModule.find((m) => m.id === mod.id) || { lessonsRead: 0, lessons: 1, challengesPassed: 0, challenges: 1, percent: 0 };
    const name = mod.title.padEnd(12);
    rows.push(fit([
      seg('  ', {}),
      seg(mod.badge.padEnd(4), { fg: t[mod.color] || t.accent, bold: true }),
      seg(name, { fg: t.text }),
      seg('  ', {}),
      ...meter(t, Math.max(12, Math.floor(w * 0.32)), s.challengesPassed, s.challenges),
      seg(`  ${String(s.challengesPassed).padStart(2)}/${String(s.challenges).padEnd(2)} solved`, { fg: t.muted }),
      seg(`   ${s.lessonsRead}/${s.lessons} read`, { fg: t.faint }),
      seg(`   ${s.percent}%`, { fg: s.percent === 100 ? t.good : t.faint }),
    ], w, { bg: t.bg }));
  });

  rows.push(fit([], w, { bg: t.bg }));

  // Recently solved, most recent first.
  const solved = [];
  for (const { module: mod, lesson } of all) {
    for (const ch of lesson.challenges) {
      const rec = app.store.data.challenges[`${lesson.id}.${ch.id}`];
      if (rec && rec.passed) solved.push({ mod, lesson, ch, at: rec.solvedAt, attempts: rec.attempts, hints: rec.hintsUsed });
    }
  }
  solved.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  rows.push(sectionLabel(t, w, 'Recently solved', `${solved.length} of ${totalChallenges}`));
  if (!solved.length) {
    rows.push(fit([seg('  Nothing yet. Open a module and fix your first bug - Ctrl+S checks your work.', { fg: t.faint })], w, { bg: t.bg }));
  }
  const room = Math.max(0, h - rows.length - 1);
  solved.slice(0, room).forEach((s) => {
    const when = s.at ? String(s.at).slice(0, 10) : '';
    rows.push(fit([
      seg('  ', {}),
      seg(s.ch.kind === 'debug' ? 'bug ' : 'code', { fg: s.ch.kind === 'debug' ? t.warn : t.accent, bold: true }),
      seg(`  ${s.lesson.title}`, { fg: t.text }),
      seg(`  > ${s.ch.id}`, { fg: t.muted }),
      seg(`   wrong turns: ${Math.max(0, s.attempts - 1)}`, { fg: t.faint }),
      seg(s.hints ? `  hints: ${s.hints}` : '', { fg: t.faint }),
      seg(`   ${when}`, { fg: t.faint }),
    ], w, { bg: t.bg }));
  });

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(fit([
    seg('  Wrong turns are the useful number. ', { fg: t.muted }),
    seg('A challenge you solved on the fifth attempt taught you more than one you solved first try.', { fg: t.faint }),
  ], w, { bg: t.bg }));

  return clampRows(rows, w, h, t);
}
