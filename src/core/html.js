/**
 * A tolerant, dependency-free HTML parser good enough to grade learner markup:
 * it builds a real tree, so checks can ask questions like "is there an `img`
 * inside a `figure` whose `alt` is non-empty?".
 *
 * It is deliberately forgiving - the point is to inspect structure, not to be
 * a spec-complete parser.
 */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', '!doctype', '!doc',
]);

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

const ATTR_RE = /([a-zA-Z_:@][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

function parseAttrs(raw) {
  const attrs = {};
  if (!raw) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name] = value;
  }
  return attrs;
}

const TAG_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/gi;

function addText(parent, raw) {
  if (!raw) return;
  parent.children.push({ tag: '#text', text: raw, children: [], parent, attrs: {} });
}

/** Parse HTML into a tree rooted at `#root`. */
export function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null, text: '' };
  const stack = [root];
  const input = String(src ?? '');
  TAG_RE.lastIndex = 0;
  let last = 0;
  let m;

  while ((m = TAG_RE.exec(input))) {
    addText(stack[stack.length - 1], input.slice(last, m.index));
    last = TAG_RE.lastIndex;

    const full = m[0];
    if (full.startsWith('<!--') || full.startsWith('<![CDATA[') || /^<!doctype/i.test(full)) continue;

    const closeTag = m[1];
    const openTag = m[2];
    const attrsRaw = m[3];
    const selfClose = m[4];

    if (closeTag) {
      const name = closeTag.toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const tag = openTag.toLowerCase();
    const parent = stack[stack.length - 1];
    const node = { tag, attrs: parseAttrs(attrsRaw), children: [], parent, selfClosed: !!selfClose };
    parent.children.push(node);

    if (selfClose || VOID.has(tag)) continue;

    if (RAW_TEXT.has(tag)) {
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = input.slice(last);
      const cm = closeRe.exec(rest);
      const inner = cm ? rest.slice(0, cm.index) : rest;
      if (inner) node.children.push({ tag: '#text', text: inner, children: [], parent: node, attrs: {} });
      last = cm ? last + cm.index + cm[0].length : input.length;
      TAG_RE.lastIndex = last;
      continue;
    }

    stack.push(node);
  }

  addText(stack[stack.length - 1], input.slice(last));
  return root;
}

export function textContent(node) {
  if (!node) return '';
  if (node.tag === '#text') return node.text;
  return (node.children || []).map(textContent).join('');
}

/** Serialise a node tree back to HTML (used by the DOM shim's innerHTML). */
export function serialize(node) {
  if (!node) return '';
  if (node.tag === '#text') return node.text;
  const children = (node.children || []).map(serialize).join('');
  if (node.tag === '#root') return children;
  const attrs = Object.entries(node.attrs || {})
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`))
    .join('');
  if (VOID.has(node.tag) || node.selfClosed) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${children}</${node.tag}>`;
}

/** Wrap a fragment so it can be handed to `parse` as a tree. */
export function parseFragment(html) {
  return parse(`<div id="__fragment">${html}</div>`).children[0];
}

export function walk(node, visit) {
  for (const child of node.children || []) {
    if (child.tag === '#text') continue;
    visit(child);
    walk(child, visit);
  }
}

// ---------------------------------------------------------------------------
// Selectors: compound selectors (`a.btn[href="#"]`) plus descendant combinators
// ---------------------------------------------------------------------------

const COMPOUND_RE = /^(\*|[a-zA-Z][\w:-]*)?((?:[.#][\w-]+|\[[^\]]+\])*)$/;

/**
 * Parse the inside of an attribute selector: `disabled`, `type=text`,
 * `href^=#`, `src$=.png`, `class*=card` and `rel~=noopener` are all supported.
 */
function parseAttrSelector(body) {
  const m = String(body).match(/^([\w-]+)\s*(\^=|\$=|\*=|~=|=)?\s*([\s\S]*)$/);
  if (!m) return null;
  const [, name, op, rawValue] = m;
  return {
    name: name.toLowerCase(),
    op: op || 'exists',
    value: String(rawValue ?? '').trim().replace(/^["']|["']$/g, ''),
  };
}

function matchCompound(node, sel) {
  if (!node || node.tag === '#text' || node.tag === '#root') return false;
  const parsed = COMPOUND_RE.exec(sel);
  if (!parsed) return false;
  const [, tag, rest] = parsed;
  if (tag && tag !== '*' && node.tag !== tag.toLowerCase()) return false;
  const tokens = rest ? rest.match(/[.#][\w-]+|\[[^\]]+\]/g) || [] : [];
  for (const tk of tokens) {
    if (tk.startsWith('.')) {
      const classes = String(node.attrs.class || '').split(/\s+/).filter(Boolean);
      if (!classes.includes(tk.slice(1))) return false;
    } else if (tk.startsWith('#')) {
      if (node.attrs.id !== tk.slice(1)) return false;
    } else {
      const spec = parseAttrSelector(tk.slice(1, -1));
      if (!spec) return false;
      const actual = node.attrs[spec.name];
      if (spec.op === 'exists') {
        if (!(spec.name in node.attrs)) return false;
      } else if (actual === undefined) {
        return false;
      } else if (spec.op === '=') {
        if (String(actual) !== spec.value) return false;
      } else if (spec.op === '^=') {
        if (!String(actual).startsWith(spec.value)) return false;
      } else if (spec.op === '$=') {
        if (!String(actual).endsWith(spec.value)) return false;
      } else if (spec.op === '*=') {
        if (!String(actual).includes(spec.value)) return false;
      } else if (spec.op === '~=') {
        if (!String(actual).split(/\s+/).includes(spec.value)) return false;
      }
    }
  }
  return true;
}

/** All descendants (document order) matching a possibly-descendant selector. */
export function queryAll(root, selector) {
  // A comma-separated selector list is a union, and the result must still be in
  // document order - `h1,h2` is how the heading outline check reads a page.
  const groups = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  if (groups.length > 1) {
    const matched = new Set();
    for (const group of groups) for (const node of queryAll(root, group)) matched.add(node);
    const ordered = [];
    walk(root, (node) => {
      if (matched.has(node)) ordered.push(node);
    });
    return ordered;
  }
  if (!groups.length) return [];
  const parts = groups[0].split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const last = parts[parts.length - 1];
  const out = [];
  walk(root, (node) => {
    if (!matchCompound(node, last)) return;
    let i = parts.length - 2;
    let cursor = node.parent;
    while (i >= 0) {
      let found = false;
      while (cursor) {
        if (matchCompound(cursor, parts[i])) {
          found = true;
          cursor = cursor.parent;
          break;
        }
        cursor = cursor.parent;
      }
      if (!found) return;
      i -= 1;
    }
    out.push(node);
  });
  return out;
}

/** A convenience wrapper with the queries most checks need. */
export class Dom {
  constructor(src, files = {}) {
    this.source = String(src ?? '');
    this.files = files;
    this.root = parse(this.source);
    this.nodes = [];
    walk(this.root, (n) => this.nodes.push(n));
  }

  query(selector) {
    return queryAll(this.root, selector);
  }

  first(selector) {
    return this.query(selector)[0] || null;
  }

  count(selector) {
    return this.query(selector).length;
  }

  exists(selector) {
    return this.count(selector) > 0;
  }

  text(selector) {
    const node = typeof selector === 'string' ? this.first(selector) : selector;
    return node ? textContent(node).replace(/\s+/g, ' ').trim() : '';
  }

  attr(selector, name) {
    const node = typeof selector === 'string' ? this.first(selector) : selector;
    if (!node) return null;
    return name in node.attrs ? node.attrs[name] : null;
  }

  attrs(selector) {
    const node = typeof selector === 'string' ? this.first(selector) : selector;
    return node ? node.attrs : {};
  }

  tags() {
    return this.nodes.map((n) => n.tag);
  }

  /** Position of `a` relative to `b`, used for "before/after" style checks. */
  indexOf(selector) {
    const node = this.first(selector);
    return node ? this.nodes.indexOf(node) : -1;
  }

  parentTag(selector) {
    const node = this.first(selector);
    return node && node.parent ? node.parent.tag : null;
  }

  /** Every value found for an attribute across matching nodes. */
  attrAll(selector, name) {
    return this.query(selector).map((n) => (name in n.attrs ? n.attrs[name] : null));
  }

  styles() {
    return extractAll(this.source, 'style').join('\n');
  }

  scripts() {
    return extractAll(this.source, 'script').join('\n');
  }
}

function extractAll(src, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m;
  while ((m = re.exec(String(src)))) out.push(m[1]);
  return out;
}

export const extractStyles = (src) => extractAll(src, 'style').join('\n');
export const extractScripts = (src) => extractAll(src, 'script').join('\n');

/** Structural sanity warnings surfaced as friendly hints rather than failures. */
export function lint(src) {
  const dom = new Dom(src);
  const notes = [];
  const imgs = dom.query('img');
  const missingAlt = imgs.filter((n) => !('alt' in n.attrs));
  if (missingAlt.length) notes.push(`${missingAlt.length} <img> tag(s) are missing an alt attribute`);
  const anchors = dom.query('a');
  const emptyAnchors = anchors.filter((n) => !textContent(n).trim() && !('aria-label' in n.attrs));
  if (emptyAnchors.length) notes.push(`${emptyAnchors.length} <a> tag(s) have no readable text or aria-label`);
  const inputs = dom.query('input');
  const noLabel = inputs.filter((n) => !('aria-label' in n.attrs) && !('id' in n.attrs) && !('placeholder' in n.attrs));
  if (noLabel.length) notes.push(`${noLabel.length} <input>(s) have no label, aria-label or placeholder`);
  const h1 = dom.count('h1');
  if (h1 > 1) notes.push(`${h1} <h1> elements found - a page should normally have exactly one`);
  if (!/^<!doctype html>/i.test(dom.source.trim())) notes.push('Missing <!DOCTYPE html> on the first line');
  return notes;
}
