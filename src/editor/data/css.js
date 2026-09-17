/**
 * CSS extras for the next-UI completion superset (overhaul §8.9, task 2.7).
 *
 * `src/core/complete.js` covers properties, their values and a handful of
 * at-rules. What a learner reaches for next is selectors — `:hover`,
 * `::before`, `:nth-child()` — and the newer at-rules, so those live here and
 * are merged in by `src/editor/completions.js`.
 *
 * Entries are `[label, insert, detail]`, matching the classic engine's shapes so
 * the merged list stays uniform.
 */
export const CSS_PSEUDO_CLASSES = [
  [':hover', ':hover', 'pointer over the element'],
  [':focus', ':focus', 'element has focus'],
  [':focus-visible', ':focus-visible', 'keyboard focus only'],
  [':focus-within', ':focus-within', 'a child has focus'],
  [':active', ':active', 'being pressed'],
  [':visited', ':visited', 'visited link'],
  [':disabled', ':disabled', 'disabled control'],
  [':checked', ':checked', 'checked input'],
  [':invalid', ':invalid', 'failed validation'],
  [':valid', ':valid', 'passed validation'],
  [':required', ':required', 'required field'],
  [':empty', ':empty', 'no children'],
  [':first-child', ':first-child', 'first child'],
  [':last-child', ':last-child', 'last child'],
  [':only-child', ':only-child', 'only child'],
  [':nth-child()', ':nth-child(2n)', 'every other child'],
  [':nth-of-type()', ':nth-of-type(2)', 'second of its type'],
  [':not()', ':not(:last-child)', 'exclude a match'],
  [':is()', ':is(h1, h2, h3)', 'match any of these'],
  [':has()', ':has(> img)', 'contains a match'],
  [':is-empty', ':is-empty', 'deprecated alias for :empty'],
  [':root', ':root', 'the document root'],
  ['::before', '::before', 'generated content before'],
  ['::after', '::after', 'generated content after'],
  ['::placeholder', '::placeholder', 'input placeholder text'],
  ['::selection', '::selection', 'selected text'],
  ['::marker', '::marker', 'list bullet'],
  ['::backdrop', '::backdrop', 'dialog backdrop'],
  ['::file-selector-button', '::file-selector-button', 'file input button'],
];

export const CSS_AT_RULES = [
  ['@media', '@media (min-width: 768px) { }', 'responsive breakpoint'],
  ['@media prefers-color-scheme', '@media (prefers-color-scheme: dark) { }', 'dark mode'],
  ['@media reduced-motion', '@media (prefers-reduced-motion: reduce) { }', 'honour motion settings'],
  ['@supports', '@supports (display: grid) { }', 'feature query'],
  ['@layer', '@layer base, components, utilities;', 'cascade layer'],
  ['@container', '@container (min-width: 30ch) { }', 'container query'],
  ['@keyframes', '@keyframes fade-in {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}', 'animation steps'],
  ['@font-face', '@font-face {\n  font-family: "Name";\n  src: url("name.woff2") format("woff2");\n}', 'web font'],
  ['@import', '@import "other.css";', 'load another stylesheet'],
  ['@font-feature-values', '@font-feature-values Font { }', 'font features'],
  ['@property', '@property --brand {\n  syntax: "<color>";\n  inherits: false;\n  initial-value: #0af;\n}', 'typed custom property'],
  ['@scope', '@scope (.card) to (.content) { }', 'scoped styles'],
];

/** Custom-property values offered after `--x:` (the engine's value pass adds the rest). */
export const CSS_CUSTOM_HINTS = [
  ['var(--brand)', 'var(--brand)', 'theme colour'],
  ['var(--space)', 'var(--space)', 'theme spacing step'],
  ['var(--radius)', 'var(--radius)', 'theme corner radius'],
];
