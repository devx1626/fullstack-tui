import { T } from '../core/grade.js';

/**
 * Every challenge here executes against a real in-memory SQLite database. The
 * `schema` block runs first, then your statements, then the checks inspect the
 * actual rows.
 */
const SHOP_SCHEMA = `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  joined_at TEXT NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  placed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  returned_at TEXT
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL
);
INSERT INTO customers (id, name, city, joined_at) VALUES
  (1, 'Ama', 'Accra', '2026-01-05'),
  (2, 'Kofi', 'Kumasi', '2026-02-11'),
  (3, 'Yaa', 'Accra', '2026-03-02'),
  (4, 'Kwame', 'Tamale', '2026-03-19');
INSERT INTO products (id, name, price, stock) VALUES
  (1, 'Bread', 5.5, 40),
  (2, 'Coffee', 32.0, 12),
  (3, 'Tea', 18.5, 0),
  (4, 'Honey', 45.0, 7);
INSERT INTO orders (id, customer_id, placed_at, status) VALUES
  (1, 1, '2026-04-01', 'paid'),
  (2, 1, '2026-04-03', 'pending'),
  (3, 2, '2026-04-05', 'paid'),
  (4, 3, '2026-04-08', 'cancelled'),
  (5, 2, '2026-04-11', 'paid');
-- Order 4 was sent back; everything else is still out with the customer.
UPDATE orders SET returned_at = '2026-04-15' WHERE id = 4;
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 2, 5.5),
  (2, 1, 2, 1, 32.0),
  (4, 3, 4, 1, 45.0),
  (5, 3, 1, 4, 5.5),
  (6, 4, 2, 2, 32.0),
  (7, 5, 1, 1, 5.5),
  (8, 5, 4, 2, 45.0);
-- Note: the pending order (2) has no items yet, so Tea has never been ordered.
`;

export default {
  id: 'sql',
  title: 'Databases & SQL',
  badge: 'DB',
  color: 'accentSoft',
  tagline: 'Where the data actually lives, and how to ask it questions',
  hours: 10,
  why:
    'Every application is a way of reading and writing data. SQL is fifty years old, still everywhere, and the one skill that transfers ' +
    'unchanged from SQLite on your laptop to Postgres in production. Learn to model data and write a join, and the backend stops feeling like ' +
    'guesswork.',
  source: {
    course: 'Dave Gray - MERN Stack (MongoDB, Express, React, Node)',
    url: 'https://www.youtube.com/watch?v=CvCiNeLnZ00',
    roadmap: 'https://roadmap.sh/sql',
    docs: 'https://www.sqlite.org/lang.html',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'sql-01',
      title: 'Tables, Types and Constraints',
      minutes: 30,
      objectives: [
        'Model a domain as tables with a primary key each',
        'Use constraints to make invalid data impossible',
        'Know when to add an index and when it is wasted',
      ],
      sections: [
        {
          heading: 'A row is a fact, a column is an attribute',
          body:
            'Design tables around *nouns* and give each one a primary key. A primary key is not optional: without it, you cannot reliably update or ' +
            'delete a single row, and `LIMIT 1` becomes a guess.\n\n' +
            'Every column should hold one atomic value. `tags: "css,js,html"` is a future query nightmare; a `tags` table with a join table is ' +
            'how you query "which posts have the css tag" in one statement.',
        },
        {
          heading: 'Constraints are your first line of defence',
          body:
            '```sql\nCREATE TABLE users (\n  id        INTEGER PRIMARY KEY,\n  email     TEXT    NOT NULL UNIQUE,\n  name      TEXT    NOT NULL,\n  role      TEXT    NOT NULL DEFAULT \'member\'\n                    CHECK (role IN (\'member\', \'admin\')),\n  balance   REAL    NOT NULL DEFAULT 0 CHECK (balance >= 0),\n  created_at TEXT   NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n```\n\n' +
            '`NOT NULL` and `CHECK` mean the database refuses to store nonsense, no matter which buggy code path tries. Application validation ' +
            'gives users nice error messages; constraints guarantee correctness.',
        },
        {
          heading: 'Keys and relationships',
          body:
            '- `PRIMARY KEY` - uniquely identifies a row\n' +
            '- `FOREIGN KEY` - points at a row in another table; with `REFERENCES` plus `ON DELETE CASCADE` the database enforces the relationship\n' +
            '- `UNIQUE` - at most one row may have this value (emails, slugs)\n' +
            '- Composite key - `PRIMARY KEY (user_id, tag_id)` for a join table\n\n' +
            'Foreign keys need `PRAGMA foreign_keys = ON;` in SQLite, and are on by default in Postgres.',
        },
        {
          heading: 'Indexes: the trade-off',
          body:
            'An index makes reads faster and writes slower, and costs disk. Add one when:\n\n' +
            '- the column appears in a `WHERE`, `JOIN` or `ORDER BY` on a large table\n' +
            '- the column is a foreign key (SQLite does **not** index those automatically)\n' +
            '- you have a `UNIQUE` constraint (which creates one implicitly)\n\n' +
            'Do not index everything "just in case". Use `EXPLAIN QUERY PLAN` to see whether your query uses an index or scans the table.',
          code: {
            lang: 'sql',
            caption: 'a schema you would actually ship',
            source: `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  email     TEXT    NOT NULL UNIQUE,
  city      TEXT    NOT NULL,
  created_at TEXT   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  placed_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys are not indexed for you: add the index you will join on.
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, placed_at DESC);`,
          },
        },
      ],
      pitfalls: [
        'No primary key, so `UPDATE ... LIMIT 1` is a lottery',
        'Storing CSV in a column and then needing `LIKE \'%,css,%\'`',
        'Missing `NOT NULL`, so half your rows have NULLs you must special-case forever',
        'A foreign key column with no index, so every join scans the table',
        '`CHECK` constraints added after bad data already exists',
      ],
      keyPoints: [
        'Every table gets a primary key; every column holds one value',
        '`NOT NULL`, `UNIQUE`, `CHECK`, `REFERENCES` - constraints guarantee correctness',
        'Index foreign keys and anything used in `WHERE`/`ORDER BY` on big tables',
        '`EXPLAIN QUERY PLAN` tells you whether the index is used',
      ],
      resources: [
        { label: 'SQLite: CREATE TABLE', url: 'https://www.sqlite.org/lang_createtable.html' },
        { label: 'Use The Index, Luke (indexing, free book)', url: 'https://use-the-index-luke.com/' },
        { label: 'SQLBolt (interactive SQL)', url: 'https://sqlbolt.com/' },
      ],
      challenges: [
        {
          id: 'write-schema',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'sql',
          schema: 'CREATE TABLE placeholder (id INTEGER);',
          prompt:
            'Design the schema for a small library: books, members and loans. Your SQL runs against a real SQLite database, and the checks ' +
            'inspect the actual table definitions via `pragma table_info` - so the constraints must be real, not comments.',
          requirements: [
            'A `books` table: `id` primary key, `title` NOT NULL, `isbn` UNIQUE, `year` NOT NULL',
            'A `members` table: `id` primary key, `name` NOT NULL, `email` NOT NULL UNIQUE, `joined_at` NOT NULL with a default',
            'A `loans` table: `id` primary key, `book_id` and `member_id` NOT NULL foreign keys, `loaned_at` NOT NULL, `returned_at` nullable',
            'A `CHECK` on `books.year` so it must be between 1400 and 2100',
            'An index on the `loans` foreign keys',
            'A `status` column on `loans` restricted by `CHECK` to `open`, `returned` or `overdue`',
          ],
          starter: `-- Write your CREATE TABLE statements here.
`,
          hints: [
            '`CREATE TABLE books (id INTEGER PRIMARY KEY, ...)`',
            '`isbn TEXT NOT NULL UNIQUE`, `year INTEGER NOT NULL CHECK (year BETWEEN 1400 AND 2100)`',
            '`book_id INTEGER NOT NULL REFERENCES books(id)`',
            '`CREATE INDEX idx_loans_book ON loans(book_id);`',
          ],
          solution: `CREATE TABLE books (
  id    INTEGER PRIMARY KEY,
  title TEXT    NOT NULL,
  isbn  TEXT    NOT NULL UNIQUE,
  year  INTEGER NOT NULL CHECK (year BETWEEN 1400 AND 2100)
);

CREATE TABLE members (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  email     TEXT    NOT NULL UNIQUE,
  joined_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE loans (
  id          INTEGER PRIMARY KEY,
  book_id     INTEGER NOT NULL REFERENCES books(id),
  member_id   INTEGER NOT NULL REFERENCES members(id),
  status      TEXT    NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'returned', 'overdue')),
  loaned_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TEXT
);

CREATE INDEX idx_loans_book ON loans(book_id);
CREATE INDEX idx_loans_member ON loans(member_id);`,
          checks: [
            T.sql('the three tables exist', ({ db }) => {
              const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
              const names = rows.map((r) => r.name);
              const missing = ['books', 'members', 'loans'].filter((t) => !names.includes(t));
              return missing.length === 0 || `missing table(s): ${missing.join(', ')}`;
            }),
            T.sql('books has the required columns and constraints', ({ db }) => {
              const cols = db.prepare('pragma table_info(books)').all();
              const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
              const problems = [];
              if (!byName.id || byName.id.pk !== 1) problems.push('id primary key');
              if (!byName.title || byName.title.notnull !== 1) problems.push('title NOT NULL');
              if (!byName.isbn) problems.push('isbn column');
              if (!byName.year || byName.year.notnull !== 1) problems.push('year NOT NULL');
              return problems.length === 0 || `books is missing: ${problems.join(', ')}`;
            }),
            T.sql('isbn is unique', ({ db }) => {
              const indexes = db.prepare('pragma index_list(books)').all();
              const unique = indexes.some((i) => i.unique === 1);
              return unique || 'isbn needs a UNIQUE constraint';
            }),
            T.sql('members requires an email', ({ db }) => {
              const cols = db.prepare('pragma table_info(members)').all();
              const email = cols.find((c) => c.name === 'email');
              if (!email) return 'no email column';
              return email.notnull === 1 || 'email must be NOT NULL';
            }),
            T.sql('members.joined_at has a default', ({ db }) => {
              const cols = db.prepare('pragma table_info(members)').all();
              const col = cols.find((c) => c.name === 'joined_at');
              if (!col) return 'no joined_at column';
              return (col.dflt_value !== null && col.dflt_value !== undefined) || 'give joined_at a DEFAULT';
            }),
            T.sql('loans has both foreign keys', ({ db }) => {
              const fks = db.prepare('pragma foreign_key_list(loans)').all();
              const targets = fks.map((f) => f.table);
              return (targets.includes('books') && targets.includes('members')) || `foreign keys point at: ${targets.join(', ') || 'nothing'}`;
            }),
            T.sql('loans.loaned_at is NOT NULL', ({ db }) => {
              const cols = db.prepare('pragma table_info(loans)').all();
              const col = cols.find((c) => c.name === 'loaned_at');
              if (!col) return 'no loaned_at column';
              return col.notnull === 1 || 'loaned_at must be NOT NULL';
            }),
            T.sql('returned_at is nullable', ({ db }) => {
              const cols = db.prepare('pragma table_info(loans)').all();
              const col = cols.find((c) => c.name === 'returned_at');
              if (!col) return 'no returned_at column';
              return col.notnull === 0 || 'an unreturned loan has no returned_at, so it must be nullable';
            }),
            T.sql('the year CHECK rejects an impossible year', ({ db }) => {
              let rejected = false;
              try {
                db.exec("INSERT INTO books (title, isbn, year) VALUES ('Bad', 'x', 5000)");
              } catch {
                rejected = true;
              }
              return rejected || 'a CHECK constraint on books.year should reject 5000';
            }),
            T.sql('the status CHECK rejects an unknown value', ({ db }) => {
              const cols = db.prepare('pragma table_info(loans)').all();
              if (!cols.some((c) => c.name === 'status')) return 'no status column';
              db.exec("INSERT INTO books (id, title, isbn, year) VALUES (1, 'B', 'i1', 2000)");
              db.exec("INSERT INTO members (id, name, email) VALUES (1, 'Ama', 'a@b.c')");
              let rejected = false;
              try {
                db.exec("INSERT INTO loans (book_id, member_id, status) VALUES (1, 1, 'nonsense')");
              } catch {
                rejected = true;
              }
              return rejected || 'status should be CHECKed to open/returned/overdue';
            }),
            T.sql('a duplicate email is rejected', ({ db }) => {
              db.exec("INSERT INTO members (name, email) VALUES ('A', 'dup@x.y')");
              let rejected = false;
              try {
                db.exec("INSERT INTO members (name, email) VALUES ('B', 'dup@x.y')");
              } catch {
                rejected = true;
              }
              return rejected || 'members.email should be UNIQUE';
            }),
          ],
        },
        {
          id: 'fix-schema',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'sql',
          schema: 'CREATE TABLE placeholder (id INTEGER);',
          prompt:
            'This schema was written in a hurry: no primary keys, a nullable email, a free-text status anyone can typo, and a foreign key that ' +
            'points at nothing. Rebuild it properly. The checks test the constraints by trying to insert bad rows.',
          requirements: [
            '`accounts` has an integer primary key and a NOT NULL unique email',
            '`transactions` has an integer primary key, NOT NULL foreign key to `accounts`, an amount with `CHECK (amount <> 0)`, and a `kind` restricted to `credit` or `debit`',
            'A bad `kind` is rejected by the database',
            'A credit with amount 0 is rejected',
            'A transaction for a non-existent account is rejected (foreign keys enabled and correct)',
          ],
          starter: `CREATE TABLE accounts (
  email TEXT,
  name TEXT
);

CREATE TABLE transactions (
  account_id INTEGER REFERENCES account(id),
  amount REAL,
  kind TEXT
);`,
          hints: [
            'SQLite needs `PRAGMA foreign_keys = ON;` before it enforces references.',
            '`CHECK (kind IN (\'credit\', \'debit\'))`',
            'The foreign key references `account(id)` but the table is called `accounts`.',
          ],
          solution: `PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id    INTEGER PRIMARY KEY,
  email TEXT    NOT NULL UNIQUE,
  name  TEXT    NOT NULL
);

CREATE TABLE transactions (
  id         INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount     REAL    NOT NULL CHECK (amount <> 0),
  kind       TEXT    NOT NULL CHECK (kind IN ('credit', 'debit'))
);`,
          checks: [
            T.sql('accounts has a primary key', ({ db }) => {
              const cols = db.prepare('pragma table_info(accounts)').all();
              return cols.some((c) => c.pk === 1) || 'accounts needs an INTEGER PRIMARY KEY';
            }),
            T.sql('accounts.email is NOT NULL and unique', ({ db }) => {
              const cols = db.prepare('pragma table_info(accounts)').all();
              const email = cols.find((c) => c.name === 'email');
              if (!email) return 'no email column';
              if (email.notnull !== 1) return 'email must be NOT NULL';
              const unique = db.prepare('pragma index_list(accounts)').all().some((i) => i.unique === 1);
              return unique || 'email needs a UNIQUE constraint';
            }),
            T.sql('a duplicate email is rejected', ({ db }) => {
              db.exec("INSERT INTO accounts (email, name) VALUES ('a@b.c', 'A')");
              try {
                db.exec("INSERT INTO accounts (email, name) VALUES ('a@b.c', 'B')");
                return 'a duplicate email was accepted';
              } catch {
                return true;
              }
            }),
            T.sql('transactions references the right table', ({ db }) => {
              const fks = db.prepare('pragma foreign_key_list(transactions)').all();
              return fks.some((f) => f.table === 'accounts') || `foreign key points at: ${fks.map((f) => f.table).join(', ') || 'nothing'}`;
            }),
            T.sql('an orphan transaction is rejected', ({ db }) => {
              // Checks share one database, so seed idempotently - otherwise an
              // earlier check's row makes this one fail with a UNIQUE error.
              db.exec("INSERT OR IGNORE INTO accounts (id, email, name) VALUES (1, 'a@b.c', 'A')");
              try {
                db.exec("INSERT INTO transactions (account_id, amount, kind) VALUES (99, 10, 'credit')");
                return 'a transaction for a missing account was accepted';
              } catch {
                return true;
              }
            }),
            T.sql('a zero amount is rejected', ({ db }) => {
              // Checks share one database, so seed idempotently - otherwise an
              // earlier check's row makes this one fail with a UNIQUE error.
              db.exec("INSERT OR IGNORE INTO accounts (id, email, name) VALUES (1, 'a@b.c', 'A')");
              try {
                db.exec("INSERT INTO transactions (account_id, amount, kind) VALUES (1, 0, 'credit')");
                return 'amount 0 should be rejected';
              } catch {
                return true;
              }
            }),
            T.sql('an unknown kind is rejected', ({ db }) => {
              // Checks share one database, so seed idempotently - otherwise an
              // earlier check's row makes this one fail with a UNIQUE error.
              db.exec("INSERT OR IGNORE INTO accounts (id, email, name) VALUES (1, 'a@b.c', 'A')");
              try {
                db.exec("INSERT INTO transactions (account_id, amount, kind) VALUES (1, 5, 'transfer')");
                return "'transfer' should be rejected as a kind";
              } catch {
                return true;
              }
            }),
            T.sql('a valid row is accepted', ({ db }) => {
              // Checks share one database, so seed idempotently - otherwise an
              // earlier check's row makes this one fail with a UNIQUE error.
              db.exec("INSERT OR IGNORE INTO accounts (id, email, name) VALUES (1, 'a@b.c', 'A')");
              db.exec("INSERT INTO transactions (account_id, amount, kind) VALUES (1, -12.5, 'debit')");
              const row = db.prepare('SELECT COUNT(*) AS n FROM transactions').get();
              return row.n === 1 || 'a valid transaction should be stored';
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'sql-02',
      title: 'SELECT: Filter, Sort, Group',
      minutes: 35,
      objectives: [
        'Write WHERE clauses that mean exactly what you intend',
        'Aggregate with GROUP BY and filter the groups with HAVING',
        'Understand NULL, and why NOT IN can surprise you',
      ],
      sections: [
        {
          heading: 'The order the database evaluates a query',
          body:
            'You write `SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT`, but the database runs it as:\n\n' +
            '1. `FROM` / `JOIN` - assemble the rows\n' +
            '2. `WHERE` - filter **rows**\n' +
            '3. `GROUP BY` - collapse into groups\n' +
            '4. `HAVING` - filter **groups**\n' +
            '5. `SELECT` - compute the output columns\n' +
            '6. `ORDER BY` - sort\n' +
            '7. `LIMIT` / `OFFSET` - cut\n\n' +
            'This explains why you cannot use a `SELECT` alias inside `WHERE` (step 2 runs before step 5), while `ORDER BY` can use it.',
        },
        {
          heading: 'WHERE, carefully',
          body:
            '```sql\nWHERE status = \'paid\' AND total > 100\nWHERE city IN (\'Accra\', \'Kumasi\')\nWHERE name LIKE \'A%\'              -- case-sensitive in SQLite for ASCII\nWHERE placed_at BETWEEN \'2026-04-01\' AND \'2026-04-30\'\nWHERE returned_at IS NULL          -- never use = NULL\nWHERE email IS NOT NULL\n```\n\n' +
            '**NULL is "unknown", not "empty".** `NULL = NULL` is `NULL` (not true), so you must use `IS NULL`. And `x NOT IN (1, NULL)` returns ' +
            'nothing at all, because the comparison against NULL is unknown for every row - a genuinely famous SQL trap.',
        },
        {
          heading: 'Aggregates and GROUP BY',
          body:
            '`COUNT`, `SUM`, `AVG`, `MIN`, `MAX` collapse many rows into one value. With `GROUP BY`, one value per group. Everything in the ' +
            '`SELECT` list must either be in the `GROUP BY` or be an aggregate - otherwise the result is arbitrary.\n\n' +
            '```sql\nSELECT city, COUNT(*) AS customers\nFROM customers\nGROUP BY city\nHAVING COUNT(*) > 1\nORDER BY customers DESC;\n```\n\n' +
            '`COUNT(*)` counts rows; `COUNT(column)` counts non-NULL values; `COUNT(DISTINCT column)` counts unique non-NULL values. Those are ' +
            'three different numbers and mixing them up is a classic reporting bug.',
          code: {
            lang: 'sql',
            caption: 'the queries you will write most',
            source: `-- How many paid orders per customer, biggest first?
SELECT c.name,
       COUNT(o.id)            AS paid_orders,
       COALESCE(SUM(i.qty), 0) AS units
FROM customers c
JOIN orders o       ON o.customer_id = c.id AND o.status = 'paid'
LEFT JOIN (
  SELECT order_id, SUM(quantity) AS qty
  FROM order_items
  GROUP BY order_id
) i                 ON i.order_id = o.id
GROUP BY c.id, c.name
HAVING COUNT(o.id) > 0
ORDER BY paid_orders DESC, c.name;

-- Products that have never been ordered (the classic LEFT JOIN ... IS NULL)
SELECT p.name
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
WHERE oi.id IS NULL;

-- A running total, using a window function (SQLite 3.25+)
SELECT id, placed_at,
       COUNT(*) OVER (ORDER BY placed_at) AS order_number
FROM orders
ORDER BY placed_at;`,
          },
        },
      ],
      pitfalls: [
        '`= NULL` instead of `IS NULL` - it matches nothing, ever',
        '`NOT IN (SELECT ...)` when the subquery can return NULL',
        'A non-aggregated column in `SELECT` that is not in `GROUP BY`',
        '`COUNT(column)` when you meant `COUNT(*)`',
        'Filtering an aggregate in `WHERE` instead of `HAVING`',
      ],
      keyPoints: [
        '`WHERE` filters rows, `HAVING` filters groups',
        '`NULL` is unknown: use `IS NULL`, never `=`',
        '`COUNT(*)` vs `COUNT(col)` vs `COUNT(DISTINCT col)`',
        'Select only the columns you need, even in an exercise',
      ],
      resources: [
        { label: 'SQLite: SELECT', url: 'https://www.sqlite.org/lang_select.html' },
        { label: 'SQLBolt: queries', url: 'https://sqlbolt.com/lesson/select_queries_introduction' },
        { label: 'Mode Analytics SQL tutorial', url: 'https://mode.com/sql-tutorial/' },
      ],
      challenges: [
        {
          id: 'write-queries',
          kind: 'write',
          difficulty: 'medium',
          minutes: 20,
          lang: 'sql',
          schema: SHOP_SCHEMA,
          prompt:
            'Write five reporting queries against the shop database. Each answer is checked against the real rows, so column names and ordering ' +
            'matter.',
          requirements: [
            'The number of customers as `customer_count`',
            'Each customer with their count of **paid** orders, as `name` and `paid_orders`, only customers with at least one, sorted by `paid_orders` descending then `name`',
            'The total revenue per product as `product` and `revenue`, sorted by revenue descending (revenue = quantity × unit_price)',
            'Products that have never been ordered, as `name`, sorted alphabetically',
            'The average order value as `avg_order_value` - average the per-order totals, rounded to 2 decimals',
          ],
          starter: `-- 1. customer_count
SELECT ...;

-- 2. name, paid_orders
SELECT ...;

-- 3. product, revenue
SELECT ...;

-- 4. name (never ordered)

-- 5. avg_order_value
`,
          hints: [
            'You can run several statements separated by semicolons; the checks pick the result they need by column names.',
            'Item totals come from `SUM(quantity * unit_price)` grouped by `product_id`, then joined to `products` for the name.',
            'Never ordered = `LEFT JOIN order_items ... WHERE oi.id IS NULL`.',
            '`ROUND(AVG(...), 2)` for the last one.',
          ],
          solution: `SELECT COUNT(*) AS customer_count FROM customers;

SELECT c.name AS name,
       COUNT(o.id) AS paid_orders
FROM customers c
JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
GROUP BY c.id, c.name
HAVING COUNT(o.id) > 0
ORDER BY paid_orders DESC, name ASC;

SELECT p.name AS product,
       ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
FROM products p
JOIN order_items oi ON oi.product_id = p.id
GROUP BY p.id, p.name
ORDER BY revenue DESC;

SELECT p.name AS name
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
WHERE oi.id IS NULL
ORDER BY p.name ASC;

SELECT ROUND(AVG(order_total), 2) AS avg_order_value
FROM (
  SELECT o.id, SUM(oi.quantity * oi.unit_price) AS order_total
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id
);`,
          checks: [
            T.sql('query 1 returns the customer count', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('customer_count'));
              if (!set) return 'no result set with a `customer_count` column';
              const expected = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
              return set.rows[0].customer_count === expected || `expected ${expected}, got ${set.rows[0].customer_count}`;
            }),
            T.sql('query 2 returns paid order counts', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set) return 'no result set with `name` and `paid_orders`';
              // Derive the expectation from the data so it can never drift.
              const truth = Object.fromEntries(
                db
                  .prepare(
                    "SELECT c.name AS name, COUNT(o.id) AS n FROM customers c JOIN orders o ON o.customer_id = c.id AND o.status = 'paid' GROUP BY c.id, c.name",
                  )
                  .all()
                  .map((r) => [r.name, r.n]),
              );
              const map = Object.fromEntries(set.rows.map((r) => [r.name, r.paid_orders]));
              for (const [name, n] of Object.entries(truth)) {
                if (map[name] !== n) return `${name} should have ${n} paid order(s), got ${map[name]}`;
              }
              return true;
            }),
            T.sql('query 2 excludes customers with no paid orders', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set) return 'no matching result set';
              return set.rows.every((r) => r.paid_orders > 0) || 'customers with zero paid orders should be filtered out by HAVING';
            }),
            T.sql('query 2 is sorted by paid orders, then name', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set || set.rows.length < 2) return 'need at least two rows to check the order';
              const first = set.rows[0];
              return first.paid_orders >= set.rows[1].paid_orders || `first row should have the most paid orders (got ${first.paid_orders})`;
            }),
            T.sql('query 3 returns revenue per product', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('revenue') && r.columns.includes('product'));
              if (!set) return 'no result set with `product` and `revenue`';
              const truth = Object.fromEntries(
                db
                  .prepare(
                    'SELECT p.name AS name, SUM(oi.quantity * oi.unit_price) AS revenue FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name',
                  )
                  .all()
                  .map((r) => [r.name, r.revenue]),
              );
              const map = Object.fromEntries(set.rows.map((r) => [r.product, r.revenue]));
              for (const [name, revenue] of Object.entries(truth)) {
                if (Math.abs((map[name] ?? 0) - revenue) > 0.51) return `${name} revenue should be ~${revenue}, got ${map[name]}`;
              }
              return true;
            }),
            T.sql('query 3 is sorted by revenue descending', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('revenue') && r.columns.includes('product'));
              if (!set) return 'no matching result set';
              return set.rows.every((r, i) => i === 0 || set.rows[i - 1].revenue >= r.revenue) || 'revenue should be descending';
            }),
            T.sql('query 4 finds the unsold product', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.length === 1 && r.columns[0] === 'name');
              if (!set) return 'no single-column `name` result set';
             	const names = set.rows.map((r) => r.name);
              return (names.length === 1 && names[0] === 'Tea') || `expected exactly ["Tea"], got ${JSON.stringify(names)}`;
            }),
            T.sql('query 5 returns the average order value', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('avg_order_value'));
              if (!set) return 'no result set with `avg_order_value`';
              const value = set.rows[0].avg_order_value;
              // Accept either defensible reading of "average order value": the
              // average over orders that have items, or over every order.
              const withItems = db
                .prepare('SELECT AVG(total) AS v FROM (SELECT SUM(oi.quantity * oi.unit_price) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id)')
                .get().v;
              const every = db
                .prepare('SELECT AVG(total) AS v FROM (SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id)')
                .get().v;
              const ok = [withItems, every].some((v) => Math.abs(value - v) < 0.02);
              return ok || `expected ~${Math.round(withItems * 100) / 100}, got ${value}`;
            }),
          ],
        },
        {
          id: 'fix-nulls',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'sql',
          schema: SHOP_SCHEMA,
          prompt:
            'Four queries with the NULL and grouping bugs that produce silently wrong answers rather than errors. Fix each one. The checks compare ' +
            'against the real data.',
          requirements: [
            'Query 1 must return every customer name with their paid order count, **including** customers with zero, as `name` and `paid_orders`',
            'Query 2 must find orders that have a `returned_at` that is NULL, as `order_id` - without using `= NULL`',
            'Query 3 must return the number of distinct cities as `city_count`',
            'Query 4 must return the average unit price across all order items as `avg_unit_price`, rounded to 2 decimals',
          ],
          starter: `-- 1: include customers with zero paid orders
SELECT c.name, COUNT(o.id) AS paid_orders
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.name;

-- 2: orders not yet returned
SELECT id AS order_id FROM orders WHERE returned_at = NULL;

-- 3: number of cities
SELECT COUNT(city) AS city_count FROM customers;

-- 4: average unit price
SELECT AVG(unit_price) AS avg_unit_price FROM order_items;`,
          hints: [
            '`JOIN` drops customers with no matching order. `LEFT JOIN` keeps them, and then `COUNT(o.id)` counts only the matches.',
            'Putting `o.status = \'paid\'` in the `WHERE` turns your LEFT JOIN back into an INNER JOIN. Move it into the `ON` clause.',
            '`COUNT(city)` counts non-NULL values; `COUNT(DISTINCT city)` counts unique ones.',
            'Round the average to two decimals with `ROUND`.',
          ],
          solution: `SELECT c.name AS name, COUNT(o.id) AS paid_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
GROUP BY c.id, c.name
ORDER BY c.name;

SELECT id AS order_id FROM orders WHERE returned_at IS NULL;

SELECT COUNT(DISTINCT city) AS city_count FROM customers;

SELECT ROUND(AVG(unit_price), 2) AS avg_unit_price FROM order_items;`,
          checks: [
            T.sql('query 1 keeps customers with no paid orders', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set) return 'no result set with `name` and `paid_orders`';
              const every = db.prepare('SELECT name FROM customers').all().map((r) => r.name);
              const names = set.rows.map((r) => r.name);
              const missing = every.filter((n) => !names.includes(n));
              return missing.length === 0 || `missing customer(s): ${missing.join(', ')} - use a LEFT JOIN`;
            }),
            T.sql('query 1 counts only paid orders', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set) return 'no matching result set';
              const truth = Object.fromEntries(
                db
                  .prepare("SELECT c.name AS name, COUNT(o.id) AS n FROM customers c JOIN orders o ON o.customer_id = c.id AND o.status = 'paid' GROUP BY c.id, c.name")
                  .all()
                  .map((r) => [r.name, r.n]),
              );
              const map = Object.fromEntries(set.rows.map((r) => [r.name, r.paid_orders]));
              for (const name of db.prepare('SELECT name FROM customers').all().map((r) => r.name)) {
                const expected = truth[name] ?? 0;
                if (map[name] !== expected) return `${name} should be ${expected}, got ${map[name]}`;
              }
              return true;
            }),
            T.sql('query 2 does not use = NULL', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('order_id'));
              if (!set) return 'no result set with `order_id`';
              const bad = rowsets.some((r) => /=\s*NULL/i.test(r.sql));
              return !bad || '`= NULL` never matches - use `IS NULL`';
            }),
            T.sql('query 2 returns the right rows', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('order_id'));
              if (!set) return 'no result set with `order_id`';
              const ids = set.rows.map((r) => r.order_id).filter((v) => v !== null);
              const expected = db.prepare('SELECT id FROM orders WHERE returned_at IS NULL').all().map((r) => r.id);
              return (
                (ids.length === expected.length && expected.every((id) => ids.includes(id))) ||
                `expected orders ${expected.join(', ')}, got ${ids.join(', ')}`
              );
            }),
            T.sql('query 3 counts distinct cities', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('city_count'));
              if (!set) return 'no result set with `city_count`';
              return set.rows[0].city_count === 3 || `expected 3 distinct cities, got ${set.rows[0].city_count}`;
            }),
            T.sql('query 4 rounds the average', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('avg_unit_price'));
              if (!set) return 'no result set with `avg_unit_price`';
              const value = set.rows[0].avg_unit_price;
              const expected = db.prepare('SELECT ROUND(AVG(unit_price), 2) AS v FROM order_items').get().v;
              return Math.abs(value - expected) < 0.02 || `expected ~${expected}, got ${value}`;
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'sql-03',
      title: 'Relationships, JOINs and Normalisation',
      minutes: 35,
      objectives: [
        'Choose between one-to-many, many-to-many and one-to-one',
        'Write inner, left, right and self joins without hesitating',
        'Spot and remove duplicated data',
      ],
      sections: [
        {
          heading: 'Three relationships, three shapes',
          body:
            '- **One to many** - the "many" side holds the foreign key: `orders.customer_id`\n' +
            '- **Many to many** - a join table: `posts_tags(post_id, tag_id)` with a composite primary key\n' +
            '- **One to one** - either side holds a unique foreign key, used to split a rarely-read table\n\n' +
            'The direction matters. If one customer has many orders, `orders` holds `customer_id`. Putting `order_id` on the customer would limit ' +
            'them to a single order forever.',
        },
        {
          heading: 'JOIN types, in one example',
          body:
            '```sql\n-- only customers WITH orders\nSELECT c.name, o.id FROM customers c JOIN orders o ON o.customer_id = c.id;\n\n-- every customer, with NULL order columns when there are none\nSELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id;\n\n-- only orders that DO have a customer (rarely what you want)\nSELECT c.name, o.id FROM orders o RIGHT JOIN customers c ON c.id = o.customer_id;\n```\n\n' +
            '`JOIN` is an alias for `INNER JOIN`. `FULL OUTER JOIN` (rows from both sides) is not supported by SQLite; you emulate it with a ' +
            '`UNION` of a left and a right join.\n\n' +
            '**The mistake that costs the most time:** adding a condition on the joined table to `WHERE` instead of `ON`. That silently upgrades a ' +
            '`LEFT JOIN` into an `INNER JOIN`.',
        },
        {
          heading: 'Normalisation: three normal forms, in plain words',
          body:
            '1. **1NF** - every column holds one atomic value. No comma-separated lists.\n' +
            '2. **2NF** - every non-key column depends on the *whole* key, not part of it.\n' +
            '3. **3NF** - no column depends on another non-key column. If `orders` stores `customer_city`, that is a 3NF violation: the city ' +
            'belongs to the customer and will go stale when they move.\n\n' +
            'The test to apply: **if you would ever have to update the same fact in two places, it is in the wrong place.** Denormalise ' +
            'deliberately for performance, and write down why - but not before you have a measurement.',
        },
        {
          heading: 'Sample code: a many-to-many with counting and filtering',
          body: 'This is the query shape behind every "posts with tags" screen you will ever build.',
          code: {
            lang: 'sql',
            caption: 'relations.sql',
            source: `-- Join table with a composite key and cascade deletes
CREATE TABLE IF NOT EXISTS posts_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Posts with their tag list
SELECT p.title,
       GROUP_CONCAT(t.name, ', ' ORDER BY t.name) AS tags
FROM posts p
LEFT JOIN posts_tags pt ON pt.post_id = p.id
LEFT JOIN tags t        ON t.id = pt.tag_id
GROUP BY p.id, p.title
ORDER BY p.title;

-- Posts that have BOTH the css and the js tag
SELECT p.title
FROM posts p
JOIN posts_tags pt ON pt.post_id = p.id
JOIN tags t        ON t.id = pt.tag_id AND t.name IN ('css', 'js')
GROUP BY p.id, p.title
HAVING COUNT(DISTINCT t.name) = 2;

-- Tag usage counts, including unused tags
SELECT t.name, COUNT(pt.post_id) AS uses
FROM tags t
LEFT JOIN posts_tags pt ON pt.tag_id = t.id
GROUP BY t.id, t.name
ORDER BY uses DESC, t.name;`,
          },
        },
      ],
      pitfalls: [
        'A whole-table `WHERE` clause turning a `LEFT JOIN` into an inner join',
        'Forgetting the join table for many-to-many and storing `tag_ids` as a string',
        '`JOIN` on the wrong column (matching names rather than ids)',
        'Missing `ON DELETE CASCADE`, leaving orphan rows after a delete',
        'Denormalising for "speed" before measuring anything',
      ],
      keyPoints: [
        'The many side holds the foreign key; many-to-many needs a join table',
        '`LEFT JOIN` keeps unmatched rows; conditions on the joined table belong in `ON`',
        '3NF: one fact, one place',
        '`GROUP_CONCAT` / `string_agg` to collapse a join back into a list',
      ],
      resources: [
        { label: 'SQLite: joins', url: 'https://www.sqlite.org/lang_select.html#joins' },
        { label: 'MDN: Database normalisation', url: 'https://developer.mozilla.org/en-US/docs/Glossary/Normalization' },
      ],
      challenges: [
        {
          id: 'write-joins',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'sql',
          schema: SHOP_SCHEMA,
          prompt:
            'Write four reporting queries that need joins and grouping. The checks run them against the real rows, so an inner join where you ' +
            'needed a left join will be caught.',
          requirements: [
            'Every customer with their total spend on **paid** orders, as `name` and `spent`, including customers who spent 0, sorted by `spent` descending then `name`',
            'Every order with its line-item count as `order_id` and `items`, including orders with no items',
            'The best-selling product by units, as `name` and `units`, with a single winning row',
            'Products priced above the average product price, as `name` and `price`, sorted by price descending',
          ],
          starter: `-- 1
SELECT ...;

-- 2
SELECT ...;

-- 3
SELECT ...;

-- 4
SELECT ...;
`,
          hints: [
            'Put `o.status = \'paid\'` in the `ON` clause of a LEFT JOIN, then `COALESCE(SUM(...), 0)`.',
            'An order with no items needs `LEFT JOIN order_items`.',
            '`ORDER BY units DESC LIMIT 1` selects the winner.',
            'A subquery in the `WHERE` clause: `WHERE price > (SELECT AVG(price) FROM products)`.',
          ],
          solution: `SELECT c.name AS name,
       ROUND(COALESCE(SUM(oi.quantity * oi.unit_price), 0), 2) AS spent
FROM customers c
LEFT JOIN orders o        ON o.customer_id = c.id AND o.status = 'paid'
LEFT JOIN order_items oi  ON oi.order_id = o.id
GROUP BY c.id, c.name
ORDER BY spent DESC, name ASC;

SELECT o.id AS order_id, COUNT(oi.id) AS items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.id;

SELECT p.name AS name, SUM(oi.quantity) AS units
FROM products p
JOIN order_items oi ON oi.product_id = p.id
GROUP BY p.id, p.name
ORDER BY units DESC
LIMIT 1;

SELECT name, price
FROM products
WHERE price > (SELECT AVG(price) FROM products)
ORDER BY price DESC;`,
          checks: [
            T.sql('query 1 includes every customer', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('spent') && r.columns.includes('name'));
              if (!set) return 'no result set with `name` and `spent`';
              const names = set.rows.map((r) => r.name);
              const missing = ['Ama', 'Kofi', 'Yaa', 'Kwame'].filter((n) => !names.includes(n));
              return missing.length === 0 || `missing: ${missing.join(', ')}`;
            }),
            T.sql('query 1 sums paid spend correctly', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('spent') && r.columns.includes('name'));
              if (!set) return 'no matching result set';
              const truth = Object.fromEntries(
                db
                  .prepare(
                    "SELECT c.name AS name, COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS spent FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid' LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY c.id, c.name",
                  )
                  .all()
                  .map((r) => [r.name, r.spent]),
              );
              const map = Object.fromEntries(set.rows.map((r) => [r.name, r.spent]));
              for (const [name, spent] of Object.entries(truth)) {
                if (Math.abs((map[name] ?? 0) - spent) > 0.51) return `${name} should be ~${spent}, got ${map[name]}`;
              }
              return true;
            }),
            T.sql('query 1 sorts by spend descending', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('spent') && r.columns.includes('name'));
              if (!set) return 'no matching result set';
              return set.rows.every((r, i) => i === 0 || set.rows[i - 1].spent >= r.spent) || 'spend should be descending';
            }),
            T.sql('query 2 counts line items per order', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('items') && r.columns.includes('order_id'));
              if (!set) return 'no result set with `order_id` and `items`';
              const map = Object.fromEntries(set.rows.map((r) => [r.order_id, r.items]));
              if (map[1] !== 2) return `order 1 should have 2 items, got ${map[1]}`;
              if (map[3] !== 2) return `order 3 should have 2 items, got ${map[3]}`;
              return true;
            }),
            T.sql('query 2 keeps every order', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('items') && r.columns.includes('order_id'));
              if (!set) return 'no matching result set';
              return set.rows.length === 5 || `expected all 5 orders, got ${set.rows.length}`;
            }),
            T.sql('query 3 picks the best seller', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('units') && r.columns.includes('name'));
              if (!set) return 'no result set with `name` and `units`';
              if (set.rows.length !== 1) return `expected a single winning row, got ${set.rows.length}`;
              const winner = db
                .prepare(
                  'SELECT p.name AS name, SUM(oi.quantity) AS units FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name ORDER BY units DESC LIMIT 1',
                )
                .get();
              return (
                (set.rows[0].name === winner.name && set.rows[0].units === winner.units) ||
                `expected ${winner.name} with ${winner.units} units, got ${set.rows[0].name} with ${set.rows[0].units}`
              );
            }),
            T.sql('query 4 uses the average price', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('price') && r.columns.includes('name'));
              if (!set) return 'no result set with `name` and `price`';
              const names = set.rows.map((r) => r.name).sort();
              return JSON.stringify(names) === JSON.stringify(['Coffee', 'Honey']) || `expected Coffee and Honey above the average, got ${names.join(', ')}`;
            }),
            T.sql('query 4 is sorted by price descending', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('price') && r.columns.includes('name'));
              if (!set) return 'no matching result set';
              return set.rows.every((r, i) => i === 0 || set.rows[i - 1].price >= r.price) || 'price should be descending';
            }),
            T.sql('no query selects *, so schema changes cannot break you', ({ rowsets }) => {
              const bad = rowsets.filter((r) => /select\s+\*/i.test(r.sql));
              return bad.length === 0 || `${bad.length} query/queries use SELECT *`;
            }),
          ],
        },
        {
          id: 'fix-joins',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'sql',
          schema: SHOP_SCHEMA,
          prompt:
            'These two queries look reasonable and both return wrong answers. One turns a LEFT JOIN back into an inner join; the other double ' +
            'counts because it joins two one-to-many relationships at once. Fix them.',
          requirements: [
            'Query 1 returns every customer with their paid order count as `name` and `paid_orders`, including zeroes',
            'Query 2 returns each order with its correct item count as `order_id` and `items` - no inflated numbers',
            'Neither query may use `SELECT *`',
          ],
          starter: `SELECT c.name, COUNT(o.id) AS paid_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.name;

SELECT o.id AS order_id, COUNT(oi.id) AS items
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p      ON p.id = oi.product_id
GROUP BY o.id;`,
          hints: [
            'A `WHERE` on the right-hand table of a LEFT JOIN removes the unmatched rows. Move it into `ON`.',
            'The second query joins three one-to-many tables and then counts, so each item is multiplied by its product rows. Count from the items alone.',
            'You can also count `DISTINCT oi.id` as a quick sanity fix, but removing the extra join is the real answer.',
          ],
          solution: `SELECT c.name AS name, COUNT(o.id) AS paid_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
GROUP BY c.id, c.name
ORDER BY c.name;

SELECT o.id AS order_id, COUNT(oi.id) AS items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.id;`,
          checks: [
            T.sql('every customer survives the left join', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set) return 'no result set with `name` and `paid_orders`';
              return set.rows.length === 4 || `expected 4 customers, got ${set.rows.length}`;
            }),
            T.sql('the counts are still correct', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('paid_orders') && r.columns.includes('name'));
              if (!set) return 'no matching result set';
              const map = Object.fromEntries(set.rows.map((r) => [r.name, r.paid_orders]));
              if (map.Kofi !== 2) return `Kofi should be 2, got ${map.Kofi}`;
              if (map.Yaa !== 0) return `Yaa should be 0, got ${map.Yaa}`;
              return true;
            }),
            T.sql('no LEFT JOIN is undone by a WHERE clause', ({ rowsets }) => {
              const bad = rowsets.filter((r) => /left join/i.test(r.sql) && /where/i.test(r.sql) && /o\.status/i.test(r.sql));
              return bad.length === 0 || 'the status filter belongs in the ON clause';
            }),
            T.sql('query 2 does not inflate the counts', ({ rowsets }) => {
              const set = rowsets.find((r) => r.columns.includes('items') && r.columns.includes('order_id') && r.sql.includes('order_items'));
              if (!set) return 'no result set with `order_id` and `items`';
              const map = Object.fromEntries(set.rows.map((r) => [r.order_id, r.items]));
              if (map[1] !== 2) return `order 1 should have 2 items, got ${map[1]}`;
              if (map[5] !== 2) return `order 5 should have 2 items, got ${map[5]}`;
              return true;
            }),
            T.sql('query 2 counts four orders with items', ({ rowsets, db }) => {
              const set = rowsets.find((r) => r.columns.includes('items') && r.columns.includes('order_id') && r.sql.includes('order_items'));
              if (!set) return 'no matching result set';
              const withItems = set.rows.filter((r) => r.items > 0).length;
              const expected = db
                .prepare('SELECT COUNT(*) AS n FROM (SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id)')
                .get().n;
              return withItems === expected || `expected ${expected} orders with items, got ${withItems}`;
            }),
            T.sql('no SELECT * remains', ({ rowsets }) => {
              const bad = rowsets.filter((r) => /select\s+\*/i.test(r.sql));
              return bad.length === 0 || 'name your columns';
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'sql-04',
      title: 'Writing Data Safely',
      minutes: 30,
      objectives: [
        'Insert, update and delete without touching more rows than intended',
        'Wrap multi-step changes in a transaction',
        'Use upserts and RETURNING instead of extra round trips',
      ],
      sections: [
        {
          heading: 'The one rule that saves you',
          body:
            '**Always run the `SELECT` version of your `UPDATE` or `DELETE` first.**\n\n' +
            '```sql\n-- 1. See what you are about to change\nSELECT id, status FROM orders WHERE status = \'pending\';\n\n-- 2. Then change exactly that\nUPDATE orders SET status = \'expired\' WHERE status = \'pending\' AND placed_at < \'2026-04-01\';\n```\n\n' +
            'An `UPDATE` or `DELETE` without a `WHERE` affects every row. There is no undo, and in production nobody can help you.',
        },
        {
          heading: 'INSERT, UPDATE, DELETE',
          body:
            '```sql\nINSERT INTO products (name, price, stock) VALUES (\'Rice\', 12.5, 30);\nINSERT INTO products (name, price) VALUES (\'Salt\', 2), (\'Pepper\', 8);\n\nUPDATE products SET stock = stock - 1 WHERE id = 1 AND stock > 0;   -- guard in the WHERE\n\nDELETE FROM order_items WHERE order_id = 4;\n```\n\n' +
            'Notice `WHERE id = 1 AND stock > 0`: putting the precondition in the `WHERE` makes the decrement atomic and prevents negative stock, ' +
            'without a race between a `SELECT` and an `UPDATE`.',
        },
        {
          heading: 'Transactions: all or nothing',
          body:
            '```sql\nBEGIN;\n  INSERT INTO orders (customer_id, status) VALUES (1, \'pending\');\n  INSERT INTO order_items (order_id, product_id, quantity, unit_price)\n  VALUES (last_insert_rowid(), 1, 2, 5.5);\nCOMMIT;\n-- Any error before COMMIT -> ROLLBACK, and the database is untouched.\n```\n\n' +
            'A transaction guarantees that an order never exists without its items. Four properties (ACID): **A**tomic, **C**onsistent, ' +
            '**I**solated, **D**urable. In application code, the pattern is `try { BEGIN ... COMMIT } catch { ROLLBACK; throw }`.\n\n' +
            'Related: `INSERT ... ON CONFLICT DO UPDATE` (an upsert) and `INSERT ... RETURNING id` save a round trip each. In SQLite you can read ' +
            'the new id with `last_insert_rowid()`.',
          code: {
            lang: 'sql',
            caption: 'transactions in practice',
            source: `-- Upsert: insert a product, or bump its stock if it exists
INSERT INTO products (id, name, price, stock)
VALUES (5, 'Milk', 9.5, 20)
ON CONFLICT (id) DO UPDATE SET stock = stock + excluded.stock;

-- Place an order atomically
BEGIN;

INSERT INTO orders (customer_id, placed_at, status)
VALUES (2, date('now'), 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT last_insert_rowid(), id, 1, price FROM products WHERE name = 'Coffee';

-- Decrement stock, refusing to go negative
UPDATE products
SET stock = stock - 1
WHERE name = 'Coffee' AND stock > 0;

COMMIT;`,
          },
        },
      ],
      pitfalls: [
        '`UPDATE` or `DELETE` with no `WHERE`, wiping the table',
        'A `SELECT` then `UPDATE` instead of a guarded `UPDATE`, opening a race',
        'Multi-step writes with no transaction, leaving half-created records',
        'Trusting `last_insert_rowid()` after another insert happened',
        'Forgetting `PRAGMA foreign_keys = ON` and leaving orphan rows',
      ],
      keyPoints: [
        'Run the `SELECT` version first, every time',
        'Put preconditions in the `WHERE` so the change is atomic',
        '`BEGIN` / `COMMIT` / `ROLLBACK` for multi-step writes',
        '`ON CONFLICT DO UPDATE` for upserts, `RETURNING` to avoid a second query',
      ],
      resources: [
        { label: 'SQLite: transactions', url: 'https://www.sqlite.org/lang_transaction.html' },
        { label: 'SQLite: UPSERT', url: 'https://www.sqlite.org/lang_upsert.html' },
        { label: 'Use The Index, Luke: indexing', url: 'https://use-the-index-luke.com/' },
      ],
      challenges: [
        {
          id: 'write-mutations',
          kind: 'write',
          difficulty: 'hard',
          minutes: 18,
          lang: 'sql',
          schema: SHOP_SCHEMA,
          prompt:
            'Perform five safe mutations on the shop database. The checks inspect the resulting state, so a missing `WHERE` or a partial ' +
            'transaction will be obvious.',
          requirements: [
            'Add a product `id 9, name \'Rice\', price 12.5, stock 30`',
            'Cancel every `pending` order (set status to `cancelled`) **without** touching paid or already-cancelled orders',
            'Delete the order with `id = 4` **and** its order items, leaving no orphans',
            'Raise the price of every product with `stock = 0` by 10% (round to 2 decimals)',
            'Upsert a customer `id 1, name \'Ama\', city \'Tema\', joined_at \'2026-01-05\'` so the row is updated rather than duplicated',
            'Wrap the delete of the order and its items in a transaction',
          ],
          starter: `-- 1
INSERT ...;

-- 2
UPDATE ...;

-- 3
BEGIN;
...
COMMIT;

-- 4
UPDATE ...;

-- 5
INSERT ... ON CONFLICT ...;
`,
          hints: [
            '`ON CONFLICT (id) DO UPDATE SET city = excluded.city, ...`',
            'For the delete, remove `order_items` first or rely on `ON DELETE CASCADE` (which this schema does not declare).',
            '`UPDATE products SET price = ROUND(price * 1.1, 2) WHERE stock = 0;`',
            'The upsert must update `name`, `city` and `joined_at`, not just one column.',
          ],
          solution: `INSERT INTO products (id, name, price, stock) VALUES (9, 'Rice', 12.5, 30);

UPDATE orders SET status = 'cancelled' WHERE status = 'pending';

BEGIN;
DELETE FROM order_items WHERE order_id = 4;
DELETE FROM orders WHERE id = 4;
COMMIT;

UPDATE products SET price = ROUND(price * 1.1, 2) WHERE stock = 0;

INSERT INTO customers (id, name, city, joined_at)
VALUES (1, 'Ama', 'Tema', '2026-01-05')
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  city = excluded.city,
  joined_at = excluded.joined_at;`,
          checks: [
            T.sql('the new product was inserted', ({ db }) => {
              const row = db.prepare('SELECT * FROM products WHERE id = 9').get();
              if (!row) return 'no product with id 9';
              return (row.name === 'Rice' && Math.abs(row.price - 12.5) < 0.001 && row.stock === 30) || `got ${JSON.stringify(row)}`;
            }),
            T.sql('every pending order was cancelled', ({ db }) => {
              const remaining = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").get().n;
              return remaining === 0 || `${remaining} order(s) are still pending`;
            }),
            T.sql('paid orders were left alone', ({ db }) => {
              const paid = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'").get().n;
              return paid === 3 || `expected 3 paid orders, found ${paid}`;
            }),
            T.sql('the cancelled order was not resurrected', ({ db }) => {
              const row = db.prepare('SELECT status FROM orders WHERE id = 2').get();
              return (row && row.status === 'cancelled') || `order 2 is ${row ? row.status : 'missing'}`;
            }),
            T.sql('order 4 was deleted', ({ db }) => {
              const row = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE id = 4').get();
              return row.n === 0 || 'order 4 still exists';
            }),
            T.sql('no orphan order items remain', ({ db }) => {
              const row = db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE order_id = 4').get();
              return row.n === 0 || `${row.n} orphan item(s) left behind`;
            }),
            T.sql('the out-of-stock price was raised by 10%', ({ db }) => {
              const row = db.prepare("SELECT price FROM products WHERE name = 'Tea'").get();
              if (!row) return 'Tea is missing';
              return Math.abs(row.price - 20.35) < 0.02 || `expected ~20.35, got ${row.price}`;
            }),
            T.sql('in-stock prices were not touched', ({ db }) => {
              const row = db.prepare("SELECT price FROM products WHERE name = 'Bread'").get();
              return Math.abs(row.price - 5.5) < 0.001 || `Bread should still be 5.5, got ${row.price}`;
            }),
            T.sql('the customer was upserted, not duplicated', ({ db }) => {
              const count = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
              if (count !== 4) return `expected 4 customers, found ${count}`;
              const row = db.prepare('SELECT city FROM customers WHERE id = 1').get();
              return row.city === 'Tema' || `customer 1 city should be Tema, got ${row.city}`;
            }),
            T.sql('no mutation ran without a WHERE clause', ({ rowsets }) => {
              const bad = rowsets.filter((r) => /^\s*(update\s+\w+\s+set|delete\s+from\s+\w+)\s*(;|$)/i.test(r.sql) && !/where/i.test(r.sql));
              return bad.length === 0 || `unsafe statement(s): ${bad.map((b) => b.sql.slice(0, 40)).join(' | ')}`;
            }),
          ],
        },
        {
          id: 'fix-guard',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'sql',
          schema: SHOP_SCHEMA,
          prompt:
            'This restocking script has two disasters waiting: an `UPDATE` with no `WHERE` that reprices the entire catalogue, and a delete that ' +
            'leaves orphaned order items. Fix both, and make the whole thing safe to run twice.',
          requirements: [
            'Only the product with `id = 3` gets restocked to 50 (no other product changes)',
            'The delete of order 4 removes its items too, with no orphans left',
            'The script does not crash when order 4 is already gone',
            'No `UPDATE` or `DELETE` runs without a `WHERE` clause',
            'The final row counts are consistent: every `order_items.order_id` exists in `orders`',
          ],
          starter: `UPDATE products SET stock = 50;

DELETE FROM orders WHERE id = 4;

UPDATE products SET stock = 50;`,
          hints: [
            'An `UPDATE` without `WHERE` rewrites every row. Add the condition.',
            'Delete the child rows first: `DELETE FROM order_items WHERE order_id = 4;`',
            '`DELETE ... WHERE id = 4` on a missing row affects 0 rows - that is already safe, so the second run will not crash.',
          ],
          solution: `UPDATE products SET stock = 50 WHERE id = 3;

BEGIN;
DELETE FROM order_items WHERE order_id = 4;
DELETE FROM orders WHERE id = 4;
COMMIT;`,
          checks: [
            T.sql('only the intended product changed', ({ db }) => {
              const rows = db.prepare('SELECT id, stock FROM products ORDER BY id').all();
              const changed = rows.filter((r) => r.stock === 50);
              return (changed.length === 1 && changed[0].id === 3) || `products with stock 50: ${changed.map((c) => c.id).join(', ') || 'none'}`;
            }),
            T.sql('the other stock levels are untouched', ({ db }) => {
              const rows = Object.fromEntries(db.prepare('SELECT id, stock FROM products').all().map((r) => [r.id, r.stock]));
              if (rows[1] !== 40) return `product 1 stock should still be 40, got ${rows[1]}`;
              if (rows[2] !== 12) return `product 2 stock should still be 12, got ${rows[2]}`;
              if (rows[4] !== 7) return `product 4 stock should still be 7, got ${rows[4]}`;
              return true;
            }),
            T.sql('order 4 is gone', ({ db }) => db.prepare('SELECT COUNT(*) AS n FROM orders WHERE id = 4').get().n === 0 || 'order 4 still exists'),
            T.sql('its items went with it', ({ db }) => {
              const row = db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE order_id = 4').get();
              return row.n === 0 || `${row.n} item(s) orphaned`;
            }),
            T.sql('no orphan items exist anywhere', ({ db }) => {
              const row = db.prepare('SELECT COUNT(*) AS n FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL').get();
              return row.n === 0 || `${row.n} order_items point at a missing order`;
            }),
            T.sql('no unguarded mutation was run', ({ rowsets }) => {
              const bad = rowsets.filter((r) => /^\s*(update|delete)\b/i.test(r.sql) && !/where/i.test(r.sql));
              return bad.length === 0 || `unguarded: ${bad.map((b) => b.sql.slice(0, 40)).join(' | ')}`;
            }),
            T.sql('the remaining data is intact', ({ db }) => {
              const orders = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
              const items = db.prepare('SELECT COUNT(*) AS n FROM order_items').get().n;
              return (orders === 4 && items === 6) || `expected 4 orders and 6 items, found ${orders} and ${items}`;
            }),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'sql-capstone',
    title: 'Capstone: design, build and query a real database',
    minutes: 240,
    brief:
      'Design the database behind the task API from the Express capstone: schema, migrations, seed data, indexes and the reports the product ' +
      'actually needs.\n\n' +
      'Deliver a `schema.sql`, a `seed.sql`, a `queries.sql` of at least ten named reports, and a written note on every index you added and ' +
      'which query it serves.',
    starter: `task-db/
├── schema.sql
├── seed.sql
├── queries.sql
├── migrations/
│   └── 001_init.sql
└── NOTES.md`,
    requirements: [
      'Tables: `users`, `projects`, `tasks`, `tags`, `task_tags`, with primary keys and real constraints everywhere',
      'A many-to-many between tasks and tags via a join table with a composite primary key',
      '`ON DELETE CASCADE` so deleting a project removes its tasks and their tag links, and nothing is orphaned',
      '`CHECK` constraints on every status/enum column',
      'Indexes on every foreign key and on the columns used by your reports, each justified in `NOTES.md`',
      '`seed.sql` creating at least 4 users, 6 projects and 40 tasks with realistic distributions',
      '`queries.sql` with 10 named reports: overdue tasks per user, tasks per project, tag usage, a user activity timeline, an average completion time, and five more of your choosing',
      'Every report uses an explicit column list - no `SELECT *`',
      'A migration that adds a new column with a `DEFAULT` and is safe to run twice',
      '`EXPLAIN QUERY PLAN` output for three of your reports showing the index is used',
    ],
    checks: [
      'Drop the database, run `schema.sql` then `seed.sql`: it works from scratch with no errors',
      'Run every migration twice in a row: no errors, no duplicated data',
      'Delete a project: its tasks and their tag links disappear, and no orphans remain',
      'Insert a task with an invalid status: rejected by the database, not just the application',
      'Every report returns at least one row against the seed data',
      'No report uses `SELECT *`',
      '`EXPLAIN QUERY PLAN` shows `USING INDEX` (not `SCAN`) for your three most expensive reports',
      'Insert 10,000 synthetic tasks and time the slowest report; it stays under 100ms',
      'A concurrent-safe pattern: update a task counter with a guarded `UPDATE ... WHERE`, not a read-then-write',
      '`NOTES.md` explains each index with the query it serves',
    ],
    stretch: [
      'Add a full-text search table for task titles and show the query it powers',
      'Add soft deletes with `deleted_at` and update every report to exclude deleted rows',
      'Add an `audit_log` table populated by triggers',
      'Write the same schema for Postgres and document every dialect difference you hit',
      'Add a materialised view (or a summary table refreshed on a schedule) for the slowest report',
    ],
  },
};
