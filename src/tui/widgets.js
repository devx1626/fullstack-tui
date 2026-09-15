/**
 * Reusable UI widgets. Every widget returns an array of segment-rows so the
 * views can stitch them together with plain array spreads.
 */

import { seg, fit, clip, width, overlay, paragraph, inline } from './canvas.js';

// ---------------------------------------------------------------------------
// Syntax highlighting
// ---------------------------------------------------------------------------

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

function resolveLang(lang) {
  const key = String(lang || 'text').toLowerCase().trim();
  return RULES[key] ? key : RULES[ALIAS[key]] ? ALIAS[key] : 'text';
}

/**
 * Tokenise one logical line. `state` carries multi-line comment state between
 * lines so a `/* ... *\/` block does not bleed colour.
 */
function tokenize(line, lang, theme, state) {
  const rules = RULES[lang] || [];
  const out = [];
  let i = 0;

  if (state.blockComment) {
    const end = line.indexOf('*/');
    if (end === -1) {
      if (line) out.push({ text: line, fg: theme.comment, italic: true });
      return out;
    }
    out.push({ text: line.slice(0, end + 2), fg: theme.comment, italic: true });
    i = end + 2;
    state.blockComment = false;
  }

  while (i < line.length) {
    let best = null;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(line);
      if (!m || m.index !== i || !m[0].length) continue;
      if (!best || m[0].length > best.text.length) {
        best = { text: m[0], fg: theme[rule.fg] ?? null, bold: !!rule.bold, italic: !!rule.italic };
      }
    }
    if (best) {
      out.push(best);
      i += best.text.length;
      if (lang === 'js' || lang === 'css') {
        const opener = best.text.indexOf('/*');
        const closer = best.text.indexOf('*/', opener + 2);
        if (opener !== -1 && closer === -1) state.blockComment = true;
      }
      continue;
    }
    const ch = line[i];
    const last = out[out.length - 1];
    if (last && last.fg === null && !last.bold && !last.italic) last.text += ch;
    else out.push({ text: ch, fg: null });
    i += 1;
  }
  return out;
}

/**
 * Highlight a single line into plain tokens `{text, fg, bold, italic}`.
 * Exported separately so the in-TUI editor can highlight without line numbers.
 */
export function highlightTokens(line, lang, theme, state = { blockComment: false }) {
  return tokenize(String(line), resolveLang(lang), theme, state);
}

/** Rows for a highlighted code block. */
export function codeBlock(theme, w, code, lang = 'js', opts = {}) {
  const lines = String(code).replace(/\t/g, '  ').replace(/\s+$/, '').split('\n');
  const gutter = opts.lineNumbers === false ? 0 : String(lines.length).length + 2;
  const bodyW = Math.max(8, w - gutter - 2);
  const state = { blockComment: false };
  const rows = [];

  const top = gutter ? ' '.repeat(gutter) : '';
  if (opts.title) {
    rows.push(fit([seg(top + ' ', { fg: theme.muted, bg: theme.codeBg })], w, { bg: theme.codeBg }));
    rows.push(fit(
      [seg(top + ' ', { bg: theme.codeBg }), seg(' ' + opts.title + ' ', { fg: theme.faint, bg: theme.codeBg, italic: true })],
      w,
      { bg: theme.codeBg },
    ));
  }
  rows.push(fit([seg(top + ' ', { bg: theme.codeBg })], w, { bg: theme.codeBg }));

  lines.forEach((line, idx) => {
    const segs = [];
    if (gutter) {
      segs.push(seg(String(idx + 1).padStart(gutter - 1) + ' ', { fg: theme.faint, bg: theme.codeBg }));
    }
    segs.push(seg(' ', { bg: theme.codeBg }));
    const pieces = tokenize(line, resolveLang(lang), theme, state);
    const clipped = [];
    let used = 0;
    for (const p of pieces) {
      if (used >= bodyW) break;
      const room = bodyW - used;
      const text = p.text.length <= room ? p.text : p.text.slice(0, room);
      clipped.push(seg(text, { fg: p.fg ?? theme.codeText, bg: theme.codeBg, bold: p.bold, italic: p.italic }));
      used += text.length;
    }
    segs.push(...clipped);
    rows.push(fit(segs, w, { bg: theme.codeBg }));
  });

  rows.push(fit([seg(top + ' ', { bg: theme.codeBg })], w, { bg: theme.codeBg }));
  return rows;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const blank = (w, theme) => [fit([], w, { bg: theme.bg })];

export function badge(theme, label, kind = 'accent') {
  const fg = theme[kind] ?? theme.accent;
  return [seg(` ${label} `, { fg: theme.bg, bg: fg, bold: true })];
}

/** A horizontal progress meter rendered as segments. */
export function meter(theme, w, done, total, opts = {}) {
  const filled = total > 0 ? Math.round((done / total) * w) : 0;
  const bar = '█'.repeat(Math.max(0, Math.min(w, filled)));
  const rest = '─'.repeat(Math.max(0, w - filled));
  const complete = total > 0 && done >= total;
  return [
    seg(bar, { fg: complete ? theme.good : theme.accent }),
    seg(rest, { fg: theme.border }),
  ].concat(opts.label ? [seg('  ' + opts.label, { fg: theme.muted })] : []);
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

export function header(theme, w, { title, subtitle = '', right = '', tabs = null, activeTab = 0, breadcrumbs = null }) {
  const rows = [];
  const left = [seg(' ' + title, { fg: theme.text, bold: true, bg: theme.panel })];
  if (subtitle) left.push(seg('  ' + subtitle, { fg: theme.muted, bg: theme.panel }));
  
  if (breadcrumbs && breadcrumbs.length) {
    const crumbs = [];
    breadcrumbs.forEach((crumb, i) => {
      crumbs.push(seg(crumb, { fg: i === breadcrumbs.length - 1 ? theme.text : theme.muted, bg: theme.panel }));
      if (i < breadcrumbs.length - 1) crumbs.push(seg(' > ', { fg: theme.border, bg: theme.panel }));
    });
    left.push(seg('  ', { bg: theme.panel }));
    left.push(...crumbs);
  }

  const rightSeg = right ? [seg(right + ' ', { fg: theme.accent, bg: theme.panel })] : [];
  rows.push(fit([...left, ...rightSeg], w, { bg: theme.panel }));

  if (tabs && tabs.length) {
    const t = [];
    t.push(seg(' ', { bg: theme.panel }));
    tabs.forEach((name, i) => {
      const active = i === activeTab;
      t.push(seg(` ${name} `, {
        fg: active ? theme.bg : theme.muted,
        bg: active ? theme.accent : theme.panelAlt,
        bold: active,
      }));
      t.push(seg(' ', { bg: theme.panel }));
    });
    rows.push(fit(t, w, { bg: theme.panel }));
  }

  rows.push(fit([seg('─'.repeat(w), { fg: theme.border, bg: theme.bg })], w, { bg: theme.bg }));
  return rows;
}

export function footer(theme, w, hints, notice = null) {
  const rows = [];
  rows.push(fit([seg('─'.repeat(w), { fg: theme.border, bg: theme.bg })], w, { bg: theme.bg }));
  if (notice) {
    rows.push(fit([seg(' ' + notice.text, { fg: theme[notice.kind] ?? theme.muted, bold: !!notice.bold })], w, { bg: theme.bg }));
  }
  const parts = [seg(' ', {})];
  hints.forEach(([key, label], i) => {
    if (i) parts.push(seg('  ', {}));
    parts.push(seg(key, { fg: theme.bg, bg: theme.muted, bold: true }));
    parts.push(seg(' ' + label, { fg: theme.muted }));
  });
  rows.push(fit(parts, w, { bg: theme.bg }));
  return rows;
}

/** Draw a bordered box around already-rendered inner rows (each inner row is w-2 wide). */
export function box(theme, w, inner, { title = '', focused = false, minHeight = 0 } = {}) {
  const bc = focused ? theme.borderFocus : theme.border;
  const rows = [];
  const cap = title
    ? [seg('┌─', { fg: bc }), seg(' ' + title + ' ', { fg: focused ? theme.borderFocus : theme.muted, bold: focused }), seg('─'.repeat(Math.max(0, w - title.length - 5)) + '┐', { fg: bc })]
    : [seg('┌' + '─'.repeat(Math.max(0, w - 2)) + '┐', { fg: bc })];
  rows.push(fit(cap, w, { bg: theme.bg }));

  const bodyW = w - 2;
  const body = inner.map((r) => fit(clip(r, bodyW), bodyW, { bg: theme.bg }));
  while (body.length < minHeight) body.push(fit([], bodyW, { bg: theme.bg }));

  for (const r of body) {
    rows.push(fit([seg('│', { fg: bc, bg: theme.bg }), ...r, seg('│', { fg: bc, bg: theme.bg })], w, { bg: theme.bg }));
  }
  rows.push(fit([seg('└' + '─'.repeat(Math.max(0, w - 2)) + '┘', { fg: bc })], w, { bg: theme.bg }));
  return rows;
}

/** Side-by-side composition of two column renderers. */
export function split(theme, w, leftW, leftRows, rightRows) {
  const gap = 0;
  const rightW = w - leftW - gap;
  const h = Math.max(leftRows.length, rightRows.length);
  const rows = [];
  for (let i = 0; i < h; i += 1) {
    rows.push(fit([
      ...fit(leftRows[i] || [], leftW, { bg: theme.bg }),
      ...(gap ? [seg(' '.repeat(gap), { bg: theme.bg })] : []),
      ...fit(rightRows[i] || [], rightW, { bg: theme.bg }),
    ], w, { bg: theme.bg }));
  }
  return rows;
}

/** A vertical scrolling window over a long list of rows. */
export function viewport(rows, h, offset) {
  const out = [];
  for (let i = 0; i < h; i += 1) out.push(rows[offset + i] || []);
  return out;
}

/** Scrollbar rail drawn on the far right of a viewport. */
export function scrollbar(theme, h, total, offset, thumbColor) {
  const rows = [];
  if (total <= h) {
    for (let i = 0; i < h; i += 1) rows.push([seg(' ', { fg: theme.faint })]);
    return rows;
  }
  const thumb = Math.max(1, Math.round((h / total) * h));
  const maxStart = h - thumb;
  const pos = Math.round((offset / Math.max(1, total - h)) * maxStart);
  for (let i = 0; i < h; i += 1) {
    const on = i >= pos && i < pos + thumb;
    rows.push([seg('▐', { fg: on ? (thumbColor || theme.accent) : theme.border })]);
  }
  return rows;
}

/** A selectable list, returning exactly `h` rows. */
export function listRows(theme, w, h, items, selected, opts = {}) {
  const rows = [];
  const offset = opts.offset || 0;
  const visible = items.slice(offset, offset + h);
  for (let i = 0; i < h; i += 1) {
    const item = visible[i];
    if (!item) {
      rows.push(fit([], w, { bg: theme.bg }));
      continue;
    }
    const index = offset + i;
    const active = index === selected;
    const bg = active ? theme.panelAlt : theme.bg;
    const style = { fg: active ? theme.text : theme.muted, bg };
    const segs = [seg(active ? ' ▸ ' : '   ', { fg: active ? theme.accent : theme.faint, bg, bold: active })];
    if (item.marker) segs.push(seg(item.marker + ' ', { fg: theme[item.markerColor || 'good'], bg, bold: true }));
    if (item.prefix) segs.push(seg(item.prefix + ' ', { fg: theme.faint, bg }));
    segs.push(seg(item.label, { ...style, bold: active }));
    if (item.suffix) segs.push(seg('  ' + item.suffix, { fg: theme.faint, bg }));
    if (item.right) segs.push(seg('  ' + item.right, { fg: theme.muted, bg }));
    rows.push(fit(segs, w, { bg }));
  }
  return rows;
}

/** Wrap markdown-ish prose to width and attach no extra styling. */
export function prose(theme, w, text, base = {}) {
  return paragraph(text, w, { fg: theme.text, codeBg: theme.codeBg, codeFg: theme.codeText, ...base });
}

/**
 * Round a view's rows to exactly `h` rows so the app can splice it into the
 * frame without ever leaving a stale line behind.
 */
export function clampRows(rows, w, h, theme) {
  const out = rows.slice(0, h);
  while (out.length < h) out.push(fit([], w, { bg: theme.bg }));
  return out;
}

/** A small UPPERCASE section label with a rule, used to break up long pages. */
export function sectionLabel(theme, w, label, right = '') {
  const segs = [seg(' ' + label.toUpperCase(), { fg: theme.accent, bold: true })];
  if (right) segs.push(seg('  ' + right, { fg: theme.faint }));
  return fit(segs, w, { bg: theme.bg });
}

/** A soft horizontal rule. */
export function rule(theme, w) {
  return fit([seg(' ' + '·'.repeat(Math.max(0, w - 2)), { fg: theme.border })], w, { bg: theme.bg });
}

/**
 * A row of stat chips: `[[label, value, colourKey], ...]`.
 */
export function statChips(theme, w, chips) {
  const segs = [seg(' ', {})];
  chips.forEach(([label, value, color = 'accent'], i) => {
    if (i) segs.push(seg('   ', {}));
    segs.push(seg(String(value), { fg: theme[color], bold: true }));
    segs.push(seg(' ' + label, { fg: theme.muted }));
  });
  return fit(segs, w, { bg: theme.bg });
}

/** A 21-day activity strip. */
const SPARK = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function sparkline(theme, w, activity) {
  const peak = Math.max(30, ...activity.map((a) => a.minutes));
  const segs = [seg(' ', {})];
  for (const day of activity) {
    const level = day.minutes === 0 ? 0 : Math.min(8, Math.max(1, Math.round((day.minutes / peak) * 8)));
    segs.push(seg(SPARK[level], { fg: day.minutes ? theme.accent : theme.border }));
  }
  segs.push(seg(`   peak ${Math.round(peak)} min/day`, { fg: theme.faint }));
  return fit(segs, w, { bg: theme.bg });
}

export { seg, fit, clip, width, overlay, inline };

export function diffCode(theme, w, current, reference, lang = 'js') {
  const currentLines = String(current).split('\n');
  const refLines = String(reference).split('\n');
  const maxLines = Math.max(currentLines.length, refLines.length);
  const rows = [];

  for (let i = 0; i < maxLines; i++) {
    const cur = currentLines[i] || '';
    const ref = refLines[i] || '';
    
    if (cur === ref) {
      rows.push(fit(highlightTokens(cur, lang, theme, { blockComment: false }), w, { bg: theme.codeBg }));
    } else {
      const curSegs = highlightTokens(cur, lang, theme, { blockComment: false }).map(s => ({ ...s, fg: theme.bad }));
      const refSegs = highlightTokens(ref, lang, theme, { blockComment: false }).map(s => ({ ...s, fg: theme.good }));
      
      rows.push(fit([seg('! ', { fg: theme.bad, bold: true }), ...curSegs], w, { bg: theme.codeBg }));
      rows.push(fit([seg('? ', { fg: theme.good, bold: true }), ...refSegs], w, { bg: theme.codeBg }));
    }
  }
  return rows;
}
