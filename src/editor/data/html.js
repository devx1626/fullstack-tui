/**
 * Markup extras for the next-UI completion superset (overhaul §8.9, task 2.7).
 *
 * `src/core/complete.js` already carries the tags and per-tag attribute sets the
 * classic editor ships. This file adds what it lacks — character ENTITIES — and
 * the two of them are merged by `src/editor/completions.js`, so the trigger
 * engine stays single-sourced while the data grows.
 *
 * Entries are `[label, insert, detail]`; `insert` is what replaces the typed
 * prefix, so `&amp` finishes as `&amp;` rather than `amp;`.
 */
export const HTML_ENTITIES = [
  ['&amp;', '&amp;', 'ampersand'],
  ['&lt;', '&lt;', 'less-than'],
  ['&gt;', '&gt;', 'greater-than'],
  ['&quot;', '&quot;', 'quotation mark'],
  ['&apos;', '&apos;', 'apostrophe'],
  ['&nbsp;', '&nbsp;', 'non-breaking space'],
  ['&copy;', '&copy;', 'copyright'],
  ['&reg;', '&reg;', 'registered'],
  ['&trade;', '&trade;', 'trademark'],
  ['&mdash;', '&mdash;', 'em dash'],
  ['&ndash;', '&ndash;', 'en dash'],
  ['&hellip;', '&hellip;', 'ellipsis'],
  ['&laquo;', '&laquo;', 'left angle quote'],
  ['&raquo;', '&raquo;', 'right angle quote'],
  ['&lsquo;', '&lsquo;', 'left single quote'],
  ['&rsquo;', '&rsquo;', 'right single quote'],
  ['&ldquo;', '&ldquo;', 'left double quote'],
  ['&rdquo;', '&rdquo;', 'right double quote'],
  ['&times;', '&times;', 'multiplication sign'],
  ['&divide;', '&divide;', 'division sign'],
  ['&plusmn;', '&plusmn;', 'plus-minus'],
  ['&deg;', '&deg;', 'degree'],
  ['&frac12;', '&frac12;', 'one half'],
  ['&euro;', '&euro;', 'euro'],
  ['&pound;', '&pound;', 'pound sterling'],
  ['&yen;', '&yen;', 'yen'],
  ['&cent;', '&cent;', 'cent'],
  ['&sect;', '&sect;', 'section sign'],
  ['&para;', '&para;', 'pilcrow'],
  ['&middot;', '&middot;', 'middle dot'],
  ['&bull;', '&bull;', 'bullet'],
  ['&larr;', '&larr;', 'left arrow'],
  ['&rarr;', '&rarr;', 'right arrow'],
  ['&uarr;', '&uarr;', 'up arrow'],
  ['&darr;', '&darr;', 'down arrow'],
  ['&check;', '&check;', 'check mark'],
  ['&star;', '&star;', 'star'],
  ['&hearts;', '&hearts;', 'heart'],
];

/** HTML boolean/valueless attributes, offered without an `=` and a quote pair. */
export const BOOLEAN_ATTRS = new Set([
  'required', 'disabled', 'checked', 'readonly', 'multiple', 'selected', 'hidden',
  'autofocus', 'autoplay', 'controls', 'loop', 'muted', 'novalidate', 'open', 'default',
]);
