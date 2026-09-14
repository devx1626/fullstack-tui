import { T } from '../core/grade.js';

/**
 * These challenges are graded by executing your handler with a mock `req`/`res`,
 * so they test the part you actually write. Run `npm i express` in a real
 * project and the same handler drops straight in.
 */
const PRELUDE = `function makeReq(options = {}) {
  const { method = 'GET', url = '/', params = {}, query = {}, body, headers = {} } = options;
  return {
    method, url, params, query, body, headers,
    get: (name) => headers[String(name).toLowerCase()],
    header: (name) => headers[String(name).toLowerCase()],
  };
}
function makeRes() {
  const res = {
    statusCode: 200, headers: {}, body: undefined, ended: false, locals: {},
    status(code) { res.statusCode = code; return res; },
    set(name, value) { res.headers[String(name).toLowerCase()] = value; return res; },
    header(name, value) { return res.set(name, value); },
    type(value) { res.headers['content-type'] = value; return res; },
    json(payload) { res.body = payload; res.ended = true; return res; },
    send(payload) { res.body = payload; res.ended = true; return res; },
    sendStatus(code) { res.statusCode = code; res.ended = true; return res; },
    end() { res.ended = true; return res; },
  };
  return res;
}
async function callHandler(handler, options) {
  const req = makeReq(options);
  const res = makeRes();
  await handler(req, res);
  return { req, res };
}`;

export default {
  id: 'express',
  title: 'Express & APIs',
  badge: 'EX',
  color: 'warn',
  tagline: 'Turning functions into an HTTP service other people can call',
  hours: 8,
  why:
    'An API is a contract. Get the verbs, status codes and error shapes right and every client - your own front end, a mobile app, someone ' +
    'else\'s script - becomes straightforward. Get them wrong and you will be debugging "why does my fetch return undefined" forever.',
  source: {
    course: 'Dave Gray - MERN Stack Full Tutorial & Project (8h)',
    url: 'https://www.youtube.com/watch?v=CvCiNeLnZ00',
    roadmap: 'https://roadmap.sh/nodejs',
    docs: 'https://expressjs.com/en/guide/routing.html',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'exp-01',
      title: 'HTTP: Verbs, Status Codes and Headers',
      minutes: 25,
      objectives: [
        'Choose the right method for the operation',
        'Return status codes that tell the truth',
        'Know what is idempotent and why it matters',
      ],
      sections: [
        {
          heading: 'Methods are the verb of your API',
          body:
            '| Method | Meaning | Idempotent? |\n|---|---|---|\n| `GET` | read, never changes anything | yes |\n| `POST` | create, or anything non-idempotent | no |\n| `PUT` | replace the whole resource | yes |\n| `PATCH` | change part of the resource | no (usually) |\n| `DELETE` | remove it | yes |\n\n' +
            '*Idempotent* means calling it twice has the same effect as calling it once. That is why a browser can safely retry a `GET` after a ' +
            'network blip, and why you must never do `GET /users/1/delete`.',
        },
        {
          heading: 'Status codes worth memorising',
          body:
            '- `200 OK` - generic success\n' +
            '- `201 Created` - new resource; include a `Location` header\n' +
            '- `204 No Content` - success with nothing to say (typical after a DELETE)\n' +
            '- `400 Bad Request` - the client sent nonsense (missing field, wrong type)\n' +
            '- `401 Unauthorized` - you are not authenticated ("who are you?")\n' +
            '- `403 Forbidden` - you are authenticated but not allowed ("I know who you are; no")\n' +
            '- `404 Not Found` - no such resource\n' +
            '- `409 Conflict` - the request contradicts the current state (duplicate email)\n' +
            '- `422 Unprocessable Entity` - syntactically fine, semantically invalid (email fails validation)\n' +
            '- `500 Internal Server Error` - your bug; never expose the stack trace to the client\n\n' +
            'The single most common API mistake is returning `200` with `{ error: "not found" }`. The client then has to parse the body to know ' +
            'whether anything worked.',
        },
        {
          heading: 'Headers carry the metadata',
          body:
            '- `Content-Type: application/json` - what you are sending\n' +
            '- `Accept` - what the client wants back\n' +
            '- `Authorization: Bearer <token>` - credentials\n' +
            '- `Cache-Control` - how long a proxy may reuse this\n' +
            '- `Location` - where the created resource lives\n\n' +
            '`fetch` sets `Content-Type` for you when the body is a string or `FormData`, but being explicit in your own handlers avoids a whole ' +
            'class of "the client parsed it as text" bugs.',
        },
        {
          heading: 'Sample code: a complete Express app',
          body: 'Twenty lines that cover a real API surface, including the JSON body parser and a 404 fallback.',
          code: {
            lang: 'js',
            caption: 'server.js',
            source: `import express from 'express';

const app = express();
app.use(express.json());                       // parses application/json bodies

const notes = new Map([[1, { id: 1, title: 'First note' }]]);

app.get('/api/notes', (req, res) => {
  res.json([...notes.values()]);
});

app.get('/api/notes/:id', (req, res) => {
  const note = notes.get(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

app.post('/api/notes', (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const id = notes.size + 1;
  const note = { id, title: title.trim() };
  notes.set(id, note);
  res.status(201).location(\`/api/notes/\${id}\`).json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  const existed = notes.delete(Number(req.params.id));
  res.sendStatus(existed ? 204 : 404);
});

app.use((req, res) => res.status(404).json({ error: 'No such route' }));

app.listen(3000, () => console.log('http://localhost:3000/api/notes'));`,
          },
        },
      ],
      pitfalls: [
        'Returning `200` with an error object inside the body',
        'Using `GET` for anything that changes state',
        'Forgetting `express.json()` and finding `req.body` undefined',
        '`401` and `403` used interchangeably',
        'Leaking stack traces or database errors to the client',
      ],
      keyPoints: [
        'GET/PUT/DELETE idempotent, POST/PATCH not',
        '201 for created, 204 for empty success, 404/400/409/422 for client mistakes',
        '`res.status(404).json({ error })` - the status is the machine-readable signal',
        '`app.use(express.json())` before routes that need a body',
      ],
      resources: [
        { label: 'MDN: HTTP response status codes', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status' },
        { label: 'Express: Routing', url: 'https://expressjs.com/en/guide/routing.html' },
      ],
      challenges: [
        {
          id: 'fix-handlers',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: PRELUDE,
          prompt:
            'Two handlers with API-shaped bugs: a lookup that returns `200` for a missing resource, and a create that accepts anything and ' +
            'reports the wrong status. Your handlers are executed with a mock request and response, so the checks see the exact status code ' +
            'and body you produce.',
          requirements: [
            '`getNote(req, res)` returns 200 with the note when it exists, 404 with `{ error: "Note not found" }` when it does not',
            'The id from the URL is a **string** - convert it before the lookup',
            '`createNote(req, res)` returns 201 with the created note when the title is a non-empty string',
            '`createNote` returns 400 with `{ error: "title is required" }` for a missing, empty or non-string title',
            '`createNote` trims the title before storing it',
          ],
          starter: `const notes = new Map([[1, { id: 1, title: 'First note' }]]);

function getNote(req, res) {
  const note = notes.get(req.params.id);
  res.json(note);
}

function createNote(req, res) {
  const { title } = req.body;
  const id = notes.size + 1;
  const note = { id, title };
  notes.set(id, note);
  res.json(note);
}`,
          hints: [
            '`notes.get("1")` misses a Map keyed by the number 1. Use `Number(req.params.id)`.',
            '`res.json(undefined)` on a missing note still sends 200. Check first and return `res.status(404)`.',
            'For a create, 200 is wrong - the resource did not exist before.',
            'Validate `typeof title === "string" && title.trim()` before storing.',
          ],
          solution: `const notes = new Map([[1, { id: 1, title: 'First note' }]]);

function getNote(req, res) {
  const note = notes.get(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'Note not found' });
  return res.json(note);
}

function createNote(req, res) {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const id = notes.size + 1;
  const note = { id, title: title.trim() };
  notes.set(id, note);
  return res.status(201).json(note);
}`,
          checks: [
            T.js('an existing note returns 200', 'await (async () => { const { res } = await callHandler(getNote, { params: { id: "1" } }); return res.statusCode === 200 && res.body.id === 1; })()'),
            T.js('the string id is converted', 'await (async () => { const { res } = await callHandler(getNote, { params: { id: "1" } }); return res.body.title === "First note"; })()', 'A Map keyed by numbers will not find "1".'),
            T.js('a missing note returns 404', 'await (async () => { const { res } = await callHandler(getNote, { params: { id: "99" } }); return res.statusCode === 404; })()', 'Check for the note before responding.'),
            T.js('the 404 body carries an error message', 'await (async () => { const { res } = await callHandler(getNote, { params: { id: "99" } }); return res.body.error === "Note not found"; })()'),
            T.js('creating returns 201', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: "New" } }); return res.statusCode === 201; })()', 'Created is not OK.'),
            T.js('the created note is returned', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: "New" } }); return res.body.title === "New" && typeof res.body.id === "number"; })()'),
            T.js('the title is trimmed', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: "  Padded  " } }); return res.body.title === "Padded"; })()'),
            T.js('a missing title is rejected', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: {} }); return res.statusCode === 400 && res.body.error === "title is required"; })()'),
            T.js('a whitespace title is rejected', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: "   " } }); return res.statusCode === 400; })()'),
            T.js('a non-string title is rejected', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: 42 } }); return res.statusCode === 400; })()'),
            T.js('a missing body does not crash', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST" }); return res.statusCode === 400; })()', '`req.body` can be undefined - guard it.'),
            T.js('the response finishes', 'await (async () => { const { res } = await callHandler(getNote, { params: { id: "1" } }); return res.ended === true; })()'),
          ],
        },
        {
          id: 'write-crud',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          async: true,
          prelude: PRELUDE,
          prompt:
            'Implement the full CRUD surface for a notes API. Your handlers are executed with a mock request and response, and the checks assert ' +
            'on status codes, headers, bodies and validation - exactly what a reviewer would do with curl.',
          requirements: [
            '`listNotes(req, res)` -> 200 with an array; supports `?q=` filtering by title (case-insensitive)',
            '`getNote(req, res)` -> 200 or 404 `{ error }`',
            '`createNote(req, res)` -> 201, `Location: /api/notes/:id`, validates `title` (non-empty string, max 120 chars)',
            '`replaceNote(req, res)` -> 200 replacing the whole note, 404 if absent, 400 on invalid body',
            '`deleteNote(req, res)` -> 204 with no body, or 404',
            'Never mutate the stored object in place - replace it with a new object',
          ],
          starter: `const notes = new Map([[1, { id: 1, title: 'First', body: 'Hello' }]]);

function listNotes(req, res) {
}

function getNote(req, res) {
}

function createNote(req, res) {
}

function replaceNote(req, res) {
}

function deleteNote(req, res) {
}`,
          hints: [
            'Reset the store between checks by working with `notes` — but be careful: the checks reuse it. Create, then delete what you created.',
            'Filtering: `[...notes.values()].filter((n) => n.title.toLowerCase().includes(q.toLowerCase()))`.',
            '`res.status(201).set("Location", `/api/notes/${id}`).json(note)` chains nicely.',
            '204 means no body at all: `res.status(204).end()`.',
          ],
          solution: `const notes = new Map([[1, { id: 1, title: 'First', body: 'Hello' }]]);

function nextId() {
  return Math.max(0, ...notes.keys()) + 1;
}

function listNotes(req, res) {
  const q = String(req.query?.q ?? '').trim().toLowerCase();
  const all = [...notes.values()];
  const filtered = q ? all.filter((n) => n.title.toLowerCase().includes(q)) : all;
  return res.json(filtered);
}

function getNote(req, res) {
  const note = notes.get(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'Note not found' });
  return res.json(note);
}

function createNote(req, res) {
  const { title, body = '' } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (title.trim().length > 120) {
    return res.status(400).json({ error: 'title is too long' });
  }
  const id = nextId();
  const note = { id, title: title.trim(), body: String(body) };
  notes.set(id, note);
  return res.status(201).set('Location', \`/api/notes/\${id}\`).json(note);
}

function replaceNote(req, res) {
  const id = Number(req.params.id);
  if (!notes.has(id)) return res.status(404).json({ error: 'Note not found' });
  const { title, body = '' } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const note = { id, title: title.trim(), body: String(body) };
  notes.set(id, note);
  return res.json(note);
}

function deleteNote(req, res) {
  const id = Number(req.params.id);
  if (!notes.has(id)) return res.status(404).json({ error: 'Note not found' });
  notes.delete(id);
  return res.status(204).end();
}`,
          checks: [
            T.js('listNotes returns 200 and an array', 'await (async () => { const { res } = await callHandler(listNotes, {}); return res.statusCode === 200 && Array.isArray(res.body); })()'),
            T.js('listNotes filters by title', 'await (async () => { const { res } = await callHandler(listNotes, { query: { q: "fir" } }); return res.body.length === 1 && res.body[0].title === "First"; })()', 'Filter case-insensitively on the title.'),
            T.js('listNotes filtering is case-insensitive', 'await (async () => { const { res } = await callHandler(listNotes, { query: { q: "FIRST" } }); return res.body.length === 1; })()'),
            T.js('listNotes with no query returns everything', 'await (async () => { const { res } = await callHandler(listNotes, { query: {} }); return res.body.length >= 1; })()'),
            T.js('createNote returns 201 and a Location header', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: "Temp A" } }); const ok = res.statusCode === 201 && String(res.headers.location || "").startsWith("/api/notes/"); if (res.body?.id) deleteNote(makeReq({ params: { id: String(res.body.id) } }), makeRes()); return ok; })()', 'Chain `.status(201).set("Location", path).json(note)`.'),
            T.js('createNote rejects an over-long title', 'await (async () => { const { res } = await callHandler(createNote, { method: "POST", body: { title: "x".repeat(121) } }); return res.statusCode === 400; })()'),
            T.js('replaceNote updates the whole note', 'await (async () => { const { res } = await callHandler(replaceNote, { method: "PUT", params: { id: "1" }, body: { title: "Replaced", body: "New body" } }); return res.statusCode === 200 && res.body.title === "Replaced" && res.body.body === "New body"; })()'),
            T.js('replaceNote 404s for a missing id', 'await (async () => { const { res } = await callHandler(replaceNote, { method: "PUT", params: { id: "999" }, body: { title: "x" } }); return res.statusCode === 404; })()'),
            T.js('replaceNote validates its body', 'await (async () => { const { res } = await callHandler(replaceNote, { method: "PUT", params: { id: "1" }, body: {} }); return res.statusCode === 400; })()'),
            T.js('deleteNote returns 204 with no body', 'await (async () => { const { res: created } = await callHandler(createNote, { method: "POST", body: { title: "Doomed" } }); const { res } = await callHandler(deleteNote, { method: "DELETE", params: { id: String(created.body.id) } }); return res.statusCode === 204 && res.body === undefined; })()', '204 means empty: `res.status(204).end()`.'),
            T.js('deleteNote 404s on a second delete', 'await (async () => { const { res } = await callHandler(deleteNote, { method: "DELETE", params: { id: "999" } }); return res.statusCode === 404; })()'),
            T.js('a deleted note is really gone', 'await (async () => { const { res: created } = await callHandler(createNote, { method: "POST", body: { title: "Gone" } }); await callHandler(deleteNote, { method: "DELETE", params: { id: String(created.body.id) } }); const { res } = await callHandler(getNote, { params: { id: String(created.body.id) } }); return res.statusCode === 404; })()'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'exp-02',
      title: 'Routing and Middleware',
      minutes: 30,
      objectives: [
        'Read a route path and know which requests match it',
        'Write middleware that runs in the right order',
        'Understand next() and why forgetting it hangs a request',
      ],
      sections: [
        {
          heading: 'Route paths are patterns',
          body:
            '```\napp.get("/users", handler)                 // exactly /users\napp.get("/users/:id", handler)             // /users/42 -> req.params.id = "42"\napp.get("/files/*splat", handler)          // /files/a/b.txt -> req.params.splat = ["a","b.txt"]\napp.get("/search", handler)                // /search?q=x  -> req.query.q = "x"\napp.route("/notes").get(list).post(create) // chained\n```\n\n' +
            'Order matters: Express tries routes **in the order you declared them**. A generic `/users/:id` declared before `/users/new` will swallow ' +
            '`/users/new`.',
        },
        {
          heading: 'Middleware is just a function with next',
          body:
            '```\nfunction logger(req, res, next) {\n  console.log(`${req.method} ${req.url}`);\n  next();                    // hand over to the next handler\n}\napp.use(logger);\n```\n\n' +
            'Every middleware receives `(req, res, next)` and must either respond or call `next()`. **Forgetting `next()` is the number one cause of ' +
            'a request that never finishes.** Calling `next(err)` with an argument skips straight to the error handler.\n\n' +
            'Middleware is how you get cross-cutting concerns out of your handlers: logging, authentication, rate limiting, body parsing, CORS.',
        },
        {
          heading: 'Param middleware and routers',
          body:
            'You can scope middleware to a route, or to a router module:\n\n' +
            '```js\n// routes/notes.js\nimport { Router } from "express";\nconst router = Router();\n\nrouter.param("id", (req, res, next, id) => {\n  const note = store.get(Number(id));\n  if (!note) return res.status(404).json({ error: "Note not found" });\n  req.note = note;               // attach it for the handlers\n  next();\n});\n\nrouter.get("/:id", (req, res) => res.json(req.note));\nexport default router;\n\n// app.js\napp.use("/api/notes", notesRouter);\n```\n\n' +
            'This is where an API becomes maintainable: the 404 logic lives in one place, and the handlers read cleanly.',
        },
        {
          heading: 'Sample code: a real middleware stack',
          body: 'Order is the whole design here - read it top to bottom.',
          code: {
            lang: 'js',
            caption: 'app.js',
            source: `import express from 'express';
import notesRouter from './routes/notes.js';

const app = express();

app.use(express.json({ limit: '1mb' }));      // 1. parse bodies
app.use((req, res, next) => {                 // 2. request logging
  const started = Date.now();
  res.on('finish', () => {
    console.log(\`\${req.method} \${req.url} \${res.statusCode} \${Date.now() - started}ms\`);
  });
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));   // 3. cheap liveness

app.use('/api/notes', notesRouter);                             // 4. feature routes

app.use((req, res) => res.status(404).json({ error: 'No such route' }));  // 5. not found

// 6. the error handler: FOUR arguments is what makes Express treat it as one
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

export default app;`,
          },
        },
      ],
      pitfalls: [
        'Forgetting `next()` in middleware, so the request hangs',
        'Registering the 404 handler before your routes',
        'A three-argument error handler (Express needs four to recognise it)',
        'Putting `express.json()` after the routes that need `req.body`',
        'Declaring `/users/:id` before `/users/new`',
      ],
      keyPoints: [
        '`req.params` from the path, `req.query` from the query string',
        'Route order matters - specific before generic',
        'Middleware must respond or call `next()`',
        'Error handlers take exactly four arguments',
      ],
      resources: [
        { label: 'Express: Using middleware', url: 'https://expressjs.com/en/guide/using-middleware.html' },
        { label: 'Express: Error handling', url: 'https://expressjs.com/en/guide/error-handling.html' },
      ],
      challenges: [
        {
          id: 'write-middleware',
          kind: 'write',
          difficulty: 'hard',
          minutes: 18,
          lang: 'js',
          async: true,
          prelude: PRELUDE,
          prompt:
            'Write the four middleware functions every API needs. The checks call them directly with a mock request and response, and verify both ' +
            'what they do and that they call `next()` at the right time.',
          requirements: [
            '`requireJson(req, res, next)` -> 415 if a request with a body is not `application/json`, otherwise continue',
            '`requireApiKey(req, res, next)` -> 401 `{ error: "Missing API key" }` without an `x-api-key` header, 403 `{ error: "Invalid API key" }` with a wrong one, otherwise attach `req.user = { role }` and continue',
            '`validateBody(schema)` -> a middleware factory returning 422 with `{ error, fields: [...] }` when required fields are missing or the wrong type',
            '`notFound(req, res)` -> 404 `{ error: "No such route" }`',
            '`errorHandler(err, req, res, next)` -> uses `err.status` (default 500), hides server-error messages, sets `Content-Type: application/json`',
            'Every middleware that continues must call `next()` exactly once',
          ],
          starter: ``,
          hints: [
            'A request "has a body" when `method` is POST/PUT/PATCH.',
            '`req.get("content-type")` reads a header case-insensitively in real Express; the mock provides `req.get` too.',
            'A factory returns a function: `const validateBody = (schema) => (req, res, next) => { ... }`.',
            'The error handler must declare four parameters or Express will treat it as normal middleware.',
          ],
          solution: `function requireJson(req, res, next) {
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
  if (!hasBody) return next();
  const type = String(req.get('content-type') ?? '');
  if (!type.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  return next();
}

function requireApiKey(req, res, next) {
  const key = req.get('x-api-key');
  if (!key) return res.status(401).json({ error: 'Missing API key' });
  if (key !== 'secret-key') return res.status(403).json({ error: 'Invalid API key' });
  req.user = { role: 'admin' };
  return next();
}

function validateBody(schema) {
  return function validate(req, res, next) {
    const body = req.body ?? {};
    const fields = [];
    for (const [field, rule] of Object.entries(schema)) {
      const value = body[field];
      if (rule.required && (value === undefined || value === null || value === '')) {
        fields.push({ field, error: 'is required' });
      } else if (value !== undefined && rule.type && typeof value !== rule.type) {
        fields.push({ field, error: \`must be a \${rule.type}\` });
      }
    }
    if (fields.length) {
      return res.status(422).json({ error: 'Validation failed', fields });
    }
    return next();
  };
}

function notFound(req, res) {
  return res.status(404).json({ error: 'No such route' });
}

function errorHandler(err, req, res, next) {
  const status = err && err.status ? err.status : 500;
  res.set('Content-Type', 'application/json');
  if (status >= 500) console.error(err);
  return res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
}`,
          checks: [
            T.js('requireJson lets a GET through', 'await (async () => { let called = false; const res = makeRes(); requireJson(makeReq({ method: "GET" }), res, () => { called = true; }); return called === true; })()'),
            T.js('requireJson lets a JSON body through', 'await (async () => { let called = false; const res = makeRes(); requireJson(makeReq({ method: "POST", headers: { "content-type": "application/json" } }), res, () => { called = true; }); return called === true; })()'),
            T.js('requireJson rejects a form post with 415', 'await (async () => { let called = false; const res = makeRes(); requireJson(makeReq({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }), res, () => { called = true; }); return called === false && res.statusCode === 415; })()'),
            T.js('a missing key is 401', 'await (async () => { let called = false; const res = makeRes(); requireApiKey(makeReq({}), res, () => { called = true; }); return res.statusCode === 401 && called === false; })()'),
            T.js('a wrong key is 403', 'await (async () => { const res = makeRes(); requireApiKey(makeReq({ headers: { "x-api-key": "nope" } }), res, () => {}); return res.statusCode === 403 && res.body.error === "Invalid API key"; })()'),
            T.js('a correct key attaches the user and continues', 'await (async () => { let called = false; const req = makeReq({ headers: { "x-api-key": "secret-key" } }); requireApiKey(req, makeRes(), () => { called = true; }); return called === true && req.user && req.user.role === "admin"; })()'),
            T.js('validateBody passes a valid payload', 'await (async () => { let called = false; const mw = validateBody({ title: { required: true, type: "string" } }); mw(makeReq({ body: { title: "ok" } }), makeRes(), () => { called = true; }); return called === true; })()'),
            T.js('validateBody reports missing fields with 422', 'await (async () => { const mw = validateBody({ title: { required: true, type: "string" } }); const res = makeRes(); mw(makeReq({ body: {} }), res, () => {}); return res.statusCode === 422 && Array.isArray(res.body.fields) && res.body.fields[0].field === "title"; })()'),
            T.js('validateBody catches a wrong type', 'await (async () => { const mw = validateBody({ count: { required: true, type: "number" } }); const res = makeRes(); mw(makeReq({ body: { count: "three" } }), res, () => {}); return res.statusCode === 422; })()'),
            T.js('notFound always answers 404', '(() => { const res = makeRes(); notFound(makeReq({}), res); return res.statusCode === 404 && res.body.error === "No such route"; })()'),
            T.js('errorHandler honours err.status', '(() => { const res = makeRes(); errorHandler({ status: 409, message: "Conflict" }, makeReq({}), res, () => {}); return res.statusCode === 409 && res.body.error === "Conflict"; })()'),
            T.js('errorHandler hides internal messages', '(() => { const res = makeRes(); errorHandler(new Error("db password is hunter2"), makeReq({}), res, () => {}); return res.statusCode === 500 && res.body.error === "Server error"; })()', 'Never leak internal detail to a client.'),
            T.js('errorHandler declares four arguments', 'errorHandler.length === 4', 'Express only treats a four-argument function as an error handler.'),
            T.js('errorHandler sets the JSON content type', '(() => { const res = makeRes(); errorHandler({ status: 400, message: "Bad" }, makeReq({}), res, () => {}); return String(res.headers["content-type"] || "").includes("application/json"); })()'),
          ],
        },
        {
          id: 'write-router',
          kind: 'write',
          difficulty: 'hard',
          minutes: 18,
          lang: 'js',
          async: true,
          prelude: PRELUDE,
          prompt:
            'Write a tiny router: a `route(method, path)` matcher plus a `createRouter()` that runs middleware and handlers in order. This is the ' +
            'exercise that makes Express stop being a black box.',
          requirements: [
            '`matchPath(pattern, path)` -> `{ matched: true, params }` or `{ matched: false }`',
            '`/users/:id` matches `/users/42` and `/users/ama`, but not `/users` or `/users/42/posts`',
            '`/files/*rest` matches any deeper path and returns `params.rest` as the remaining segments',
            '`createRouter()` with `use`, `get`, `post` and `handle(req, res)`',
            '`handle` runs matching middleware, then the matching route handler, calling the error handler when one calls `next(err)`',
            'An unmatched request produces a 404 through the router itself',
          ],
          starter: ``,
          hints: [
            'Split both patterns and paths on `/`, then compare segment by segment.',
            'A `:name` segment captures; a `*name` segment captures the rest and stops the loop.',
            'Keep two arrays: middleware (run always) and routes (run on a match).',
            'Track whether `next(err)` was called by throwing inside the chain and catching it in `handle`.',
          ],
          solution: `function matchPath(pattern, path) {
  const patternParts = String(pattern).split('/').filter(Boolean);
  const pathParts = String(path.split('?')[0]).split('/').filter(Boolean);
  const params = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    if (part.startsWith('*')) {
      params[part.slice(1)] = pathParts.slice(i);
      return { matched: true, params };
    }
    const value = pathParts[i];
    if (value === undefined) return { matched: false };
    if (part.startsWith(':')) {
      params[part.slice(1)] = value;
      continue;
    }
    if (part !== value) return { matched: false };
  }

  if (pathParts.length !== patternParts.length) return { matched: false };
  return { matched: true, params };
}

function createRouter() {
  const middleware = [];
  const routes = [];
  let errorHandler = null;

  const router = {
    use(fn) {
      if (fn.length === 4) errorHandler = fn;
      else middleware.push(fn);
      return router;
    },
    get(path, handler) {
      routes.push({ method: 'GET', path, handler });
      return router;
    },
    post(path, handler) {
      routes.push({ method: 'POST', path, handler });
      return router;
    },
    notFound(req, res) {
      res.status(404).json({ error: 'No such route' });
    },
    async handle(req, res) {
      const chain = [...middleware];
      const route = routes.find((r) => r.method === req.method && matchPath(r.path, req.url).matched);
      if (route) {
        const { params } = matchPath(route.path, req.url);
        req.params = params;
        chain.push(route.handler);
      }

      let error = null;
      for (const fn of chain) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve, reject) => {
            const stepped = (err) => (err ? reject(err) : resolve());
            try {
              const out = fn(req, res, stepped);
              if (out && typeof out.then === 'function') out.then(resolve, reject);
              // A middleware or handler that ended the response without
              // calling next() is finished too - otherwise we would wait for
              // a next() that never comes.
              else if (res.ended) resolve();
            } catch (err2) {
              reject(err2);
            }
          });
        } catch (err3) {
          error = err3;
          break;
        }
        if (res.ended) return res;
      }

      if (error) {
        if (errorHandler) return errorHandler(error, req, res, () => {});
        res.status(error.status ?? 500).json({ error: error.message ?? 'Server error' });
        return res;
      }
      if (res.ended) return res;
      router.notFound(req, res);
      return res;
    },
  };

  return router;
}`,
          checks: [
            T.js('an exact path matches', 'matchPath("/users", "/users").matched === true'),
            T.js('a param captures the segment', 'matchPath("/users/:id", "/users/42").params.id === "42"'),
            T.js('a param does not match a missing segment', 'matchPath("/users/:id", "/users").matched === false'),
            T.js('a param does not match extra segments', 'matchPath("/users/:id", "/users/42/posts").matched === false'),
            T.js('mismatched literals do not match', 'matchPath("/users/:id", "/posts/42").matched === false'),
            T.js('a wildcard captures the rest', 'JSON.stringify(matchPath("/files/*rest", "/files/a/b.txt").params.rest) === JSON.stringify(["a","b.txt"])', 'The `*name` segment takes everything that is left.'),
            T.js('a wildcard matches an empty remainder', 'matchPath("/files/*rest", "/files").matched === true'),
            T.js('a GET route runs and responds', 'await (async () => { const r = createRouter(); r.get("/ping", (req, res) => res.json({ pong: true })); const res = makeRes(); await r.handle(makeReq({ url: "/ping" }), res); return res.statusCode === 200 && res.body.pong === true; })()'),
            T.js('params reach the handler', 'await (async () => { const r = createRouter(); r.get("/notes/:id", (req, res) => res.json({ id: req.params.id })); const res = makeRes(); await r.handle(makeReq({ url: "/notes/7" }), res); return res.body.id === "7"; })()'),
            T.js('middleware runs in registration order', 'await (async () => { const r = createRouter(); const order = []; r.use((req, res, next) => { order.push(1); next(); }); r.use((req, res, next) => { order.push(2); next(); }); r.get("/x", (req, res) => { order.push(3); res.end(); }); await r.handle(makeReq({ url: "/x" }), makeRes()); return JSON.stringify(order) === "[1,2,3]"; })()'),
            T.js('middleware can short-circuit', 'await (async () => { const r = createRouter(); let reached = false; r.use((req, res) => res.status(401).json({ error: "no" })); r.get("/x", (req, res) => { reached = true; res.end(); }); const res = makeRes(); await r.handle(makeReq({ url: "/x" }), res); return reached === false && res.statusCode === 401; })()'),
            T.js('a POST route only matches POST', 'await (async () => { const r = createRouter(); r.post("/notes", (req, res) => res.status(201).json({ ok: true })); const res = makeRes(); await r.handle(makeReq({ method: "GET", url: "/notes" }), res); return res.statusCode === 404; })()'),
            T.js('an unmatched route is a 404 through the router', 'await (async () => { const r = createRouter(); const res = makeRes(); await r.handle(makeReq({ url: "/nothing" }), res); return res.statusCode === 404 && res.body.error === "No such route"; })()'),
            T.js('next(err) reaches the error handler', 'await (async () => { const r = createRouter(); let seen = null; r.use((req, res, next) => next(Object.assign(new Error("kaboom"), { status: 409 }))); r.use((err, req, res, next) => { seen = err.message; res.status(err.status).json({ error: err.message }); }); const res = makeRes(); await r.handle(makeReq({ url: "/x" }), res); return seen === "kaboom" && res.statusCode === 409; })()'),
            T.js('a thrown error is caught too', 'await (async () => { const r = createRouter(); r.get("/boom", () => { throw new Error("bad"); }); const res = makeRes(); await r.handle(makeReq({ url: "/boom" }), res); return res.statusCode === 500; })()'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'exp-03',
      title: 'REST Design and Talking to Your Own API',
      minutes: 30,
      objectives: [
        'Design resource URLs that stay stable as the app grows',
        'Version and paginate an API without breaking clients',
        'Call your own API from the front end with correct error handling',
      ],
      sections: [
        {
          heading: 'Resources, not actions',
          body:
            'REST is nouns plus HTTP verbs:\n\n' +
            '```\nGET    /api/notes             list\nPOST   /api/notes             create\nGET    /api/notes/:id         read\nPUT    /api/notes/:id         replace\nPATCH  /api/notes/:id         partial update\nDELETE /api/notes/:id         delete\nGET    /api/notes/:id/tags    sub-resource\n```\n\n' +
            'Not `/api/getNotes`, not `/api/deleteNote`, not `/api/notes/create`. The verb is already in the method, and putting it in the URL ' +
            'breaks caching, tooling and every client library.\n\n' +
            'Plural nouns, lowercase, hyphens not underscores: `/api/blog-posts`, not `/api/BlogPost` or `/api/blog_posts`.',
        },
        {
          heading: 'Versioning, pagination and filtering',
          body:
            '- **Version** from day one: `/api/v1/notes`. Adding it later means every existing client breaks.\n' +
            '- **Paginate** anything that can grow: `?page=2&limit=20`, and return the metadata the client needs:\n' +
            '```json\n{ "data": [...], "page": 2, "limit": 20, "total": 137, "pages": 7 }\n```\n' +
            '- **Filter and sort with query parameters**: `?q=rebase&sort=-createdAt`\n' +
            '- **Never** return a bare array at the top level: you cannot add `total` later without breaking everyone.',
        },
        {
          heading: 'Consistent error shape',
          body:
            'Pick one shape and use it everywhere:\n\n' +
            '```json\n{\n  "error": "Validation failed",\n  "code": "VALIDATION_ERROR",\n  "fields": [{ "field": "title", "error": "is required" }]\n}\n```\n\n' +
            '`error` is for humans, `code` is for code to branch on, `fields` is for forms. A front end that can render field errors automatically ' +
            'is a front end that stops needing bespoke handling per endpoint.',
        },
        {
          heading: 'Sample code: the front end that consumes it',
          body: 'Notice the single `request()` helper: one place for the base URL, the auth header, the status check and the JSON parse.',
          code: {
            lang: 'js',
            caption: 'api.js',
            source: `const BASE = '/api/v1';

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(\`\${BASE}\${path}\`, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error ?? \`HTTP \${response.status}\`);
    error.status = response.status;
    error.code = payload?.code;
    error.fields = payload?.fields ?? [];
    throw error;
  }

  return payload;
}

export const api = {
  list: (params = {}) => request(\`/notes?\${new URLSearchParams(params)}\`),
  get: (id) => request(\`/notes/\${id}\`),
  create: (data) => request('/notes', { method: 'POST', body: data }),
  update: (id, data) => request(\`/notes/\${id}\`, { method: 'PATCH', body: data }),
  remove: (id) => request(\`/notes/\${id}\`, { method: 'DELETE' }),
};`,
          },
        },
      ],
      pitfalls: [
        'Verbs in the URL (`/getNotes`), which is not REST and breaks caching',
        'Returning a bare array, then being unable to add pagination metadata',
        'No API version, so clients break on the first breaking change',
        'Inconsistent error bodies, so the front end needs special cases everywhere',
        'Sending the auth token in a query string, where it lands in every log',
      ],
      keyPoints: [
        'Nouns in URLs, verbs in methods; plural, lowercase, hyphenated',
        '`/api/v1/...` and pagination envelopes from day one',
        'One error shape: `error`, `code`, `fields`',
        'One `request()` helper on the client, with `response.ok` checked',
      ],
      resources: [
        { label: 'MDN: REST', url: 'https://developer.mozilla.org/en-US/docs/Glossary/REST' },
        { label: 'Microsoft REST API guidelines', url: 'https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md' },
        { label: 'roadmap.sh: API design', url: 'https://roadmap.sh/api-design' },
      ],
      challenges: [
        {
          id: 'write-api-design',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Write the design layer: turn raw query parameters into a safe, bounded query object, and shape a paginated response. Get these two ' +
            'functions right and every list endpoint you write afterwards is consistent for free.',
          requirements: [
            '`parseQuery(raw)` -> `{ page, limit, q, sort, order }` with safe defaults',
            '`page` defaults to 1 and is clamped to a minimum of 1',
            '`limit` defaults to 20, clamped to 1..100, and never `NaN`',
            '`q` is trimmed and capped at 100 characters',
            '`order` is only ever `"asc"` or `"desc"`, defaulting to `"desc"`',
            '`paginate(items, query)` -> `{ data, page, limit, total, pages }`, slicing correctly',
            '`errorBody(message, code, fields)` -> the standard error envelope',
          ],
          starter: ``,
          hints: [
            '`Number(undefined)` is `NaN`, and `NaN` comparisons are always false - clamp after converting.',
            '`Math.min(100, Math.max(1, n))` is the clamping idiom.',
            '`pages` should be `Math.max(1, Math.ceil(total / limit))`.',
          ],
          solution: `const DEFAULTS = { page: 1, limit: 20, maxLimit: 100, q: '', order: 'desc' };

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function parseQuery(raw = {}) {
  const page = clampInt(raw.page, 1, Number.MAX_SAFE_INTEGER, DEFAULTS.page);
  const limit = clampInt(raw.limit, 1, DEFAULTS.maxLimit, DEFAULTS.limit);
  const q = String(raw.q ?? '').trim().slice(0, 100);
  const sort = String(raw.sort ?? '').trim().slice(0, 40) || null;
  const order = String(raw.order ?? DEFAULTS.order).toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { page, limit, q, sort, order };
}

function paginate(items = [], query = DEFAULTS) {
  const { page, limit } = query;
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

function errorBody(message, code = 'ERROR', fields = []) {
  return { error: message, code, fields };
}`,
          checks: [
            T.js('defaults are safe', 'JSON.stringify(parseQuery({})) === JSON.stringify({ page: 1, limit: 20, q: "", sort: null, order: "desc" })'),
            T.js('a bad page falls back to 1', 'parseQuery({ page: "abc" }).page === 1 && parseQuery({ page: "0" }).page === 1'),
            T.js('a negative page is clamped', 'parseQuery({ page: -5 }).page === 1'),
            T.js('limit is clamped to 100', 'parseQuery({ limit: "5000" }).limit === 100', '`Number("5000")` is fine - clamp it.'),
            T.js('a NaN limit falls back', 'parseQuery({ limit: "many" }).limit === 20'),
            T.js('the query string is trimmed and capped', 'parseQuery({ q: "   " }).q === "" && parseQuery({ q: "x".repeat(200) }).q.length === 100'),
            T.js('order only accepts asc or desc', 'parseQuery({ order: "ASC" }).order === "asc" && parseQuery({ order: "sideways" }).order === "desc"'),
            T.js('paginate slices the right window', 'JSON.stringify(paginate([1,2,3,4,5], { page: 2, limit: 2 }).data) === "[3,4]"'),
            T.js('paginate reports the total and page count', '(() => { const r = paginate(new Array(37).fill(0), { page: 1, limit: 20 }); return r.total === 37 && r.pages === 2; })()'),
            T.js('paginate handles an empty list', '(() => { const r = paginate([], { page: 1, limit: 20 }); return r.total === 0 && r.pages === 1 && r.data.length === 0; })()'),
            T.js('paginate beyond the end returns an empty page', 'paginate([1,2,3], { page: 9, limit: 2 }).data.length === 0'),
            T.js('the error envelope is consistent', 'JSON.stringify(errorBody("Validation failed", "VALIDATION_ERROR", [{ field: "title", error: "is required" }])).includes("VALIDATION_ERROR")'),
          ],
        },
        {
          id: 'fix-client',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 16,
          lang: 'js',
          async: true,
          mockFetch: {
            'https://api.example.com/v1/notes': {
              data: [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }],
              page: 1,
              limit: 20,
              total: 2,
              pages: 1,
            },
          },
          prompt:
            'This client helper has three bugs that all hide behind a happy-path test: it never checks the response status, it caches the whole ' +
            'envelope instead of the items, and its retry swallows the final error. The checks simulate failures with a stubbed fetch.',
          requirements: [
            '`getJson(url)` throws an Error whose message contains the status code when `response.ok` is false',
            '`getNotes()` resolves to the **array** of notes, not the envelope',
            '`getNotes()` returns an empty array when the request fails, and logs the reason',
            '`getNotes()` does not re-fetch when the result is already cached',
            '`retry(fn, attempts)` retries up to `attempts` times and then rethrows the last error',
          ],
          starter: `let cache = null;

async function getJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function getNotes() {
  if (cache) return cache;
  const payload = await getJson('https://api.example.com/v1/notes');
  cache = payload;
  return cache;
}

async function retry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    return await fn();
  }
}`,
          hints: [
            '`fetch` only rejects on a network failure - a 500 arrives as a resolved response, so check `response.ok` yourself.',
            'The envelope wraps the notes in `data`; the caller wants `payload.data`, not `payload`.',
            'A `return` inside the retry loop ends it on the first failure. Catch, remember the error, and only rethrow after the loop.',
          ],
          solution: `let cache = null;

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`Request failed with status \${response.status}\`);
  }
  return response.json();
}

async function getNotes() {
  if (cache) return cache;
  try {
    const payload = await getJson('https://api.example.com/v1/notes');
    cache = payload.data ?? [];
  } catch (err) {
    console.warn('Could not load notes:', err.message);
    return [];
  }
  return cache;
}

async function retry(fn, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}`,
          checks: [
            T.js('getJson parses a healthy response', 'await (async () => { const body = await getJson("https://api.example.com/v1/notes"); return body.total === 2; })()'),
            T.js('getJson throws on a bad status', 'await (async () => { const original = fetch; fetch = async () => ({ ok: false, status: 503, json: async () => ({}) }); let message = null; try { await getJson("/x"); } catch (e) { message = e.message; } fetch = original; return message !== null && message.includes("503"); })()', '`fetch` resolves on a 503 - check `response.ok`.'),
            T.js('getNotes returns the array', 'await (async () => { cache = null; const notes = await getNotes(); return Array.isArray(notes) && notes.length === 2; })()', 'Unwrap the pagination envelope.'),
            T.js('getNotes returns note objects', 'await (async () => { cache = null; const notes = await getNotes(); return notes[0].title === "First"; })()'),
            T.js('getNotes survives a failure', 'await (async () => { cache = null; const original = fetch; fetch = async () => ({ ok: false, status: 500, json: async () => ({}) }); const notes = await getNotes(); fetch = original; cache = null; return Array.isArray(notes) && notes.length === 0; })()', 'A failed list endpoint should not blank your page.'),
            T.js('getNotes caches the unwrapped array', 'await (async () => { cache = null; const first = await getNotes(); const second = await getNotes(); return first === second && Array.isArray(second); })()', 'Cache the data the caller needs, and return the same reference.'),
            T.js('retry returns a successful value immediately', 'await (async () => { let calls = 0; const v = await retry(async () => { calls += 1; return "ok"; }, 3); return v === "ok" && calls === 1; })()'),
            T.js('retry keeps going until it succeeds', 'await (async () => { let calls = 0; const v = await retry(async () => { calls += 1; if (calls < 3) throw new Error("nope"); return calls; }, 5); return v === 3; })()'),
            T.js('retry gives up and rethrows', 'await (async () => { let calls = 0; let caught = null; try { await retry(async () => { calls += 1; throw new Error("always"); }, 3); } catch (e) { caught = e; } return caught !== null && caught.message === "always" && calls === 3; })()', 'Returning inside the loop means the first failure ends it.'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'exp-04',
      title: 'Auth, Security and Rate Limiting',
      minutes: 30,
      objectives: [
        'Hash passwords and issue sessions or tokens',
        'Close the four vulnerabilities that hit every beginner API',
        'Protect expensive endpoints with a rate limit',
      ],
      sections: [
        {
          heading: 'Passwords: hash, never encrypt',
          body:
            'Encryption is reversible, which is exactly what you do not want. Use a slow, salted hash:\n\n' +
            '```js\nimport bcrypt from "bcrypt";\n\nconst hash = await bcrypt.hash(password, 12);       // store this\nconst ok = await bcrypt.compare(attempt, hash);     // check this\n```\n\n' +
            'Never `md5` or plain `sha256` - they are fast, which is a bug when an attacker has your database. Never log a password, and never ' +
            'send it back in a response.',
        },
        {
          heading: 'Sessions versus tokens',
          body:
            '- **Session cookie** - server stores the session, the cookie just holds an id. Easy to revoke. Needs `HttpOnly; Secure; SameSite=Lax`.\n' +
            '- **JWT** - the token carries the claims and is signed, not encrypted. Stateless and easy to scale, but **you cannot revoke it** before ' +
            'it expires without a blocklist.\n\n' +
            'For a same-site web app, a session cookie is simpler and safer. Store tokens in memory or an `HttpOnly` cookie - not `localStorage`, ' +
            'where any XSS can read them.',
        },
        {
          heading: 'The four vulnerabilities to close today',
          body:
            '1. **Injection.** Never build SQL by concatenating strings: `"SELECT * FROM users WHERE id = " + id` is a hole. Use parameterised ' +
            'queries (`?` placeholders) or an ORM.\n' +
            '2. **XSS.** Never put user input into `innerHTML`. Use `textContent`, or escape on the server. Add a Content-Security-Policy header.\n' +
            '3. **Broken authorisation.** `GET /api/orders/:id` must check that the order *belongs to the requester*, not just that it exists. ' +
            'This is the most commonly missed one in real APIs.\n' +
            '4. **Excessive data exposure.** Do not return the full user row with `password_hash`. Whitelist the fields you send.',
        },
        {
          heading: 'Sample code: a protected route done properly',
          body: 'Parameterised SQL, ownership checks, rate limiting, and a whitelist on the response.',
          code: {
            lang: 'js',
            caption: 'protected.js',
            source: `import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { db } from '../db.js';

const router = Router();

router.get(
  '/api/v1/orders/:id',
  rateLimit({ windowMs: 60_000, max: 60 }),   // 60 requests per minute
  requireAuth,                                 // sets req.user or 401s
  async (req, res, next) => {
    try {
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id', code: 'BAD_ID' });
      }

      // Parameterised: the driver escapes the value, so injection is impossible.
      const { rows } = await db.query(
        'SELECT id, total, status, created_at FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, req.user.id],
      );

      const order = rows[0];
      if (!order) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });

      // Whitelisted shape - never spread a database row straight to the client.
      return res.json({
        id: order.id,
        total: order.total,
        status: order.status,
        createdAt: order.created_at,
      });
    } catch (err) {
      return next(err);          // hand it to the error handler
    }
  },
);

export default router;`,
          },
        },
      ],
      pitfalls: [
        'Storing passwords with md5 or sha256 (fast hashes are the wrong tool)',
        'String-concatenated SQL',
        'Checking that a resource exists but not that the user owns it',
        'Tokens in `localStorage`, where any XSS can exfiltrate them',
        '`cors({ origin: "*" })` together with credentials',
        'Returning the whole database row, including hashes',
      ],
      keyPoints: [
        'bcrypt (cost 12+) for passwords, never a fast hash',
        'Session cookie for same-site apps, JWT when you need statelessness',
        'Parameterised queries; `textContent` not `innerHTML`',
        'Authorisation = ownership, not existence',
      ],
      resources: [
        { label: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' },
        { label: 'MDN: Content Security Policy', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP' },
        { label: 'Node.js: Security best practices', url: 'https://nodejs.org/en/learn/getting-started/security-best-practices' },
      ],
      challenges: [
        {
          id: 'fix-security',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 18,
          lang: 'js',
          async: true,
          prelude: PRELUDE,
          prompt:
            'Four vulnerabilities in one small API: an injection-shaped query builder, a response that leaks the password hash, an authorisation ' +
            'check that only tests existence, and a rate limiter that never resets. Fix all four. The checks call your functions directly.',
          requirements: [
            '`findUserSql(id)` builds a **parameterised** query - no user value is ever concatenated into the SQL string',
            '`publicUser(row)` returns only `id`, `name` and `email` - never `passwordHash`',
            '`canAccess(user, order)` is true only when the order belongs to that user (or the user is an admin)',
            '`createRateLimiter({ windowMs, max })` resets its counter once the window passes',
            '`createRateLimiter` returns 429 `{ error: "Too many requests" }` once the limit is exceeded',
          ],
          starter: `function findUserSql(id) {
  return \`SELECT * FROM users WHERE id = \${id}\`;
}

function publicUser(row) {
  return row;
}

function canAccess(user, order) {
  return order !== undefined;
}

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    return next();
  };
}`,
          hints: [
            'Replace the interpolated value with a placeholder: `WHERE id = ?` (SQLite) or `$1` (Postgres).',
            'Whitelist the fields rather than deleting one from the row - new columns then cannot leak.',
            'Authorisation is `order.userId === user.id`, with an explicit admin bypass.',
            'A rate limiter needs a timestamp per client key, and must reset when `Date.now() - start > windowMs`.',
          ],
          solution: `function findUserSql(id) {
  // Never interpolate: the driver binds the value, so a malicious string is
  // simply a value that matches no row instead of changing the query.
  return { text: 'SELECT id, name, email FROM users WHERE id = ?', values: [id] };
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email };
}

function canAccess(user, order) {
  if (!user || !order) return false;
  if (user.role === 'admin') return true;
  return order.userId === user.id;
}

function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const key = req.ip ?? req.headers?.['x-forwarded-for'] ?? 'anonymous';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests' });
    }
    return next();
  };
}`,
          checks: [
            T.js('the query is parameterised', '(() => { const q = findUserSql(1); return typeof q === "object" && Array.isArray(q.values) && !String(q.text).includes("1"); })()'),
            T.js('injection attempts cannot change the SQL', '(() => { const q = findUserSql("1 OR 1=1"); return typeof q === "object" && !String(q.text).includes("OR 1=1"); })()', 'Validate, then bind - never concatenate.'),
            T.js('the query only selects safe columns', '!String(findUserSql(2).text).includes("*")'),
            T.js('publicUser strips the password hash', '(() => { const out = publicUser({ id: 1, name: "Ama", email: "a@b.c", passwordHash: "secret" }); return out.passwordHash === undefined && out.name === "Ama"; })()', 'Whitelist the fields you send.'),
            T.js('publicUser keeps exactly the public fields', 'JSON.stringify(Object.keys(publicUser({ id: 1, name: "A", email: "e", role: "admin", passwordHash: "x" })).sort()) === JSON.stringify(["email", "id", "name"])'),
            T.js('publicUser tolerates a missing row', 'publicUser(null) === null'),
            T.js('access is granted to the owner', 'canAccess({ id: 7 }, { userId: 7 }) === true'),
            T.js('access is denied to a stranger', 'canAccess({ id: 7 }, { userId: 8 }) === false', 'Existence is not authorisation.'),
            T.js('an admin can access anything', 'canAccess({ id: 1, role: "admin" }, { userId: 99 }) === true'),
            T.js('missing input is handled safely', 'canAccess(null, null) === false && canAccess({ id: 1 }, null) === false'),
            T.js('the rate limiter allows traffic under the limit', 'await (async () => { const limit = createRateLimiter({ windowMs: 1000, max: 3 }); let allowed = 0; for (let i = 0; i < 3; i += 1) { const res = makeRes(); limit(makeReq({ headers: { "x-forwarded-for": "1.1.1.1" } }), res, () => { allowed += 1; }); } return allowed === 3; })()'),
            T.js('the rate limiter blocks over the limit', 'await (async () => { const limit = createRateLimiter({ windowMs: 1000, max: 2 }); const req = makeReq({ headers: { "x-forwarded-for": "2.2.2.2" } }); let blocked = 0; for (let i = 0; i < 5; i += 1) { const res = makeRes(); limit(req, res, () => {}); if (res.statusCode === 429) blocked += 1; } return blocked === 3; })()', 'The fourth request should be the first rejection.'),
            T.js('the rejection carries the right body and header', 'await (async () => { const limit = createRateLimiter({ windowMs: 1000, max: 1 }); const req = makeReq({ headers: { "x-forwarded-for": "3.3.3.3" } }); limit(req, makeRes(), () => {}); const res = makeRes(); limit(req, res, () => {}); return res.statusCode === 429 && res.body.error === "Too many requests" && !!res.headers["retry-after"]; })()'),
            T.js('the window resets', 'await (async () => { const limit = createRateLimiter({ windowMs: 30, max: 1 }); const req = makeReq({ headers: { "x-forwarded-for": "4.4.4.4" } }); limit(req, makeRes(), () => {}); await new Promise((r) => setTimeout(r, 45)); const res = makeRes(); let allowed = false; limit(req, res, () => { allowed = true; }); return allowed === true && res.statusCode === 200; })()', 'Old hits must expire, or a client is locked out forever.'),
            T.js('limits are tracked per client', 'await (async () => { const limit = createRateLimiter({ windowMs: 1000, max: 1 }); limit(makeReq({ headers: { "x-forwarded-for": "5.5.5.5" } }), makeRes(), () => {}); let allowed = false; limit(makeReq({ headers: { "x-forwarded-for": "6.6.6.6" } }), makeRes(), () => { allowed = true; }); return allowed === true; })()'),
          ],
        },
        {
          id: 'write-auth',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          async: true,
          prelude: PRELUDE,
          prompt:
            'Write the authentication core: password hashing with a salt, sign-up validation, a token issuer and the middleware that guards ' +
            'protected routes. The checks exercise it end to end without any real crypto dependency - you implement the hashing yourself so the ' +
            'logic is visible.',
          requirements: [
            '`hashPassword(password, salt)` -> a stable hex digest combining both (a real project would use bcrypt; here you build the shape)',
            '`verifyPassword(password, salt, hash)` -> boolean, using a constant-time-ish comparison',
            '`validateSignup({ email, password })` -> `{ ok, errors: [{ field, error }] }` with at least 3 rules',
            '`issueToken(user, secret)` / `verifyToken(token, secret)` -> a tamper-evident token that fails when the secret or payload changes',
            '`requireAuth(secret)` -> middleware returning 401 without a valid `authorization: Bearer <token>` header, otherwise sets `req.user`',
          ],
          starter: ``,
          hints: [
            'A simple deterministic digest: fold character codes into a number, then `toString(16)`. Keep it deterministic.',
            'A "signature" is just the payload hashed together with the secret. Change either and the check fails.',
            'Bearer parsing: `String(req.get("authorization") || "").replace(/^Bearer\\s+/i, "")`.',
          ],
          solution: `function digest(input) {
  const text = String(input);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return ((h2 >>> 0) * 4294967296 + (h1 >>> 0)).toString(16);
}

function hashPassword(password, salt) {
  return digest(\`\${salt}::\${String(password)}::\${salt}\`);
}

function verifyPassword(password, salt, hash) {
  const candidate = hashPassword(password, salt);
  if (typeof hash !== 'string' || hash.length !== candidate.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

function validateSignup(input = {}) {
  const errors = [];
  const email = String(input.email ?? '').trim();
  const password = String(input.password ?? '');
  if (!email) errors.push({ field: 'email', error: 'is required' });
  else if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) errors.push({ field: 'email', error: 'is not a valid address' });
  if (!password) errors.push({ field: 'password', error: 'is required' });
  else if (password.length < 8) errors.push({ field: 'password', error: 'must be at least 8 characters' });
  else if (!/[0-9]/.test(password)) errors.push({ field: 'password', error: 'must contain a number' });
  return { ok: errors.length === 0, errors };
}

function issueToken(user, secret) {
  const body = JSON.stringify({ id: user.id, email: user.email, iat: Date.now() });
  const signature = digest(\`\${body}.\${secret}\`);
  return \`\${body}.\${signature}\`;
}

function verifyToken(token, secret) {
  const text = String(token ?? '');
  // Split on the LAST dot: the JSON body may itself contain dots (an email
  // address, for instance), while the hex signature never does.
  const dot = text.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  if (digest(\`\${body}.\${secret}\`) !== signature) return null;
  try {
    const payload = JSON.parse(body);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function requireAuth(secret) {
  return function auth(req, res, next) {
    const header = String(req.get('authorization') ?? '');
    const token = header.replace(/^Bearer\\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const user = verifyToken(token, secret);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    return next();
  };
}`,
          checks: [
            T.js('hashing is deterministic for the same salt', 'hashPassword("hunter2", "s1") === hashPassword("hunter2", "s1")'),
            T.js('the same password with a different salt differs', 'hashPassword("hunter2", "s1") !== hashPassword("hunter2", "s2")', 'That is what the salt is for.'),
            T.js('different passwords hash differently', 'hashPassword("aaaa", "s") !== hashPassword("aaab", "s")'),
            T.js('verifyPassword accepts the right password', 'verifyPassword("hunter2", "s1", hashPassword("hunter2", "s1")) === true'),
            T.js('verifyPassword rejects the wrong password', 'verifyPassword("hunter3", "s1", hashPassword("hunter2", "s1")) === false'),
            T.js('verifyPassword rejects a malformed hash', 'verifyPassword("hunter2", "s1", "nope") === false && verifyPassword("hunter2", "s1", null) === false'),
            T.js('signup accepts a valid payload', 'validateSignup({ email: "dev@example.com", password: "hunter2x" }).ok === true'),
            T.js('signup reports every problem at once', '(() => { const r = validateSignup({ email: "bad", password: "short" }); return r.ok === false && r.errors.length >= 2 && r.errors.every((e) => e.field && e.error); })()', 'Return all field errors, not just the first.'),
            T.js('signup requires a number in the password', 'validateSignup({ email: "dev@example.com", password: "abcdefgh" }).errors.some((e) => e.field === "password")'),
            T.js('signup rejects an empty payload', 'validateSignup({}).ok === false && validateSignup().ok === false'),
            T.js('a token round-trips', '(() => { const token = issueToken({ id: 5, email: "a@b.c" }, "secret"); const payload = verifyToken(token, "secret"); return payload !== null && payload.id === 5; })()'),
            T.js('a token fails with the wrong secret', '(() => { const token = issueToken({ id: 5 }, "secret"); return verifyToken(token, "other") === null; })()'),
            T.js('a tampered token fails', '(() => { const token = issueToken({ id: 5 }, "secret"); return verifyToken(token.split(".")[0] + ".deadbeef", "secret") === null; })()'),
            T.js('garbage tokens fail safely', 'verifyToken("nonsense", "secret") === null && verifyToken(undefined, "secret") === null'),
            T.js('requireAuth rejects a missing header', '(() => { const mw = requireAuth("secret"); const res = makeRes(); mw(makeReq({}), res, () => {}); return res.statusCode === 401 && res.body.error === "Missing token"; })()'),
            T.js('requireAuth rejects a bad token', '(() => { const mw = requireAuth("secret"); const res = makeRes(); mw(makeReq({ headers: { authorization: "Bearer junk.junk" } }), res, () => {}); return res.statusCode === 401 && res.body.error === "Invalid token"; })()'),
            T.js('requireAuth accepts a good token and attaches the user', '(() => { const mw = requireAuth("secret"); const token = issueToken({ id: 9, email: "a@b.c" }, "secret"); const req = makeReq({ headers: { authorization: \`Bearer \${token}\` } }); let called = false; mw(req, makeRes(), () => { called = true; }); return called === true && req.user && req.user.id === 9; })()'),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'express-capstone',
    title: 'Capstone: a real REST API with persistence',
    minutes: 300,
    brief:
      'Build the API behind a task manager: users, authentication, projects and tasks, with a database, migrations, validation, tests and ' +
      'documented endpoints.\n\n' +
      'This is the largest piece of work in the curriculum so far. Build it in slices and commit after each one - the Git module gives you the ' +
      'muscle for that now.',
    starter: `task-api/
├── package.json
├── .env.example
└── src/
    ├── server.js
    ├── app.js
    ├── config.js
    ├── db/
    │   ├── client.js
    │   └── schema.sql
    ├── middleware/
    │   ├── auth.js
    │   ├── error.js
    │   └── rate-limit.js
    └── routes/
        ├── auth.js
        ├── projects.js
        └── tasks.js`,
    requirements: [
      '`GET /health` returns `{ status: "ok" }` without touching the database',
      'Sign up and log in, with bcrypt-hashed passwords and a token or session cookie',
      'Full CRUD for projects and tasks, all scoped to the authenticated user',
      'Every list endpoint is paginated and filterable (`?page=&limit=&q=&sort=`)',
      'Input validation on every write, returning 422 with a `fields` array',
      'A single error handler producing `{ error, code, fields? }` for every failure',
      'Parameterised SQL throughout - zero string concatenation',
      'Rate limiting on the auth endpoints (10 attempts per 15 minutes per IP)',
      'A `.sql` schema file plus a `npm run migrate` script that applies it idempotently',
      'Integration tests with `node:test` and `supertest` covering the happy path and the four failure paths per route',
      'A README documenting every endpoint with a copy-pasteable curl example',
    ],
    checks: [
      'Sign up, log in, create a project, create three tasks, list them: all 2xx with correct shapes',
      'GET another user\'s task returns 404 (not 403 - do not leak existence)',
      'POST a task with a missing title returns 422 with a field error',
      'Send 11 login attempts: the 11th returns 429',
      'Send `{"title": "a".repeat(10000)}`: rejected by a max-length rule, not a crash',
      '`?limit=99999` is clamped, and `?page=abc` does not 500',
      'Kill the database and hit an endpoint: 500 with a generic message and a logged stack trace',
      'Grep the source for `+ req.` or template literals inside SQL: no matches',
      '`curl` every documented endpoint exactly as written in the README: all work',
      'The test suite passes with `npm test`, and coverage includes the error middleware',
    ],
    stretch: [
      'Add refresh tokens with rotation and revocation',
      'Add soft deletes (`deleted_at`) and a `?includeDeleted=true` parameter',
      'Add ETag support on GET endpoints',
      'Add an OpenAPI document generated from your route definitions',
      'Add request id propagation so a log line can be traced from a single response',
    ],
  },
};
