/**
 * A small CSS parser + query helper.
 *
 * Challenges can assert on *resolved intent* rather than text: "does `.card`
 * declare `display: flex`", "is there a `@media` block with a min-width of at
 * least 768px", "does the rule use a relative unit".
 */

/** Split on `sep` while ignoring separators inside (), {}, [] and quotes. */
function splitTop(str, sep = ';') {
  const out = [];
  let depth = 0;
  let quote = null;
  let buf = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (quote) {
      buf += ch;
      if (ch === quote && str[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === sep && depth <= 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function parseDecls(body) {
  const decls = [];
  for (const chunk of splitTop(body, ';')) {
    if (!chunk.trim()) continue;
    if (chunk.includes('{')) continue; // nested rule; handled by the recursive parser
    const idx = chunk.indexOf(':');
    if (idx === -1) continue;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    let value = chunk.slice(idx + 1).trim();
    const important = /!important\s*$/i.test(value);
    if (important) value = value.replace(/!important\s*$/i, '').trim();
    if (!prop) continue;
    decls.push({ prop, value, important });
  }
  return decls;
}

const normaliseSelector = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function parseRules(src, media, out, depth = 0) {
  const input = String(src);
  let buf = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (ch === '{') {
      let level = 1;
      let j = i + 1;
      while (j < input.length && level > 0) {
        if (input[j] === '{') level += 1;
        else if (input[j] === '}') level -= 1;
        j += 1;
      }
      const prelude = buf.trim();
      const body = input.slice(i + 1, j - 1);
      buf = '';
      i = j;

      if (!prelude) continue;

      if (prelude.startsWith('@')) {
        const at = (prelude.match(/^@([\w-]+)/) || [, ''])[1].toLowerCase();
        if (['media', 'supports', 'layer', 'container', 'scope', 'document'].includes(at) && depth < 4) {
          parseRules(body, prelude, out, depth + 1);
        } else if (at === 'keyframes' || at.endsWith('keyframes')) {
          out.push({ at, prelude, media, selectors: [], decls: [], isAtBlock: true, body });
        } else {
          out.push({ at, prelude, media, selectors: [normaliseSelector(prelude)], decls: parseDecls(body), isAtBlock: false });
        }
        continue;
      }

      // Native CSS nesting: a rule may contain nested rules.
      const nested = body.includes('{');
      const decls = nested ? parseDecls(body.slice(0, body.indexOf('{'))) : parseDecls(body);
      out.push({
        selectors: splitTop(prelude, ',').map(normaliseSelector).filter(Boolean),
        decls,
        media,
        prelude: prelude.trim(),
      });
      if (nested) parseRules(body.slice(body.indexOf('{') + 1).replace(/\}[^}]*$/, ''), media, out, depth + 1);
      continue;
    }
    if (ch === '}' || ch === ';') {
      if (ch === ';' && buf.trim().startsWith('@')) {
        out.push({ at: buf.trim().match(/^@([\w-]+)/)?.[1], prelude: buf.trim(), media, selectors: [], decls: [], isAtBlock: false });
        buf = '';
        i += 1;
        continue;
      }
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  return out;
}

/** Parse a stylesheet (comments stripped) into a flat rule list. */
export function parse(src) {
  const clean = String(src ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  return parseRules(clean, null, []);
}

export const extractCss = (src) => {
  const text = String(src ?? '');
  if (!/<[a-z!/]/i.test(text)) return text; // raw CSS file
  // A document with <style> blocks: keep ONLY the stylesheet contents. Keeping
  // the surrounding markup too would make the doctype and <head> lines parse
  // into a garbage first rule that swallows the real rule after it.
  const blocks = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  return blocks.join('\n');
};

const UNITS = /(-?\d*\.?\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|s|ms|fr|deg)\b/i;

export class Css {
  constructor(src, files = {}) {
    this.files = files;
    this.source = String(src ?? '');
    this.rules = parse(extractCss(this.source));
    
    // Merge in any other CSS files provided in the synthesis set
    for (const [name, content] of Object.entries(files)) {
      if (name !== 'index.css' && (name.endsWith('.css') || name.endsWith('.scss'))) {
        this.rules.push(...parse(extractCss(content)));
      }
    }
  }

  /** Rules that declare `selector`. Case-insensitive, whitespace-insensitive. */
  rulesFor(selector) {
    const want = normaliseSelector(selector);
    return this.rules.filter((r) => r.selectors.includes(want));
  }

  has(selector) {
    return this.rulesFor(selector).length > 0;
  }

  /** Last declared value for `prop` under `selector`, or null. */
  value(selector, prop) {
    const key = String(prop).toLowerCase();
    const all = this.rulesFor(selector).flatMap((r) => r.decls.filter((d) => d.prop === key));
    return all.length ? all[all.length - 1].value : null;
  }

  /** Value with the unit, e.g. `1.5rem` -> `1.5rem`; number only -> `1.5rem` -> 1.5 */
  numeric(selector, prop) {
    const v = this.value(selector, prop);
    if (v == null) return null;
    const m = String(v).match(/-?\d*\.?\d+/);
    return m ? Number(m[0]) : null;
  }

  unit(selector, prop) {
    const v = this.value(selector, prop);
    if (v == null) return null;
    const m = String(v).match(UNITS);
    return m ? m[2].toLowerCase() : null;
  }

  /** Every rule that declares a property, useful for "used anywhere" checks. */
  uses(prop) {
    const key = String(prop).toLowerCase();
    return this.rules.filter((r) => r.decls.some((d) => d.prop === key));
  }

  /** All values declared for a property across the sheet. */
  values(prop) {
    const key = String(prop).toLowerCase();
    return this.rules.flatMap((r) => r.decls.filter((d) => d.prop === key).map((d) => d.value));
  }

  /** Rules wrapped in @media whose prelude mentions `feature` (e.g. 'min-width'). */
  media(feature) {
    return this.rules.filter((r) => r.media && (!feature || r.media.toLowerCase().includes(String(feature).toLowerCase())));
  }

  /** Largest numeric value used inside a `@media (min-width: ...)` prelude. */
  maxMinWidth() {
    let best = null;
    for (const r of this.rules) {
      if (!r.media) continue;
      const m = r.media.match(/min-width\s*:\s*(-?\d*\.?\d+)(px|rem|em)?/i);
      if (!m) continue;
      const n = Number(m[1]) * (m[2] === 'rem' || m[2] === 'em' ? 16 : 1);
      best = best === null ? n : Math.max(best, n);
    }
    return best;
  }

  customProps() {
    const out = {};
    for (const r of this.rules) {
      for (const d of r.decls) {
        if (d.prop.startsWith('--')) out[d.prop] = d.value;
      }
    }
    return out;
  }

  /**
   * Substitute `var(--name)` references with the value declared for that custom
   * property, including the `var(--name, fallback)` form. Design tokens are only
   * useful if a check can see through them.
   */
  resolve(value) {
    const props = this.customProps();
    let out = String(value ?? '');
    for (let guard = 0; guard < 10 && /var\(/.test(out); guard += 1) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (match, name, fallback) => {
        if (props[name] !== undefined) return props[name];
        return fallback !== undefined ? fallback.trim() : '';
      });
    }
    return out;
  }

  get ruleCount() {
    return this.rules.filter((r) => r.selectors.length).length;
  }

  /** Human-readable dump used in the review screen. */
  summary() {
    return this.rules
      .filter((r) => r.selectors.length && r.decls.length)
      .map((r) => `${r.selectors.join(', ')} { ${r.decls.map((d) => `${d.prop}: ${d.value}`).join('; ')} }`);
  }
}

export { normaliseSelector };
