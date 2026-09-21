/**
 * The internal browser.
 *
 * There is no rendering engine to hand markup to inside a terminal, so this
 * lays HTML out as text the way a reader view would: block elements break
 * lines, headings get weight, lists get markers, and the CSS the learner wrote
 * is applied for the properties that survive the trip to a character grid
 * (weight, style, decoration, alignment, colour, display).
 *
 * It is deliberately good at *analysis* rather than fidelity: alongside the
 * layout it exposes the element tree and the rules that matched each node, so
 * the dev-tools panes can explain why a page looks the way it does.
 */

import { parse, queryAll, textContent, extractStyles, extractScripts, offsetToPos } from './html.js';import { Css } from './css.js';

// ---------------------------------------------------------------------------
// Preview assembly
// ---------------------------------------------------------------------------

/**
 * Split the editor's contents into the parts a page preview needs.
 * Shared by the in-TUI browser and the "write a file and open it" action, so
 * the two never disagree about what is being shown.
 */
export function previewParts(challenge, code) {
  const lang = challenge.lang;
  if (lang === 'css') {
    return {
      html: challenge.previewHtml || '<h1>Preview</h1>\n<p>Your stylesheet is applied to this document.</p>',
      css: code,
      js: '',
    };
  }
  if (lang === 'html' || lang === 'html+css') {
    return { html: code, css: extractStyles(code), js: extractScripts(code) };
  }
  return { html: challenge.previewHtml || '<h1>Preview</h1>', css: '', js: code };
}

/**
 * Preview parts for a multi-file synthesis challenge: the first `.html` file is
 * the page, every stylesheet is concatenated, and so is every script. The
 * browser, the console and the written preview file all share this so they
 * never disagree about what is being shown.
 */
export function synthesisParts(files = {}) {
  const names = Object.keys(files);
  const htmlName = names.find((n) => n.endsWith('.html')) || names.find((n) => n.endsWith('.htm')) || '';
  const cssNames = names.filter((n) => n.endsWith('.css') || n.endsWith('.scss'));
  const jsNames = names.filter((n) => n.endsWith('.js') || n.endsWith('.ts') || n.endsWith('.jsx'));
  const html = (htmlName && files[htmlName]) || '';
  return {
    html: html || challenge_placeholder_html(),
    // Inline <style>/<script> blocks in the page count too - a one-file page is
    // the most common shape a learner writes.
    css: [...cssNames.map((n) => files[n]), extractStyles(html)].filter(Boolean).join('\n'),
    js: [...jsNames.map((n) => files[n]), extractScripts(html)].filter(Boolean).join('\n'),
  };
}

function challenge_placeholder_html() {
  return '<h1>Preview</h1>\n<p>Add an index.html file to see your page here.</p>';
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const NAMED_COLOURS = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192],
  orange: [255, 165, 0], purple: [128, 0, 128], teal: [0, 128, 128], navy: [0, 0, 128],
  maroon: [128, 0, 0], olive: [128, 128, 0], yellow: [255, 255, 0], pink: [255, 192, 203],
  brown: [165, 42, 42], gold: [255, 215, 0], coral: [255, 127, 80], crimson: [220, 20, 60],
  tomato: [255, 99, 71], steelblue: [70, 130, 180], rebeccapurple: [102, 51, 153],
  transparent: null, currentcolor: null, inherit: null,
};

function toRgb(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw in NAMED_COLOURS) return NAMED_COLOURS[raw];
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = raw.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** Nearest xterm-256 index for an RGB triple. */
export function rgbToAnsi([r, g, b]) {
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

/** A CSS colour (any common syntax) as an xterm-256 index, or undefined. */
export function cssColor(value) {
  const rgb = toRgb(value);
  return rgb ? rgbToAnsi(rgb) : undefined;
}

// ---------------------------------------------------------------------------
// Style resolution
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'html', 'legend', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'caption',
]);

const SKIP_TAGS = new Set(['head', 'script', 'style', 'title', 'meta', 'link', 'base', 'template', 'noscript']);

const HEADING_LEVEL = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

const def = 'inherit';

/**
 * Resolve which rules matched which node. `viewport` is the notional width in
 * characters, used to decide whether a `min-width` media query applies.
 */
export function styleMap(html, cssSource, viewport = 100, rootOverride = null) {
  const root = rootOverride || parse(html);
  const css = new Css(cssSource || '');
  const map = new Map();
  const viewportPx = viewport * 8;

  for (const rule of css.rules) {
    if (!rule.selectors || !rule.selectors.length || !rule.decls.length) continue;
    const minWidth = rule.media ? Number((rule.media.match(/min-width\s*:\s*(\d+)/i) || [])[1]) : null;
    if (minWidth && minWidth > viewportPx) continue;
    for (const selector of rule.selectors) {
      // Pseudo-classes and pseudo-elements never match a static tree.
      if (selector.includes(':')) continue;
      let matched = [];
      try {
        matched = queryAll(root, selector);
      } catch {
        matched = [];
      }
      for (const node of matched) {
        if (!map.has(node)) map.set(node, { decls: {}, rules: [] });
        const entry = map.get(node);
        for (const decl of rule.decls) entry.decls[decl.prop] = decl.value;
        entry.rules.push({ selector, decls: rule.decls, media: rule.media || null });
      }
    }
  }
  return { root, css, map };
}

/** Declarations for a node: matched rules, then its inline `style` on top. */
function declsFor(map, node) {
  const entry = map.get(node);
  const out = entry ? { ...entry.decls } : {};
  const raw = node && node.attrs ? node.attrs.style : null;
  if (typeof raw === 'string' && raw.trim()) {
    for (const part of raw.split(';')) {
      const i = part.indexOf(':');
      if (i === -1) continue;
      out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/** A blank style that inherits nothing. */
export function baseStyle() {
  return {
    bold: false, italic: false, underline: false, dim: false, strike: false,
    fg: null, bg: null, align: null, display: 'inline', heading: null,
    listStyle: null, transform: '', tag: 'body',
  };
}

function computeStyle(map, css, node, inherited) {
  const decls = declsFor(map, node);
  const style = { ...inherited };
  style.tag = node.tag;
  style.heading = null;
  style.listStyle = null;
  style.transform = '';

  style.display = decls.display || (BLOCK_TAGS.has(node.tag) ? 'block' : 'inline');

  const weight = String(decls['font-weight'] || '');
  if (weight === 'bold' || (weight && Number(weight) >= 600)) style.bold = true;
  if (decls['font-style'] === 'italic') style.italic = true;

  const decoration = String(decls['text-decoration'] || '');
  if (decoration.includes('underline')) style.underline = true;
  if (decoration.includes('line-through')) style.strike = true;
  if (decls.opacity !== undefined && Number(decls.opacity) < 0.7) style.dim = true;

  const colour = cssColor(css.resolve(decls.color));
  if (colour !== undefined) style.fg = colour;
  const background = cssColor(css.resolve(decls['background-color'] || decls.background));
  // Only paint a background when a text colour is declared too - otherwise a
  // light hero section renders light-on-light in a dark terminal.
  if (background !== undefined && colour !== undefined) style.bg = background;

  if (decls['text-transform']) style.transform = decls['text-transform'];
  if (decls['list-style']) style.listStyle = decls['list-style'];
  if (decls['list-style-type']) style.listStyle = decls['list-style-type'];

  if (node.tag === 'strong' || node.tag === 'b' || node.tag === 'th') style.bold = true;
  if (node.tag === 'em' || node.tag === 'i' || node.tag === 'cite' || node.tag === 'var') style.italic = true;
  if (node.tag === 'u') style.underline = true;
  if (node.tag === 's' || node.tag === 'del') style.strike = true;
  if (node.tag === 'a' && stylesHasHref(node)) style.underline = true;
  if (node.tag === 'code' || node.tag === 'kbd' || node.tag === 'samp') style.display = 'inline';
  if (HEADING_LEVEL[node.tag]) style.heading = HEADING_LEVEL[node.tag];

  return style;
}

const stylesHasHref = (node) => !!(node.attrs && node.attrs.href);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const VOID_LABEL = {
  img: (attrs) => (attrs.alt ? `[img: ${attrs.alt}]` : '[img]'),
  input: (attrs) => `[input${attrs.type ? `:${attrs.type}` : ''}${attrs.name ? ` ${attrs.name}` : ''}]`,
  textarea: (attrs) => `[textarea${attrs.name ? ` ${attrs.name}` : ''}]`,
  select: () => '[select]',
  iframe: (attrs) => `[iframe${attrs.title ? `: ${attrs.title}` : ''}]`,
  video: () => '[video]',
  audio: () => '[audio]',
  canvas: () => '[canvas]',
  svg: () => '[svg]',
  meta: () => null,
  link: () => null,
};

/**
 * Map from an element's source start offset → its row index in
 * `elementTree`'s flat list. Both this and the layout walk descend in document
 * order over the same parse, so the indices are consistent by construction.
 * TEXT rows count too (a non-empty trimmed text node is a tree row) — the map
 * only records element positions, but the row numbers it produces are indices
 * into the full list, text rows included.
 */
export function elementRowOffsets(html, rootOverride = null) {
  const root = rootOverride || parse(html);
  const map = new Map();
  let index = 0;
  const visit = (node) => {
    for (const child of node.children || []) {
      if (child.tag === '#text') {
        if (child.text.replace(/\s+/g, ' ').trim()) index += 1;
        continue;
      }
      if (SKIP_TAGS.has(child.tag)) continue;
      if (child.range) map.set(child.range.start, index);
      index += 1;
      visit(child);
    }
  };
  visit(root);
  return map;
}

/**
 * Lay an HTML document out as text lines.
 *
 * Returns `{ lines, meta }`; `lines` is an array of fragment arrays
 * (`{ text, bold, italic, underline, fg, bg, dim }`) so the view can style them
 * with the current theme.
 *
 * Phase 3 (click-to-inspect): pass `opts.rows` (a Map from
 * `elementRowOffsets(html)`) and the result also carries `lineElements` — for
 * each rendered line, the elementTree row index of the element whose content is
 * on it. The classic view ignores the extra array; the next-UI render pane uses
 * it to map a click to an element and jump to its source line.
 */
export function layoutDocument(html, cssSource, width, viewport = 100, opts = null) {
  const { root, css, map } = styleMap(html, cssSource, viewport);
  const rows = opts && opts.rows instanceof Map ? opts.rows : null;
  const limit = Math.max(20, width);
  const lines = [];
  const lineElements = [];
  let cur = [];
  let curW = 0;
  let indent = 0;
  let pre = false;
  // The tree row of the element currently being walked, stamped onto every
  // line its content produces. -1 = document-level text (no element).
  let curElement = -1;

  const flush = () => {
    // A newline between tags collapses to a space; drop it if it ended the line.
    while (cur.length && /^\s*$/.test(cur[cur.length - 1].text)) cur.pop();
    lines.push(cur);
    lineElements.push(curElement);
    cur = [];
    curW = 0;
  };

  const blank = () => {
    if (cur.length) flush();
    if (!lines.length) return;
    if (lines[lines.length - 1].length === 0) return;
    lines.push([]);
    lineElements.push(curElement);
  };

  const openLine = () => {
    if (cur.length || !indent) return;
    cur.push({ text: ' '.repeat(indent), s: {} });
    curW = indent;
  };

  const addText = (text, style, keepWhitespace = false) => {
    const body = keepWhitespace ? String(text) : String(text).replace(/\s+/g, ' ');
    if (!body) return;
    if (keepWhitespace) {
      const parts = body.split('\n');
      parts.forEach((part, i) => {
        openLine();
        if (part) {
          cur.push({ text: applyTransform(part, style), s: style });
          curW += part.length;
        }
        if (i < parts.length - 1) flush();
      });
      return;
    }
    for (const token of body.match(/\S+\s*|\s+/g) || []) {
      if (/^\s+$/.test(token) && curW === 0) continue;
      if (curW + token.length > limit && curW > 0) flush();
      openLine();
      cur.push({ text: applyTransform(token, style), s: style });
      curW += token.length;
    }
  };

  const applyTransform = (text, style) => {
    if (style.transform === 'uppercase') return text.toUpperCase();
    if (style.transform === 'lowercase') return text.toLowerCase();
    return text;
  };

  const walk = (node, inherited) => {
    for (const child of node.children || []) {
      if (child.tag === '#text') {
        addText(child.text, inherited, pre);
        continue;
      }
      if (SKIP_TAGS.has(child.tag)) continue;

      const style = computeStyle(map, css, child, inherited);
      if (String(style.display) === 'none') continue;

      const previousElement = curElement;
      curElement = rows && child.range ? (rows.get(child.range.start) ?? -1) : -1;

      if (child.tag === 'br') {
        flush();
        curElement = previousElement;
        continue;
      }

      if (child.tag === 'hr') {
        blank();
        openLine();
        cur.push({ text: '─'.repeat(Math.max(4, limit - indent)), s: { dim: true, fg: style.fg } });
        flush();
        blank();
        continue;
      }

      const isBlock = style.display === 'block' || style.display === 'flex' || style.display === 'grid';

      if (VOID_LABEL[child.tag]) {
        const label = VOID_LABEL[child.tag](child.attrs);
        if (label) {
          if (isBlock) blank();
          openLine();
          cur.push({ text: label, s: { ...style, fg: style.fg ?? null, dim: true } });
          curW += label.length;
          if (isBlock) blank();
        }
        continue;
      }

      if (child.tag === 'a') {
        const text = textContent(child).replace(/\s+/g, ' ').trim();
        const label = text || child.attrs.href || '';
        openLine();
        cur.push({ text: label, s: { ...style, underline: true } });
        curW += label.length;
        if (!text && child.attrs.href) {
          cur.push({ text: `  (${child.attrs.href})`, s: { dim: true } });
        }
        continue;
      }

      if (style.heading) {
        const text = textContent(child).replace(/\s+/g, ' ').trim();
        blank();
        openLine();
        const marker = `${'#'.repeat(style.heading)} `;
        cur.push({ text: marker, s: { bold: true, fg: style.fg } });
        curW += marker.length;
        addText(text, { ...style, bold: true });
        flush();
        blank();
        continue;
      }

      if (child.tag === 'ul' || child.tag === 'ol') {
        if (cur.length) flush();
        const before = indent;
        indent += 2;
        walk(child, style);
        indent = before;
        blank();
        continue;
      }

      if (child.tag === 'li') {
        if (cur.length) flush();
        const marker = String(style.listStyle) === 'none' ? '' : (node.tag === 'ol' ? '› ' : '• ');
        openLine();
        if (marker) {
          cur.push({ text: marker, s: { fg: style.fg, bold: true } });
          curW += marker.length;
        }
        const before = indent;
        indent += 2;
        walk(child, style);
        indent = before;
        if (cur.length) flush();
        continue;
      }

      if (child.tag === 'blockquote') {
        if (cur.length) flush();
        const before = indent;
        indent += 2;
        walk(child, style);
        indent = before;
        blank();
        continue;
      }

      if (child.tag === 'tr') {
        if (cur.length) flush();
        indent += 1;
        walk(child, style);
        indent -= 1;
        if (cur.length) flush();
        continue;
      }

      if (child.tag === 'td' || child.tag === 'th') {
        openLine();
        if (curW > indent) {
          cur.push({ text: ' │ ', s: { dim: true } });
          curW += 3;
        }
        walk(child, style);
        continue;
      }

      const wasPre = pre;
      if (child.tag === 'pre') pre = true;
      if (isBlock && !pre) blank();
      walk(child, style);
      if (isBlock && !pre) blank();
      pre = wasPre;
    }
  };

  walk(root, baseStyle());
  if (cur.length) flush();
  while (lines.length && lines[0].length === 0) { lines.shift(); lineElements.shift(); }
  while (lines.length && lines[lines.length - 1].length === 0) { lines.pop(); lineElements.pop(); }

  const allNodes = [];
  (function collect(n) {
    for (const c of n.children || []) {
      if (c.tag === '#text') continue;
      allNodes.push(c);
      collect(c);
    }
  })(root);

  const titleNode = (function find(n) {
    if (n.tag === 'title') return n;
    for (const c of n.children || []) {
      const found = find(c);
      if (found) return found;
    }
    return null;
  })(root);

  return {
    lines,
    lineElements,
    meta: {
      nodes: allNodes.length,
      rules: css.rules.filter((r) => r.selectors && r.selectors.length).length,
      title: titleNode ? textContent(titleNode).trim() : '',
      text: lines.map((frags) => frags.map((f) => f.text).join('')).join('\n'),
      links: queryAll(root, 'a[href]').map((a) => a.attrs.href),
      headings: queryAll(root, 'h1,h2,h3,h4,h5,h6').map((h) => `${h.tag}: ${textContent(h).replace(/\s+/g, ' ').trim()}`),
      images: queryAll(root, 'img').map((i) => ({ src: i.attrs.src || '', alt: i.attrs.alt ?? null })),
    },
  };
}

// ---------------------------------------------------------------------------
// Dev tools: element tree + matched styles
// ---------------------------------------------------------------------------

/**
 * A flat, indented list of element nodes for the Elements pane.
 * Pass `root` (from `parse`, or `buildPage`'s page.root) to reuse ONE parse —
 * node identity only matches within a single parse run, and the Styles pane
 * looks nodes up in the style map built from that same tree.
 */
export function elementTree(html, rootOverride = null) {
  const root = rootOverride || parse(html);
  const rows = [];
  const visit = (node, depth) => {
    for (const child of node.children || []) {
      if (child.tag === '#text') {
        const text = child.text.replace(/\s+/g, ' ').trim();
        if (text) rows.push({ kind: 'text', depth, label: `“${text.slice(0, 46)}”`, node: child });
        continue;
      }
      if (SKIP_TAGS.has(child.tag)) continue;
      rows.push({ kind: 'element', depth, label: child.tag, node: child, attrs: child.attrs });
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return rows;
}

/**
 * The rules that matched one node, plus its inline declarations.
 * `node` must come from the SAME parse the lookup runs against — pass the
 * `root` the node was found in (a fresh parse cannot see it; the classic UI
 * had exactly that bug, so its Styles pane never matched a rule).
 */
export function stylesFor(html, cssSource, node, viewport = 100, rootOverride = null) {
  const { map } = styleMap(html, cssSource, viewport, rootOverride);
  const entry = map.get(node);
  const out = { matched: entry ? entry.rules : [], inline: [], computed: {} };
  const raw = node && node.attrs ? node.attrs.style : null;
  if (typeof raw === 'string' && raw.trim()) {
    for (const part of raw.split(';')) {
      const i = part.indexOf(':');
      if (i === -1) continue;
      out.inline.push({ prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() });
    }
  }
  out.computed = declsFor(map, node);
  return out;
}

/** A one-line description of a node, as dev tools show it in the breadcrumb. */
export function describeNode(node) {
  if (!node) return '';
  if (node.tag === '#text') return `#text “${node.text.replace(/\s+/g, ' ').trim().slice(0, 40)}”`;
  const attrs = Object.entries(node.attrs || {})
    .slice(0, 5)
    .map(([k, v]) => (v === '' ? k : `${k}="${String(v).slice(0, 24)}"`))
    .join(' ');
  return `<${node.tag}${attrs ? ' ' + attrs : ''}>`;
}

// ---------------------------------------------------------------------------
// Phase 3 seams (overhaul §5.4 item 1): structured results with SOURCE ranges
//
// Click-to-inspect maps a render-tab click to an element and jumps to its
// source position; that needs (a) element → source line, (b) the mocked-route
// table for the network panel. Both are pure additions — existing exports are
// unchanged.
// ---------------------------------------------------------------------------

/** The element nodes of a document in document order (text nodes excluded). */
export function elementNodes(html) {
  const out = [];
  (function collect(n) {
    for (const c of n.children || []) {
      if (c.tag === '#text') continue;
      out.push(c);
      collect(c);
    }
  })(parse(html));
  return out;
}

/**
 * `{index: {row, col}}` — the 0-based source position of each row of
 * `elementTree(html)` (text rows included; they have no source position and
 * are omitted). A click on a tree row reads its position here; a click on a
 * RENDERED line goes through `elementRowOffsets` → `lineElements` instead.
 */
export function elementSourceMap(html, rootOverride = null) {
  const root = rootOverride || parse(html);
  const flat = [];
  const visit = (node, depth) => {
    for (const child of node.children || []) {
      if (child.tag === '#text') {
        const text = child.text.replace(/\s+/g, ' ').trim();
        if (text) flat.push({ kind: 'text', node: child });
        continue;
      }
      if (SKIP_TAGS.has(child.tag)) continue;
      flat.push({ kind: 'element', node: child });
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  const out = {};
  flat.forEach((row, index) => {
    const range = row.node && row.node.range;
    if (range) out[index] = offsetToPos(html, range.start);
  });
  return out;
}

/** The source text of one element's open tag, as jump-to-source highlights. */
export function elementSource(html, node) {
  const range = node && node.range;
  if (!range) return null;
  return String(html ?? '').slice(range.start, range.end);
}

/**
 * Extract the `mockFetch`-table routes a challenge declares, for the Network
 * pane: `[{method, url, status, body}]`. The classic UI shows the table only
 * implicitly (through what fetch returns); the panel renders it explicitly so
 * learners can see WHY a request answers the way it does.
 */
export function mockRoutes(challenge) {
  const mock = (challenge && challenge.mockFetch) || {};
  return Object.entries(mock).map(([url, body]) => ({
    method: null, // the classic mock table matches on URL fragment only
    url,
    status: body === undefined ? 404 : 200,
    body,
  }));
}

export { parse, queryAll, textContent };
