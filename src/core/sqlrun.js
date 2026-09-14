/**
 * Real SQL execution against an in-memory SQLite database.
 *
 * Node 22.5+ ships `node:sqlite`, so database challenges are graded by running
 * the learner's statements and inspecting the actual rows - not by looking for
 * the word SELECT.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let cached = null;

function loadSqlite() {
  if (cached !== null) return cached;
  // The module emits an ExperimentalWarning on first load which would scribble
  // over the TUI, so silence it for the duration of the import.
  const original = process.emitWarning;
  process.emitWarning = () => {};
  try {
    cached = require('node:sqlite');
  } catch {
    cached = false;
  } finally {
    process.emitWarning = original;
  }
  return cached;
}

export const sqlAvailable = () => !!loadSqlite();

/** Split a script into statements, respecting quotes and parentheses. */
export function splitStatements(sql) {
  const out = [];
  let buf = '';
  let quote = null;
  let depth = 0;
  const text = String(sql ?? '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      buf += ch;
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      buf += '\n';
      continue;
    }
    if (ch === ';' && depth <= 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

const READ_ONLY = /^(select|with|pragma|explain)\b/i;

function friendlyError(message) {
  const m = String(message || '');
  if (/no such table/i.test(m)) return `${m}. Did you create or name a table correctly?`;
  if (/no such column/i.test(m)) return `${m}. Check the column names in your CREATE TABLE.`;
  if (/syntax error/i.test(m)) return `${m}. Look for a missing comma, quote or keyword.`;
  return m;
}

/**
 * Execute `code` against a fresh in-memory database pre-loaded with `schema`.
 * Returns the last result set plus every statement's output.
 */
export function runSql(code, { schema = '' } = {}) {
  const sqlite = loadSqlite();
  if (!sqlite) {
    return {
      available: false,
      error: 'node:sqlite is unavailable - this needs Node 22.5 or newer.',
      rowsets: [],
      rows: [],
      columns: [],
      db: null,
    };
  }

  const db = new sqlite.DatabaseSync(':memory:');
  const out = { available: true, error: null, rowsets: [], rows: [], columns: [], db, executed: 0 };

  try {
    if (schema) db.exec(schema);
    for (const statement of splitStatements(code)) {
      out.executed += 1;
      if (READ_ONLY.test(statement)) {
        const rows = db.prepare(statement).all();
        const columns = rows.length ? Object.keys(rows[0]) : [];
        out.rowsets.push({ sql: statement, rows, columns });
        out.rows = rows;
        out.columns = columns;
      } else {
        db.exec(statement);
        out.rowsets.push({ sql: statement, rows: [], columns: [] });
      }
    }
  } catch (err) {
    out.error = friendlyError(err.message);
  }

  return out;
}
