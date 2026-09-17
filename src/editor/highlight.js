/**
 * Syntax highlighting for the editor (overhaul task 2.8, §8.1's rendering half).
 *
 * The tokenizer is PORTED from `src/tui/widgets.js` (the classic highlighter):
 * the rule tables below are copied verbatim so the two UIs give the same code
 * block the same colours. What is NEW here is what a real editor needs and a
 * code block does not:
 *
 *   - **stateful highlighting across a WINDOW.** The classic tokenizes whole
 *     buffers line-by-line with a fresh state, so its blockComment detection is
 *     effectively dead (a `/*` rule only matches when the closer is on the same
 *     line). Fine for a code block; wrong for an editor showing rows 80–100 of
 *     a file whose comment opened at row 12. Here an opener WITHOUT a closer on
 *     the line opens the state, and `highlightWindow` computes the incoming
 *     state for the viewport by a cheap native-indexOf sweep from the top.
 *   - **an LRU cache keyed by theme, language, row, incoming comment state and
 *     line text.** Typing edits one line; the other 499 must not re-tokenise.
 *     The theme is part of the key because cached entries carry resolved
 *     colours. The comment state is part of the key because the same line text
 *     colours differently inside vs outside a block comment.
 *   - **role tokens.** `tokenizeLine` returns theme-independent roles
 *     ('keyword', 'comment', …); `highlightLine` resolves them through a theme.
 *
 * Every exported function is pure.
 */

// The rule tables, verbatim from src/tui/widgets.js (see the note above).
const RULES = {
  js: [
    { re: /\/\/[^\n]*/y, fg: 'comment', italic: true },
    { re: /\/\*[\s\S]*?\*\//y, fg: 'comment', italic: true },
    { re: /`(?:[^`\\]|\\.)*`/y, fg: 'string' },
    { re: /'(?:[^'\\\n]|\\.)*'/y, fg: 'string' },
    { re: /"(?:[^"\\\n]|\\.)*"/y, fg: 'string' },
    { re: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y, fg: 'number' },
    {
      re: /\b(?:const|let|var|function|return|if|else|for|while|do|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|import|from|export|default|switch|case|null|undefined|true|false|delete|void|yield|static|interface|type|enum|implements|public|private|protected|readonly|as|satisfies|declare|namespace)\b/y,
      fg: 'keyword',
      bold: true,
    },
    { re: /[A-Za-z_$][\w$]*(?=\s*\()/y, fg: 'accent' },
    { re: /\b[A-Z][\w$]*\b/y, fg: 'star' },
  ],
  html: [
    { re: /<!--[\s\S]*?-->/y, fg: 'comment', italic: true },
    { re: /<!DOCTYPE[^>]*>/iy, fg: 'comment' },
    { re: /<\/?[a-zA-Z][\w:-]*/y, fg: 'keyword', bold: true },
    { re: /\/?>/y, fg: 'keyword', bold: true },
    { re: /[a-zA-Z-]+(?==)/y, fg: 'accent' },
    { re: /"(?:[^"]*)"/y, fg: 'string' },
    { re: /'(?:[^']*)'/y, fg: 'string' },
  ],
  css: [
    { re: /\/\*[\s\S]*?\*\//y, fg: 'comment', italic: true },
    { re: /@[a-zA-Z-]+/y, fg: 'keyword', bold: true },
    { re: /#[0-9a-fA-F]{3,8}\b/y, fg: 'number' },
    { re: /--[\w-]+/y, fg: 'accent' },
    { re: /\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|vmin|vmax|s|ms|fr|deg|ch|ex|pt)\b/y, fg: 'number' },
    { re: /[a-z-]+(?=\s*:)/y, fg: 'accentSoft' },
    { re: /"(?:[^"]*)"/y, fg: 'string' },
    { re: /'(?:[^']*)'/y, fg: 'string' },
  ],
  sh: [
    { re: /#[^\n]*/y, fg: 'comment', italic: true },
    { re: /"(?:[^"\\]|\\.)*"/y, fg: 'string' },
    { re: /'(?:[^'\\]|\\.)*'/y, fg: 'string' },
    { re: /\s-{1,2}[a-zA-Z][\w-]*/y, fg: 'number' },
    { re: /\b(?:cd|ls|mkdir|touch|git|npm|npx|node|cat|echo|curl|pwd|rm|cp|mv|grep|chmod|export|source)\b/y, fg: 'keyword', bold: true },
  ],
  sql: [
    { re: /--[^\n]*/y, fg: 'comment', italic: true },
    { re: /'(?:[^']*)'/y, fg: 'string' },
    {
      re: /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|PRIMARY|KEY|FOREIGN|REFERENCES|JOIN|INNER|LEFT|RIGHT|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|DEFAULT|INDEX|UNIQUE|CHECK|ALTER|DROP|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|LIKE|IN|BETWEEN|ASC|DESC)\b/y,
      fg: 'keyword',
      bold: true,
    },
    { re: /\b\d+\b/y, fg: 'number' },
  ],
  docker: [
    { re: /#[^\n]*/y, fg: 'comment', italic: true },
    { re: /\b(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL|AS|mkdir|npm|node|apk|apt-get|pip|yarn|ci)\b/y, fg: 'keyword', bold: true },
    { re: /\s--?[a-zA-Z][\w-]*/y, fg: 'number' },
    { re: /"(?:[^"\\]|\\.)*"/y, fg: 'string' },
    { re: /\b[a-z]+(?==)/y, fg: 'accentSoft' },
  ],
  yaml: [
    { re: /#[^\n]*/y, fg: 'comment', italic: true },
    { re: /^\s*-\s/y, fg: 'keyword', bold: true },
    { re: /[\w.-]+(?=\s*:)/y, fg: 'accentSoft' },
    { re: /'(?:[^']*)'/y, fg: 'string' },
    { re: /"(?:[^"\\]|\\.)*"/y, fg: 'string' },
    { re: /\b(?:true|false|null|on|off)\b/y, fg: 'keyword' },
  ],
  json: [
    { re: /"(?:[^"\\]|\\.)*"(?=\s*:)/y, fg: 'accentSoft' },
    { re: /"(?:[^"\\]|\\.)*"/y, fg: 'string' },
    { re: /\b(?:true|false|null)\b/y, fg: 'keyword' },
    { re: /-?\b\d+(?:\.\d+)?\b/y, fg: 'number' },
  ],
  py: [
    { re: /#.*/y, fg: 'comment' },
    { re: /[rbfu]{0,2}"(?:[^"\\\n]|\\.)*"/y, fg: 'string' },
    { re: /[rbfu]{0,2}'(?:[^'\\\n]|\\.)*'/y, fg: 'string' },
    { re: /\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/y, fg: 'keyword' },
    { re: /\b(?:abs|all|any|bool|dict|dir|enumerate|filter|float|format|input|int|isinstance|len|list|map|max|min|open|pow|print|range|reversed|round|set|sorted|str|sum|tuple|type|zip|capture)\b/y, fg: 'accentSoft' },
    { re: /\b(?:Exception|KeyError|IndexError|TypeError|ValueError|ZeroDivisionError)\b/y, fg: 'accent' },
    { re: /\b\d+(?:\.\d+)?\b/y, fg: 'number' },
  ],
  md: [
    { re: /^#{1,6}[^\n]*/y, fg: 'keyword', bold: true },
    { re: /`[^`]*`/y, fg: 'string' },
    { re: /\*\*[^*]*\*\*/y, fg: 'accentSoft' },
  ],
  text: [],
};

const ALIAS = {
  javascript: 'js', node: 'js', nodejs: 'js', ts: 'js', typescript: 'js', jsx: 'js', tsx: 'js',
  jsonc: 'json',
  bash: 'sh', shell: 'sh', console: 'sh', terminal: 'sh', git: 'sh',
  htm: 'html', svg: 'html', xml: 'html',
  python: 'py',
  sqlite: 'sql', postgres: 'sql',
  dockerfile: 'docker', containerfile: 'docker',
  yml: 'yaml', github: 'yaml', workflow: 'yaml',
  plaintext: 'text', txt: 'text',
};

/** Language key with aliases resolved; unknown languages fall back to text. */
export function resolveLang(lang) {
  const key = String(lang || 'text').toLowerCase().trim();
  if (RULES[key]) return key;
  const alias = ALIAS[key];
  return alias && RULES[alias] ? alias : 'text';
}

/** Tokenizer state carried between lines (multi-line comments). */
export function createHighlightState({ blockComment = false } = {}) {
  return { blockComment };
}

// Block-comment delimiters per language family. Only families the classic
// opener-check covered (js, css) plus html's `<!--`, which has the same shape.
const COMMENT = {
  js: { open: '/*', close: '*/' },
  css: { open: '/*', close: '*/' },
  html: { open: '<!--', close: '-->' },
};

/**
 * Does `line` open a block comment at/after `from` that does not close on this
 * line? Native indexOf sweep, same fidelity as the tokenizer itself (neither
 * tracks strings when looking for comment delimiters — a literal `"/*"` in a
 * string misfires in both, as it does in the classic highlighter).
 */
function opensBlockComment(line, from, family) {
  const delims = COMMENT[family];
  if (!delims) return false;
  let i = line.indexOf(delims.open, from);
  while (i !== -1) {
    if (line.indexOf(delims.close, i + delims.open.length) === -1) return true;
    i = line.indexOf(delims.open, i + delims.open.length);
  }
  return false;
}

/** Is an unclosed opener sitting exactly at `i`? O(1) per-token guard. */
function openerAt(line, i, family) {
  const delims = COMMENT[family];
  if (!delims) return false;
  if (!line.startsWith(delims.open, i)) return false;
  return line.indexOf(delims.close, i + delims.open.length) === -1;
}

/** Tokenise one logical line into ROLE tokens: `{text, token, bold, italic}`
 * where `token` names a theme role ('keyword', 'comment', …) or null for plain
 * text. Mutates `state` (pass a fresh one per document scan). */
export function tokenizeLine(line, lang, state = createHighlightState()) {
  const family = resolveLang(lang);
  const rules = RULES[family] || [];
  const out = [];
  let i = 0;

  if (state.blockComment) {
    const end = line.indexOf('*/');
    if (end === -1) {
      if (line) out.push({ text: line, token: 'comment', bold: false, italic: true });
      return out;
    }
    out.push({ text: line.slice(0, end + 2), token: 'comment', bold: false, italic: true });
    i = end + 2;
    state.blockComment = false;
  }

  while (i < line.length) {
    // An unclosed block-comment opener colours the rest of the line and opens
    // the state. (The classic could never reach this branch — see the header.)
    if (state.blockComment === false && openerAt(line, i, family)) {
      out.push({ text: line.slice(i), token: 'comment', bold: false, italic: true });
      state.blockComment = true;
      return out;
    }

    let best = null;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(line);
      if (!m || m.index !== i || !m[0].length) continue;
      if (!best || m[0].length > best.text.length) {
        best = { text: m[0], token: rule.fg, bold: !!rule.bold, italic: !!rule.italic };
      }
    }
    if (best) {
      out.push(best);
      i += best.text.length;
      continue;
    }
    const ch = line[i];
    const last = out[out.length - 1];
    if (last && last.token === null && !last.bold && !last.italic) last.text += ch;
    else out.push({ text: ch, token: null, bold: false, italic: false });
    i += 1;
  }
  return out;
}

/**
 * Highlight one line with a theme's colours. `state` is optional; when given it
 * is threaded (multi-line comments stay open across calls).
 */
export function highlightLine(line, lang, theme, state = null) {
  const st = state || createHighlightState();
  return tokenizeLine(line, lang, st).map((t) => ({
    text: t.text,
    color: t.token ? (theme[t.token] ?? null) : null,
    bold: !!t.bold,
    italic: !!t.italic,
  }));
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

/** LRU cache with Map semantics; evicts the least recently used entry. */
export function createHighlightCache({ capacity = 1024 } = {}) {
  const map = new Map();
  return {
    capacity,
    get size() { return map.size; },
    get(key) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value); // most-recently-used
      return value;
    },
    set(key, value) {
      if (map.has(key)) map.delete(key);
      else if (map.size >= capacity) map.delete(map.keys().next().value);
      map.set(key, value);
    },
    clear() { map.clear(); },
  };
}

export const cacheKey = (themeId, lang, row, inComment, line) =>
  `${themeId}:${lang}:${row}:${inComment ? 1 : 0}:${line}`;

/**
 * Cache-aware line highlight. Keyed by theme id, resolved language, row, the
 * INCOMING comment state and the line text — a line inside a comment is a
 * different entry from the same text outside one. Returns
 * `{ tokens, blockComment }` so callers can keep threading state for free.
 */
export function cachedLine(cache, theme, lang, row, line, inComment = false) {
  const themeId = theme && (theme.id || theme.name || 'theme');
  const family = resolveLang(lang);
  const key = cacheKey(themeId, family, row, inComment, line);
  const hit = cache.get(key);
  if (hit) return hit;
  const state = createHighlightState({ blockComment: inComment });
  const tokens = highlightLine(line, lang, theme, state);
  const value = { tokens, blockComment: state.blockComment };
  cache.set(key, value);
  return value;
}

/**
 * Highlight the visible window `[top, top + height)`.
 *
 * Correctness over cleverness: the incoming comment state for `top` is computed
 * by a state-only sweep from row 0 — native indexOf per line, no regex, so it
 * is microseconds even for very large files, and it is NOT cached (the result
 * is one boolean per viewport render). `maxBacktrack` caps the sweep for the
 * perf budget; a comment opened before the anchor then mis-colours, which is
 * the documented trade (default Infinity = always exact).
 */
export function highlightWindow(doc, { top, height, lang, theme, cache = null, maxBacktrack = Infinity } = {}) {
  const lines = doc.lines;
  const from = Math.max(0, Math.min(top, Math.max(0, lines.length - 1)));
  const to = Math.min(lines.length - 1, from + Math.max(0, height) - 1);

  // --- state-only sweep to learn the comment state at `from` ---
  const family = resolveLang(lang);
  let blockComment = false;
  const anchor = Number.isFinite(maxBacktrack) ? Math.max(0, from - maxBacktrack) : 0;
  for (let r = anchor; r < from; r += 1) {
    const line = lines[r] || '';
    if (blockComment) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      blockComment = opensBlockComment(line, end + 2, family);
    } else {
      blockComment = opensBlockComment(line, 0, family);
    }
  }

  // --- tokenize the window, threading the state ---
  const out = new Array(Math.max(0, to - from + 1));
  for (let row = from; row <= to; row += 1) {
    const line = lines[row] || '';
    if (cache) {
      const res = cachedLine(cache, theme, lang, row, line, blockComment);
      blockComment = res.blockComment;
      out[row - from] = res.tokens;
    } else {
      const state = createHighlightState({ blockComment });
      out[row - from] = highlightLine(line, lang, theme, state);
      blockComment = state.blockComment;
    }
  }
  return out;
}
