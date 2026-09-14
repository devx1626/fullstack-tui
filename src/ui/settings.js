/**
 * UI settings store (overhaul task 0.6; errors-and-qol-spec §4.1).
 *
 * `.data/settings.json` holds everything the UI adds on top of the classic
 * progress file: goal config, milestone flags, banner dismissals, palette
 * recents, theme, editor prefs. All keys optional, unknown keys preserved,
 * corrupted file recovers to defaults (progress.json is never touched).
 */import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(HERE, '..', '..', '.data', 'settings.json');

export function defaults() {
  return {
    version: 1,
    onboardedAt: null,
    theme: null, // null = auto
    editor: { vimMode: true, tabSize: 2, wrap: false },
    mouse: true,
    sound: 'bell', // 'bell' (BEL + OSC 9 notify) | 'off' — docs/multimedia.md §5
    icons: 'auto',
    goal: { daily: 3 }, // 0 = off
    milestonesSeen: [],
    bannerDismissedOn: null, // 'YYYY-MM-DD' when today's banner is dismissed
    palette: { recent: [] },
  };
}

const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Deep-merge saved values over defaults; unknown keys survive the round trip. */
export function merge(saved) {
  const base = defaults();
  const out = { ...base, ...saved };
  for (const key of ['editor', 'goal', 'palette']) {
    out[key] = { ...base[key], ...(saved && saved[key]) };
  }
  if (!Array.isArray(out.milestonesSeen)) out.milestonesSeen = [];
  return out;
}

export class Settings {
  constructor(file = SETTINGS_FILE) {
    this.file = file;
    this.data = this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return merge(parsed);
    } catch {
      // Missing OR corrupted → defaults (corruption never blocks the TUI).
      return defaults();
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch {
      /* disk problems never crash the TUI (same policy as Store) */
    }
  }

  // -- Q6 at-risk banner -----------------------------------------------------
  bannerVisible(streak) {
    if (!streak || streak.current < 2) return false;
    if (this.data.bannerDismissedOn === today()) return false;
    return true;
  }

  dismissBanner() {
    this.data.bannerDismissedOn = today();
    this.save();
  }

  // -- Q5 milestones ----------------------------------------------------------
  /**
   * Returns the milestone ids to celebrate now (and marks them seen).
   * Ids: `streak-7`, `streak-30`, `streak-100`, `best-<n>`, `module-<id>-<pct>`.
   */
  takeMilestones(stats) {
    const earned = [];
    const streak = stats.streak || { current: 0, best: 0 };
    for (const n of [7, 30, 100]) {
      if (streak.current >= n) earned.push(`streak-${n}`);
    }
    if (streak.best > 0 && streak.current === streak.best) earned.push(`best-${streak.best}`);
    for (const m of stats.perModule) {
      for (const pct of [25, 50, 75, 100]) {
        if (m.percent >= pct) earned.push(`module-${m.id}-${pct}`);
      }
    }
    const fresh = earned.filter((id) => !this.data.milestonesSeen.includes(id));
    if (fresh.length) {
      this.data.milestonesSeen.push(...fresh);
      this.save();
    }
    return fresh;
  }

  // -- Q2 palette recents -------------------------------------------------------
  pushRecent(id) {
    const recent = this.data.palette.recent.filter((x) => x !== id);
    recent.unshift(id);
    this.data.palette.recent = recent.slice(0, 5);
    this.save();
  }

  // -- Q14 daily goal -------------------------------------------------------------
  goalDaily() {
    const g = this.data.goal.daily;
    return Number.isFinite(g) ? g : 3;
  }

  goalProgress(store) {
    const goal = this.goalDaily();
    if (!goal) return null;
    const done = (store.data.days[today()] || {}).challenges || 0;
    return { done, goal, complete: done >= goal, pct: Math.min(100, Math.round((done / goal) * 100)) };
  }
}

export { today, SETTINGS_FILE };
