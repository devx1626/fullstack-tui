/**
 * Q13 — the on-quit recap.
 *
 * Plain strings, no ANSI: the caller decides how to paint them (the classic UI
 * prints them dimmed after the alt-screen teardown, so they stay readable in
 * the scrollback). Pure so the session accounting can be asserted in tests
 * without quitting anything.
 */
import { formatDuration } from './checkNotes.js';

const LABEL_W = 9;

function row(label, value) {
  if (value === null || value === undefined || value === '') return null;
  return `  ${label.padEnd(LABEL_W)}${value}`;
}

/**
 * @param {{
 *   seconds?: number,          // time spent this session
 *   passed?: Array<string>,    // challenge ids passed this session
 *   failures?: number,         // failed *checks* seen this session
 *   totalPassed?: number,      // challenge records marked passed overall
 *   totalChallenges?: number,
 *   streak?: number,           // current streak in days
 *   todayCount?: number,       // challenges passed today
 *   dailyGoal?: number,        // 0 = goal off
 *   nextUp?: string | null,    // label of the next unpassed challenge
 * }} session
 * @returns {string[]} lines, ready to print
 */
export function buildRecap(session = {}) {
  const {
    seconds = 0,
    passed = [],
    failures = 0,
    totalPassed = null,
    totalChallenges = null,
    streak = 0,
    todayCount = null,
    dailyGoal = 0,
    nextUp = null,
  } = session;

  const passedCount = passed.length;
  const lines = [];

  // A session with no activity gets one friendly line, not a wall of zeros.
  if (passedCount === 0 && failures === 0) {
    lines.push(nextUp
      ? `  Nothing checked this session - next up: ${nextUp}`
      : '  Nothing checked this session.');
    return lines;
  }

  if (seconds >= 5) {
    const time = row('time', formatDuration(seconds * 1000));
    if (time) lines.push(time);
  }

  if (passedCount > 0) {
    const overall = Number.isFinite(totalPassed) && Number.isFinite(totalChallenges) && totalChallenges > 0
      ? `  (${totalPassed}/${totalChallenges} overall)`
      : '';
    lines.push(row('passed', `${passedCount} challenge${passedCount === 1 ? '' : 's'}${overall}`));
  }
  if (failures > 0) {
    lines.push(row('failures', `${failures} failed check${failures === 1 ? '' : 's'} - they are all waiting in the editor`));
  }
  if (streak > 0) {
    const goal = dailyGoal > 0 && Number.isFinite(todayCount)
      ? `  ·  today ${Math.min(todayCount, dailyGoal)}/${dailyGoal}${todayCount >= dailyGoal ? ' (goal met)' : ''}`
      : '';
    lines.push(row('streak', `${streak} day${streak === 1 ? '' : 's'}${goal}`));
  }
  if (nextUp) lines.push(row('next up', nextUp));

  return lines;
}
