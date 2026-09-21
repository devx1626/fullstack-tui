/**
 * Q5 milestone celebrations — the shared id → text step for both UIs.
 *
 * `Settings.takeMilestones(stats)` (src/ui/settings.js) decides WHICH
 * milestones are fresh and marks them seen exactly once; this module decides
 * WHAT to say about each one. The classic app's pass path (src/app.js) and the
 * next-UI challenge route (src/ui/routes.jsx) both go through here, so the two
 * renderers can never disagree about the wording — the same single-source rule
 * `src/ui/preferences.js` applies to the settings rows.
 *
 * Pure: no store, no settings, no rendering. Glyphs always come from an icon
 * set (defaulting to unicode), so tier D stays 7-bit (the §9b tour's rule).
 */

/**
 * Human label for one milestone id, without the celebration prefix.
 * Unknown ids degrade to the raw id rather than throwing — a new milestone
 * kind added in settings.js still surfaces.
 *
 * @param {string} id  e.g. `streak-7`, `best-12`, `module-html-basics-100`
 * @returns {string}
 */
export function milestoneLabel(id) {
  if (id.startsWith('streak-')) return `${id.slice('streak-'.length)}-day streak!`;
  if (id.startsWith('best-')) return `new best streak: ${id.slice('best-'.length)} days`;
  if (id.startsWith('module-')) {
    return `${id.slice('module-'.length).replace(/-(\d+)$/, ' $1%')} complete`;
  }
  return id;
}

/**
 * The toast line for the first fresh milestone of a pass (classic appends this
 * to its pass note; the Ink route shows it as a toast). Returns '' when there
 * is nothing to celebrate, so both call sites can append/branch unconditionally.
 *
 * @param {string[]} milestones  takeMilestones() output (fresh ids)
 * @param {object} [icons]       active icon set (unicode default; ascii keeps tier D 7-bit)
 * @returns {string}
 */
export function milestoneToast(milestones, icons) {
  if (!milestones || !milestones.length) return '';
  const star = (icons && icons.star) || '\u2605';
  return `${star} ${milestoneLabel(milestones[0])}`;
}
