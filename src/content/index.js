/**
 * The curriculum.
 *
 * Shape of a module:
 *   { id, title, tagline, badge, color, hours, why, source: {course, url, roadmap, docs},
 *     lessons: [...], project: {...} }
 *
 * Shape of a lesson:
 *   { id, title, minutes, objectives[], sections[{heading, body, code?: {lang, source, caption}}],
 *     pitfalls[], keyPoints[], resources[{label, url}], challenges[...] }
 *
 * Shape of a challenge:
 *   { id, kind: 'debug'|'write', difficulty, minutes, prompt, requirements[], starter,
 *     lang, hints[], solution, checks[], preview? }
 *
 * `checks` uses the `T` helpers from core/grade.js so every assertion runs real
 * code instead of pattern matching wherever that is possible.
 */

import html from './01-html.js';
import css from './02-css.js';
import javascript from './03-javascript.js';
import git from './04-git-and-cli.js';
import node from './05-node.js';
import express from './06-express-and-apis.js';
import sql from './07-databases-sql.js';
import react from './08-react.js';
import typescript from './09-typescript.js';
import python from './10-python.js';
import testing from './11-testing-and-debugging.js';
import devops from './12-deploy-and-devops.js';

export const curriculum = [
  html,
  css,
  javascript,
  git,
  node,
  express,
  sql,
  react,
  typescript,
  python,
  testing,
  devops,
];

export const globalChallengeId = (lessonId, challengeId) => `${lessonId}.${challengeId}`;

/** Flat list of every lesson, in curriculum order, tagged with its module. */
export function allLessons() {
  const out = [];
  curriculum.forEach((mod) => {
    mod.lessons.forEach((lesson, i) => {
      out.push({ module: mod, lesson, indexInModule: i });
    });
  });
  return out;
}

export function findModule(id) {
  return curriculum.find((m) => m.id === id) || null;
}

export function findLesson(lessonId) {
  return allLessons().find((e) => e.lesson.id === lessonId) || null;
}

/** The lesson after this one anywhere in the curriculum (crosses module boundaries). */
export function nextLesson(lessonId) {
  const list = allLessons();
  const idx = list.findIndex((e) => e.lesson.id === lessonId);
  if (idx === -1 || idx === list.length - 1) return null;
  return list[idx + 1];
}

export function prevLesson(lessonId) {
  const list = allLessons();
  const idx = list.findIndex((e) => e.lesson.id === lessonId);
  if (idx <= 0) return null;
  return list[idx - 1];
}

export function modulesWithProjects() {
  return curriculum.filter((m) => m.project).map((m) => ({ module: m, project: m.project }));
}

export function totals() {
  const lessons = curriculum.reduce((n, m) => n + m.lessons.length, 0);
  const challenges = curriculum.reduce(
    (n, m) => n + m.lessons.reduce((k, l) => k + (l.challenges || []).length, 0),
    0,
  );
  const debug = curriculum.reduce(
    (n, m) => n + m.lessons.reduce((k, l) => k + (l.challenges || []).filter((c) => c.kind === 'debug').length, 0),
    0,
  );
  const hours = curriculum.reduce((n, m) => n + (m.hours || 0), 0);
  return { modules: curriculum.length, lessons, challenges, debug, write: challenges - debug, hours };
}

export default curriculum;
