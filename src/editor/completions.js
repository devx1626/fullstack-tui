/**
 * Completions v2 (overhaul §8.9, task 2.7).
 *
 * The TRIGGER ENGINE is not reimplemented here: `src/core/complete.js` already
 * decides what a prefix means in HTML/CSS/JS/SQL/shell/Python, and the graders
 * and the classic editor use it. Re-typing it would give the two UIs two answers
 * for the same keystroke, so this module ADAPTS it to the document model and
 * adds the three things the classic one has no concept of:
 *
 *   1. **Tab-stop snippets** — an accepted snippet carries ordered stop
 *      positions, so Tab walks them and the whole insertion is still ONE
 *      change list through `applyEdit`.
 *   2. **Signature help** — after `(` the identifier before it is looked up in
 *      a table and the ACTIVE PARAMETER is derived by counting commas at the
 *      right nesting depth (so `f(a, [b, c], |)` reports parameter 2, not 3).
 *   3. **A popup state machine** — a pure reducer, because the popup has to
 *      behave identically under the keyboard and under a mouse click.
 *
 * The data superset (`src/editor/data/*.js`) is merged OVER the classic results
 * rather than replacing them: entities, CSS pseudo-selectors/at-rules and the
 * React/JSX surface are additive.
 */
import {
  autoCloseTag, completionsFor, documentWords, normaliseLang, offsetToPosition, pairBackspace, smartInsert,
} from '../core/complete.js';
import { docFromText, docText, offsetOf, pos, posOf } from './document.js';

/**
 * A position on the document as it will be AFTER an insertion.
 *
 * `posOf` clamps into the CURRENT document, so a caret or tab stop past the last
 * character silently collapsed back to the end of the old text (every snippet
 * caret landed at the insertion point instead of on its first placeholder).
 */
function positionAfter(doc, newText, offset) {
  const after = docFromText(newText);
  return posOf(after, offset);
}
import { BOOLEAN_ATTRS, HTML_ENTITIES } from './data/html.js';
import { CSS_AT_RULES, CSS_CUSTOM_HINTS, CSS_PSEUDO_CLASSES } from './data/css.js';
import { JSX_ELEMENTS, JSX_HOOKS, JSX_PROPS, JSX_SNIPPETS } from './data/jsx.js';

export const MAX_STOPS = 20;

// ---------------------------------------------------------------------------
// Trigger policy (§8.9: Ctrl+Space, ≥2-char auto, `<`/`:`/`@` starters)
// ---------------------------------------------------------------------------

/**
 * Should a keystroke open the popup on its own?
 *
 * `manual` is Ctrl+Space (or Ctrl+Space with an empty prefix): it always asks.
 * The three starters are structural — `<` in markup, `:` in CSS, `@` in CSS —
 * and a two-character prefix is the general case. Deliberately NOT triggered by
 * a single letter: that is what makes typing in the editor noisy.
 */
export function shouldTrigger({ ch = '', prefix = '', lang = 'text', manual = false, insideString = false } = {}) {
  if (manual) return true;
  if (insideString) return false;
  if (!ch && !prefix) return false;
  const family = normaliseLang(lang);
  if (ch === '<' && family === 'markup') return true;
  if (ch === ':' && family === 'css') return true;
  if (ch === '@' && family === 'css') return true;
  if ((ch === '<' || ch === ':' || ch === '@') && family !== 'markup' && family !== 'css') {
    // JS decorators and JSX attributes are the other two places those keys start
    // something completable.
    return true;
  }
  return prefix.length >= 2;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const FAMILY_ALIASES = { html: 'markup', htm: 'markup', xhtml: 'markup', xml: 'markup', svg: 'markup', jsx: 'js', tsx: 'js' };

/** The completion family a language belongs to (jsx/tsx count as js). */
export function familyOf(lang) {
  const key = String(lang || '').toLowerCase().trim();
  return FAMILY_ALIASES[key] || normaliseLang(lang);
}

const isJsx = (lang) => /^(jsx|tsx)$/.test(String(lang || '').toLowerCase().trim());

function extraItem(label, insert, detail, caret = null) {
  return {
    label,
    kind: label.startsWith('&') ? 'value' : 'snip',
    detail: detail || '',
    insert,
    caret: caret == null ? insert.length : caret,
  };
}

/** The additive data for a language, in the classic engine's item shape. */
export function extraItems(lang, prefix = '') {
  const family = familyOf(lang);
  const lower = String(prefix || '').toLowerCase();
  const match = (label) => !lower || label.toLowerCase().startsWith(lower);
  const out = [];
  if (family === 'markup') {
    for (const [label, insert, detail] of HTML_ENTITIES) {
      if (match(label)) out.push(extraItem(label, insert, detail));
    }
  }
  if (family === 'css') {
    for (const [label, insert, detail] of CSS_PSEUDO_CLASSES.concat(CSS_AT_RULES, CSS_CUSTOM_HINTS)) {
      if (match(label)) out.push(extraItem(label, insert, detail));
    }
  }
  if (family === 'js' && isJsx(lang)) {
    for (const [label, insert, detail, caret] of JSX_HOOKS.concat(JSX_PROPS)) {
      if (match(label)) out.push(extraItem(label, insert, detail, caret));
    }
    for (const [label, insert, detail] of JSX_SNIPPETS) {
      if (match(label)) out.push(extraItem(label, insert, detail, stopHint(insert)));
    }
    for (const label of JSX_ELEMENTS) {
      if (match(label)) out.push(extraItem(label, `${label} />`, 'React element'));
    }
  }
  // `<` and `&` both open a value position in markup; keep entities visible
  // while the user is still typing the ampersand.
  if (family === 'markup' && lower.startsWith('&')) {
    for (const [label, insert, detail] of HTML_ENTITIES) {
      if (!out.some((i) => i.label === label)) out.push(extraItem(label, insert, detail));
    }
  }
  return out;
}

/** Where the caret wants to be inside a snippet body (before its first stop). */
function stopHint(body) {
  const stops = snippetStops(body);
  return stops.length ? stops[0] : body.length;
}

/**
 * Ordered tab stops inside a snippet body: the named placeholders a learner is
 * expected to edit, then the block interior. Sorted and deduped.
 */
export function snippetStops(body) {
  const text = String(body ?? '');
  if (!text) return [];
  const candidates = [];
  const named = [
    /\binitials?\b/, /\bname\b/, /\bargs\b/, /\bprops\b/, /\bcondition\b/, /\bselector\b/,
    /\bitems\b/, /\bvalue\b/, /\bdeps\b/, /\burl\b/, /\bContext\b/, /\bn\b/, /\breducer\b/,
    /"click"/, /"Search"/, /"Description"/, /"button"/, /"thing"/,
  ];
  for (const re of named) {
    const m = re.exec(text);
    if (m) candidates.push(m.index);
  }
  const block = text.indexOf('{');
  if (block !== -1) candidates.push(Math.min(block + 2, text.length));
  const paren = text.indexOf('(');
  if (paren !== -1) candidates.push(Math.min(paren + 1, text.length));
  return [...new Set(candidates)].sort((a, b) => a - b).slice(0, MAX_STOPS);
}

/**
 * The completion list at a document caret.
 *
 * @returns {{items, from, to, prefix, family, stops}|null} `from`/`to` are
 *   document positions, `stops` the absolute tab-stop positions of the focused
 *   item (empty for plain identifiers).
 */
export function completionsAt(doc, { lang = 'text', limit = 60, prefixOverride = null } = {}) {
  const text = docText(doc);
  const offset = offsetOf(doc, doc.caret);
  const base = completionsFor(lang, text, offset, limit);
  const family = familyOf(lang);
  let prefix = prefixOverride != null ? prefixOverride : (base ? base.prefix : lineWord(text, offset));
  let fromOffset = base ? base.from : offset - prefix.length;

  // A CSS pseudo-selector starts with the colon, but the classic prefix rule
  // stops at it: `a:ho` reads as `ho`, and no pseudo-class matches `ho`. When
  // the engine has NO answer, re-read the prefix as the selector run from the
  // colon instead.
  //
  // Only when the engine had nothing: for `display:` the engine answers with
  // the VALUE list, and replacing from the colon would eat the property name.
  if (family === 'css' && !base) {
    const pseudo = /(:{1,2}[A-Za-z-]*)$/.exec(text.slice(0, offset));
    if (pseudo) {
      prefix = pseudo[1];
      fromOffset = offset - pseudo[1].length;
    }
  }

  const baseItems = base ? base.items : [];
  const known = new Set(baseItems.map((i) => i.label.toLowerCase()));
  const extras = extraItems(lang, prefix).filter((i) => !known.has(i.label.toLowerCase()));
  const items = baseItems.concat(extras).slice(0, limit);
  if (!items.length) return null;
  // Nothing to suggest when accepting the only candidate would change nothing:
  // a popup over a finished `:hover` (or a fully-typed identifier) is noise.
  // The `insert` check matters — typing a snippet's own name (`qsel`) must
  // still pop, because accepting it expands to the whole body.
  if (items.length === 1) {
    const only = items[0];
    const body = String(only.insert ?? only.label);
    if (body === prefix && only.label.toLowerCase() === prefix.toLowerCase()) return null;
  }

  const from = posOf(doc, fromOffset);
  const to = posOf(doc, offset);
  return { items, from, to, prefix, family, stops: tabStopsFor(doc, items[0], { from, to }) };
}

/** The identifier-ish run before an offset (used when the engine has no answer). */
export function lineWord(text, offset) {
  const before = String(text).slice(0, Math.max(0, offset));
  const m = /[A-Za-z_$&:@<][\w$&;:#-]*$/.exec(before);
  return m ? m[0] : '';
}

/**
 * Absolute tab stops for an item accepted at `{from, to}`: the item's own
 * placeholders mapped into the document, plus the end of the insertion.
 */
export function tabStopsFor(doc, item, { from, to } = {}) {
  if (!item) return [];
  const body = String(item.insert ?? item.label ?? '');
  const text = docText(doc);
  const startOffset = from ? offsetOf(doc, from) : offsetOf(doc, doc.caret);
  const endOffset = to ? offsetOf(doc, to) : startOffset;
  const newText = text.slice(0, startOffset) + body + text.slice(endOffset);
  const stops = snippetStops(body).map((rel) => positionAfter(doc, newText, startOffset + rel));
  stops.push(positionAfter(doc, newText, startOffset + body.length));
  return dedupePositions(stops).slice(0, MAX_STOPS);
}

function dedupePositions(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const key = `${p.row}:${p.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Popup state machine
// ---------------------------------------------------------------------------

/**
 * @param {{items, from, to, prefix, family, stops}} list
 * @param {{selected?: number, stops?: Array, stopIndex?: number}} [opts]
 */
export function createPopup(list, { selected = 0, stopIndex = -1 } = {}) {
  if (!list || !list.items || !list.items.length) return null;
  return {
    items: list.items,
    selected: Math.max(0, Math.min(selected, list.items.length - 1)),
    from: list.from,
    to: list.to,
    prefix: list.prefix || '',
    family: list.family || 'text',
    stops: list.stops || [],
    stopIndex,
    doc: null,
  };
}

export const popupItem = (popup) => (popup && popup.items[popup.selected]) || null;

/** Keyboard: ↑/↓ move, Tab/Enter accept, Esc dismiss (§8.9). */
export function popupKey(popup, key) {
  if (!popup) return { popup: null, action: 'ignored' };
  const name = typeof key === 'string' ? key : (key.name === 'char' ? key.char : key.name);
  const count = popup.items.length;
  switch (name) {
    case 'down':
    case 'ctrl-n':
      return { popup: { ...popup, selected: (popup.selected + 1) % count }, action: 'move' };
    case 'up':
    case 'ctrl-p':
      return { popup: { ...popup, selected: (popup.selected - 1 + count) % count }, action: 'move' };
    case 'home':
      return { popup: { ...popup, selected: 0 }, action: 'move' };
    case 'end':
      return { popup: { ...popup, selected: count - 1 }, action: 'move' };
    case 'tab':
    case 'enter':
      return { popup, action: 'accept' };
    case 'escape':
      return { popup: null, action: 'dismiss' };
    default:
      return { popup, action: 'ignored' };
  }
}

/** Mouse: click a popup row (the same code path as ↑/↓ + Enter). */
export function popupClick(popup, row) {
  if (!popup || row < 0 || row >= popup.items.length) return { popup, action: 'ignored' };
  return { popup: { ...popup, selected: row }, action: 'accept' };
}

/** Filter as the user types another character (re-running the engine). */
export function popupRefilter(popup, doc, lang) {
  if (!popup) return null;
  const next = completionsAt(doc, { lang, prefixOverride: popup.prefix });
  if (!next) return null;
  return { ...popup, items: next.items, from: next.from, to: next.to, stops: next.stops, selected: 0 };
}

// ---------------------------------------------------------------------------
// Accepting
// ---------------------------------------------------------------------------

/**
 * The change list for accepting an item: replace `[from, to)` in one change, and
 * place the caret at the first stop (an identifier) or inside the snippet.
 */
export function acceptItem(doc, popup, item = popupItem(popup)) {
  if (!doc || !popup || !item) return null;
  const from = popup.from;
  const to = popup.to;
  const body = String(item.insert ?? item.label);
  const text = docText(doc);
  const startOffset = offsetOf(doc, from);
  const endOffset = offsetOf(doc, to);
  const newText = text.slice(0, startOffset) + body + text.slice(endOffset);
  const stops = tabStopsFor(doc, item, { from, to });
  return {
    changes: [{ start: from, end: to, text: body }],
    caret: stops[0] || positionAfter(doc, newText, startOffset + body.length),
    stops,
    label: item.label,
    kind: item.kind,
  };
}

/** The next tab stop after a caret (wraps to the last one, then null). */
export function nextStop(stops, caret) {
  if (!stops || !stops.length) return null;
  const at = stops.findIndex((p) => p.row === caret.row && p.col === caret.col);
  if (at === -1) return stops[0];
  return stops[Math.min(at + 1, stops.length - 1)];
}

// ---------------------------------------------------------------------------
// Signature help
// ---------------------------------------------------------------------------

/**
 * A one-line signature table for the DOM and builtin APIs a learner meets.
 * `params` drives the active-parameter highlight; `doc` is the popup's second
 * line.
 */
export const SIGNATURES = {
  addEventListener: { sig: 'addEventListener(type, listener, options?)', params: ['type', 'listener', 'options'], doc: 'Subscribe to an event on this element.' },
  removeEventListener: { sig: 'removeEventListener(type, listener, options?)', params: ['type', 'listener', 'options'] },
  querySelector: { sig: 'querySelector(selectors)', params: ['selectors'], doc: 'First element matching a CSS selector.' },
  querySelectorAll: { sig: 'querySelectorAll(selectors)', params: ['selectors'], doc: 'All elements matching a CSS selector.' },
  getElementById: { sig: 'getElementById(id)', params: ['id'] },
  getElementsByClassName: { sig: 'getElementsByClassName(names)', params: ['names'] },
  createElement: { sig: 'createElement(tagName, options?)', params: ['tagName', 'options'] },
  appendChild: { sig: 'appendChild(node)', params: ['node'] },
  setAttribute: { sig: 'setAttribute(name, value)', params: ['name', 'value'] },
  getAttribute: { sig: 'getAttribute(name)', params: ['name'] },
  removeAttribute: { sig: 'removeAttribute(name)', params: ['name'] },
  classList: { sig: 'classList.add(token) / .remove(token) / .toggle(token)', params: ['token'] },
  closest: { sig: 'closest(selectors)', params: ['selectors'] },
  scrollIntoView: { sig: 'scrollIntoView(options?)', params: ['options'] },
  focus: { sig: 'focus(options?)', params: ['options'] },
  preventDefault: { sig: 'preventDefault()', params: [] },
  'console.log': { sig: 'console.log(...data)', params: ['data'] },
  'console.error': { sig: 'console.error(...data)', params: ['data'] },
  'console.table': { sig: 'console.table(data, columns?)', params: ['data', 'columns'] },
  fetch: { sig: 'fetch(url, options?)', params: ['url', 'options'], doc: 'Returns a Promise for the response.' },
  setTimeout: { sig: 'setTimeout(callback, delayMs, ...args)', params: ['callback', 'delayMs', '...args'] },
  setInterval: { sig: 'setInterval(callback, delayMs)', params: ['callback', 'delayMs'] },
  clearTimeout: { sig: 'clearTimeout(id)', params: ['id'] },
  'JSON.stringify': { sig: 'JSON.stringify(value, replacer?, space?)', params: ['value', 'replacer', 'space'] },
  'JSON.parse': { sig: 'JSON.parse(text, reviver?)', params: ['text', 'reviver'] },
  'Object.keys': { sig: 'Object.keys(object)', params: ['object'] },
  'Object.values': { sig: 'Object.values(object)', params: ['object'] },
  'Object.entries': { sig: 'Object.entries(object)', params: ['object'] },
  'Array.isArray': { sig: 'Array.isArray(value)', params: ['value'] },
  'Math.max': { sig: 'Math.max(...values)', params: ['values'] },
  'Math.round': { sig: 'Math.round(value)', params: ['value'] },
  forEach: { sig: 'forEach((element, index) => void)', params: ['callback'] },
  map: { sig: 'map((element, index) => value)', params: ['callback'] },
  filter: { sig: 'filter((element, index) => boolean)', params: ['predicate'] },
  reduce: { sig: 'reduce((accumulator, element) => value, initialValue)', params: ['callback', 'initialValue'] },
  find: { sig: 'find((element, index) => boolean)', params: ['predicate'] },
  includes: { sig: 'includes(searchValue, fromIndex?)', params: ['searchValue', 'fromIndex'] },
  join: { sig: 'join(separator?)', params: ['separator'] },
  slice: { sig: 'slice(start?, end?)', params: ['start', 'end'] },
  splice: { sig: 'splice(start, deleteCount?, ...items)', params: ['start', 'deleteCount', '...items'] },
  push: { sig: 'push(...items)', params: ['items'] },
  sort: { sig: 'sort((a, b) => number)', params: ['compareFn'] },
  split: { sig: 'split(separator, limit?)', params: ['separator', 'limit'] },
  replace: { sig: 'replace(pattern, replacement)', params: ['pattern', 'replacement'] },
  replaceAll: { sig: 'replaceAll(pattern, replacement)', params: ['pattern', 'replacement'] },
  toUpperCase: { sig: 'toUpperCase()', params: [] },
  toLowerCase: { sig: 'toLowerCase()', params: [] },
  padStart: { sig: 'padStart(targetLength, padString?)', params: ['targetLength', 'padString'] },
  trim: { sig: 'trim()', params: [] },
  useState: { sig: 'useState(initialValue)', params: ['initialValue'], doc: 'Returns [value, setValue].' },
  useEffect: { sig: 'useEffect(effect, dependencies?)', params: ['effect', 'dependencies'], doc: 'Runs after render.' },
  useMemo: { sig: 'useMemo(create, dependencies)', params: ['create', 'dependencies'] },
  useCallback: { sig: 'useCallback(callback, dependencies)', params: ['callback', 'dependencies'] },
  useReducer: { sig: 'useReducer(reducer, initialArg, init?)', params: ['reducer', 'initialArg', 'init'] },
  useRef: { sig: 'useRef(initialValue)', params: ['initialValue'] },
  useContext: { sig: 'useContext(context)', params: ['context'] },
  createRoot: { sig: 'createRoot(domNode)', params: ['domNode'] },
  render: { sig: 'render(element)', params: ['element'] },
};

/**
 * Signature help for the call being typed at the caret.
 *
 * Walks back from the caret to the nearest unmatched `(`, takes the identifier
 * (or `obj.method`) before it, and counts the commas at the same depth to find
 * the active parameter — so `f(a, [b, c], |)` reports parameter 2, not 3.
 *
 * @returns {{name, sig, params, activeParam, doc}|null}
 */
export function signatureAt(doc, { offset = null } = {}) {
  const text = docText(doc);
  const at = offset == null ? offsetOf(doc, doc.caret) : offset;
  const open = findOpenParen(text, at);
  if (!open) return null;
  const before = text.slice(0, open);
  const nameMatch = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/.exec(before);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  const table = SIGNATURES[name] || SIGNATURES[name.split('.').pop()];
  if (!table) return null;
  return {
    name,
    sig: table.sig,
    params: table.params,
    activeParam: activeParamIndex(text, open, at),
    doc: table.doc || '',
  };
}

/** The index of the unmatched `(` that opens the call containing `at`. */
export function findOpenParen(text, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ')') depth += 1;
    else if (ch === '(') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (ch === ';' || ch === '{' || ch === '}' || ch === '\n') {
      if (depth === 0) return null; // the call cannot span a statement boundary
    }
  }
  return null;
}

/** Which parameter the caret is in, counting commas at the call's own depth. */
export function activeParamIndex(text, openIndex, at) {
  let depth = 0;
  let count = 0;
  for (let i = openIndex + 1; i < at; i += 1) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) count += 1;
  }
  return count;
}

/** Cycle the popup through a name's overloads (Ctrl+Space repeatedly). */
export function cycleSignature(name, index = 0) {
  return SIGNATURES[name] ? { ...SIGNATURES[name], index: index % 1 } : null;
}

// ---------------------------------------------------------------------------
// Editor reflexes the classic engine owns (one implementation, two UIs)
// ---------------------------------------------------------------------------

/**
 * The smallest single change that turns `docText(doc)` into `newText`.
 *
 * Both `smartInsert` and `pairBackspace` are expressed as whole-text functions
 * because that is what the classic editor hands them. Emitting the whole buffer
 * as one change would still be *correct*, but it makes every keystroke a
 * full-document replacement: history coalescing, the caret mapping and any
 * viewport diffing all lose the information that one character moved. Trimming
 * the common prefix/suffix restores it.
 */
export function minimalChange(doc, newText) {
  const old = docText(doc);
  const next = String(newText ?? '');
  const max = Math.min(old.length, next.length);
  let start = 0;
  while (start < max && old[start] === next[start]) start += 1;
  let endOld = old.length;
  let endNew = next.length;
  while (endOld > start && endNew > start && old[endOld - 1] === next[endNew - 1]) {
    endOld -= 1;
    endNew -= 1;
  }
  return {
    start: posOf(doc, start),
    end: posOf(doc, Math.max(start, endOld)),
    text: next.slice(start, endNew),
  };
}

/**
 * Auto-pair / auto-close-tag / step-over for one typed character, as a change
 * list. Returns null when the plain insertion is already right.
 */
export function smartInsertChanges(doc, ch, lang) {
  const text = docText(doc);
  const offset = offsetOf(doc, doc.caret);
  const result = smartInsert(text, offset, ch, lang);
  if (!result) return null;
  return {
    changes: [minimalChange(doc, result.text)],
    caret: positionAfter(doc, result.text, result.offset),
  };
}

/** Between an empty pair, backspace removes both halves — as a change list. */
export function pairBackspaceChanges(doc) {
  const text = docText(doc);
  const offset = offsetOf(doc, doc.caret);
  const result = pairBackspace(text, offset);
  if (!result) return null;
  return {
    changes: [minimalChange(doc, result.text)],
    caret: positionAfter(doc, result.text, result.offset),
  };
}

/** Words already in the buffer, for the popup's fallback pass. */
export function wordsIn(doc, prefix, limit = 40) {
  return documentWords(docText(doc), prefix, limit);
}

export { autoCloseTag, completionsFor, normaliseLang, offsetToPosition, BOOLEAN_ATTRS, pos };
