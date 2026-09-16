/**
 * Store multi-writer safety (QoL-era regression).
 *
 * Two Store instances can legitimately share one progress.json (the classic
 * UI and FULLSTACK_UI=next, or an open helper). Before the merge-on-save fix,
 * the second writer's stale in-memory copy silently erased the first's pass:
 *
 *   a.recordAttempt('x.y', …, true);  // a's memory has x.y
 *   b.recordAttempt('z.w', …, true);  // b (loaded earlier) only had z.w — its
 *                                     // save clobbered a's x.y
 *   fresh → x.y NOT passed            // the learner's solved challenge vanished
 *
 * The rule after the fix: per-record last-writer-wins, but additive facts
 * (passed, attempts, hintsUsed) never go backwards, and single-writer files
 * round-trip byte-for-byte as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../../src/core/store.js';

/**
 * Every call in ONE test must share a file for the multi-writer scenario to
 * be real, so the directory is per-test via `t` and the helper reuses it.
 * (A mkdtemp-per-call helper was itself the first bug this suite caught:
 * two "writers" on two different files trivially "survive".)
 */
function tmpStore(t) {
  const dir = t._fsStoreDir || (t._fsStoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsstore-')));
  return new Store(path.join(dir, 'progress.json'));
}

test('a concurrent pass is not erased by the other writer', (t) => {
  const a = tmpStore(t);
  const b = tmpStore(t);
  a.recordAttempt('m.l.c1', '<a>', true);
  b.recordAttempt('m.l.c2', '<b>', true);
  const fresh = new Store(a.file);
  assert.equal(fresh.isPassed('m.l.c1'), true, 'writer A pass survived B save');
  assert.equal(fresh.isPassed('m.l.c2'), true, 'writer B pass survived');
});

test('attempts and hints merge monotonically', (t) => {
  const a = tmpStore(t);
  const b = tmpStore(t);
  a.recordAttempt('m.l.c1', 'v1', false); // attempts 1
  a.recordAttempt('m.l.c1', 'v2', true); // attempts 2
  b.save(); // b has a pre-attempt in-memory view
  const fresh = new Store(a.file);
  const rec = fresh.challengeRecord('m.l.c1');
  assert.equal(rec.attempts, 2, 'the attempt count never goes backwards');
  assert.equal(rec.passed, true);
});

test('a stale unpassed in-memory copy does not un-pass a challenge', (t) => {
  const a = tmpStore(t);
  // A second writer opened BEFORE the pass, holding no record at all — same
  // file, otherwise this scenario is meaningless.
  const stale = tmpStore(t);
  a.recordAttempt('m.l.c1', 'code', true);
  a.recordAttempt('m.l.c2', 'x', true); // a saves again; stale holds the older file
  stale.recordAttempt('m.l.c3', 'y', true); // stale writes its old view of c1 (absent)
  const fresh = new Store(a.file);
  assert.equal(fresh.isPassed('m.l.c1'), true, 'c1 (in stale-free state) survives');
  assert.equal(fresh.isPassed('m.l.c2'), true, 'c2 survived the stale write');
  assert.equal(fresh.isPassed('m.l.c3'), true, 'the stale write itself persisted');
});

test('single-writer round-trips exactly like before (no merge surprises)', (t) => {
  const s = tmpStore(t);
  s.addTime(120); // banked BEFORE any save-triggering call
  s.recordAttempt('m.l.c1', 'code', true);
  s.markLessonRead('m.l.l1');
  const fresh = new Store(s.file);
  assert.equal(fresh.isPassed('m.l.c1'), true);
  assert.equal(fresh.isLessonRead('m.l.l1'), true);
  assert.ok(fresh.data.totals.seconds >= 120, 'time banked once, not lost');
  assert.equal(fresh.data.version, 1);
  // Re-save from a fresh instance must not double-count or lose anything.
  fresh.addTime(30);
  fresh.save();
  const again = new Store(fresh.file);
  assert.equal(again.data.totals.seconds, fresh.data.totals.seconds, 'single-writer totals preserved exactly');
});

test('a corrupted on-disk file falls back to the in-memory state', (t) => {
  const s = tmpStore(t);
  s.recordAttempt('m.l.c1', 'code', true);
  fs.writeFileSync(s.file, '{corrupt');
  s.recordAttempt('m.l.c2', 'x', true); // merge step sees garbage → ours wins
  const fresh = new Store(s.file);
  assert.equal(fresh.isPassed('m.l.c2'), true, 'the in-memory record persisted over garbage');
  assert.equal(fresh.isPassed('m.l.c1'), true, 'in-memory history survives garbage on disk');
  // c1 was written BEFORE the corruption, so it is still in the writer's
  // memory — the merge rewrite restores it (strictly better than the old
  // plain rewrite, which would have lost it with the garbage).
});

test('streak and day counters survive the other writer', (t) => {
  const a = tmpStore(t);
  a.touch(); // advances today's streak/day record
  const b = tmpStore(t);
  b.recordAttempt('m.l.c1', 'x', true); // b merges a's day record back
  const fresh = new Store(a.file);
  assert.equal(fresh.passedToday() >= 1, true, "today's pass count survived");
  assert.ok(fresh.data.days, 'day records intact');
});

test('two writers passing different challenges count BOTH in passedToday', (t) => {
  const a = tmpStore(t);
  const b = tmpStore(t);
  a.recordAttempt('m.l.cA', '<a>', true);
  b.recordAttempt('m.l.cB', '<b>', true);
  const fresh = new Store(a.file);
  assert.equal(fresh.isPassed('m.l.cA'), true);
  assert.equal(fresh.isPassed('m.l.cB'), true);
  assert.equal(fresh.passedToday(), 2, 'distinct passes today = 2, not max(1,1)=1');
});

test('re-passing the same challenge does not inflate passedToday', (t) => {
  const s = tmpStore(t);
  s.recordAttempt('m.l.c1', 'v1', true);
  s.recordAttempt('m.l.c1', 'v2', true);
  assert.equal(new Store(s.file).passedToday(), 1, 'one distinct challenge, however many re-runs');
});
