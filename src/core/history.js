/**
 * Checkpoint sidecar (errors-and-qol-spec Q9, Appendix A) — pure model.
 *
 * One sidecar per challenge, written lazily the first time a check runs:
 *
 *   .data/history/<lessonId>.<challengeId>.json
 *   { version, challengeId, updatedAt, snapshots: [{ id, at, kind, passed,
 *     files, meta }], dailyBest: { day, id } | null }
 *
 * Everything here is pure (no fs) so the ring/prune maths is unit-testable;
 * `Store` owns the file IO. Kinds: `check` = the pre-check state captured on
 * every run, `daily-best` = the first passing snapshot of a day (never evicted
 * by the ring), `manual` = reserved for a future "snapshot now" command.
 */

export const HISTORY_MAX_CHECK = 10;
export const HISTORY_MAX_AGE_DAYS = 30;
export const HISTORY_MAX_BYTES = 256 * 1024;

/** ISO → sidecar file name fragment: `s-20260914T115812444Z`. */
export function snapshotId(at = new Date()) {
  return `s-${at.toISOString().replace(/[-:]/g, '').replace('.', '')}`;
}

/** `2026-09-14` (local day, matching the streak/goal day key). */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyHistory(challengeId) {
  return { version: 1, challengeId, updatedAt: null, snapshots: [], dailyBest: null };
}

/** Byte size of a snapshot's captured buffers. */
export function snapshotBytes(snap) {
  let total = 0;
  for (const text of Object.values((snap && snap.files) || {})) {
    total += Buffer.byteLength(String(text ?? ''), 'utf8');
  }
  return total;
}

/**
 * Append a snapshot and prune (Appendix A steps 1–5). Mutates `history`:
 *   1. append newest-first,
 *   2. keep at most HISTORY_MAX_CHECK `check` snapshots (ring),
 *   3. daily-best/manual are never evicted by the ring,
 *   4. drop snapshots older than 30 days,
 *   5. a >256 KB snapshot keeps the newest 3 entries and flags `truncated`.
 */
export function addSnapshot(history, snap, now = new Date()) {
  history.snapshots.unshift(snap);

  if (snapshotBytes(snap) > HISTORY_MAX_BYTES) {
    history.snapshots = history.snapshots.slice(0, 3);
    history.truncated = true;
  } else {
    let checks = 0;
    history.snapshots = history.snapshots.filter((entry) => {
      if (entry.kind !== 'check') return true;
      checks += 1;
      return checks <= HISTORY_MAX_CHECK;
    });
  }

  const cutoff = now.getTime() - HISTORY_MAX_AGE_DAYS * 86400000;
  history.snapshots = history.snapshots.filter((entry) => {
    const at = Date.parse(entry.at);
    return Number.isFinite(at) ? at >= cutoff : false;
  });

  history.updatedAt = now.toISOString();
  return history;
}

/**
 * Promote a passing snapshot to `dailyBest` — first passing state of the day
 * wins; later passes stay ordinary ring entries. Returns true when promoted.
 */
export function promoteDailyBest(history, snap, now = new Date()) {
  const day = dayKey(now);
  if (history.dailyBest && history.dailyBest.day === day) return false;
  history.dailyBest = { day, id: snap.id };
  const entry = history.snapshots.find((s) => s.id === snap.id);
  if (entry) entry.kind = 'daily-best';
  return true;
}

/** Daily best first (★), then the ring, newest first. */
export function historyList(history) {
  const bestId = history.dailyBest && history.dailyBest.id;
  const best = bestId ? history.snapshots.find((s) => s.id === bestId) : null;
  const rest = history.snapshots.filter((s) => s !== best);
  return best ? [best, ...rest] : rest;
}

export function findSnapshot(history, id) {
  return history.snapshots.find((s) => s.id === id) || null;
}

/** Human label for the restore list: badge, time, kind, check counts. */
export function snapshotLabel(snap, now = new Date()) {
  const badge = snap.kind === 'daily-best' ? '★ ' : '';
  const kind = snap.kind === 'manual' ? 'manual ' : '';
  const counts = snap.meta && Number.isFinite(snap.meta.checksPassed)
    ? `${snap.meta.checksPassed}/${snap.meta.checksTotal} checks`
    : snap.passed === true ? 'passing' : snap.passed === false ? 'not passing' : 'unknown';
  const size = `${snapshotBytes(snap)} B`;
  return `${badge}${relativeTime(snap.at, now)} · ${kind}${counts} · ${size}`;
}

/** Coarse relative time for labels ("just now", "4 min ago", "yesterday"). */
export function relativeTime(iso, now = new Date()) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'unknown time';
  const secs = Math.max(0, Math.round((now.getTime() - at) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `${days} days ago`;
}
