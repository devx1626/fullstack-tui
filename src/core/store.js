/**
 * Progress persistence.
 *
 * Everything lives in `.data/progress.json` next to the project so a learner
 * can back it up, diff it, or delete it to start over.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
const DATA_DIR = path.join(ROOT, '.data');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function emptyState() {
  return {
    version: 1,
    learner: process.env.USER || process.env.USERNAME || 'learner',
    createdAt: new Date().toISOString(),
    lessons: {},
    challenges: {},
    projects: {},
    days: {},
    streak: { current: 0, best: 0, lastDay: null },
    totals: { seconds: 0, sessions: 0 },
    lastSeen: null,
  };
}

export class Store {
  constructor(file = PROGRESS_FILE) {
    this.file = file;
    this.data = this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...emptyState(), ...parsed };
    } catch {
      return emptyState();
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      // Never crash the TUI because of a disk problem.
      process.stderr.write(`\nCould not save progress: ${err.message}\n`);
    }
  }

  // -- touch / streak -------------------------------------------------------

  touch() {
    const day = today();
    this.data.lastSeen = new Date().toISOString();
    if (!this.data.days[day]) this.data.days[day] = { minutes: 0, challenges: 0, lessons: 0 };
    const streak = this.data.streak || { current: 0, best: 0, lastDay: null };
    if (streak.lastDay !== day) {
      const yesterday = today(new Date(Date.now() - 86400000));
      streak.current = streak.lastDay === yesterday ? (streak.current || 0) + 1 : 1;
      streak.best = Math.max(streak.best || 0, streak.current);
      streak.lastDay = day;
    }
    this.data.streak = streak;
  }

  addTime(seconds) {
    const day = today();
    this.touch();
    this.data.days[day].minutes = Math.round(((this.data.days[day].minutes || 0) + seconds / 60) * 10) / 10;
    this.data.totals.seconds = (this.data.totals.seconds || 0) + seconds;
  }

  // -- lessons --------------------------------------------------------------

  lessonRecord(lessonId) {
    return this.data.lessons[lessonId] || null;
  }

  isLessonRead(lessonId) {
    return !!(this.data.lessons[lessonId] && this.data.lessons[lessonId].read);
  }

  markLessonRead(lessonId) {
    const day = today();
    const rec = this.data.lessons[lessonId] || { attempts: 0 };
    if (!rec.read) {
      rec.read = true;
      rec.completedAt = new Date().toISOString();
      this.touch();
      if (this.data.days[day]) this.data.days[day].lessons = (this.data.days[day].lessons || 0) + 1;
    }
    rec.attempts = (rec.attempts || 0) + 0;
    this.data.lessons[lessonId] = rec;
    this.save();
  }

  setLessonScroll(lessonId, offset) {
    const rec = this.data.lessons[lessonId] || {};
    rec.scroll = offset;
    this.data.lessons[lessonId] = rec;
  }

  getLessonScroll(lessonId) {
    return (this.data.lessons[lessonId] || {}).scroll || 0;
  }

  // -- challenges -----------------------------------------------------------

  challengeRecord(id) {
    return (
      this.data.challenges[id] || {
        passed: false,
        attempts: 0,
        hintsUsed: 0,
        solutionSeen: false,
        solvedAt: null,
        lastCode: null,
        bestCode: null,
      }
    );
  }

  isPassed(id) {
    return !!(this.data.challenges[id] && this.data.challenges[id].passed);
  }

  recordAttempt(id, code, passed) {
    const day = today();
    const rec = this.challengeRecord(id);
    rec.attempts += 1;
    rec.lastCode = code;
    if (passed && !rec.passed) {
      rec.passed = true;
      rec.solvedAt = new Date().toISOString();
      rec.bestCode = code;
      this.touch();
      if (this.data.days[day]) this.data.days[day].challenges = (this.data.days[day].challenges || 0) + 1;
    } else if (passed) {
      rec.bestCode = code;
    }
    this.data.challenges[id] = rec;
    this.save();
  }

  useHint(id) {
    const rec = this.challengeRecord(id);
    rec.hintsUsed += 1;
    this.data.challenges[id] = rec;
    this.save();
    return rec.hintsUsed;
  }

  markSolutionSeen(id) {
    const rec = this.challengeRecord(id);
    rec.solutionSeen = true;
    this.data.challenges[id] = rec;
    this.save();
  }

  // -- projects -------------------------------------------------------------

  projectRecord(id) {
    return this.data.projects[id] || { checks: {}, notes: '' };
  }

  toggleProjectCheck(id, checkId) {
    const rec = this.projectRecord(id);
    rec.checks[checkId] = !rec.checks[checkId];
    this.data.projects[id] = rec;
    this.save();
    return rec.checks[checkId];
  }

  projectProgress(id, checkIds) {
    const rec = this.projectRecord(id);
    return checkIds.filter((c) => rec.checks[c]).length;
  }

  // -- reporting ------------------------------------------------------------

  stats(curriculum) {
    const totals = { lessons: 0, lessonsRead: 0, challenges: 0, challengesPassed: 0, debug: 0, debugPassed: 0, write: 0, writePassed: 0 };
    const perModule = [];
    for (const mod of curriculum) {
      const m = { id: mod.id, title: mod.title, lessons: mod.lessons.length, lessonsRead: 0, challenges: 0, challengesPassed: 0 };
      for (const lesson of mod.lessons) {
        totals.lessons += 1;
        m.challenges += (lesson.challenges || []).length;
        if (this.isLessonRead(lesson.id)) {
          totals.lessonsRead += 1;
          m.lessonsRead += 1;
        }
        for (const ch of (lesson.challenges || [])) {
          const id = `${lesson.id}.${ch.id}`;
          totals.challenges += 1;
          if (ch.kind === 'debug') totals.debug += 1;
          else totals.write += 1;
          if (this.isPassed(id)) {
            totals.challengesPassed += 1;
            m.challengesPassed += 1;
            if (ch.kind === 'debug') totals.debugPassed += 1;
            else totals.writePassed += 1;
          }
        }
      }
      m.percent = m.challenges ? Math.round((m.challengesPassed / m.challenges) * 100) : 0;
      perModule.push(m);
    }
    totals.percent = totals.challenges ? Math.round((totals.challengesPassed / totals.challenges) * 100) : 0;
    return { totals, perModule, streak: this.data.streak, minutes: this.data.days[today()]?.minutes || 0 };
  }

  todayMinutes() {
    return Math.round((this.data.days[today()]?.minutes || 0));
  }

  weekMinutes() {
    let sum = 0;
    for (let i = 0; i < 7; i += 1) {
      const day = today(new Date(Date.now() - i * 86400000));
      sum += this.data.days[day]?.minutes || 0;
    }
    return Math.round(sum);
  }

  activity(days = 21) {
    const out = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000);
      const key = today(d);
      const rec = this.data.days[key];
      out.push({ day: key, minutes: rec?.minutes || 0, challenges: rec?.challenges || 0 });
    }
    return out;
  }
}

export { today, PROGRESS_FILE, DATA_DIR };
