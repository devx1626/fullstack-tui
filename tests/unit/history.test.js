/**
 * Checkpoint sidecar tests (Q9, errors-and-qol-spec Appendix A).
 * Run: node --test tests/unit/history.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  HISTORY_MAX_CHECK,
  addSnapshot,
  emptyHistory,
  historyList,
  promoteDailyBest,
  relativeTime,
  snapshotBytes,
  snapshotId,
  snapshotLabel,
} from '../../src/core/history.js';
import { Store } from '../../src/core/store.js';

const DAY = 86400000;
const at = (offsetMs) => new Date(Date.UTC(2026, 8, 14, 12, 0, 0) + offsetMs);

function snap(id, when, { kind = 'check', passed = null, files = { code: 'x' }, meta = null } = {}) {
  return { id, at: when.toISOString(), kind, passed, files, meta };
}

test('snapshotId matches the Appendix A shape', () => {
  assert.equal(snapshotId(new Date('2026-09-14T11:58:12.444Z')), 's-20260914T115812444Z');
});

test('snapshotBytes counts every captured file', () => {
  assert.equal(snapshotBytes({ files: { a: 'abc', b: 'de' } }), 5);
  assert.equal(snapshotBytes({ files: {} }), 0);
  assert.equal(snapshotBytes(null), 0);
});

test('the check ring keeps the 10 newest and never evicts a daily best', () => {
  const history = emptyHistory('m.l.c');
  const best = snap('s-best', at(0), { kind: 'daily-best', passed: true });
  addSnapshot(history, best, at(0));

  for (let i = 1; i <= 14; i += 1) {
    addSnapshot(history, snap(`s-${i}`, at(i * 1000)), at(i * 1000));
  }

  const checks = history.snapshots.filter((s) => s.kind === 'check');
  assert.equal(checks.length, HISTORY_MAX_CHECK);
  assert.deepEqual(checks.map((s) => s.id), ['s-14', 's-13', 's-12', 's-11', 's-10', 's-9', 's-8', 's-7', 's-6', 's-5']);
  assert.ok(history.snapshots.some((s) => s.id === 's-best'), 'the daily best survives the ring');
  assert.equal(history.updatedAt, at(14000).toISOString());
});

test('snapshots older than 30 days are dropped', () => {
  const history = emptyHistory('m.l.c');
  addSnapshot(history, snap('old', at(-40 * DAY)), at(-40 * DAY));
  addSnapshot(history, snap('fresh', at(0)), at(0));
  assert.deepEqual(history.snapshots.map((s) => s.id), ['fresh']);
});

test('a runaway snapshot truncates the sidecar to the newest 3', () => {
  const history = emptyHistory('m.l.c');
  for (let i = 0; i < 6; i += 1) addSnapshot(history, snap(`s-${i}`, at(i * 1000)), at(i * 1000));
  const huge = new Array(60000).join('x'); // ~60 KB per entry, > 256 KB total
  addSnapshot(history, snap('s-huge', at(9000), { files: { code: huge, style: huge, extra: huge, more: huge, last: huge } }), at(9000));
  assert.equal(history.truncated, true);
  assert.equal(history.snapshots.length, 3);
  assert.equal(history.snapshots[0].id, 's-huge');
});

test('only the first passing snapshot of a day becomes the daily best', () => {
  const history = emptyHistory('m.l.c');
  const first = snap('s-first', at(0), { passed: true });
  const second = snap('s-second', at(3600000), { passed: true });
  addSnapshot(history, first, at(0));
  addSnapshot(history, second, at(3600000));

  assert.equal(promoteDailyBest(history, first, at(1000)), true);
  assert.equal(promoteDailyBest(history, second, at(3600000)), false, 'same day → no re-promotion');
  assert.equal(history.dailyBest.id, 's-first');
  assert.equal(history.snapshots.find((s) => s.id === 's-first').kind, 'daily-best');

  const tomorrow = new Date(at(0).getTime() + DAY);
  const third = snap('s-third', tomorrow, { passed: true });
  addSnapshot(history, third, tomorrow);
  assert.equal(promoteDailyBest(history, third, tomorrow), true, 'a new day promotes again');
});

test('historyList puts the daily best first, then newest-first ring entries', () => {
  const history = emptyHistory('m.l.c');
  addSnapshot(history, snap('s-1', at(0)), at(0));
  const best = snap('s-2', at(1000), { passed: true });
  addSnapshot(history, best, at(1000));
  addSnapshot(history, snap('s-3', at(2000)), at(2000));
  promoteDailyBest(history, best, at(1000));
  assert.deepEqual(historyList(history).map((s) => s.id), ['s-2', 's-3', 's-1']);
});

test('labels read like the restore list', () => {
  const now = at(0);
  const best = snap('s-best', new Date(now.getTime() - 30000), { kind: 'daily-best', passed: true, meta: { checksPassed: 8, checksTotal: 8 } });
  const label = snapshotLabel(best, now);
  assert.match(label, /^★ just now · 8\/8 checks · /);
  const failing = snap('s-old', new Date(now.getTime() - 3 * 3600000), { passed: false, meta: { checksPassed: 2, checksTotal: 8 } });
  assert.match(snapshotLabel(failing, now), /^3 h ago · 2\/8 checks · /);
  assert.equal(relativeTime(new Date(now.getTime() - DAY).toISOString(), now), 'yesterday');
  assert.equal(relativeTime('nonsense', now), 'unknown time');
});

test('Store writes, reads, prunes and finds checkpoints on disk', () => {
  const dir = path.join(process.cwd(), '.data', 'history-test');
  rmSync(dir, { recursive: true, force: true });
  const store = new Store(path.join(dir, 'progress.json'));
  const id = 'm1.l1.c1';

  assert.deepEqual(store.checkpoints(id), [], 'no sidecar yet');

  const first = store.saveCheckpoint(id, { html: '<h1>' }, { meta: { checksTotal: 2 } });
  assert.equal(first.kind, 'check');
  assert.equal(store.checkpoints(id).length, 1);
  assert.equal(store.findCheckpoint(id, first.id).files.html, '<h1>');

  store.updateSnapshot(id, first.id, { passed: true, meta: { checksPassed: 2 } });
  assert.equal(store.promoteDailyBest(id, first), true);
  const list = store.checkpoints(id);
  assert.equal(list[0].id, first.id, 'daily best is listed first');
  assert.equal(list[0].kind, 'daily-best');
  assert.match(snapshotLabel(list[0]), /2\/2 checks/);

  // The ring holds after many runs, and the daily best survives.
  for (let i = 0; i < 12; i += 1) store.saveCheckpoint(id, { html: `<p>${i}</p>` });
  const after = store.checkpoints(id);
  assert.equal(after.filter((s) => s.kind === 'check').length, HISTORY_MAX_CHECK);
  assert.equal(after.filter((s) => s.kind === 'daily-best').length, 1);

  // progress.json is untouched by checkpoint writes.
  assert.equal(store.data.challenges[id], undefined);

  // A corrupt sidecar degrades to an empty history instead of throwing.
  writeFileSync(store.historyFile(id), '{oops');
  assert.deepEqual(store.checkpoints(id), []);

  rmSync(dir, { recursive: true, force: true });
});
