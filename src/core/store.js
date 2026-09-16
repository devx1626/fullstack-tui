/**
 * Progress persistence.
 *
 * Everything lives in `.data/progress.json` next to the project so a learner
 * can back it up, diff it, or delete it to start over.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addSnapshot,
  emptyHistory,
  findSnapshot,
  historyList,
  promoteDailyBest as promoteDailyBestIn,
  snapshotId,
} from './history.js';

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
  /**
   * @param {string} file progress.json path
   * @param {{historyDir?: string}} opts checkpoint sidecar directory
   *   (defaults to `<progress dir>/history`, per Appendix A)
   */
  constructor(file = PROGRESS_FILE, { historyDir } = {}) {
    this.file = file;
    this.historyDir = historyDir || path.join(path.dirname(file), 'history');
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
      // Two writers can legitimately exist (the classic UI and the next UI,
      // or an open $EDITOR helper): both hold in-memory state, and a naive
      // write would let the stale one silently erase the other's pass. Merging
      // the on-disk challenge/lesson/project records over ours before writing
      // costs one read and preserves the "last writer wins per-record" rule.
      let merged = this.data;
      try {
        const fresh = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (fresh && typeof fresh === 'object') {
          const union = (ours, theirs) => {
            const out = { ...theirs, ...ours };
            for (const [id, rec] of Object.entries(theirs || {})) {
              const mine = (ours || {})[id];
              // A record the other writer made *passed* wins over a stale
              // in-memory copy that still says unpassed (same for attempts,
              // which only ever grow).
              if (mine && typeof mine === 'object') {
                out[id] = {
                  ...rec,
                  ...mine,
                  passed: !!(mine.passed || rec.passed),
                  attempts: Math.max(mine.attempts || 0, rec.attempts || 0),
                  hintsUsed: Math.max(mine.hintsUsed || 0, rec.hintsUsed || 0),
                };
              }
            }
            return out;
          };
          merged = {
            ...this.data,
            ...fresh,
            lessons: union(this.data.lessons, fresh.lessons),
            challenges: union(this.data.challenges, fresh.challenges),
            projects: union(this.data.projects, fresh.projects),
            // Day records: additive counters (minutes/challenges/lessons)
            // merge per key, so the other instance's passes today survive.
            days: (() => {
              // Two writers advance the SAME day from the same base: per-key
              // max is correct for counters that were part of the shared base
              // (neither writer lost the other's increment — challenge records
              // carry the pass; the day counter is re-derivable). The derived
              // truth for "passed today" is the challenge records themselves,
              // so reconcile the day counter against the merged records.
              const out = { ...this.data.days, ...fresh.days };
              for (const [day, theirs] of Object.entries(fresh.days || {})) {
                const mine = (this.data.days || {})[day];
                if (mine && typeof mine === 'object') {
                  out[day] = {
                    minutes: Math.max(mine.minutes || 0, theirs.minutes || 0),
                    challenges: Math.max(mine.challenges || 0, theirs.challenges || 0),
                    lessons: Math.max(mine.lessons || 0, theirs.lessons || 0),
                  };
                }
              }
              return out;
            })(),
            // Additive counters never go backwards, and a streak the other
            // instance advanced must survive our write.
            streak: (this.data.streak?.current || 0) >= (fresh.streak?.current || 0) ? this.data.streak : fresh.streak,
            totals: {
              seconds: Math.max(this.data.totals?.seconds || 0, fresh.totals?.seconds || 0),
              sessions: Math.max(this.data.totals?.sessions || 0, fresh.totals?.sessions || 0),
            },
          };
          this.data = merged;
          // The day counter for today is derived from the challenge records
          // (a pass bumps `days[today].challenges`), and the merge above can
          // only take a max — recount from the merged records so "passed
          // today" counts DISTINCT passes from both writers, never fewer.
          const dayKey = today();
          if (merged.days && merged.days[dayKey]) {
            const passedTodayCount = Object.values(merged.challenges || {})
              .filter((r) => r && r.passed && r.solvedAt && r.solvedAt.slice(0, 10) === dayKey).length;
            if (passedTodayCount > (merged.days[dayKey].challenges || 0)) {
              merged.days[dayKey].challenges = passedTodayCount;
            }
          }
        }
      } catch {
        /* unreadable/absent file → ours wins entirely (the classic path) */
      }
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

  /** Challenges passed today (local day) — the day-goal counter. */
  passedToday() {
    return this.data.days[today()]?.challenges || 0;
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

  /**
   * Persist in-progress code WITHOUT recording an attempt (QoL Q8 autosave,
   * errors-and-qol-spec §4.4). `lastCode` is an existing field older app
   * versions already read, so this stays schema-compatible. Debounce lives
   * with the caller.
   */
  saveDraft(id, code) {
    const rec = this.challengeRecord(id);
    rec.lastCode = code;
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

  // -- checkpoints (Q9, errors-and-qol-spec Appendix A) ----------------------
  //
  // Sidecars live beside progress.json, never inside it: a learner can delete
  // the directory and lose only checkpoints. Reads degrade to an empty history
  // (a corrupt sidecar must not stop a check run).

  historyFile(id) {
    return path.join(this.historyDir, `${id}.json`);
  }

  readHistory(id) {
    try {
      const raw = fs.readFileSync(this.historyFile(id), 'utf8');
      const parsed = JSON.parse(raw);
      const base = emptyHistory(id);
      return {
        ...base,
        ...parsed,
        snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      };
    } catch {
      return emptyHistory(id);
    }
  }

  writeHistory(id, history) {
    try {
      fs.mkdirSync(this.historyDir, { recursive: true });
      const file = this.historyFile(id);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(history, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      // A checkpoint is a convenience: never crash the TUI over it.
      process.stderr.write(`\nCould not save a checkpoint: ${err.message}\n`);
    }
  }

  /**
   * Snapshot a challenge's buffers. `files` is the editor tab map, so a
   * multi-file challenge captures every tab byte-exact.
   */
  saveCheckpoint(id, files, { kind = 'check', passed = null, meta = null, now = new Date() } = {}) {
    const history = this.readHistory(id);
    const snapshot = {
      id: snapshotId(now),
      at: now.toISOString(),
      kind,
      passed,
      files: { ...files },
      meta,
    };
    addSnapshot(history, snapshot, now);
    this.writeHistory(id, history);
    return snapshot;
  }

  /** Patch a snapshot in place (check outcome, checksPassed meta). */
  updateSnapshot(id, snapshotIdToPatch, patch = {}) {
    const history = this.readHistory(id);
    const entry = findSnapshot(history, snapshotIdToPatch);
    if (!entry) return null;
    Object.assign(entry, patch, { meta: { ...(entry.meta || {}), ...(patch.meta || {}) } });
    this.writeHistory(id, history);
    return entry;
  }

  /** First passing snapshot of the day becomes the sidecar's daily best. */
  promoteDailyBest(id, snapshot, now = new Date()) {
    const history = this.readHistory(id);
    const promoted = promoteDailyBestIn(history, snapshot, now);
    if (promoted) this.writeHistory(id, history);
    return promoted;
  }

  /** Restore list: daily best first, then the ring, newest first. */
  checkpoints(id) {
    return historyList(this.readHistory(id));
  }

  findCheckpoint(id, snapshotIdToFind) {
    return findSnapshot(this.readHistory(id), snapshotIdToFind);
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
