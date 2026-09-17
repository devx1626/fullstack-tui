/**
 * ex-lite (overhaul §8.8: "ex-lite via palette … routed as registry commands").
 *
 * The `:` line is parsed into an intent, and the intent names a REGISTRY
 * COMMAND ID rather than an editor function. That is what keeps the classic
 * and next UIs honest: `:w` checks your code because `challenge.check` does,
 * not because vim knows what checking is. The editor only reports what it
 * understood; the host decides what the command does.
 *
 * Supported (spec §8.8): `:w`, `:q`, `:q!`, `:wq`, `:reset`, `:hint`,
 * `:solution`, `:browser`, `:%s//`, `:<number>` (go to line). Anything else is
 * reported as unknown instead of silently ignored — a user who types `:Q` wants
 * to know it did nothing.
 */

/** Registry ids the ex commands map to (kept in one place for the tests). */
/**
 * The command table. `handler` is `'command'` (dispatch a registry id) or
 * `'registers'` (a local panel) — deliberately NOT called `kind`, because
 * `parseEx` reports the PARSE kind and the two collided: spreading an entry
 * whose `kind` was `'command'` over `kind: 'ex'` silently made every `:w`
 * unparseable.
 */
export const EX_COMMANDS = {
  w: { id: 'challenge.check', title: 'check my code', handler: 'command' },
  write: { id: 'challenge.check', title: 'check my code', handler: 'command' },
  q: { id: 'app.back', title: 'go back', handler: 'command' },
  quit: { id: 'app.back', title: 'go back', handler: 'command' },
  'q!': { id: 'app.back', title: 'go back (no checks)', handler: 'command' },
  wq: { id: 'challenge.check', title: 'check my code', handler: 'command', also: 'app.back' },
  reset: { id: 'challenge.reset', title: 'reset to the starter', handler: 'command' },
  hint: { id: 'challenge.hint', title: 'reveal a hint', handler: 'command' },
  solution: { id: 'challenge.solution', title: 'toggle the solution', handler: 'command' },
  browser: { id: 'challenge.browser', title: 'open the built-in browser', handler: 'command' },
  save: { id: 'challenge.save', title: 'save to the workspace', handler: 'command' },
  preview: { id: 'challenge.preview', title: 'preview in the browser', handler: 'command' },
  tour: { id: 'app.tour', title: 'replay the welcome tour', handler: 'command' },
  registers: { handler: 'registers', title: 'show the registers' },
};

/**
 * Parse one `:` command line.
 *
 * @param {string} input everything after the `:` (leading/trailing space ignored)
 * @returns {{ kind, ... }}
 *   `{kind:'command', id, title, also?}` — run a registry command
 *   `{kind:'goto-line', line}`           — `:42`
 *   `{kind:'substitute', range, pattern, replacement, flags, all}`
 *   `{kind:'registers'}`                 — `:registers`
 *   `{kind:'empty'}` / `{kind:'unknown', command}` / `{kind:'error', message}`
 */
export function parseEx(input) {
  const line = String(input ?? '').trim();
  if (!line) return { kind: 'empty' };

  // `:42` — go to a line (the spec's `:123`).
  if (/^\d+$/.test(line)) return { kind: 'goto-line', line: Number(line) };

  // `:%s/old/new/g`, `:s/old/new/`, `:1,5s/…` — the substitute family.
  const sub = /^(%|\d+(?:,\d+)?)?s(\/|#|,)(.*)$/.exec(line);
  if (sub) {
    const [, range, sep, rest] = sub;
    const parts = splitUnescaped(rest, sep);
    if (parts.length < 2) return { kind: 'error', message: 'substitute needs a pattern and a replacement' };
    const [pattern, replacement, flags = ''] = parts;
    if (!pattern) return { kind: 'error', message: 'substitute needs a pattern' };
    return {
      kind: 'substitute',
      range: range || null,
      all: range === '%' || flags.includes('g'),
      confirm: flags.includes('c'),
      pattern,
      replacement,
      flags,
    };
  }

  // Longest command name wins, so `:wq` is not read as `:w` + `q`. The entry is
  // spread FIRST and `kind`/`name` are set after, so a table field can never
  // overwrite the parse kind.
  const keys = Object.keys(EX_COMMANDS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (line === key) return { ...EX_COMMANDS[key], kind: 'ex', name: key };
  }
  const first = line.split(/\s+/)[0];
  if (EX_COMMANDS[first]) return { ...EX_COMMANDS[first], kind: 'ex', name: first };

  return { kind: 'unknown', command: first };
}

/** Split on a separator, honouring `\/` escapes (vim's substitute syntax). */
export function splitUnescaped(text, sep) {
  const out = [];
  let current = '';
  for (let i = 0; i < String(text).length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      current += text[i + 1] === sep ? sep : ch + text[i + 1];
      i += 1;
      continue;
    }
    if (ch === sep) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** A one-line description for the footer after an ex command ran. */
export function describeEx(parsed) {
  switch (parsed.kind) {
    case 'ex': return parsed.title || parsed.name;
    case 'goto-line': return `line ${parsed.line}`;
    case 'substitute': return `${parsed.all ? 'replace all' : 'replace'} “${parsed.pattern}”${parsed.confirm ? ' (confirm each)' : ''}`;
    case 'registers': return 'registers';
    case 'empty': return 'nothing typed';
    case 'unknown': return `unknown command :${parsed.command}`;
    case 'error': return parsed.message;
    default: return String(parsed.kind);
  }
}
