/**
 * Emmet abbreviations (like the VS Code extension) for the in-TUI editor.
 *
 * A subset that covers everything this curriculum teaches, implemented with
 * the project's zero-dependency rule: a tokenizer + a pure expander on
 * `(text, offset)`, in the same style as `complete.js`. No filesystem, no
 * regex built from user input.
 *
 *   div.card#main[data-x="1"]*2{Hi}+p^span
 *     -> <div class="card" id="main" data-x="1">Hi</div>
 *        <div class="card" id="main" data-x="1">Hi</div>
 *        <p><span></span></p>
 *
 * Works in markup AND inside <style> blocks / css files (cssExpand).
 *
 * Two guards make it safe to bind to Tab in the classic editor:
 *   - `isAbbreviationAt` rejects anything that is not plausibly an
 *     abbreviation, so Tab keeps inserting indentation elsewhere;
 *   - `expandAt` only ever replaces the abbreviation token itself, never
 *     surrounding content.
 */

// ---------------------------------------------------------------------------
// Element name handling
// ---------------------------------------------------------------------------

/** Default tag when the abbreviation starts with `.`, `#`, or an attr. */
const DEFAULT_TAG = 'div';

/** Tags whose default child differs (bare `.a` inside `ul` expands to `li`). */
const IMPLICIT_CHILD = {
  ul: 'li', ol: 'li', table: 'tr', tbody: 'tr', thead: 'tr', tfoot: 'tr',
  tr: 'td', select: 'option', optgroup: 'option', dl: 'dt',
};

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/** A bare word only expands when it names a real element (see TAG_NAME_RE). */
const KNOWN_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label',
  'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress',
  'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'slot', 'small',
  'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td',
  'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul',
  'var', 'video', 'wbr',
]);

const ATTR_NAME_RE = /^[a-zA-Z@:_.][\w:.-]*$/;
const TAG_NAME_RE = /^[a-zA-Z][\w:-]*$/;

// ---------------------------------------------------------------------------
// Abbreviation alphabet (shared by the parser and the Tab guard)
// ---------------------------------------------------------------------------

const ABBR_ALLOWED = /^[a-zA-Z0-9_$#.[\]{}>+^*()='"!,\s:/-]*$/;

// ---------------------------------------------------------------------------
// Element parsing
// ---------------------------------------------------------------------------

/**
 * One element from its "part" (everything up to an operator):
 * tag, classes, id, attributes, text. Multipliers are handled by the main
 * loop, not here.
 */
function parseElement(part) {
  const el = { tag: DEFAULT_TAG, classes: [], id: null, attrs: {}, text: '', rest: '' };
  let rest = part;

  const head = rest.match(/^([a-zA-Z][\w:-]*)/); // non-optional: null when none
  if (head) {
    el.tag = head[1];
    rest = rest.slice(head[1].length);
  }

  let m;
  while (rest.length) {
    if ((m = rest.match(/^\.([A-Za-z0-9_$-]+)/))) {
      el.classes.push(m[1]);
      rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^#([A-Za-z0-9_$-]+)/))) {
      el.id = m[1];
      rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^\[([^\]]*)\]/))) {
      parseAttrBody(m[1], el);
      rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^\{([^}]*)\}/))) {
      el.text = m[1];
      rest = rest.slice(m[0].length);
    } else {
      break; // operator or junk — caller decides
    }
  }
  return { el, rest };
}

/** Parse the inside of `[...]` into attributes on `el`. */
function parseAttrBody(body, el) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ' ') {
      if (cur) parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      if (ATTR_NAME_RE.test(part)) el.attrs[part] = '';
      continue;
    }
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (ATTR_NAME_RE.test(name)) el.attrs[name] = value;
  }
}

/**
 * Substitute `$` runs with the repeat index, zero-padded to the run width —
 * `li$*3` -> li1..li3, `li$$*3` -> li01..li03 (emmet's numbering rule).
 */
function expandDollar(str, index = 1) {
  return String(str).replace(/\$+/g, (run) => String(index).padStart(run.length, '0'));
}

// ---------------------------------------------------------------------------
// Parser: abbreviation -> forest
// ---------------------------------------------------------------------------

/**
 * Parse an abbreviation into a forest of nodes.
 * Node: { tag, classes, id, attrs, text, children }.
 * Returns null for anything it does not fully understand — callers treat
 * null as "not an abbreviation", never as an error.
 */
export function parseAbbreviation(src) {
  const tokens = String(src ?? '').trim();
  if (!tokens || !ABBR_ALLOWED.test(tokens)) return null;

  const roots = [];
  const stack = [roots]; // stack of sibling lists; top = current parent list
  let current = null; // most recent element (for `>`)

  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];

  /** One element or balanced group (multiplier NOT consumed). */
  const readUnit = () => {
    if (peek() === '(') {
      consume();
      let depth = 1;
      let body = '';
      while (i < tokens.length && depth > 0) {
        const ch = consume();
        if (ch === '(') depth += 1;
        else if (ch === ')') { depth -= 1; if (depth === 0) break; }
        body += ch;
      }
      if (depth !== 0) return null; // unbalanced
      const inner = parseAbbreviation(body);
      if (!inner) return null;
      return { type: 'group', nodes: inner };
    }
    // Element: read until an operator.
    let part = '';
    let depthSq = 0;
    let depthBr = 0;
    while (i < tokens.length) {
      const ch = peek();
      if (ch === '[') depthSq += 1;
      else if (ch === ']') depthSq = Math.max(0, depthSq - 1);
      else if (ch === '{') depthBr += 1;
      else if (ch === '}') depthBr = Math.max(0, depthBr - 1);
      else if (depthSq === 0 && depthBr === 0 && '>+^*()'.includes(ch)) break;
      part += consume();
    }
    if (!part.trim()) return null;
    const { el, rest } = parseElement(part);
    if (rest) return null; // unparsed junk after the element — not ours
    return { type: 'element', el };
  };

  /** Apply an optional trailing `*n` multiplier to freshly read kids. */
  const takeMultiplier = (kids) => {
    let count = 1;
    const mm = tokens.slice(i).match(/^\*(\d+|\*)/);
    if (mm) {
      count = mm[1] === '*' ? 2 : parseInt(mm[1], 10);
      i += mm[0].length;
    }
    return applyCount(kids, count);
  };

  const insert = (kids) => {
    stack[stack.length - 1].push(...kids);
    current = kids[kids.length - 1] || current;
  };

  while (i < tokens.length) {
    const ch = peek();
    if (ch === '>') {
      consume();
      if (!current) return null;
      const unit = readUnit();
      if (!unit) return null;
      // The children list itself goes on the climb stack, so a following
      // `+` inserts a SIBLING of what was just nested (div>p+span).
      if (!current.children) current.children = [];
      stack.push(current.children);
      const kids = takeMultiplier(unit.type === 'group' ? unit.nodes : [unit.el]);
      current.children.push(...kids);
      current = kids[kids.length - 1] || current;
      continue;
    }
    if (ch === '+') {
      consume();
      if (stack.length < 1) return null;
      const unit = readUnit();
      if (!unit) return null;
      insert(takeMultiplier(unit.type === 'group' ? unit.nodes : [unit.el]));
      continue;
    }
    if (ch === '^') {
      consume();
      let climbs = 1;
      while (peek() === '^') { consume(); climbs += 1; }
      // Climbing above the root clamps (real emmet is forgiving here too).
      climbs = Math.min(climbs, stack.length - 1);
      stack.length -= climbs;
      current = null;
      continue;
    }
    if (ch === ' ' || ch === '\t') { consume(); continue; }
    const unit = readUnit();
    if (!unit) return null;
    insert(takeMultiplier(unit.type === 'group' ? unit.nodes : [unit.el]));
  }

  // Descended levels left open by a trailing `>` are simply closed here;
  // only an underflowing climb (handled above) is an error.
  return roots.length ? roots : null;
}

/** Expand a node list `count` times in place (cloning applies `$` numbering). */
function applyCount(nodes, count) {
  if (count <= 1) return nodes;
  const out = [];
  for (let n = 1; n <= count; n += 1) {
    for (const node of nodes) out.push(cloneWithIndex(node, n));
  }
  nodes.length = 0;
  nodes.push(...out);
  return nodes;
}

function cloneWithIndex(node, index) {
  return {
    tag: node.tag,
    classes: node.classes.map((c) => expandDollar(c, index)),
    id: node.id ? expandDollar(node.id, index) : null,
    attrs: Object.fromEntries(Object.entries(node.attrs || {}).map(([k, v]) => [k, expandDollar(v, index)])),
    text: expandDollar(node.text || '', index),
    children: (node.children || []).map((c) => cloneWithIndex(c, index)),
  };
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

function attrString(el) {
  const parts = [];
  if (el.id) parts.push(` id="${el.id}"`);
  if (el.classes.length) parts.push(` class="${el.classes.join(' ')}"`);
  for (const [k, v] of Object.entries(el.attrs)) parts.push(v === '' ? ` ${k}` : ` ${k}="${v}"`);
  return parts.join('');
}

/** Render one node at `depth`; `parentTag` drives implicit children. */
function renderNode(node, depth, parentTag) {
  const el = { ...node };
  if (el.tag === DEFAULT_TAG && (el.classes.length || el.id || Object.keys(el.attrs).length)) {
    if (parentTag && IMPLICIT_CHILD[parentTag]) el.tag = IMPLICIT_CHILD[parentTag];
  }
  const pad = '  '.repeat(depth);
  const open = `${pad}<${el.tag}${attrString(el)}>`;
  if (VOID_TAGS.has(el.tag)) return [`${pad}<${el.tag}${attrString(el)}>`];
  if (el.text) return [`${open}${el.text}</${el.tag}>`];
  const kids = el.children || [];
  if (!kids.length) return [`${open}</${el.tag}>`];
  const lines = [open];
  for (const kid of kids) lines.push(...renderNode(kid, depth + 1, el.tag));
  lines.push(`${pad}</${el.tag}>`);
  return lines;
}

/** Expand a parsed forest to formatted HTML text. */
export function renderForest(forest) {
  const lines = [];
  for (const node of forest) lines.push(...renderNode(node, 0, null));
  return lines.join('\n');
}

/**
 * Render a forest as OPEN tags only (nesting context after a `>` trigger):
 * `.card>` expands to `<div class="card">` with the caret ready for children.
 */
export function renderOpen(forest) {
  const parts = [];
  const emit = (node) => {
    if (VOID_TAGS.has(node.tag)) { parts.push(`<${node.tag}${attrString(node)}>`); return; }
    parts.push(`<${node.tag}${attrString(node)}>`);
    for (const kid of node.children || []) emit(kid);
  };
  for (const node of forest) emit(node);
  return parts.join('');
}

// ---------------------------------------------------------------------------
// CSS abbreviations
// ---------------------------------------------------------------------------

/** Length transformer: `10` -> 10px, `100p` -> 100%, `2e` -> 2em, `3x` -> 3ex. */
function len(v) {
  if (v === '' || v == null) return '';
  if (v.endsWith('p')) return `${v.slice(0, -1)}%`;
  if (v.endsWith('e')) return `${v.slice(0, -1)}em`;
  if (v.endsWith('x') && /^[\d.]+x$/.test(v)) return `${v.slice(0, -1)}ex`;
  if (/^-?[\d.]+$/.test(v)) return `${v}px`;
  return v;
}

/**
 * Keyword-value aliases so `d:f` means display:flex, the way emmet's value
 * stubs work. Anything unknown passes through untouched.
 */
const VALUE_ALIASES = {
  f: 'flex', g: 'grid', b: 'block', ib: 'inline-block', n: 'none',
  a: 'absolute', r: 'relative', s: 'sticky',
  c: 'center', fe: 'flex-end', fs: 'flex-start',
  sb: 'space-between', sa: 'space-around', se: 'space-evenly',
  col: 'column', row: 'row',
};
const kw = (v) => (v == null ? '' : VALUE_ALIASES[v] ?? v);

const id = (v) => (v == null ? '' : v);

/**
 * The shorthand table: key -> [property, valueTransform].
 * `prop:value` abbreviations transform the value; bare ones emit the
 * transform's default (usually '').
 */
const CSS_SHORTHANDS = {
  w: ['width', len], h: ['height', len],
  'min-w': ['min-width', len], 'max-w': ['max-width', len],
  'min-h': ['min-height', len], 'max-h': ['max-height', len],
  m: ['margin', len], mt: ['margin-top', len], mb: ['margin-bottom', len],
  ml: ['margin-left', len], mr: ['margin-right', len],
  mx: ['margin-inline', len], my: ['margin-block', len],
  p: ['padding', len], pt: ['padding-top', len], pb: ['padding-bottom', len],
  pl: ['padding-left', len], pr: ['padding-right', len],
  t: ['top', len], b: ['bottom', len], l: ['left', len], r: ['right', len],
  z: ['z-index', id],
  fs: ['font-size', len], fw: ['font-weight', (v) => v || '400'], lh: ['line-height', id],
  ls: ['letter-spacing', len], c: ['color', id],
  bg: ['background', id], bgc: ['background-color', id],
  bd: ['border', (v) => v || '1px solid'], bdr: ['border-radius', len], br: ['border-radius', len],
  op: ['opacity', id], o: ['outline', id],
  d: ['display', kw], pos: ['position', kw],
  fl: ['flex', id], fx: ['flex', id], fld: ['flex-direction', kw],
  jc: ['justify-content', kw], ai: ['align-items', kw],
  g: ['gap', len],
  gtc: ['grid-template-columns', id], gtr: ['grid-template-rows', id],
  ta: ['text-align', kw], td: ['text-decoration', kw], tt: ['text-transform', id],
  ff: ['font-family', id], ov: ['overflow', kw], trs: ['transition', id],
  cur: ['cursor', kw], va: ['vertical-align', kw], ws: ['white-space', kw],
  // bare value-forms (`flex` -> display:flex) the way emmet offers them
  flex: ['display', () => 'flex'],
  grid: ['display', () => 'grid'],
  block: ['display', () => 'block'],
  hidden: ['display', () => 'none'],
  absolute: ['position', () => 'absolute'],
  relative: ['position', () => 'relative'],
  fixed: ['position', () => 'fixed'],
  sticky: ['position', () => 'sticky'],
  bold: ['font-weight', () => '700'],
  uppercase: ['text-transform', () => 'uppercase'],
};

/**
 * CSS abbreviation: `m10` -> `margin: 10px;`, `w100p` -> `width: 100%;`,
 * `d:f` -> `display: flex;`, `bg` -> `background: ;`.
 */
export function cssExpand(src) {
  const abbr = String(src ?? '').trim();
  if (!abbr) return null;
  if (!/^[a-zA-Z-]+[0-9a-zA-Z%.#ex-]*(:[-a-zA-Z0-9%.#,\s]*)?$/.test(abbr)) return null;

  let prop = abbr;
  let value = '';
  const colon = abbr.indexOf(':');
  if (colon !== -1) {
    prop = abbr.slice(0, colon);
    value = abbr.slice(colon + 1);
  } else {
    const m = prop.match(/^([a-zA-Z-]+?)([0-9].*)?$/);
    if (!m) return null;
    prop = m[1];
    value = m[2] || '';
  }
  const resolved = CSS_SHORTHANDS[prop.toLowerCase()];
  if (!resolved) return null;
  const [realProp, transform] = resolved;
  const realValue = String(transform(value) ?? '');  return `${realProp}: ${realValue};`;
}

// ---------------------------------------------------------------------------
// Detection + public API
// ---------------------------------------------------------------------------

/**
 * The abbreviation token ending at `offset`, or null when the text there is
 * not plausibly an abbreviation (prose, real markup, operators, ...).
 */
export function isAbbreviationAt(text, offset, opts = {}) {
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const lineStart = raw.lastIndexOf('\n', pos - 1) + 1;
  const before = raw.slice(lineStart, pos);
  const after = raw.slice(pos);
  const m = before.match(/[^\s]*$/);
  let tokenBefore = m ? m[0] : '';
  // The token may continue after the caret (caret mid-`div.foo`).
  const stop = after.search(/[\s<>]/);
  const tokenAfter = stop === -1 ? after : after.slice(0, stop);
  let token = tokenBefore + tokenAfter;
  if (!token) return null;
  // A trigger char (`>`, `;`) just typed at the caret sits at the token's end;
  // the caller expands the token and CONSUMES the trigger.
  let trigger = null;
  if (opts.trigger && token.endsWith(opts.trigger)) {
    // A trigger is only a trigger when the caret sits right after it —
    // `.card>x` with the caret after `>` must NOT eat the `x`.
    if (tokenAfter) return null;
    trigger = opts.trigger;
    token = token.slice(0, -1);
    tokenBefore = tokenBefore.slice(0, -1);
  }
  if (!token) return null;
  if (!ABBR_ALLOWED.test(token)) return null;
  if (!/^[a-zA-Z.#[{]/.test(token)) return null; // must look like a name
  // Something that already looks like a real tag is markup, not an abbreviation.
  if (/^<\/?[a-zA-Z]/.test(token)) return null;
  // Trailing operators mean the user is mid-typing a compound; not expandable.
  if (/[>+^*()]$/.test(token)) return null;
  // An operator immediately after the caret means the compound is still
  // being typed (`div>|li`) — nothing to expand yet.
  if (/^[>+^*()]/.test(after)) return null;
  return {
    token,
    from: pos - (tokenBefore.length + (trigger ? 1 : 0)),
    to: pos + tokenAfter.length,
    trigger,
  };
}

/**
 * Language family at the caret: 'markup' | 'css' | 'none'.
 * `lang` is the editor's language label; `text`/`offset` detect <style> and
 * <script> regions inside markup documents.
 */
export function emmetContext(lang, text, offset) {
  const family = String(lang || '').toLowerCase().trim();
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const before = raw.slice(0, pos);
  const styleOpen = (before.match(/<style\b/gi) || []).length;
  const styleClose = (before.match(/<\/style\s*>/gi) || []).length;
  const scriptOpen = (before.match(/<script\b/gi) || []).length;
  const scriptClose = (before.match(/<\/script\s*>/gi) || []).length;
  if (/^(css|scss|sass|less)$/.test(family)) return 'css';
  if (styleOpen > styleClose) return 'css';
  if (scriptOpen > scriptClose) return 'none'; // no emmet in JS
  if (/^(html|htm|xhtml|xml|svg)$/.test(family)) return 'markup';
  // Unknown/text languages: expand only structurally-marked tokens.
  return family === '' ? 'markup' : 'none';
}

/** Does this markup token carry a structural hint, or name a real element? */
function plausiblyMarkup(token) {
  if (/[.#\[{}>+^*]/.test(token)) return true;
  const name = token.split(/[.#\[{}>+^*]/)[0].toLowerCase();
  return KNOWN_TAGS.has(name);
}

/**
 * Expand the abbreviation ending at `offset`.
 * Returns `{ text, offset, from, to, label, row, col }` for a full-document
 * update (drop-in for `setTextAt`), or null when not expandable.
 */
export function expandAt(lang, text, offset, opts = {}) {
  const raw = String(text ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const ctx = emmetContext(lang, raw, pos);
  if (ctx === 'none') return null;
  const found = isAbbreviationAt(raw, pos, { trigger: opts.trigger || null });
  if (!found) return null;
  const { token, from, to, trigger } = found;
  const requireStructure = !!opts.requireStructure;

  // The abbreviation must START its line (only indentation before it). This
  // is what makes the triggers safe: `text-align: center;` + `;` and
  // `hello world` + Tab can never be mistaken for abbreviations.
  const abbrLineStart = raw.lastIndexOf('\n', from - 1) + 1;
  if (!/^[ \t]*$/.test(raw.slice(abbrLineStart, from))) return null;

  let expansion = null;
  let label = '';
  if (ctx === 'css') {
    // `;` trigger: cssExpand re-appends the semicolon the trigger consumed.
    expansion = cssExpand(token);
    label = 'css';
  } else if (plausiblyMarkup(token) && (!requireStructure || /[.#\[{}>+^*]/.test(token))) {
    const forest = parseAbbreviation(token);
    if (forest) {
      // `>` trigger: emit open tags only — the user is about to nest children.
      expansion = trigger === '>' ? renderOpen(forest) : renderForest(forest);
      label = 'html';
    }
  }
  if (!expansion) return null;

  // Indent the expansion to match the abbreviation's own column.
  const lineStart = raw.lastIndexOf('\n', from - 1) + 1;
  const baseIndent = raw.slice(lineStart, from).match(/^[ \t]*/)[0];
  const indented = expansion
    .split('\n')
    .map((l, i) => (i === 0 || !l ? l : baseIndent + l))
    .join('\n');

  const text2 = raw.slice(0, from) + indented + raw.slice(to);
  const before = raw.slice(0, from) + indented;
  const row = (before.match(/\n/g) || []).length;
  const col = before.length - (before.lastIndexOf('\n') + 1);
  return { text: text2, offset: before.length, from, to, label, row, col };
}

/** Convenience for the palette/tests: expand a standalone abbreviation. */
export function expand(abbr, kind = 'markup') {
  if (kind === 'css') return cssExpand(abbr);
  const forest = parseAbbreviation(abbr);
  return forest ? renderForest(forest) : null;
}
