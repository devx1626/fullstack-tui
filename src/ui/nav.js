/**
 * List navigation (pure) — the cursor math behind nav.up/down/pageUp/pageDown
 * /first/last (Q3's `g`/`G` endpoints included).
 *
 * Both UIs move a cursor through a list of `count` rows; the next UI's host
 * and the classic app's screens must agree, so the rule lives here once:
 * movement CLAMPS (never wraps) and an empty list keeps the cursor at 0.
 * Returns null for ids that are not list movement.
 */

export const LIST_MOVES = ['nav.up', 'nav.down', 'nav.pageUp', 'nav.pageDown', 'nav.first', 'nav.last'];

const PAGE = 10;

/** Next cursor for a movement id, or null when the id doesn't move a cursor. */
export function nextIndex(cursor, id, count = 0, page = PAGE) {
  const n = Math.max(0, count | 0);
  const last = Math.max(0, n - 1);
  const at = Math.max(0, Math.min(cursor | 0, last));
  switch (id) {
    case 'nav.up': return Math.max(0, at - 1);
    case 'nav.down': return Math.min(last, at + 1);
    case 'nav.pageUp': return Math.max(0, at - page);
    case 'nav.pageDown': return Math.min(last, at + page);
    case 'nav.first': return 0;
    case 'nav.last': return last;
    default: return null;
  }
}

/** True when the id is list movement (used to route ids in one place). */
export function isListMove(id) {
  return LIST_MOVES.includes(id);
}
