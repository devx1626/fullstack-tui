/**
 * Language-aware completion + auto-pairing for the in-TUI editor.
 *
 * The editor is a plain array of lines, so everything here works on `(text,
 * offset)` and returns `(text, offset)` - no DOM, no hidden editor state, which
 * makes the behaviour easy to reason about and to test.
 *
 * Two halves:
 *   - `completionsFor` proposes items for the prefix under the cursor, using
 *     knowledge of the language plus the words already present in the file
 *     (the same "document words" trick VS Code falls back on).
 *   - `smartInsert` / `pairBackspace` implement the editor reflexes people
 *     expect: brackets and quotes close themselves, `>` closes the tag you
 *     opened, and backspacing an empty pair removes both halves.
 *
 * The vocabulary is deliberately curated rather than exhaustive: it covers the
 * things this curriculum teaches, and a wrong suggestion is worse than none.
 */

// ---------------------------------------------------------------------------
// Language handling
// ---------------------------------------------------------------------------

const MARKUP = new Set(['html', 'htm', 'xhtml', 'xml', 'svg', 'jsx', 'tsx']);
const CSS_LIKE = new Set(['css', 'scss', 'sass', 'less']);
const JS_LIKE = new Set(['js', 'javascript', 'mjs', 'cjs', 'ts', 'typescript', 'node', 'nodejs']);
const SHELL_LIKE = new Set(['sh', 'bash', 'shell', 'zsh', 'console', 'terminal', 'git']);

const ALIASES = { htm: 'html', javascript: 'js', mjs: 'js', cjs: 'js', nodejs: 'js', typescript: 'ts', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh', yml: 'yaml', dockerfile: 'docker', sqlite: 'sql', postgres: 'sql' };

/** Map any language label the curriculum uses onto a known family. */
export function normaliseLang(lang) {
  const key = String(lang || 'text').toLowerCase().trim();
  const resolved = ALIASES[key] || key;
  if (MARKUP.has(resolved)) return 'markup';
  if (CSS_LIKE.has(resolved)) return 'css';
  if (JS_LIKE.has(resolved)) return 'js';
  if (SHELL_LIKE.has(resolved)) return 'sh';
  if (resolved === 'sql') return 'sql';
  if (resolved === 'json') return 'json';
  if (resolved === 'yaml') return 'yaml';
  if (resolved === 'md' || resolved === 'markdown') return 'md';
  return 'text';
}

export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', '!doctype',
]);

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const HTML_TAGS = [
  'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote', 'body', 'br', 'button',
  'canvas', 'caption', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn',
  'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
  'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style',
  'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th',
  'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
];

const GLOBAL_ATTRS = [
  'class', 'id', 'style', 'title', 'lang', 'dir', 'hidden', 'tabindex', 'role', 'aria-label',
  'aria-hidden', 'aria-describedby', 'data-id', 'contenteditable', 'draggable', 'spellcheck',
];

const TAG_ATTRS = {
  a: ['href', 'target', 'rel', 'download'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes', 'decoding'],
  input: ['type', 'name', 'value', 'placeholder', 'required', 'disabled', 'checked', 'readonly', 'min', 'max', 'step', 'pattern', 'autocomplete'],
  form: ['action', 'method', 'enctype', 'novalidate', 'autocomplete'],
  label: ['for'],
  button: ['type', 'disabled', 'name', 'value'],
  script: ['src', 'type', 'defer', 'async'],
  link: ['rel', 'href', 'type', 'media', 'crossorigin'],
  meta: ['name', 'content', 'charset', 'property', 'http-equiv'],
  video: ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'width', 'height', 'preload'],
  audio: ['src', 'controls', 'autoplay', 'loop', 'muted', 'preload'],
  source: ['srcset', 'src', 'type', 'media', 'sizes'],
  iframe: ['src', 'title', 'width', 'height', 'loading', 'allow', 'sandbox'],
  td: ['colspan', 'rowspan', 'headers'],
  th: ['colspan', 'rowspan', 'scope'],
  ol: ['type', 'start', 'reversed'],
  li: ['value'],
  time: ['datetime'],
  blockquote: ['cite'],
  q: ['cite'],
  details: ['open'],
  option: ['value', 'selected', 'disabled'],
  select: ['name', 'multiple', 'required', 'disabled', 'size'],
  textarea: ['name', 'rows', 'cols', 'placeholder', 'required', 'maxlength'],
  table: ['border', 'cellpadding', 'cellspacing'],
  track: ['kind', 'src', 'srclang', 'label', 'default'],
  area: ['shape', 'coords', 'href', 'alt'],
};

/** CSS properties worth suggesting, each with the values a learner would type. */
const CSS_PROPS = {
  display: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none'],
  position: ['relative', 'absolute', 'fixed', 'sticky', 'static'],
  'flex-direction': ['row', 'column', 'row-reverse', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
  'flex-grow': ['0', '1'],
  'flex-shrink': ['0', '1'],
  'flex-basis': ['auto', '0', '100%'],
  'justify-content': ['center', 'space-between', 'space-around', 'space-evenly', 'flex-start', 'flex-end'],
  'align-items': ['center', 'flex-start', 'flex-end', 'stretch', 'baseline'],
  'align-self': ['center', 'flex-start', 'flex-end', 'stretch'],
  'place-items': ['center'],
  'grid-template-columns': ['repeat(3, 1fr)', '1fr 1fr', 'auto 1fr'],
  'grid-template-rows': ['auto 1fr', 'repeat(2, minmax(0, 1fr))'],
  'grid-column': ['span 2', '1 / -1'],
  gap: ['0.5rem', '1rem', '1.5rem'],
  'row-gap': ['1rem'],
  'column-gap': ['1rem'],
  margin: ['0', 'auto', '1rem', '0 0 1rem'],
  'margin-top': ['1rem'],
  'margin-bottom': ['1rem'],
  'margin-inline': ['auto'],
  'margin-inline-start': ['auto'],
  padding: ['0', '0.5rem', '1rem', '2rem'],
  'padding-inline': ['1rem'],
  width: ['100%', '100vw', 'min-content', 'fit-content(40ch)'],
  'max-width': ['65ch', '100%', '1200px'],
  'min-width': ['0'],
  height: ['100%', '100vh', 'auto'],
  'min-height': ['100vh', '100dvh'],
  'box-sizing': ['border-box', 'content-box'],
  color: ['inherit', 'currentColor', '#1b1b1f'],
  background: ['#fff', 'transparent'],
  'background-color': ['#fbfbfd', 'transparent'],
  'background-image': ['linear-gradient(180deg, #fff, #eee)'],
  border: ['1px solid #d8d8de', 'none'],
  'border-radius': ['0.5rem', '9999px', '50%'],
  'border-bottom': ['1px solid #d8d8de'],
  outline: ['2px solid currentColor'],
  'outline-offset': ['2px'],
  'box-shadow': ['0 1px 2px rgb(0 0 0 / 0.08)'],
  'font-family': ['system-ui, sans-serif', 'ui-monospace, monospace'],
  'font-size': ['1rem', 'clamp(1rem, 2vw, 1.5rem)'],
  'font-weight': ['400', '600', '700'],
  'font-style': ['italic'],
  'font-variant-numeric': ['tabular-nums'],
  'line-height': ['1.6', '1.2'],
  'letter-spacing': ['0.01em'],
  'text-align': ['center', 'right', 'left'],
  'text-decoration': ['underline', 'none'],
  'text-decoration-thickness': ['3px'],
  'text-underline-offset': ['0.2em'],
  'text-transform': ['uppercase', 'capitalize', 'lowercase'],
  'text-wrap': ['balance', 'pretty'],
  'white-space': ['pre', 'pre-wrap', 'nowrap'],
  'overflow-wrap': ['anywhere'],
  'word-break': ['break-word'],
  overflow: ['hidden', 'auto', 'scroll'],
  'overflow-x': ['auto', 'hidden'],
  'aspect-ratio': ['16 / 9', '1 / 1'],
  'object-fit': ['cover', 'contain'],
  opacity: ['0.8', '1'],
  'cursor': ['pointer', 'not-allowed'],
  transition: ['color 150ms ease, background 150ms ease'],
  transform: ['translateY(-2px)'],
  'z-index': ['1', '10'],
  visibility: ['hidden', 'visible'],
  content: ["''", '""'],
  'list-style': ['none', 'disc', 'decimal'],
  'user-select': ['none'],
  'scroll-margin-top': ['2rem'],
  'pointer-events': ['none'],
  'clip-path': ['inset(0)'],
  inset: ['0'],
  top: ['0'], right: ['0'], bottom: ['0'], left: ['0'],
  'grid-area': ['header'],
  'animation-duration': ['200ms'],
};

const CSS_AT_RULES = ['@media (min-width: 768px)', '@supports (display: grid)', '@keyframes fade-in', '@font-face', '@layer base'];

/** Values worth offering once the cursor is inside `attr="..."`. */
const ATTR_VALUES = {
  type: ['text', 'email', 'password', 'number', 'search', 'tel', 'url', 'checkbox', 'radio', 'date', 'file', 'range', 'color', 'submit', 'button', 'hidden', 'module'],
  rel: ['stylesheet', 'icon', 'preload', 'canonical', 'noopener', 'noreferrer', 'alternate'],
  method: ['get', 'post', 'put', 'patch', 'delete'],
  target: ['_blank', '_self', '_parent', '_top'],
  loading: ['lazy', 'eager'],
  decoding: ['async', 'sync', 'auto'],
  enctype: ['multipart/form-data', 'application/x-www-form-urlencoded', 'text/plain'],
  autocomplete: ['on', 'off', 'email', 'name', 'username', 'current-password', 'new-password', 'tel', 'street-address'],
  charset: ['utf-8'],
  crossorigin: ['anonymous', 'use-credentials'],
  dir: ['ltr', 'rtl', 'auto'],
  kind: ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'],
  scope: ['col', 'row', 'colgroup', 'rowgroup'],
  preload: ['none', 'metadata', 'auto'],
  inputmode: ['text', 'numeric', 'decimal', 'email', 'tel', 'url', 'search'],
  referrerpolicy: ['no-referrer', 'origin', 'same-origin', 'strict-origin-when-cross-origin'],
  role: ['button', 'link', 'navigation', 'main', 'banner', 'contentinfo', 'search', 'alert', 'dialog', 'status', 'tab', 'tabpanel', 'list', 'listitem'],
};

const JS_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue',
  'new', 'class', 'extends', 'super', 'this', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch',
  'finally', 'throw', 'async', 'await', 'switch', 'case', 'default', 'null', 'undefined', 'true',
  'false', 'delete', 'void', 'yield', 'static', 'get', 'set', 'export', 'import', 'from', 'as',
];

const JS_SNIPPETS = [
  ['fori', 'for (let i = 0; i < n; i += 1) {\n  \n}', 'loop over a range'],
  ['forof', 'for (const item of items) {\n  \n}', 'loop over an iterable'],
  ['foreach', 'items.forEach((item) => {\n  \n});', 'array forEach'],
  ['fn', 'function name(args) {\n  \n}', 'function declaration'],
  ['arrow', '(args) => {\n  \n}', 'arrow function'],
  ['asyncfn', 'async function name(args) {\n  \n}', 'async function'],
  ['trycatch', 'try {\n  \n} catch (err) {\n  console.error(err);\n}', 'try / catch'],
  ['ifelse', 'if (condition) {\n  \n} else {\n  \n}', 'if / else'],
  ['mapsel', 'document.querySelectorAll(selector)', 'select many elements'],
  ['qsel', 'document.querySelector(selector)', 'select one element'],
  ['addevent', 'addEventListener("click", (event) => {\n  \n})', 'listen for an event'],
  ['log', 'console.log()', 'log a value'],
  ['table', 'console.table()', 'log a table'],
  ['fetchj', 'const response = await fetch(url);\nif (!response.ok) throw new Error(`HTTP ${response.status}`);\nconst data = await response.json();', 'fetch JSON, checking status'],
];

const JS_BUILTINS = [
  'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'createElement',
  'appendChild', 'append', 'prepend', 'remove', 'classList', 'dataset', 'textContent', 'innerHTML',
  'setAttribute', 'getAttribute', 'preventDefault', 'stopPropagation', 'closest', 'matches',
  'map', 'filter', 'reduce', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf', 'slice',
  'splice', 'join', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'replace', 'padStart', 'padEnd',
  'sort', 'reverse', 'keys', 'values', 'entries', 'from', 'isArray', 'assign', 'freeze', 'parse',
  'stringify', 'round', 'floor', 'ceil', 'random', 'max', 'min', 'abs', 'resolve', 'reject', 'all',
  'allSettled', 'race', 'then', 'catch', 'finally', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'fetch', 'json', 'text', 'structuredClone', 'localStorage', 'Number', 'String',
  'Boolean', 'Object', 'Array', 'JSON', 'Math', 'Promise', 'Date', 'Map', 'Set', 'RegExp', 'Error',
];

const TS_EXTRAS = [
  ['interface ', 'interface Name {\n  \n}', 'declare an object shape'],
  ['type ', 'type Name = {\n  \n}', 'declare an alias'],
  ['enum ', 'enum Name {\n  \n}', 'declare an enum'],
  ['generic', '<T>', 'a type parameter'],
  ['readonly ', 'readonly ', 'immutable property'],
];

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE',
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'NOT NULL', 'UNIQUE', 'CHECK', 'DEFAULT', 'JOIN',
  'LEFT JOIN', 'INNER JOIN', 'ON', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'AS', 'AND',
  'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'IN', 'BETWEEN', 'LIKE', 'DISTINCT', 'COUNT(*)',
  'SUM', 'AVG', 'MIN', 'MAX', 'CASE WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'BEGIN', 'COMMIT',
  'ROLLBACK', 'WITH', 'RETURNING', 'ON CONFLICT', 'EXPLAIN QUERY PLAN', 'INDEX',
];

const SQL_SNIPPETS = [
  ['sel', 'SELECT column\nFROM table\nWHERE condition;', 'a filtered select'],
  ['selagg', 'SELECT category, COUNT(*) AS total\nFROM table\nGROUP BY category\nHAVING COUNT(*) > 1\nORDER BY total DESC;', 'group + having'],
  ['leftjoin', 'SELECT a.name, b.id\nFROM a\nLEFT JOIN b ON b.a_id = a.id\nWHERE b.id IS NULL;', 'find rows with no match'],
  ['cte', 'WITH recent AS (\n  SELECT * FROM orders WHERE placed_at > date(\'now\', \'-30 days\')\n)\nSELECT * FROM recent;', 'a common table expression'],
  ['insert', 'INSERT INTO table (column) VALUES (\'value\');', 'insert a row'],
  ['create', 'CREATE TABLE name (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);', 'create a table'],
  ['temptable', 'PRAGMA foreign_keys = ON;', 'turn foreign keys on'],
  ['explain', 'EXPLAIN QUERY PLAN SELECT 1;', 'inspect a query plan'],
];

const SHELL_COMMANDS = [
  'git init', 'git status', 'git add', 'git commit -m', 'git log --oneline --graph', 'git diff',
  'git branch', 'git switch -c', 'git checkout', 'git checkout -b', 'git merge', 'git rebase -i', 'git restore', 'git reset --hard',
  'git remote add origin', 'git push -u origin main', 'git stash', 'git revert', 'git tag',
  'npm init -y', 'npm install', 'npm run', 'npx', 'node', 'mkdir -p', 'cd', 'ls -la', 'cat',
  'curl -s', 'chmod +x', 'export', 'grep -rn', 'find . -name',
];

/**
 * Shell commands are phrases, so completing them well means knowing the
 * command that opens the line and what can follow it. `subs` are the words
 * that come next, `flags` the switches that command accepts, `subFlags` the
 * extra switches a particular subcommand unlocks.
 */
const SHELL_SPEC = {
  git: {
    subs: ['init', 'status', 'add', 'commit', 'log', 'diff', 'branch', 'switch', 'checkout', 'merge', 'rebase', 'restore', 'reset', 'remote', 'push', 'pull', 'fetch', 'stash', 'revert', 'tag', 'clone', 'show', 'blame', 'clean', 'cherry-pick', 'config'],
    flags: ['--help', '--version', '-C'],
    subFlags: {
      add: ['-A', '-p', '--all'],
      commit: ['-m', '-am', '--amend', '--no-verify'],
      log: ['--oneline', '--graph', '--stat', '--author', '-n', '--decorate'],
      diff: ['--staged', '--stat', '--name-only', '--cached'],
      push: ['-u', '--force-with-lease', '--tags'],
      branch: ['-a', '-d', '-D', '-m', '-vv'],
      rebase: ['-i', '--continue', '--abort', '--onto'],
      reset: ['--hard', '--soft', '--mixed', 'HEAD~1'],
      stash: ['push', 'pop', 'list', 'apply', 'drop'],
      remote: ['-v', 'add', 'set-url', 'remove'],
      config: ['--global', '--local', 'user.name', 'user.email'],
      checkout: ['-b', '--', 'main', 'HEAD~1'],
      switch: ['-c', '-', 'main'],
      clean: ['-fd', '-n'],
      tag: ['-a', '-m', '-d'],
    },
  },
  npm: {
    subs: ['init', 'install', 'uninstall', 'run', 'test', 'start', 'exec', 'ci', 'audit', 'outdated', 'publish', 'link', 'update', 'ls'],
    flags: ['--save-dev', '--save-exact', '--global', '--omit=dev', '--prefix', '-y'],
    subFlags: { run: ['dev', 'build', 'test', 'lint', 'check', 'start'], install: ['-D', '-g', '--save-dev', '--no-audit'], audit: ['--fix', '--production'] },
  },
  npx: { subs: ['--yes', 'tsc', 'eslint', 'prettier', 'vite', 'nodemon'], flags: ['--yes', '--no-install'] },
  node: { subs: ['--version', '--watch', '-e', '--test', '--inspect', '--env-file=.env'], flags: ['--version', '--watch', '--test', '--experimental-strip-types', '--env-file=.env', '--input-type=module'], subFlags: {} },
  docker: {
    subs: ['build', 'run', 'ps', 'images', 'exec', 'logs', 'stop', 'rm', 'rmi', 'compose', 'pull', 'push', 'inspect', 'network', 'volume', 'login'],
    flags: ['--help', '--version', '-d'],
    subFlags: {
      build: ['-t', '--no-cache', '-f', '--platform'],
      run: ['-d', '-p', '--name', '-e', '--rm', '-v', '--network', '-it'],
      ps: ['-a', '-q', '--format'],
      exec: ['-it', '-u', 'sh', 'bash'],
      logs: ['-f', '--tail'],
      compose: ['up', 'down', 'build', 'logs', 'ps', 'restart', 'exec'],
      login: ['-u', '--password-stdin'],
    },
  },
  kubectl: {
    subs: ['get', 'describe', 'apply', 'delete', 'logs', 'exec', 'port-forward', 'rollout', 'scale', 'config', 'top'],
    flags: ['--help', '-n', '-o', '--context', '-f'],
    subFlags: { get: ['pods', 'svc', 'deploy', 'nodes', 'all', '-o wide', '-o yaml'], apply: ['-f', '--dry-run'], logs: ['-f', '--tail=100', '--previous'], config: ['current-context', 'get-contexts', 'use-context'] },
  },
  curl: { subs: ['-s', '-X', '-H', '-d', '-o', '-i', '-v'], flags: ['-s', '-sS', '-i', '-v', '-X GET', '-X POST', '-H', '-d', '-o', '-L', '-f', '-w'] },
  psql: { subs: ['-h', '-U', '-d', '-c', '-f', '-l'], flags: ['-h', '-U', '-d', '-c', '-f', '-l', '-p', '-W'] },
  sqlite3: { subs: ['-header', '-column', '.tables', '.schema', '.mode', '.read'], flags: ['-header', '-column', '-csv', '-line'] },
  ssh: { subs: ['-i', '-p', '-L', '-o'], flags: ['-i', '-p', '-L', '-N', '-f', '-o', '-t'] },
  systemctl: { subs: ['start', 'stop', 'restart', 'status', 'enable', 'disable', 'daemon-reload', 'is-active', 'list-units'], flags: ['--now', '--user', '-l'] },
  journalctl: { subs: ['-u', '-f', '-n', '--since', '--grep'], flags: ['-u', '-f', '-n', '--since', '--grep', '-xe'] },
  pm2: { subs: ['start', 'stop', 'restart', 'list', 'logs', 'delete', 'save', 'monit', 'status'], flags: ['--name', '-i', '--watch', '--update-env'] },
  grep: { subs: ['-rn', '-i', '-l', '-c', '-E', '-w', '-A', '-B', '-v'], flags: ['-rn', '-i', '-l', '-c', '-E', '-w', '-A', '-B', '-v', '--include'] },
  find: { subs: ['.', '-name', '-type', '-maxdepth', '-not', '-exec'], flags: ['-name', '-type f', '-type d', '-maxdepth', '-exec', '-delete', '-print'] },
  chmod: { subs: ['+x', '755', '644', '-R'], flags: ['-R', '+x', '755', '644'] },
  tar: { subs: ['-czf', '-xzf', '-tzf', '-cvf'], flags: ['-czf', '-xzf', '-tzf', '-v', '-f'] },
  lsof: { subs: ['-i', '-p', '-u'], flags: ['-i', '-iTCP', '-p', '-u', '-n', '-P'] },
  netstat: { subs: ['-tulpn', '-an', '-rn'], flags: ['-tulpn', '-an', '-rn', '-i'] },
  export: { subs: [], flags: [] },
  ls: { subs: [], flags: ['-la', '-l', '-a', '-lh', '-R', '-t', '--color'] },
  mkdir: { subs: [], flags: ['-p', '-v'] },
  rm: { subs: [], flags: ['-rf', '-r', '-f', '-i', '-d'] },
  cp: { subs: [], flags: ['-r', '-R', '-i', '-v', '-a'] },
  mv: { subs: [], flags: ['-i', '-v', '-n'] },
  tail: { subs: [], flags: ['-f', '-n', '-F', '--follow'] },
  head: { subs: [], flags: ['-n', '-c'] },
  touch: { subs: [], flags: [] },
  ps: { subs: [], flags: ['aux', '-ef', '-u', '--sort=-%mem'] },
  kill: { subs: [], flags: ['-9', '-15', '-l'] },
  which: { subs: [], flags: [] },
  env: { subs: [], flags: [] },
  sort: { subs: [], flags: ['-n', '-r', '-u', '-k'] },
  wc: { subs: [], flags: ['-l', '-w', '-c'] },
};

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

const isWordChar = (ch) => /[A-Za-z0-9_$]/.test(ch || '');

/** Build a completion item. `caret` is the offset from the insert start. */
function item(label, kind, detail, insert, caret) {
  return { label, kind, detail: detail || '', insert: insert ?? label, caret: caret ?? (insert ?? label).length };
}

function matches(prefix, label) {
  if (!prefix) return true;
  return label.toLowerCase().startsWith(prefix.toLowerCase());
}

/** Rank: exact prefix, then prefix length, then kind, then label. */
const KIND_ORDER = { snip: 0, tag: 1, kw: 2, prop: 3, attr: 4, value: 5, fn: 6, cmd: 7, flag: 8, word: 9 };

function rank(prefix, a, b) {
  const aExact = a.label.toLowerCase() === prefix.toLowerCase() ? 0 : 1;
  const bExact = b.label.toLowerCase() === prefix.toLowerCase() ? 0 : 1;
  if (aExact !== bExact) return aExact - bExact;
  const ka = KIND_ORDER[a.kind] ?? 9;
  const kb = KIND_ORDER[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;
  return a.label.localeCompare(b.label);
}

/** Identifiers already in the document - the fallback every editor needs. */
export function documentWords(text, prefix, limit = 40) {
  const seen = new Map();
  for (const word of String(text).match(/[A-Za-z_$][\w$]*/g) || []) {
    if (word.length < 3) continue;
    if (prefix && !matches(prefix, word)) continue;
    // Offering back the exact word under the cursor is a no-op suggestion.
    if (prefix && word.toLowerCase() === prefix.toLowerCase()) continue;
    if (!seen.has(word)) seen.set(word, word);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Context detection
// ---------------------------------------------------------------------------

function lineContext(lang, text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  const prefixMatch = before.match(/[A-Za-z0-9_$][\w$-]*$/);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const from = offset - prefix.length;
  const charBefore = before.slice(before.length - prefix.length - 1, before.length - prefix.length);
  return { lineStart, before, prefix, from, charBefore };
}

function insideOpenTag(before) {
  const lt = before.lastIndexOf('<');
  if (lt === -1) return null;
  const gt = before.lastIndexOf('>');
  if (gt > lt) return null;
  return before.slice(lt);
}

/** `{ attr, value }` when the caret sits inside an unclosed attribute value. */
function insideAttrValue(open) {
  const m = open.match(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)$|'([^']*)$)/);
  if (!m) return null;
  return { attr: m[1].toLowerCase(), value: m[2] ?? m[3] ?? '' };
}

// ---------------------------------------------------------------------------
// Per-language suggestion builders
// ---------------------------------------------------------------------------

function markupItems(before, prefix) {
  const open = insideOpenTag(before);
  const items = [];

  if (open !== null) {
    const isClosing = open.startsWith('</');
    const tagName = (open.match(/^<\/?([a-zA-Z][\w:-]*)/) || [, ''])[1].toLowerCase();
    const inner = open.replace(/^<\/?[a-zA-Z][\w:-]*/, '');

    // Still typing the tag name: suggest elements (with their closing tag).
    if (!isClosing && !/\s/.test(inner) && !open.endsWith('>')) {
      for (const tag of HTML_TAGS) {
        if (!matches(prefix, tag)) continue;
        const closing = VOID_TAGS.has(tag) ? '' : `</${tag}>`;
        const insert = `${tag}>${closing}`;
        items.push(item(tag, 'tag', VOID_TAGS.has(tag) ? 'void element' : `closes itself`, insert, tag.length + 1));
      }
      return items;
    }

    // Inside `attr="..."`: offer values, never other attribute names.
    const quoted = insideAttrValue(open);
    if (quoted) {
      for (const value of ATTR_VALUES[quoted.attr] || []) {
        if (!matches(prefix, value)) continue;
        items.push(item(value, 'value', `${tagName} ${quoted.attr}`));
      }
      return items;
    }

    // Inside the attributes of a known tag.
    const attrs = [...new Set([...(TAG_ATTRS[tagName] || []), ...GLOBAL_ATTRS])];
    for (const attr of attrs) {
      if (!matches(prefix, attr)) continue;
      const needsValue = !['required', 'disabled', 'checked', 'readonly', 'multiple', 'selected', 'defer', 'async', 'open', 'novalidate'].includes(attr);
      const insert = needsValue ? `${attr}=""` : attr;
      items.push(item(attr, 'attr', needsValue ? `${attr}=""` : attr, insert, needsValue ? attr.length + 2 : attr.length));
    }
    return items;
  }

  // Bare word on the line: still offer the document's own words.
  return items;
}

function cssItems(before, prefix) {
  const items = [];
  const declStart = Math.max(before.lastIndexOf('{'), before.lastIndexOf(';'), before.lastIndexOf('}'));
  const segment = before.slice(declStart + 1);
  const colon = segment.lastIndexOf(':');
  const inValue = colon !== -1 && !segment.slice(colon + 1).includes(';');

  if (prefix.startsWith('@') || (!inValue && /^\s*@/.test(before))) {
    for (const at of CSS_AT_RULES) {
      const label = at.split(' ')[0];
      if (!matches(prefix || '@', label)) continue;
      items.push(item(label, 'kw', at, at, at.indexOf('(') === -1 ? at.length : at.indexOf('(') + 1));
    }
    return items;
  }

  if (inValue) {
    const prop = segment.slice(0, colon).trim().toLowerCase();
    for (const value of CSS_PROPS[prop] || []) {
      if (!matches(prefix, value)) continue;
      items.push(item(value, 'value', prop));
    }
    return items;
  }

  for (const [prop, values] of Object.entries(CSS_PROPS)) {
    if (!matches(prefix, prop)) continue;
    items.push(item(prop, 'prop', values[0] ? `${prop}: ${values[0]}` : prop, `${prop}: `, prop.length + 2));
  }
  return items;
}

/** Where the caret should land inside a snippet body. */
function snippetCaret(body) {
  if (body.includes('{')) return body.indexOf('{') + 2; // inside the block
  if (body.includes('(')) return body.indexOf('(') + 1; // inside the parens
  return body.length;
}

function jsItems(langKey, before, prefix) {
  const items = [];
  for (const kw of JS_KEYWORDS) {
    if (!matches(prefix, kw)) continue;
    items.push(item(kw, 'kw', 'keyword'));
  }
  for (const [label, body, detail] of JS_SNIPPETS) {
    if (!matches(prefix, label)) continue;
    items.push(item(label, 'snip', detail, body, snippetCaret(body)));
  }
  if (langKey === 'ts') {
    for (const [label, body, detail] of TS_EXTRAS) {
      if (!matches(prefix, label.trim())) continue;
      items.push(item(label.trim(), 'snip', detail, body, snippetCaret(body)));
    }
  }
  for (const fn of JS_BUILTINS) {
    if (!matches(prefix, fn)) continue;
    items.push(item(fn, 'fn', 'built-in'));
  }
  return items;
}

function sqlItems(before, prefix) {
  const items = [];
  for (const kw of SQL_KEYWORDS) {
    if (!matches(prefix, kw)) continue;
    items.push(item(kw, 'kw', 'SQL keyword'));
  }
  for (const [label, body, detail] of SQL_SNIPPETS) {
    if (!matches(prefix, label)) continue;
    items.push(item(label, 'snip', detail, body, body.search(/\s/)));
  }
  // Named columns from the schema in the file, so `WHERE custo` can complete.
  return items;
}

/**
 * Shell completion.
 *
 * Returns items plus the offset (relative to `before`) they replace, because a
 * shell line has different replacement spans: completing `git ch` should
 * replace only `ch`, completing `git ` should append, and completing
 * `npm in` should replace `in` with the whole phrase `npm init -y`.
 */
function shellItems(before) {
  const raw = String(before ?? '');
  const line = raw.replace(/^\s+/, '');
  const tokens = line.split(/\s+/).filter(Boolean);
  const cmd = tokens[0] || '';
  const spec = SHELL_SPEC[cmd] || null;
  const atTokenStart = line === '' || /\s$/.test(line);
  const token = atTokenStart ? '' : tokens[tokens.length - 1] || '';
  const tokenFrom = Math.max(0, raw.length - token.length);

  const items = [];
  const seen = new Set();
  const push = (label, detail, insert, caret, kind = 'cmd') => {
    const key = String(label).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item(label, kind, detail, insert ?? label, caret));
  };

  const sub = tokens[1];
  const flagsFor = () => [
    ...((spec && spec.flags) || []),
    ...((spec && sub && spec.subFlags && spec.subFlags[sub]) || []),
  ];

  // Inside a switch: `git commit --a` / `docker run -` / `kubectl get -o`.
  if (spec && token.startsWith('-')) {
    for (const flag of flagsFor()) {
      if (matches(token, flag.split(' ')[0])) push(flag, `flag for ${cmd}`, flag, undefined, 'flag');
    }
    return { items, from: tokenFrom };
  }

  // After the command (or a subcommand) on a fresh token: what can follow?
  if (spec && (atTokenStart || tokens.length > 1)) {
    if (atTokenStart && !sub) {
      for (const s of spec.subs) push(s, `${cmd} subcommand`, s + ' ');
      for (const flag of spec.flags || []) push(flag, `flag for ${cmd}`, flag + ' ', undefined, 'flag');
      return { items, from: raw.length };
    }
    const follow = (sub && spec.subFlags && spec.subFlags[sub]) || spec.subs;
    for (const s of follow) {
      // `-A` style entries are flags, everything else is a word to complete.
      const isFlag = String(s).startsWith('-') || String(s).startsWith('+');
      if (!matches(token, String(s).split(' ')[0])) continue;
      push(s, isFlag ? `flag for ${cmd} ${sub || ''}`.trim() : `${cmd} ${sub || ''}`.trim(), s + (atTokenStart ? ' ' : ''), undefined, isFlag ? 'flag' : 'cmd');
    }
    if (atTokenStart && items.length) return { items, from: raw.length };
    if (items.length) return { items, from: tokenFrom };
  }

  // The command word itself, or an unrecognised command: match whole phrases.
  const prefix = atTokenStart ? line.trim() : token;
  for (const phrase of SHELL_COMMANDS) {
    if (!matches(prefix, phrase)) continue;
    push(phrase, 'command', phrase);
  }
  for (const name of Object.keys(SHELL_SPEC)) {
    if (!matches(prefix, name)) continue;
    push(name, 'command', name + ' ');
  }
  return { items, from: atTokenStart ? raw.length - line.length : tokenFrom };
}

const JSON_WORDS = ['true', 'false', 'null'];
const YAML_WORDS = ['true', 'false', 'null', '---'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Suggestions for the prefix under the cursor.
 *
 * Returns `{ items, from, to }` where `[from, to)` is the range in `text` the
 * chosen item replaces, or `null` when there is nothing to offer.
 */
export function completionsFor(lang, text, offset, limit = 60) {
  const label = String(lang || 'text').toLowerCase().trim();
  const langKey = ALIASES[label] || label;
  const family = normaliseLang(lang);
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const { before, prefix, from, lineStart } = lineContext(family, raw, pos);

  let items = [];
  let fromOverride = null;
  if (family === 'markup') items = markupItems(before, prefix);
  else if (family === 'css') items = cssItems(before, prefix);
  else if (family === 'js') items = jsItems(langKey === 'ts' ? 'ts' : 'js', before, prefix);
  else if (family === 'sql') items = sqlItems(before, prefix);
  else if (family === 'sh') {
    // Shell commands are phrases: match the whole line before the cursor
    // (`git ch` -> `git checkout`) and replace from the start of the command.
    const shell = shellItems(before);
    items = shell.items;
    fromOverride = shell.from;
  }
  else if (family === 'json') items = JSON_WORDS.filter((w) => matches(prefix, w)).map((w) => item(w, 'kw', 'JSON'));
  else if (family === 'yaml') items = YAML_WORDS.filter((w) => matches(prefix, w)).map((w) => item(w, 'kw', 'YAML'));

  // Document words fill the gaps, but never outrank language knowledge.
  if (prefix.length >= 2) {
    const known = new Set(items.map((i) => i.label.toLowerCase()));
    for (const word of documentWords(raw, prefix)) {
      if (known.has(word.toLowerCase())) continue;
      items.push(item(word, 'word', 'used in this file'));
    }
  }

  if (!items.length) return null;
  items.sort((a, b) => rank(prefix, a, b));
  return { items: items.slice(0, limit), from: fromOverride ?? from, to: pos, prefix };
}

/** Where a completion should be applied, as `{ row, col }` for the editor. */
export function offsetToPosition(text, offset) {
  const before = String(text).slice(0, offset);
  const row = (before.match(/\n/g) || []).length;
  const col = offset - (before.lastIndexOf('\n') + 1);
  return { row, col };
}

// ---------------------------------------------------------------------------
// Auto-pairing
// ---------------------------------------------------------------------------

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };

/**
 * Apply one typed character with editor reflexes.
 *
 * Returns `{ text, offset }`, or `null` when the plain insertion is correct.
 */
export function smartInsert(text, offset, ch, lang) {
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const family = normaliseLang(lang);
  const next = raw[pos];

  // Typing a closing character that is already there just steps over it.
  if (Object.values(PAIRS).includes(ch) && next === ch) {
    return { text: raw, offset: pos + 1 };
  }

  // `>` closes the tag you opened. The closing tag has to be computed against
  // the text *after* the `>`, so build that candidate first.
  if (ch === '>' && family === 'markup') {
    const candidate = `${raw.slice(0, pos)}>${raw.slice(pos)}`;
    const closed = autoCloseTag(candidate, pos + 1);
    if (closed) return { text: closed.text, offset: pos + 1 };
  }

  if (PAIRS[ch]) {
    // Do not auto-pair a quote in the middle of a word (`don't`).
    const prev = raw[pos - 1];
    if ((ch === '"' || ch === "'" || ch === '`') && isWordChar(next)) return null;
    if ((ch === '"' || ch === "'" || ch === '`') && isWordChar(prev)) return null;
    return { text: raw.slice(0, pos) + ch + PAIRS[ch] + raw.slice(pos), offset: pos + 1 };
  }

  return null;
}

/** If the cursor sits between an empty pair, backspace removes both halves. */
export function pairBackspace(text, offset) {
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const before = raw[pos - 1];
  const after = raw[pos];
  if (before && after && PAIRS[before] === after) {
    return { text: raw.slice(0, pos - 1) + raw.slice(pos + 1), offset: pos - 1 };
  }
  return null;
}

/**
 * Insert the matching closing tag for an opening tag the user just finished
 * typing with `>`.
 */
export function autoCloseTag(text, offset) {
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const lineStart = raw.lastIndexOf('\n', pos - 1) + 1;
  const before = raw.slice(lineStart, pos);
  const m = before.match(/<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)>$/);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  if (VOID_TAGS.has(tag)) return null;
  if (/\/>$/.test(before)) return null;
  const after = raw.slice(pos);
  if (new RegExp(`^\\s*</${tag}\\s*>`, 'i').test(after)) return null;
  return { text: `${raw.slice(0, pos)}</${tag}>${after}`, offset: pos };
}
