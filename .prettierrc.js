/** Prettier config (P1-5, minimal): only the knobs that cannot churn diffs.
 *
 * No `printWidth` on purpose. The house style wraps manually and allows
 * long lines (comment blocks, regexes, string tables) where they read
 * better; a 100-col hard wrap would reformat most of the repo in one
 * commit and drown every blame. ESLint owns the semantic rules; this
 * config only normalises quotes/semicolons/trailing commas if `format`
 * is ever pointed at new files.
 */
export default {
  useTabs: false,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  bracketSameLine: false,
};
