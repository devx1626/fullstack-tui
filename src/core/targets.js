/**
 * Curriculum navigation targets — pure, shared by both UIs.
 *
 * These are the "where does this key take me" helpers: resume / next-up
 * (Q2 + Q1) and challenge lookup by id (the router's `{ moduleId, lessonId,
 * challengeId }` params). Keeping them pure means the classic app and the
 * next UI resolve the same target for the same progress state instead of
 * each re-deriving it.
 */

/** All challenges in curriculum order, flattened with their owners. */
export function eachChallenge(curriculum) {
  const out = [];
  (curriculum || []).forEach((mod, moduleIndex) => {
    (mod.lessons || []).forEach((lesson, lessonIndex) => {
      (lesson.challenges || []).forEach((challenge, challengeIndex) => {
        out.push({ module: mod, lesson, challenge, moduleIndex, lessonIndex, challengeIndex });
      });
    });
  });
  return out;
}

/** Shape one entry into the id/target object both UIs pass around. */
export function toTarget(entry) {
  if (!entry) return null;
  return {
    moduleId: entry.module.id,
    lessonId: entry.lesson.id,
    challengeId: entry.challenge.id,
    moduleIndex: entry.moduleIndex,
    lessonIndex: entry.lessonIndex,
    challengeIndex: entry.challengeIndex,
    module: entry.module,
    lesson: entry.lesson,
    challenge: entry.challenge,
  };
}

/**
 * First unpassed challenge in curriculum order — the resume / next-up target.
 * @param {Array<object>} curriculum
 * @param {(id: string) => boolean} isPassed
 */
export function firstUnpassed(curriculum, isPassed) {
  return toTarget(
    eachChallenge(curriculum).find((e) => !isPassed(`${e.lesson.id}.${e.challenge.id}`)),
  );
}

/**
 * First unpassed challenge inside one lesson (falls back to the first
 * challenge, and to index 0 when the lesson has none).
 */
export function firstUnpassedIn(lesson, isPassed) {
  const list = (lesson && lesson.challenges) || [];
  const idx = list.findIndex((c) => !isPassed(`${lesson.id}.${c.id}`));
  return idx === -1 ? 0 : idx;
}

/**
 * Resolve a router target by id. `challengeId` is optional: without it the
 * first unpassed challenge of the lesson is used (what "open lesson" means
 * before the lesson screen exists in the next UI).
 */
export function findChallenge(curriculum, { moduleId, lessonId, challengeId }, isPassed = () => false) {
  const mod = (curriculum || []).find((m) => m.id === moduleId);
  if (!mod) return null;
  const lesson = (mod.lessons || []).find((l) => l.id === lessonId) || (mod.lessons || [])[0];
  if (!lesson) return null;
  const list = lesson.challenges || [];
  const idx = challengeId ? list.findIndex((c) => c.id === challengeId) : -1;
  const challengeIndex = idx === -1 ? firstUnpassedIn(lesson, isPassed) : idx;
  const challenge = list[challengeIndex];
  if (!challenge) return null;
  return toTarget({
    module: mod,
    lesson,
    challenge,
    moduleIndex: (curriculum || []).indexOf(mod),
    lessonIndex: (mod.lessons || []).indexOf(lesson),
    challengeIndex,
  });
}
