/**
 * Prettier-style deterministic formatting for the in-TUI editor (zero deps).
 *
 * Three pure formatters + a dispatcher, all in the style of `complete.js`:
 * take `(lang, text)`, return formatted text or `null` when the input cannot
 * be formatted safely. `null` is the contract for "abort" — the editor never
 * receives a mangled document.
 *
 *   HTML  — DOM-based re-serialisation: attrs normalized to double quotes,
 *           void tags stay void, <pre>/<textarea> verbatim, inline-only
 *           elements stay on one line.
 *   CSS   — rule tokenizer: one decl per line, lowercase props, blank line
 *           between rules, @media nesting.
 *   JS    — mark-and-reindent: strings/templates/comments/regexes are masked
 *           so their braces never affect depth, then every line is re-indented
 *           by brace depth. Never reflows statements, so it cannot corrupt
 *           code the way a naive reformat could.
 *
 * `formatCodeAt` formats just the enclosing CSS rule under the caret (the
 * Ctrl+F experience inside a stylesheet); no enclosing block means the whole
 * document.
 */

import { normaliseLang, VOID_TAGS as COMPLETE_VOID } from './complete.js';

const VOID_TAGS = COMPLETE_VOID || new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const INDENT = '  ';
const MAX_INLINE = 80;

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Elements that, with only inline/text children, render on one line. */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'dfn',
  'em', 'i', 'img', 'input', 'kbd', 'label', 'mark', 'output', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'time',
  'u', 'var', 'wbr', 'select', 'option', 'textarea',
]);

const RAW_TEXT_TAGS = new Set(['script', 'style', 'pre', 'textarea']);

const HTML_TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/gi;

function htmlAttrs(raw) {
  const out = [];
  const RE = /([a-zA-Z_:@][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m;
  while ((m = RE.exec(raw || ''))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? null; // null = boolean attr
    out.push({ name, value });
  }
  return out;
}

function attrText(attrs) {
  let s = '';
  for (const { name, value } of attrs) {
    if (value === null) s += ` ${name}`;
    else s += ` ${name}="${String(value).replace(/"/g, '&quot;')}"`;
  }
  return s;
}

function collapseText(t) {
  return String(t).replace(/\s+/g, ' ');
}

/** Serialize a node + its inline descendants to a single line. */
function serializeInline(c) {
  if (c.type === 'text') return collapseText(c.text);
  if (c.type === 'raw') return `${c.inner}`;
  if (c.type === 'comment') return `<!--${c.inner}-->`;
  if (c.type !== 'element') return '';
  const openTag = `<${c.tag}${attrText(c.attrs)}>`;
  if (VOID_TAGS.has(c.tag)) return openTag;
  return `${openTag}${c.children.map(serializeInline).join('')}</${c.tag}>`;
}

/**
 * Render a node list at `depth`. Returns lines or `null` on structural
 * trouble (unbalanced tags the tokenizer could not recover from).
 */
function renderHtmlNodes(nodes, depth) {
  const pad = INDENT.repeat(depth);
  const lines = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      const t = collapseText(node.text).trim();
      if (t) lines.push(pad + t);
      continue;
    }
    if (node.type === 'comment') {
      lines.push(`${pad}<!--${node.inner}-->`);
      continue;
    }
    if (node.type === 'doctype') {
      lines.push(pad + node.text);
      continue;
    }
    if (node.type === 'raw') {
      lines.push(`${pad}<${node.tag}${attrText(node.attrs)}>${node.inner}</${node.tag}>`);
      continue;
    }
    // element
    const open = `<${node.tag}${attrText(node.attrs)}>`;
    if (VOID_TAGS.has(node.tag)) {
      lines.push(pad + open);
      continue;
    }
    const inlineOnly = node.children.every((c) => c.type === 'text' || c.type === 'raw' || (c.type === 'element' && INLINE_TAGS.has(c.tag)));
    if (inlineOnly) {
      const inner = node.children.map(serializeInline).join('');
      const one = `${open}${inner.trim()}</${node.tag}>`;
      if (one.length - pad.length <= MAX_INLINE) { lines.push(pad + one); continue;
      }
    }
    lines.push(pad + open);
    lines.push(...renderHtmlNodes(node.children, depth + 1));
    lines.push(`${pad}</${node.tag}>`);
  }
  return lines;
}

/** Parse + re-serialise an HTML document. Returns null when unparseable. */
export function formatHtml(src) {
  const raw = String(src ?? '');
  if (!raw.trim()) return null;
  const root = { type: 'root', children: [] };
  const stack = [root];
  let last = 0;
  let m;
  HTML_TOKEN_RE.lastIndex = 0;

  const pushText = (t) => {
    if (t) stack[stack.length - 1].children.push({ type: 'text', text: t });
  };

  while ((m = HTML_TOKEN_RE.exec(raw))) {
    pushText(raw.slice(last, m.index));
    last = HTML_TOKEN_RE.lastIndex;
    const full = m[0];

    if (full.startsWith('<!--')) {
      stack[stack.length - 1].children.push({ type: 'comment', inner: full.slice(4, -3) });
      continue;
    }
    if (full.startsWith('<![CDATA[')) {
      stack[stack.length - 1].children.push({ type: 'text', text: full });
      continue;
    }
    if (/^<!doctype/i.test(full)) {
      stack[stack.length - 1].children.push({ type: 'doctype', text: full });
      continue;
    }
    if (m[1]) {
      // closing tag: unwind to the matching opener
      const name = m[1].toLowerCase();
      let found = false;
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].type === 'element' && stack[i].tag === name) {
          stack.length = i;
          found = true;
          break;
        }
      }
      if (!found) return null; // stray closer — refuse to guess
      continue;
    }

    const tag = m[2].toLowerCase();
    const attrs = htmlAttrs(m[3]);
    const selfClose = !!m[4];
    const node = { type: 'element', tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);

    if (selfClose || VOID_TAGS.has(tag)) continue;

    if (RAW_TEXT_TAGS.has(tag)) {
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = raw.slice(last);
      const cm = closeRe.exec(rest);
      const inner = cm ? rest.slice(0, cm.index) : rest;
      node.type = 'raw';
      node.inner = inner;
      node.children = [];
      last = cm ? last + cm.index + cm[0].length : raw.length;
      HTML_TOKEN_RE.lastIndex = last;
      continue;
    }
    stack.push(node);
  }
  pushText(raw.slice(last));
  if (stack.length !== 1) return null; // unclosed element — refuse

  // Reformat <style>/<script> interiors in place; failures keep the original.
  const walkNodes = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'raw' && node.tag === 'style') {
        const formatted = formatCss(node.inner);
        if (formatted !== null) node.inner = `\n${formatted.replace(/\n+$/, '')}\n`;
      } else if (node.type === 'raw' && node.tag === 'script') {
        const formatted = formatJs(node.inner);
        if (formatted !== null) node.inner = `\n${formatted.replace(/\n+$/, '')}\n`;
      } else if (node.children) {
        walkNodes(node.children);
      }
    }
  };
  walkNodes(root.children);

  const lines = renderHtmlNodes(root.children, 0);
  if (lines === null) return null;
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/** Collapse whitespace outside strings; lowercase property names. */
function cssDecl(raw) {
  let colon = -1;
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ':') { colon = i; break; }
  }
  if (colon === -1) return null;
  const prop = raw.slice(0, colon).trim().toLowerCase();
  let value = '';
  quote = null;
  for (let i = colon + 1; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) { value += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; value += ch; continue; }
    if (/\s/.test(ch)) value += ' ';
    else value += ch;
  }
  value = value.trim().replace(/\s+/g, ' ');
  if (!prop || /[^a-z-]/.test(prop)) return null;
  if (!value) return null; // `color: ;` is a mid-edit typo — abort, never emit
  return `${prop}: ${value};`;
}

/** Split a selector/value list on top-level commas. */
function cssTopSplit(s) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Format CSS text. Returns null when the input has unbalanced braces or
 * malformed declarations — the abort contract.
 */
export function formatCss(src, depth = 0) {
  const res = formatCssFrom(String(src ?? ''), 0, depth);
  if (res === null) return null;
  if (!res.closed) {
    // EOF at top level is normal — but the braces must still balance.
    const { masked } = maskCssForOffsets(String(src ?? ''));
    const opens = (masked.match(/\{/g) || []).length;
    const closes = (masked.match(/\}/g) || []).length;
    if (opens !== closes) return null;
  }
  return res.lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

/** Prettier-style touch: `@media(...)` gets its space back. */
const normaliseAtPrelude = (p) => p.replace(/^(@[a-zA-Z-]+)\s*\(/, '$1 (');

function formatCssFrom(raw, start, depth) {
  const pad = INDENT.repeat(depth);
  const lines = [];
  let i = start;
  const n = raw.length;

  while (i < n) {
    const ch = raw[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '}') {
      if (depth === 0) return null; // stray closer
      return { lines, i: i + 1, closed: true };
    }
    if (ch === ';') { i += 1; continue; }

    const prelude = readPrelude(raw, i);
    i = prelude.end;
    if (raw[i] === '}') {
      // A declaration may end the block without a trailing `;`.
      if (prelude.text && !prelude.text.startsWith('@')) {
        const decl = cssDecl(prelude.text);
        if (!decl) return null;
        lines.push(`${pad}${decl}`);
      } else if (prelude.text) {
        return null; // at-rule prelude with no block is junk
      }
      return { lines, i: i + 1, closed: true };
    }
    if (raw[i] === ';') {
      // Declaration or block-less at-rule (@import …; / @charset …;).
      if (prelude.text) {
        if (prelude.text.startsWith('@')) {
          lines.push(`${pad}${normaliseAtPrelude(prelude.text)};`);
        } else {
          const decl = cssDecl(prelude.text);
          if (!decl) return null;
          lines.push(`${pad}${decl}`);
        }
      }
      i += 1;
      continue;
    }
    if (raw[i] !== '{') return null;
    i += 1;

    const isAt = prelude.text.startsWith('@');
    lines.push(`${pad}${isAt ? normaliseAtPrelude(prelude.text) : cssTopSplit(prelude.text).join(',\n' + pad)} {`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = formatCssFrom(raw, i, depth + 1);
      // A nested context MUST end on its own `}`; EOF here means unclosed.
      if (res === null || !res.closed) return null;
      lines.push(...res.lines);
      i = res.i;
      break;
    }
    lines.push(`${pad}}`);
    if (isAt || depth === 0) lines.push(''); // blank line between rules
  }
  return { lines, i, closed: false };
}

function readPrelude(raw, start) {
  let text = '';
  let quote = null;
  let i = start;
  const n = raw.length;
  while (i < n) {
    const ch = raw[i];
    if (quote) { text += ch; if (ch === quote) quote = null; i += 1; continue; }
    if (ch === '"' || ch === "'") { quote = ch; text += ch; i += 1; continue; }
    if (ch === '{' || ch === '}' || ch === ';') break;
    text += ch;
    i += 1;
  }
  return { text: text.trim(), end: i };
}

// ---------------------------------------------------------------------------
// JS — mark-and-reindent
// ---------------------------------------------------------------------------

const MASK = '\x01';

/**
 * Mask everything whose braces must not affect indentation: strings,
 * template literals (including ${…} bodies), comments and regex literals.
 * Newlines are preserved; every other masked char becomes \x01.
 * Returns { masked, spans } where spans are multi-line masked regions.
 */
function maskJs(src) {
  const raw = String(src ?? '');
  let out = '';
  const spans = [];
  let i = 0;
  const n = raw.length;
  let lineStart = 0;
  let line = 0;

  const prevSignificant = () => {
    for (let k = out.length - 1; k >= 0; k -= 1) {
      const ch = out[k];
      if (ch === MASK || /[\s]/.test(ch)) continue;
      return ch;
    }
    return '';
  };
  const prevWord = () => {
    const m = out.replace(new RegExp(`${MASK}`, 'g'), '').match(/([A-Za-z_$][\w$]*)[\s\x01]*$/);
    return m ? m[1] : '';
  };

  while (i < n) {
    const ch = raw[i];
    if (ch === '\n') { out += '\n'; line += 1; lineStart = i + 1; i += 1; continue; }

    // comments
    if (ch === '/' && raw[i + 1] === '/') {
      const startLine = line;
      while (i < n && raw[i] !== '\n') { out += MASK; i += 1; }
      if (line !== startLine) spans.push([startLine, line]);
      continue;
    }
    if (ch === '/' && raw[i + 1] === '*') {
      const startLine = line;
      out += MASK; out += MASK; i += 2;
      while (i < n && !(raw[i] === '*' && raw[i + 1] === '/')) {
        if (raw[i] === '\n') { out += '\n'; line += 1; } else out += MASK;
        i += 1;
      }
      if (i < n) { out += MASK; out += MASK; i += 2; }
      if (line !== startLine) spans.push([startLine, line]);
      continue;
    }
    // strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += MASK; i += 1;
      while (i < n && raw[i] !== quote) {
        if (raw[i] === '\\' && i + 1 < n) { out += MASK; out += MASK; i += 2; continue; }
        if (raw[i] === '\n') break; // unterminated — bail out of the string
        out += MASK; i += 1;
      }
      if (i < n && raw[i] === quote) { out += MASK; i += 1; }
      continue;
    }
    // template literal
    if (ch === '`') {
      const startLine = line;
      out += MASK; i += 1;
      let depthDollar = 0;
      while (i < n) {
        if (raw[i] === '\\') { out += MASK; out += MASK; i += 2; continue; }
        if (raw[i] === '\n') { out += '\n'; line += 1; i += 1; continue; }
        if (raw[i] === '`' && depthDollar === 0) { out += MASK; i += 1; break; }
        if (raw[i] === '$' && raw[i + 1] === '{') {
          out += MASK; out += '{'; i += 2;
          depthDollar += 1;
          // mask the ${ … } body EXCEPT its braces, so template expressions
          // do not contribute depth but their structure stays balanced.
          let d = 1;
          while (i < n && d > 0) {
            if (raw[i] === '\n') { out += '\n'; line += 1; i += 1; continue; }
            if (raw[i] === '{') { d += 1; out += '{'; i += 1; continue; }
            if (raw[i] === '}') { d -= 1; if (d === 0) { out += '}'; i += 1; depthDollar -= 1; break; } out += '}'; i += 1; continue; }
            if (raw[i] === '"' || raw[i] === "'" || raw[i] === '`') {
              const q = raw[i];
              out += MASK; i += 1;
              while (i < n && raw[i] !== q) {
                if (raw[i] === '\\') { out += MASK; out += MASK; i += 2; continue; }
                if (raw[i] === '\n') break;
                out += MASK; i += 1;
              }
              if (i < n && raw[i] === q) { out += MASK; i += 1; }
              continue;
            }
            out += MASK; i += 1;
          }
          continue;
        }
        out += MASK; i += 1;
      }
      if (line !== startLine) spans.push([startLine, line]);
      continue;
    }
    // regex literal — only when a division is impossible here
    if (ch === '/') {
      const prev = prevSignificant();
      const word = prevWord();
      const afterValue = /[)\]\w$"'`]/.test(prev);
      const afterKeyword = /^(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/.test(word);
      if (!afterValue || afterKeyword) {
        const startLine = line;
        out += MASK; i += 1;
        let closed = false;
        let inClass = false;
        while (i < n) {
          if (raw[i] === '\\') { out += MASK; out += MASK; i += 2; continue; }
          if (raw[i] === '\n') break;
          if (raw[i] === '[') inClass = true;
          else if (raw[i] === ']') inClass = false;
          else if (raw[i] === '/' && !inClass) { out += MASK; i += 1; closed = true; break; }
          out += MASK; i += 1;
        }
        while (i < n && /[a-z]/.test(raw[i])) { out += MASK; i += 1; }
        if (closed && line !== startLine) spans.push([startLine, line]);
        continue;
      }
      out += '/'; i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return { masked: out, spans };
}

/** Restore masked characters from the original, 1:1 per line. */
function unmaskLine(maskedLine, origLine) {
  let out = '';
  for (let i = 0; i < maskedLine.length; i += 1) {
    out += maskedLine[i] === MASK ? (origLine[i] ?? '') : maskedLine[i];
  }
  return out;
}

/** Re-indent masked JS by brace depth. Returns null when braces unbalance. */
export function formatJs(src) {
  const raw = String(src ?? '');
  if (!raw.trim()) return null;
  const { masked, spans } = maskJs(raw);
  const inSpan = (lineIdx) => spans.some(([a, b]) => lineIdx > a && lineIdx < b);

  const maskedLines = masked.split('\n');
  const rawLines = raw.split('\n');
  if (maskedLines.length !== rawLines.length) return null; // masking broke lines

  const outLines = [];
  let depth = 0;
  let net = 0;
  for (const l of maskedLines) {
    for (const ch of l) {
      if (ch === '{' || ch === '(' || ch === '[') net += 1;
      else if (ch === '}' || ch === ')' || ch === ']') net -= 1;
    }
  }
  if (net !== 0) return null; // unbalanced — abort, never mangle

  for (let li = 0; li < maskedLines.length; li += 1) {
    const maskedLine = maskedLines[li];
    if (inSpan(li)) { outLines.push(rawLines[li]); continue; } // template interior: untouched
    if (!maskedLine.trim()) { outLines.push(''); continue; }

    const line = unmaskLine(maskedLine, rawLines[li]);

    // compute this line's indent from leading closers + depth
    let d = depth;
    let lineIndent = depth;
    let seenContent = false;
    for (const ch of maskedLine) {
      if (ch === '{' || ch === '(' || ch === '[') { d += 1; seenContent = true; }
      else if (ch === '}' || ch === ')' || ch === ']') {
        d -= 1;
        if (!seenContent) lineIndent = d;
      } else if (!/\s/.test(ch) && ch !== MASK) seenContent = true;
    }
    const stripped = line.replace(/^[ \t]+/, '').replace(/\t/g, '  ');
    outLines.push(INDENT.repeat(Math.max(0, lineIndent)) + stripped);
    depth = d;
    if (depth < 0) return null;
  }
  return outLines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function formatJson(src) {
  try {
    return `${JSON.stringify(JSON.parse(String(src ?? '')), null, 2)}\n`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Format a whole document. Returns `{ text, changed, lang }` or `null` when
 * the language is unsupported or the formatter aborted (unsafe input).
 */
export function formatCode(lang, src) {
  const family = normaliseLang(lang);
  const raw = String(src ?? '');
  let out = null;
  if (family === 'markup') out = formatHtml(raw);
  else if (family === 'css') out = formatCss(raw);
  else if (family === 'js') out = formatJs(raw);
  else if (family === 'json') out = formatJson(raw);
  if (out === null) return null;
  return { text: out, changed: out !== raw, lang: family };
}

/**
 * Format the enclosing CSS rule under `offset` (or the whole document when
 * the caret is outside any block). Returns the setTextAt-shaped result
 * `{ text, offset, from, to, row, col }`, or null.
 */
export function formatCodeAt(lang, src, offset) {
  const raw = String(src ?? '');
  const pos = Math.max(0, Math.min(offset, raw.length));
  const family = normaliseLang(lang);
  if (family !== 'css') return null;

  // Find the innermost unclosed block containing `pos` (masked scan so
  // strings with braces do not confuse the search).
  const { masked } = maskCssForOffsets(raw);
  let openIdx = -1;
  let depth = 0;
  for (let i = 0; i < pos; i += 1) {
    const ch = masked[i];
    if (ch === '{') { if (depth === 0) openIdx = i; depth += 1; }
    else if (ch === '}') { depth = Math.max(0, depth - 1); openIdx = depth === 0 ? -1 : openIdx; }
  }
  if (depth === 0 || openIdx === -1) {
    const whole = formatCss(raw);
    if (whole === null) return null;
    const row = (whole.slice(0, pos).match(/\n/g) || []).length;
    return { text: whole, offset: pos, from: 0, to: raw.length, row, col: 0 };
  }

  // Rule start: beginning of the prelude line before openIdx.
  let start = raw.lastIndexOf('}', openIdx) + 1;
  const semi = raw.lastIndexOf(';', openIdx) + 1;
  if (semi > start) start = semi;
  const lineStart = raw.lastIndexOf('\n', openIdx) + 1;
  if (lineStart > start) start = lineStart;
  // Rule end: matching close brace.
  let d = 0;
  let end = raw.length;
  for (let i = openIdx; i < raw.length; i += 1) {
    if (masked[i] === '{') d += 1;
    else if (masked[i] === '}') { d -= 1; if (d === 0) { end = i + 1; break; } }
  }
  const innermost = raw.slice(start, end);
  const formatted = formatCss(innermost);
  if (formatted === null) return null;
  const text2 = raw.slice(0, start) + formatted + raw.slice(end).replace(/^\n?/, (m2) => (formatted.endsWith('\n') && m2 === '\n' ? '' : m2));
  const before = raw.slice(0, start) + formatted;
  const row = (before.match(/\n/g) || []).length;
  const col = before.length - (before.lastIndexOf('\n') + 1);
  return { text: text2, offset: start + formatted.length, from: start, to: end, row, col };
}

function maskCssForOffsets(src) {
  const raw = String(src ?? '');
  let out = '';
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const ch = raw[i];
    if ((ch === '"' || ch === "'")) {
      const q = ch;
      out += MASK; i += 1;
      while (i < n && raw[i] !== q) {
        if (raw[i] === '\\') { out += MASK; out += MASK; i += 2; continue; }
        out += MASK; i += 1;
      }
      if (i < n) { out += MASK; i += 1; }
      continue;
    }
    if (ch === '/' && raw[i + 1] === '*') {
      while (i < n && !(raw[i] === '*' && raw[i + 1] === '/')) { out += MASK; i += 1; }
      if (i < n) { out += MASK; out += MASK; i += 2; }
      continue;
    }
    out += ch;
    i += 1;
  }
  return { masked: out };
}
