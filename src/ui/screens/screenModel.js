/**
 * Screen view-models (Phase 1 ports) — pure, terminal-free shaping of store +
 * curriculum data so the Ink screens and the classic canvas views agree on
 * every number. Classic views derive inline (src/views/home.js,
 * src/views/module.js); these functions are the same logic, extracted for
 * unit tests and reused by the next-UI components.
 */

/** Text progress meter cells shared by home and module rows. */
export function meterCells(done, total, width = 14) {
  const filled = total > 0 ? Math.round((Math.min(done, total) / total) * width) : 0;
  return { filled, open: Math.max(0, width - filled) };
}

/**
 * Home screen view-model.
 *
 * @param {object} p
 * @param {Array} p.curriculum      module list (content/index.js curriculum)
 * @param {object} p.stats          store.stats(curriculum) → { totals, perModule, streak }
 * @param {object} p.overall        content totals() → { modules, lessons, challenges, … }
 * @param {object} p.store          store-like: isPassed, todayMinutes, weekMinutes, activity
 * @param {object} [p.settings]     settings-like: bannerVisible(streak) (optional)
 * @param {() => {lessonId, moduleId}|null} [p.resumeTarget]
 * @param {Array<{module, lesson}>} [lessonIndex] precomputed allLessons() (injectable for tests)
 */
export function homeViewModel({ curriculum, stats, overall, store, settings, resumeTarget, lessonIndex }) {
  const streak = stats.streak || { current: 0, best: 0 };
  const banner = settings && typeof settings.bannerVisible === 'function' && settings.bannerVisible(streak)
    ? { current: streak.current }
    : null;

  let resume = null;
  const target = typeof resumeTarget === 'function' ? resumeTarget() : null;
  if (target) {
    const entries = lessonIndex || [];
    const entry = entries.find((e) => e.lesson.id === target.lessonId);
    if (entry) {
      const ch = (entry.lesson.challenges || []).find((c) => !store.isPassed(`${entry.lesson.id}.${c.id}`));
      resume = {
        moduleTitle: entry.module.title,
        lessonTitle: entry.lesson.title,
        challengeId: ch ? ch.id : '',
        kind: ch ? ch.kind : '',
      };
    }
  }

  const statsById = Object.fromEntries((stats.perModule || []).map((m) => [m.id, m]));
  const modules = curriculum.map((mod) => {
    const s = statsById[mod.id] || { challengesPassed: 0, challenges: 0, percent: 0 };
    return {
      id: mod.id,
      badge: mod.badge,
      title: mod.title,
      tagline: mod.tagline || '',
      done: s.challengesPassed,
      total: s.challenges,
      percent: s.percent,
    };
  });

  const t = stats.totals || {};
  return {
    banner,
    resume,
    headline: {
      modules: overall.modules ?? curriculum.length,
      challenges: overall.challenges ?? t.challenges ?? 0,
    },
    chips: [
      { label: 'day streak', value: streak.current, tone: streak.current > 0 ? 'good' : 'muted' },
      { label: 'best', value: streak.best, tone: 'muted' },
      { label: 'minutes today', value: store.todayMinutes ? store.todayMinutes() : 0, tone: 'accent' },
      { label: 'this week', value: `${store.weekMinutes ? store.weekMinutes() : 0}m`, tone: 'muted' },
      {
        label: 'solved',
        value: `${t.challengesPassed ?? 0}/${t.challenges ?? 0}`,
        tone: t.challenges && t.challengesPassed === t.challenges ? 'good' : 'accent',
      },
      { label: 'debug fixes', value: `${t.debugPassed ?? 0}/${t.debug ?? 0}`, tone: 'secondary' },
      { label: 'files written', value: `${t.writePassed ?? 0}`, tone: 'star' },
    ],
    modules,
  };
}

const LESSON_MARKS = {
  done: { mark: '✓', tone: 'good' },
  open: { mark: '●', tone: 'warn' },
  unread: { mark: '○', tone: 'faint' },
};

/**
 * Module screen view-model.
 *
 * @param {object} p
 * @param {object} p.mod            the module (curriculum entry)
 * @param {object} [p.statsEntry]   stats.perModule entry for this module
 * @param {object} p.store          store-like: isPassed, isLessonRead, projectProgress
 */
export function moduleViewModel({ mod, statsEntry, store }) {
  if (!mod) return null;
  const s = statsEntry || { challengesPassed: 0, challenges: 0, percent: 0, lessonsRead: 0 };

  const lessons = mod.lessons.map((lesson, i) => {
    const chs = lesson.challenges || [];
    const ids = chs.map((c) => `${lesson.id}.${c.id}`);
    const passed = ids.filter((id) => store.isPassed(id)).length;
    const read = store.isLessonRead ? store.isLessonRead(lesson.id) : false;
    const status = chs.length && passed === chs.length ? 'done' : (passed > 0 || read ? 'open' : 'unread');
    return {
      index: i,
      title: lesson.title,
      minutes: lesson.minutes,
      challenges: chs.length,
      passed,
      status,
      ...LESSON_MARKS[status],
    };
  });

  let project = null;
  if (mod.project) {
    const checks = mod.project.checks || [];
    const done = store.projectProgress
      ? store.projectProgress(mod.project.id, checks)
      : 0;
    project = {
      title: mod.project.title,
      minutes: mod.project.minutes,
      done,
      total: checks.length,
    };
  }

  return {
    title: mod.title,
    badge: mod.badge,
    tagline: mod.tagline || '',
    course: mod.source?.course || '',
    hours: mod.hours,
    why: mod.why || '',
    meter: { done: s.challengesPassed, total: s.challenges, percent: s.percent },
    lessonsRead: s.lessonsRead || 0,
    lessonsCount: mod.lessons.length,
    lessons,
    project,
  };
}
