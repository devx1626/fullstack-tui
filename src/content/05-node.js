import { T } from '../core/grade.js';

/**
 * The checks here run your exported functions in a sandbox with no filesystem
 * access, so they test *your* logic (parsing, grouping, emitting) rather than
 * Node itself. The lesson code shows the real `node:fs` calls to copy into a
 * project.
 */
export default {
  id: 'node',
  title: 'Node.js',
  badge: 'ND',
  color: 'good',
  tagline: 'JavaScript outside the browser - servers, files and processes',
  hours: 7,
  why:
    'Node lets you reuse the language you already know on the server. That is the whole reason the MERN-style stack exists: one language, one ' +
    'mental model, from the input field to the database. Learn the module system, the filesystem and the event loop, and Express becomes ' +
    'almost obvious.',
  source: {
    course: 'Dave Gray - Node.js Full Course for Beginners (7h)',
    url: 'https://www.youtube.com/watch?v=f2EqECiTBL8',
    roadmap: 'https://roadmap.sh/nodejs',
    docs: 'https://nodejs.org/docs/latest-v22.x/api/',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'node-01',
      title: 'The Runtime and the Module System',
      minutes: 30,
      objectives: [
        'Explain what Node actually provides that the browser does not',
        'Split code into ES modules with import and export',
        'Read a package.json and know what each field is for',
      ],
      sections: [
        {
          heading: 'What Node is',
          body:
            'Node is the V8 JavaScript engine with the browser stripped out and system APIs added: files, processes, sockets, timers. There is no ' +
            '`window` and no `document`. Instead you get `process`, `fs`, `path`, `http`, `crypto` and about fifty more built-in modules.\n\n' +
            'It is single-threaded for your code, but its I/O is asynchronous and handled by the operating system. That is why a Node server on ' +
            'one core can hold thousands of open connections: it is not waiting for anything, it is just never blocked.',
        },
        {
          heading: 'ES modules versus CommonJS',
          body:
            'Modern Node uses ES modules. Two things must be true: the file ends in `.mjs`, or `package.json` has `"type": "module"`.\n\n' +
            '```js\n// the modern way\nimport { readFile } from "node:fs/promises";\nexport function greet(name) { return `Hello ${name}`; }\nexport default greet;\n```\n\n' +
            'You will still meet CommonJS in older packages: `const fs = require("fs")` and `module.exports = ...`. The two systems have different ' +
            'rules about *when* imports run and circular dependencies - another reason not to mix them casually.\n\n' +
            'Always import built-ins with the `node:` prefix (`node:fs`, not `fs`). It is explicit, and it prevents a package on npm from ' +
            'shadowing a built-in.',
        },
        {
          heading: 'package.json, field by field',
          body:
            '- `type: "module"` - use ESM\n' +
            '- `main` / `exports` - what other packages get when they import you\n' +
            '- `scripts` - named commands: `npm run dev`, `npm test`\n' +
            '- `dependencies` - needed at runtime\n' +
            '- `devDependencies` - needed only to build or test\n' +
            '- `engines` - the Node versions you support\n\n' +
            '`npm install` reads it; `package-lock.json` pins the exact tree and **must be committed**. Without the lock file, two machines ' +
            'install different versions of the same dependency.',
        },
        {
          heading: 'Sample code: a module you would actually write',
          body: 'Pure functions in their own module, so they can be tested without starting a server.',
          code: {
            lang: 'js',
            caption: 'lib/text.js',
            source: `// No Node APIs needed here at all - which makes it trivially testable.
export function slugify(title = '') {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function truncate(text, max = 120) {
  const s = String(text);
  return s.length <= max ? s : \`\${s.slice(0, max - 1).trimEnd()}…\`;
}

export function readingTime(words, wpm = 220) {
  return Math.max(1, Math.round(words / wpm));
}

export default { slugify, truncate, readingTime };`,
          },
        },
      ],
      pitfalls: [
        'Mixing `require` and `import` in one project',
        'Forgetting `"type": "module"` and getting "Cannot use import statement outside a module"',
        'Committing `node_modules` (never) or forgetting `package-lock.json` (also never)',
        'Using `console.log` for structured output instead of `console.error` for errors',
        'Assuming `process.cwd()` is the directory of the file - it is not: use `import.meta.dirname`',
      ],
      keyPoints: [
        'Node = V8 + system APIs; no `window`, no `document`',
        'ESM needs `"type": "module"` or `.mjs`',
        'Import built-ins with the `node:` prefix',
        'Commit `package-lock.json`, never `node_modules`',
      ],
      resources: [
        { label: 'Node.js docs: Modules', url: 'https://nodejs.org/api/packages.html' },
        { label: 'Node.js: The Absolute Beginner guide (official)', url: 'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs' },
      ],
      challenges: [
        {
          id: 'fix-module',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 10,
          lang: 'js',
          prompt:
            'Someone ported this helper module from an old CommonJS project and it broke: a leftover `require`, a `.default` lookup that no ' +
            'longer applies, a mutable export, and a slug function that leaves punctuation behind. Fix the module so its three functions behave.',
          requirements: [
            '`slugify("Hello, World!")` is `"hello-world"` with no leading, trailing or doubled separators',
            '`truncate(text, max)` never exceeds `max` characters and appends an ellipsis only when it actually truncates',
            '`readingTime(words)` is at least 1 minute and rounds to the nearest minute',
            'No `require` calls, and no `module.exports` anywhere',
          ],
          starter: `const path = require('path');

function slugify(title) {
  return title.toLowerCase().replace(' ', '-');
}

function truncate(text, max) {
  return text.slice(0, max) + '...';
}

function readingTime(words, wpm) {
  return Math.round(words / wpm);
}

module.exports = { slugify, truncate, readingTime };`,
          hints: [
            '`.replace(" ", "-")` with a string argument replaces only the first match. Use a regex with the global flag.',
            '`slice(0, max) + "..."` is longer than `max`. Only add the ellipsis when you truncated, and account for its length.',
            '`Math.round(words / undefined)` is `NaN`. Give `wpm` a default.',
          ],
          solution: `function slugify(title = '') {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function truncate(text, max = 120) {
  const s = String(text);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function readingTime(words, wpm = 220) {
  return Math.max(1, Math.round(Number(words) / wpm));
}`,
          checks: [
            T.js('slugify produces a clean slug', 'slugify("Hello, World!") === "hello-world"', 'Use a global regex to collapse punctuation runs.'),
            T.js('slugify collapses multiple separators', 'slugify("A   B -- C") === "a-b-c"'),
            T.js('slugify trims the edges', 'slugify("  Spaced  ") === "spaced"'),
            T.js('truncate leaves short text alone', 'truncate("short", 20) === "short"', 'Only add the ellipsis when you actually cut.'),
            T.js('truncate never exceeds the limit', 'truncate("a very long sentence that goes on", 10).length <= 10'),
            T.js('truncate marks the cut', 'truncate("a very long sentence that goes on", 10).endsWith("\\u2026")'),
            T.js('readingTime has a sensible default', 'readingTime(440) === 2', '`wpm` needs a default value.'),
            T.js('readingTime is at least 1', 'readingTime(10) === 1'),
            T.notSrc('No require calls', /\brequire\s*\(/, 'Use `import` with the `node:` prefix.'),
            T.notSrc('No module.exports', /module\.exports/, 'Use `export` / `export default`.'),
          ],
        },
        {
          id: 'write-module',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Write a small utilities module of the kind every Node project grows: string helpers, an id generator, and a validator. Everything ' +
            'must be a pure function with no filesystem or network access, which is exactly what makes it testable.',
          requirements: [
            '`capitalise(str)` -> first letter upper, rest lower',
            '`toKebab(str)` -> kebab-case for any input',
            '`initials(name)` -> `"Ama Kojo Mensah"` becomes `"AKM"`',
            '`makeId(prefix)` -> `prefix_` plus a unique-ish suffix; two calls must never collide',
            '`isEmail(str)` -> a pragmatic email check (one `@`, a dot in the domain, no spaces)',
            'All five functions must be pure: same input, same output, nothing global',
          ],
          starter: ``,
          hints: [
            '`str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()`',
            '`split(/\\s+/)` for names - people sometimes type double spaces.',
            'For uniqueness use a counter plus `Date.now()`, both held inside a closure.',
          ],
          solution: `let counter = 0;

function capitalise(str = '') {
  const s = String(str).trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function toKebab(str = '') {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function initials(name = '') {
  return String(name)
    .trim()
    .split(/\\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function makeId(prefix = 'id') {
  counter += 1;
  return \`\${prefix}_\${Date.now().toString(36)}\${counter.toString(36)}\`;
}

function isEmail(str = '') {
  const s = String(str).trim();
  if (/\\s/.test(s)) return false;
  const parts = s.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}`,
          checks: [
            T.js('capitalise normalises case', 'capitalise("aMA") === "Ama" && capitalise("hello world") === "Hello world"'),
            T.js('capitalise handles empty input', 'capitalise("") === "" && capitalise() === ""'),
            T.js('toKebab handles mixed input', 'toKebab("Hello World Again") === "hello-world-again" && toKebab("  spaced_OUT  ") === "spaced-out"'),
            T.js('initials handles extra whitespace', 'initials("Ama  Kojo Mensah") === "AKM"'),
            T.js('initials handles one name', 'initials("Ama") === "A" && initials("") === ""'),
            T.js('makeId uses its prefix', 'makeId("user").startsWith("user_")', 'Prefix plus separator.'),
            T.js('makeId never repeats', '(() => { const seen = new Set(); for (let i = 0; i < 500; i += 1) seen.add(makeId("x")); return seen.size === 500; })()', 'Hold a counter in a closure so two ids cannot collide.'),
            T.js('isEmail accepts real addresses', 'isEmail("dev@example.com") === true && isEmail("ama.kojo+tag@sub.domain.co") === true'),
            T.js('isEmail rejects nonsense', 'isEmail("nope") === false && isEmail("a@b") === false && isEmail("a b@c.com") === false && isEmail("@example.com") === false'),
            T.notSrc('The module has no filesystem access', /require\(|node:fs|readFileSync/, 'Keep it pure so it can be tested anywhere.'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'node-02',
      title: 'The Filesystem and Paths',
      minutes: 30,
      objectives: [
        'Read and write files with the promise API',
        'Join paths correctly on every platform',
        'Choose between sync, callback and promise styles deliberately',
      ],
      sections: [
        {
          heading: 'promises, not callbacks',
          body:
            'Every `node:fs` function has three flavours: `readFile` (callback), `readFileSync` (blocking) and, in `node:fs/promises`, ' +
            '`readFile` returning a Promise. Use the promise API with `await`.\n\n' +
            '**`...Sync` blocks the entire event loop.** A server that reads a file synchronously stops answering every other request until the ' +
            'disk responds. Sync is fine in a build script or a one-shot CLI; never in a request handler.',
          code: {
            lang: 'js',
            caption: 'fs/promises',
            source: `import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function loadNotes(dir) {
  await mkdir(dir, { recursive: true });            // idempotent
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

  return Promise.all(
    files.map(async (entry) => ({
      name: entry.name,
      body: await readFile(path.join(dir, entry.name), 'utf8'),
    })),
  );
}

export async function saveNote(dir, name, body) {
  const target = path.join(dir, name.endsWith('.md') ? name : \`\${name}.md\`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body, 'utf8');
  return target;
}`,
          },
        },
        {
          heading: 'Paths: always `path.join`',
          body:
            'String concatenation breaks on Windows, where the separator is `\\`. Use:\n\n' +
            '- `path.join("a", "b.md")` -> `a/b.md` on POSIX, `a\\b.md` on Windows\n' +
            '- `path.resolve("a", "b")` -> an absolute path, resolved against `process.cwd()`\n' +
            '- `path.basename`, `path.extname`, `path.dirname`\n' +
            '- `import.meta.dirname` - the directory of the current module (Node 20.11+)\n\n' +
            '`process.cwd()` is where you *ran* the command; `import.meta.dirname` is where the *file* lives. Mixing them up is the classic ' +
            '"works in dev, breaks in production" path bug.',
        },
        {
          heading: 'Reading a directory as a tree',
          body:
            '`fs.readdir` with `{ withFileTypes: true }` saves a `stat()` per entry, because each entry already knows whether it is a file or a ' +
            'directory. For a recursive walk you still need to recurse yourself (or pass `{ recursive: true }` on Node 20+).\n\n' +
            'Errors carry a `code`: `ENOENT` (no such file), `EACCES` (permission), `EISDIR` (it is a directory). Catching on `err.code` is ' +
            'far more robust than matching the message, which changes between locales.',
        },
        {
          heading: 'Sample code: a tiny static file server',
          body:
            'This is the whole idea behind web servers: map a URL to a path, read the file, send it with a content type. Express does exactly ' +
            'this, with a lot more care about edge cases.',
          code: {
            lang: 'js',
            caption: 'server.js',
            source: `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(ROOT, relative);

    // Stop ../ escapes from reading files outside the root
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT') res.writeHead(404).end('Not found');
    else {
      console.error(err);
      res.writeHead(500).end('Server error');
    }
  }
});

server.listen(3000, () => console.log('http://localhost:3000'));`,
          },
        },
      ],
      pitfalls: [
        'String concatenation for paths, which breaks on Windows',
        '`readFileSync` inside a request handler, blocking every other request',
        'Assuming `process.cwd()` is the project root',
        'Serving a path without checking for `..` - a directory traversal vulnerability',
        'Catching errors by message text instead of `err.code`',
      ],
      keyPoints: [
        '`node:fs/promises` with `await`; avoid `...Sync` in servers',
        '`path.join` / `path.resolve` / `import.meta.dirname`',
        '`{ withFileTypes: true }` avoids extra `stat` calls',
        'Branch on `err.code` (`ENOENT`, `EACCES`)',
      ],
      resources: [
        { label: 'Node.js: Working with file descriptors', url: 'https://nodejs.org/en/learn/manipulating-files/reading-files-with-nodejs' },
        { label: 'Node.js: Path module', url: 'https://nodejs.org/api/path.html' },
      ],
      challenges: [
        {
          id: 'fix-path-logic',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 14,
          lang: 'js',
          prompt:
            'This file-indexing module is full of the path bugs that only appear on someone else\u2019s machine: string concatenation for paths, ' +
            'a traversal hole, a case-sensitive extension check and a listing that cannot tell files from folders. Fix the pure logic; the ' +
            'checks call it directly.',
          requirements: [
            '`extOf(filename)` -> the lowercase extension including the dot, or `""` when there is none',
            '`isSafe(root, relative)` -> false when the path escapes the root via `..` or an absolute path',
            '`joinPath(root, ...parts)` -> a POSIX-style path with exactly one separator between segments',
            '`countByExtension(files)` -> `{ ".js": 2, ".md": 1 }`, extensions lowercased, extensionless files counted as `"(none)"`',
          ],
          starter: `function extOf(filename) {
  const i = filename.indexOf('.');
  return i === -1 ? '' : filename.slice(i);
}

function isSafe(root, relative) {
  return true;
}

function joinPath(root, ...parts) {
  return root + '/' + parts.join('/');
}

function countByExtension(files) {
  const out = {};
  for (const f of files) {
    out[extOf(f)] += 1;
  }
  return out;
}`,
          hints: [
            '`indexOf(".")` finds the FIRST dot. `lastIndexOf(".")` finds the extension. And `file.tar.gz` has only one extension.',
            '`isSafe` must reject `../etc/passwd` and any absolute path.',
            'Use `path.join` in real code; in this pure exercise, collapse duplicate slashes.',
            '`out[key] += 1` on an undefined key gives `NaN`. Initialise it first.',
          ],
          solution: `function extOf(filename) {
  const name = String(filename).split('/').pop();
  const i = name.lastIndexOf('.');
  if (i <= 0) return '';
  return name.slice(i).toLowerCase();
}

function isSafe(root, relative) {
  const target = String(relative);
  if (target.startsWith('/') || /^[a-zA-Z]:/.test(target)) return false;

  // Depth starts at the root. Any ".." segment that takes it below zero has
  // climbed out of the root, which is exactly the traversal we are refusing.
  let depth = 0;
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      depth -= 1;
      if (depth < 0) return false;
    } else {
      depth += 1;
    }
  }
  return true;
}

function joinPath(root, ...parts) {
  const segments = [root, ...parts]
    .map((s) => String(s).replace(/^\\/+|\\/+$/g, ''))
    .filter(Boolean);
  return segments.join('/');
}

function countByExtension(files) {
  const out = {};
  for (const f of files) {
    const key = extOf(f) || '(none)';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}`,
          checks: [
            T.js('extOf finds the extension', 'extOf("app.js") === ".js"', '`indexOf` finds the first dot.'),
            T.js('extOf lowercases it', 'extOf("STYLES.CSS") === ".css"'),
            T.js('extOf handles nested paths', 'extOf("src/lib/text.ts") === ".ts"'),
            T.js('extOf uses the last dot', 'extOf("archive.tar.gz") === ".gz"', '`lastIndexOf` is the right tool.'),
            T.js('extOf returns empty for dotfiles and no extension', 'extOf("README") === "" && extOf(".gitignore") === ""'),
            T.js('isSafe allows a normal relative path', 'isSafe("/srv/app", "public/index.html") === true'),
            T.js('isSafe blocks parent traversal', 'isSafe("/srv/app", "../../etc/passwd") === false', 'Walk the segments and never pop past the root.'),
            T.js('isSafe blocks a plain .. escape', 'isSafe("public", "../secret.txt") === false'),
            T.js('isSafe blocks absolute paths', 'isSafe("/srv/app", "/etc/passwd") === false'),
            T.js('isSafe allows an internal ..', 'isSafe("/srv/app/assets", "img/../style.css") === true', 'Going up and back down inside the root is fine.'),
            T.js('joinPath produces one separator', 'joinPath("/srv/app/", "/public/", "index.html") === "srv/app/public/index.html" || joinPath("/srv/app/", "/public/", "index.html") === "/srv/app/public/index.html"'),
            T.js('joinPath handles a single part', 'joinPath("root", "file.txt") === "root/file.txt"'),
            T.js('countByExtension counts correctly', 'JSON.stringify(countByExtension(["a.js", "b.js", "c.md"])) === JSON.stringify({ ".js": 2, ".md": 1 })'),
            T.js('countByExtension handles extensionless files', 'JSON.stringify(countByExtension(["README", "LICENSE"])) === JSON.stringify({ "(none)": 2 })'),
            T.js('countByExtension does not produce NaN', 'Object.values(countByExtension(["one.js"])).every((n) => Number.isFinite(n))', 'Initialise the counter before incrementing.'),
          ],
        },
        {
          id: 'write-file-index',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Write the pure core of a static site builder: turn a list of file paths into a sorted, grouped index, and generate the output path ' +
            'for each source file. Pure functions, so the checks can run them directly - in the lesson code above they are wrapped in real ' +
            '`fs` calls.',
          requirements: [
            '`indexFiles(paths)` -> `[{ path, dir, name, ext }]`, sorted by path',
            '`byExtension(files)` -> a map of extension to the sorted list of paths',
            '`outputPath(source, outDir)` -> `posts/one.md` becomes `outDir/posts/one.html`',
            '`totalBytes(files)` -> sums a `size` property, treating missing sizes as 0',
            'No mutation of the input array',
          ],
          starter: ``,
          hints: [
            '`split("/").pop()` for the name, `slice(0, -1).join("/")` for the directory.',
            '`toSorted` avoids mutating the input.',
            'For `outputPath`, replace only the final extension: `name.replace(/\\.[^.]+$/, ".html")`.',
          ],
          solution: `function indexFiles(paths = []) {
  return paths
    .map((p) => {
      const parts = String(p).split('/');
      const name = parts[parts.length - 1];
      const dir = parts.slice(0, -1).join('/');
      const i = name.lastIndexOf('.');
      const ext = i > 0 ? name.slice(i).toLowerCase() : '';
      return { path: String(p), dir, name, ext };
    })
    .toSorted((a, b) => a.path.localeCompare(b.path));
}

function byExtension(files = []) {
  return files.reduce((acc, file) => {
    const key = file.ext || '(none)';
    (acc[key] ??= []).push(file.path);
    return acc;
  }, {});
}

function outputPath(source, outDir = 'dist') {
  const parts = String(source).split('/');
  const name = parts.pop().replace(/\\.[^.]+$/, '.html');
  return [outDir.replace(/\\/+$/, ''), ...parts, name].join('/');
}

function totalBytes(files = []) {
  return files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
}`,
          checks: [
            T.js('indexFiles splits path, dir, name and ext', 'JSON.stringify(indexFiles(["posts/one.md"])[0]) === JSON.stringify({ path: "posts/one.md", dir: "posts", name: "one.md", ext: ".md" })'),
            T.js('indexFiles handles a root-level file', 'indexFiles(["index.html"])[0].dir === "" && indexFiles(["index.html"])[0].ext === ".html"'),
            T.js('indexFiles is sorted', 'JSON.stringify(indexFiles(["b.js", "a.js"]).map((f) => f.path)) === JSON.stringify(["a.js", "b.js"])'),
            T.js('indexFiles does not mutate its input', '(() => { const input = ["b.js", "a.js"]; indexFiles(input); return JSON.stringify(input) === JSON.stringify(["b.js", "a.js"]); })()'),
            T.js('byExtension groups and keeps order', 'JSON.stringify(byExtension(indexFiles(["b.js", "a.md", "a.js"]))) === JSON.stringify({ ".js": ["a.js", "b.js"], ".md": ["a.md"] })'),
            T.js('byExtension handles extensionless files', 'JSON.stringify(byExtension(indexFiles(["README"]))) === JSON.stringify({ "(none)": ["README"] })'),
            T.js('outputPath rewrites the extension', 'outputPath("posts/one.md", "dist") === "dist/posts/one.html"'),
            T.js('outputPath keeps nested directories', 'outputPath("a/b/c.txt", "build") === "build/a/b/c.html"'),
            T.js('outputPath tolerates a trailing slash', 'outputPath("index.md", "dist/") === "dist/index.html"'),
            T.js('totalBytes sums sizes', 'totalBytes([{ size: 10 }, { size: 5 }]) === 15'),
            T.js('totalBytes treats missing sizes as 0', 'totalBytes([{ size: 10 }, {}, { size: null }]) === 10'),
            T.js('totalBytes handles an empty list', 'totalBytes([]) === 0'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'node-03',
      title: 'Events, Streams and the Event Loop',
      minutes: 30,
      objectives: [
        'Decode a callback-first API into a promise without a library',
        'Use EventEmitter to decouple parts of an application',
        'Know when to stream instead of buffering',
      ],
      sections: [
        {
          heading: 'Callbacks, promises and promisifying',
          body:
            'The old Node convention is `(err, value) => {}`. Modern code uses promises, and Node ships a helper:\n\n' +
            '```js\nimport { promisify } from "node:util";\nimport { readFile } from "node:fs";\nconst read = promisify(readFile);\n```\n\n' +
            'Writing your own is three lines, and doing it once teaches you the shape of every async API you will meet:\n\n' +
            '```js\nfunction once(fn) {\n  return (...args) => new Promise((resolve, reject) => {\n    fn(...args, (err, value) => (err ? reject(err) : resolve(value)));\n  });\n}\n```',
        },
        {
          heading: 'EventEmitter: the publish/subscribe built into Node',
          body:
            'Almost every Node object is an emitter: `http.Server`, `process`, streams. The pattern is `on(type, handler)` to subscribe and ' +
            '`emit(type, payload)` to publish.\n\n' +
            'Two rules worth remembering:\n' +
            '1. **An `error` event with no listener throws.** Always attach an error handler.\n' +
            '2. Emitters are synchronous - listeners run before `emit()` returns. A slow listener blocks the emitter.',
          code: {
            lang: 'js',
            caption: 'events.js',
            source: `import { EventEmitter } from 'node:events';

export class Cart extends EventEmitter {
  #items = [];

  add(item) {
    this.#items.push(item);
    this.emit('add', item);
    if (this.#items.length > 20) this.emit('limit', this.#items.length);
    return this;
  }

  get total() {
    return this.#items.reduce((sum, i) => sum + i.price, 0);
  }
}

const cart = new Cart();
cart.on('add', (item) => console.log('added', item.name));
cart.on('limit', (n) => console.warn('cart is getting big:', n));
cart.on('error', (err) => console.error('cart failed:', err.message));

cart.add({ name: 'Bread', price: 5 });`,
          },
        },
        {
          heading: 'Streams: for data you cannot hold in memory',
          body:
            '`readFile` puts the whole file in memory. For a 2GB log or an HTTP upload, you stream: read a chunk, process it, throw it away.\n\n' +
            '```js\nimport { createReadStream } from "node:fs";\nimport { createInterface } from "node:readline";\n\nconst lines = createInterface({\n  input: createReadStream("access.log"),\n  crlfDelay: Infinity,\n});\n\nfor await (const line of lines) {\n  if (line.includes(" 500 ")) console.log(line);\n}\n```\n\n' +
            'The bigger idea is **backpressure**: a stream tells you to slow down when the destination cannot keep up. `pipe()` handles that for ' +
            'you automatically.',
        },
        {
          heading: 'Sample code: the event loop, in order',
          body: 'Predict the output before you run it. If you get it right, you understand the concurrency model.',
          code: {
            lang: 'js',
            caption: 'loop.js',
            source: `console.log('1 - start');

process.nextTick(() => console.log('2 - nextTick (before promises)'));

Promise.resolve().then(() => console.log('3 - microtask'));

setTimeout(() => console.log('4 - timer (macrotask)'), 0);

setImmediate(() => console.log('5 - immediate'));

queueMicrotask(() => console.log('6 - queued microtask'));

console.log('7 - end of the synchronous block');

// Order: 1, 7, 2, 3, 6, 4, 5 (timers vs immediates can swap - they are
// different queues drained in the same phase of the loop).`,
          },
        },
      ],
      pitfalls: [
        'Emitting `error` with no listener, which throws and crashes the process',
        'Buffering a huge file with `readFile` instead of streaming',
        'Assuming `setTimeout(fn, 0)` runs before promise callbacks (it does not)',
        'Doing heavy synchronous work in a listener, blocking every other event',
        'Forgetting to `removeListener`, which leaks memory in long-running processes',
      ],
      keyPoints: [
        '`emit` is synchronous; listeners run before it returns',
        'An unhandled `error` event throws',
        'Microtasks (promises) run before macrotasks (timers)',
        'Streams for anything that might not fit in memory',
      ],
      resources: [
        { label: 'Node.js: The event loop', url: 'https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick' },
        { label: 'Node.js: Streams', url: 'https://nodejs.org/api/stream.html' },
        { label: 'Jake Archibald: In the loop', url: 'https://www.youtube.com/watch?v=cCOL7MC4Pl0' },
      ],
      challenges: [
        {
          id: 'write-emitter',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Build a small event emitter from scratch. This is the exercise that makes callbacks, hooks and frameworks stop being magic - and ' +
            'the checks exercise your emitter directly.',
          requirements: [
            '`createEmitter()` returns an object with `on`, `once`, `off`, `emit` and `listeners`',
            '`on(type, fn)` returns an unsubscribe function',
            '`once(type, fn)` fires at most once',
            '`off(type, fn)` removes a specific handler',
            '`emit(type, ...args)` returns the number of handlers that ran',
            'A handler that throws must not stop the others: run them all, then rethrow the first error',
            '`listeners(type)` returns the current handler count',
          ],
          starter: ``,
          hints: [
            'Keep an object of arrays: `{ type: [fn, ...] }`.',
            'Iterate over a copy (`[...handlers]`) inside `emit` so a handler can unsubscribe during dispatch.',
            'Wrap each handler call in its own `try/catch`, keep the first error, and throw it once the loop is done.',
            '`once` wraps the handler with a function that removes itself first, then calls through.',
          ],
          solution: `function createEmitter() {
  const handlers = new Map();

  const on = (type, fn) => {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
    return () => off(type, fn);
  };

  const once = (type, fn) => {
    const wrapped = (...args) => {
      off(type, wrapped);
      return fn(...args);
    };
    return on(type, wrapped);
  };

  const off = (type, fn) => {
    const list = handlers.get(type);
    if (!list) return false;
    const next = list.filter((h) => h !== fn);
    handlers.set(type, next);
    return next.length !== list.length;
  };

  const emit = (type, ...args) => {
    const list = handlers.get(type);
    if (!list) return 0;

    let ran = 0;
    let firstError = null;
    for (const fn of [...list]) {
      try {
        fn(...args);
      } catch (err) {
        if (!firstError) firstError = err;
      }
      ran += 1;
    }

    // Every listener gets its turn; the first failure is rethrown afterwards.
    if (firstError) throw firstError;
    return ran;
  };

  return {
    on,
    once,
    off,
    emit,
    listeners: (type) => (handlers.get(type) || []).length,
  };
}`,
          checks: [
            T.js('on registers a handler that receives the payload', '(() => { const e = createEmitter(); let got = null; e.on("save", (v) => { got = v; }); e.emit("save", 42); return got === 42; })()'),
            T.js('emit reports how many handlers ran', '(() => { const e = createEmitter(); e.on("x", () => {}); e.on("x", () => {}); return e.emit("x") === 2; })()'),
            T.js('emit on an unknown event is harmless', '(() => { const e = createEmitter(); return e.emit("nothing") === 0; })()'),
            T.js('the payload is passed through', '(() => { const e = createEmitter(); let args = null; e.on("multi", (...a) => { args = a; }); e.emit("multi", 1, 2, 3); return JSON.stringify(args) === "[1,2,3]"; })()'),
            T.js('once fires exactly once', '(() => { const e = createEmitter(); let calls = 0; e.once("tick", () => { calls += 1; }); e.emit("tick"); e.emit("tick"); return calls === 1; })()'),
            T.js('once is removed from the listener count', '(() => { const e = createEmitter(); e.once("a", () => {}); e.emit("a"); return e.listeners("a") === 0; })()'),
            T.js('off removes a specific handler', '(() => { const e = createEmitter(); const a = () => {}; const b = () => {}; e.on("x", a); e.on("x", b); e.off("x", a); return e.listeners("x") === 1 && e.emit("x") === 1; })()'),
            T.js('on returns a working unsubscribe function', '(() => { const e = createEmitter(); const stop = e.on("x", () => {}); stop(); return e.listeners("x") === 0; })()'),
            T.js('handlers can unsubscribe during dispatch', '(() => { const e = createEmitter(); let calls = 0; const stop = e.on("x", () => { calls += 1; stop(); }); e.emit("x"); e.emit("x"); return calls === 1; })()'),
            T.js('errors in one handler do not break the others', '(() => { const e = createEmitter(); let second = false; e.on("x", () => { throw new Error("boom"); }); e.on("x", () => { second = true; }); try { e.emit("x"); } catch {} return second === true; })()'),
            T.js('events do not leak between instances', '(() => { const a = createEmitter(); const b = createEmitter(); a.on("x", () => {}); return b.listeners("x") === 0; })()'),
          ],
        },
        {
          id: 'fix-promisify',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'js',
          async: true,
          mockFetch: { 'https://api.example.com/data': { ok: true } },
          prompt:
            'This promise plumbing has four bugs that only show under failure: a swallowed rejection, a resolved error value, a `once` that does ' +
            'not remember, and a retry that never gives up. Fix them. The checks call your helpers with deliberately awkward inputs.',
          requirements: [
            '`promisify(fn)` converts a `(arg, callback)` function into one returning a Promise',
            '`withTimeout(promise, ms)` rejects with an Error saying it timed out when the promise is too slow',
            '`retry(fn, attempts)` retries on rejection up to `attempts` times, then rethrows the last error',
            '`settle(promise)` never rejects: returns `{ ok, value }` or `{ ok: false, error }`',
          ],
          starter: `function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => {
    fn(...args, (value) => resolve(value));
  });
}

function withTimeout(promise, ms) {
  return promise;
}

async function retry(fn, attempts) {
  while (true) {
    try {
      return await fn();
    } catch (err) {
      continue;
    }
  }
}

async function settle(promise) {
  const value = await promise;
  return { ok: true, value };
}`,
          hints: [
            'A Node callback is `(err, value)`. Ignoring the first argument turns failures into silent successes.',
            '`Promise.race` against a rejecting timer gives you a timeout.',
            '`while (true)` never stops on failure - count your attempts.',
            '`settle` must wrap the await in a `try/catch` or it will still reject.',
          ],
          solution: `function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => {
    fn(...args, (err, value) => (err ? reject(err) : resolve(value)));
  });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Operation timed out after ' + ms + 'ms')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function retry(fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}`,
          checks: [
            T.js('promisify resolves with the callback value', 'await promisify((arg, cb) => cb(null, arg * 2))(21) === 42'),
            T.js('promisify rejects when the callback errors', 'await (async () => { try { await promisify((arg, cb) => cb(new Error("nope")))(1); return false; } catch (e) { return e.message === "nope"; } })()', 'A callback is `(err, value)` - handle the first argument.'),
            T.js('promisify passes multiple arguments', 'await promisify((a, b, cb) => cb(null, a + b))(2, 3) === 5', 'Forward all args before the callback.'),
            T.js('withTimeout resolves fast promises', 'await withTimeout(Promise.resolve("done"), 50) === "done"'),
            T.js('withTimeout rejects slow promises', 'await (async () => { try { await withTimeout(new Promise((r) => setTimeout(() => r("late"), 60)), 10); return false; } catch (e) { return /timed out|timeout/i.test(e.message); } })()'),
            T.js('retry returns after the first success', 'await (async () => { let calls = 0; const value = await retry(async () => { calls += 1; return "ok"; }, 3); return value === "ok" && calls === 1; })()'),
            T.js('retry keeps trying until it succeeds', 'await (async () => { let calls = 0; const value = await retry(async () => { calls += 1; if (calls < 3) throw new Error("nope"); return calls; }, 5); return value === 3; })()'),
            T.js('retry gives up and rethrows', 'await (async () => { let calls = 0; try { await retry(async () => { calls += 1; throw new Error("always"); }, 3); return false; } catch (e) { return e.message === "always" && calls === 3; } })()', 'A `while (true)` loop never stops.'),
            T.js('settle reports success', 'JSON.stringify(await settle(Promise.resolve(7))) === JSON.stringify({ ok: true, value: 7 })'),
            T.js('settle never rejects', 'await (async () => { try { const r = await settle(Promise.reject(new Error("bad"))); return r.ok === false && r.error === "bad"; } catch (e) { return false; } })()', 'Wrap the await in try/catch.'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'node-04',
      title: 'Configuration, Errors and Processes',
      minutes: 25,
      objectives: [
        'Load configuration from environment variables safely',
        'Throw structured errors instead of strings',
        'Validate input at the boundary, not in every function',
      ],
      sections: [
        {
          heading: 'Environment variables, and never committing secrets',
          body:
            '`process.env.PORT` is a **string**. `if (process.env.DEBUG)` is true for the string `"false"`. Convert deliberately:\n\n' +
            '```js\nconst port = Number(process.env.PORT ?? 3000);\nconst debug = process.env.DEBUG === "true";\n```\n\n' +
            'Node 20+ can load a `.env` file itself with `node --env-file=.env server.js`, so `dotenv` is now optional. Commit a `.env.example` ' +
            'with the keys and dummy values, and put `.env` in `.gitignore`.',
        },
        {
          heading: 'Validate once, at startup',
          body:
            'The worst failure mode is a missing `DATABASE_URL` discovered on the first request in production. Read and validate every ' +
            'variable at boot, and crash loudly if one is missing:\n\n' +
            '```js\nfunction required(name) {\n  const value = process.env[name];\n  if (!value) throw new Error(`Missing required environment variable: ${name}`);\n  return value;\n}\n\nconst config = Object.freeze({\n  port: Number(process.env.PORT ?? 3000),\n  dbUrl: required("DATABASE_URL"),\n  nodeEnv: process.env.NODE_ENV ?? "development",\n});\n```\n\n' +
            'Freezing the object means nothing can quietly reassign it later.',
        },
        {
          heading: 'Structured errors and exit codes',
          body:
            '```js\nexport class AppError extends Error {\n  constructor(message, { status = 500, code = "INTERNAL" } = {}) {\n    super(message);\n    this.name = "AppError";\n    this.status = status;\n    this.code = code;\n  }\n}\n```\n\n' +
            'Two payoffs: a single error handler can turn `status` into an HTTP response, and you can distinguish expected failures ("user not ' +
            'found") from unexpected ones ("the database is gone") without matching message text.\n\n' +
            'Processes signal failure with an exit code: `0` is success. `process.exitCode = 1` lets pending work finish; `process.exit(1)` ' +
            'kills immediately. Prefer the former, and always log before exiting.',
        },
        {
          heading: 'Sample code: config, errors and a graceful shutdown together',
          body: 'This is the boilerplate that separates a script from a service.',
          code: {
            lang: 'js',
            caption: 'config.js',
            source: `export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'INTERNAL';
    this.expected = options.status !== undefined;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(\`Missing required environment variable: \${name}\`);
  return value;
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  logLevel: ['debug', 'info', 'warn', 'error'].includes(process.env.LOG_LEVEL)
    ? process.env.LOG_LEVEL
    : 'info',
});

// Graceful shutdown: stop accepting connections, finish in-flight work, then exit.
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    console.log(\`\${signal} received, shutting down\`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exitCode = 1;
});`,
          },
        },
      ],
      pitfalls: [
        'Treating `process.env.FLAG` as a boolean - it is the string `"false"` when false',
        '`process.exit(1)` in the middle of a write, truncating data',
        'Logging secrets in error output',
        'Throwing strings instead of `Error` objects, which lose the stack trace',
        'Reading config lazily inside request handlers, so a missing variable only fails in production',
      ],
      keyPoints: [
        '`process.env` values are always strings - convert explicitly',
        'Validate configuration at startup and crash loudly',
        'Custom `Error` subclasses with `status` and `code`',
        '`process.exitCode` lets in-flight work finish',
      ],
      resources: [
        { label: 'Node.js: Reading environment variables', url: 'https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs' },
        { label: 'The Twelve-Factor App: Config', url: 'https://12factor.net/config' },
      ],
      challenges: [
        {
          id: 'fix-config',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 14,
          lang: 'js',
          prompt:
            'This configuration module has the four bugs that show up in every codebase eventually: a boolean parsed as a string, a port that is ' +
            'not a number, a required value that silently becomes undefined, and an error that loses its stack trace. Fix them.',
          requirements: [
            '`parseEnv(text)` -> an object of key/value pairs, ignoring comments and blank lines, stripping quotes',
            '`asBool(value, fallback)` -> a real boolean, understanding `"true"`, `"1"`, `"yes"`, `"on"` and their negatives',
            '`asPort(value, fallback)` -> an integer in 1..65535, or the fallback',
            '`buildConfig(env)` -> freezes its result and throws when a required key is missing',
          ],
          starter: `function parseEnv(text) {
  const out = {};
  for (const line of text.split('\\n')) {
    const [key, value] = line.split('=');
    out[key] = value;
  }
  return out;
}

function asBool(value, fallback) {
  return value;
}

function asPort(value, fallback) {
  return value;
}

function buildConfig(env) {
  return {
    port: env.PORT,
    debug: env.DEBUG,
    dbUrl: env.DATABASE_URL,
  };
}`,
          hints: [
            'Split on the **first** `=`: `line.indexOf("=")`, not `split("=")`, or a URL query string breaks.',
            'Skip lines that are empty or start with `#`, and strip matching quotes from the value.',
            '`asBool` should accept `true/1/yes/on` and `false/0/no/off` case-insensitively, with a fallback for anything else.',
            '`Object.freeze` returns the object - so `return Object.freeze({ ... })`.',
          ],
          solution: `function parseEnv(text) {
  const out = {};

  for (const rawLine of String(text).split('\\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    out[key] = value;
  }

  return out;
}

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;

  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function asPort(value, fallback = 3000) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

function buildConfig(env) {
  if (!env || typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL === '') {
    throw new Error('DATABASE_URL is required');
  }

  return Object.freeze({
    port: asPort(env.PORT, 3000),
    debug: asBool(env.DEBUG, false),
    dbUrl: env.DATABASE_URL,
  });
}`,
          checks: [
            T.js('parseEnv reads simple pairs', 'JSON.stringify(parseEnv("PORT=3000\\nDEBUG=true")) === JSON.stringify({ PORT: "3000", DEBUG: "true" })'),
            T.js('parseEnv ignores comments and blanks', 'JSON.stringify(parseEnv("# comment\\n\\nPORT=3000\\n")) === JSON.stringify({ PORT: "3000" })'),
            T.js('parseEnv strips surrounding quotes', 'parseEnv("NAME=\\"Dev\\"").NAME === "Dev"'),
            T.js('parseEnv keeps values containing =', 'parseEnv("URL=postgres://a?x=1").URL === "postgres://a?x=1"', 'Split on the first `=` only.'),
            T.js('asBool understands true-like values', 'asBool("true", false) === true && asBool("1", false) === true && asBool("yes", false) === true && asBool("on", false) === true'),
            T.js('asBool understands false-like values', 'asBool("false", true) === false && asBool("0", true) === false && asBool("no", true) === false'),
            T.js('asBool falls back for junk', 'asBool(undefined, true) === true && asBool("maybe", false) === false', 'The string "false" is truthy - that is the trap.'),
            T.js('asPort accepts a valid port', 'asPort("8080", 3000) === 8080'),
            T.js('asPort rejects out-of-range ports', 'asPort("0", 3000) === 3000 && asPort("70000", 3000) === 3000 && asPort("abc", 3000) === 3000'),
            T.js('buildConfig returns real types', 'typeof buildConfig({ PORT: "4000", DEBUG: "true", DATABASE_URL: "x" }).port === "number" && buildConfig({ PORT: "4000", DEBUG: "true", DATABASE_URL: "x" }).debug === true'),
            T.js('buildConfig throws when a required key is missing', '(() => { try { buildConfig({ PORT: "3000" }); return false; } catch (e) { return e instanceof Error; } })()'),
            T.js('buildConfig freezes its result', 'Object.isFrozen(buildConfig({ PORT: "3000", DEBUG: "false", DATABASE_URL: "x" }))'),
          ],
        },
        {
          id: 'write-error-handling',
          kind: 'write',
          difficulty: 'hard',
          minutes: 16,
          lang: 'js',
          prompt:
            'Write the error-handling layer you would want in a real service: a typed error class, a wrapper that adds context, a safe runner ' +
            'and an HTTP status mapper. The checks drive it with plain values and thrown non-errors.',
          requirements: [
            '`AppError` extends `Error`, sets `name = "AppError"`, and carries `status` and `code`',
            '`wrapError(err, message)` returns an AppError preserving the original as `cause` and the original `status` when present',
            '`safeRun(fn)` returns `[result, null]` or `[null, error]`, and never throws',
            '`toHttpResponse(err)` returns `{ status, body: { error, code } }`, defaulting to 500/INTERNAL',
            'Non-Error throwables (a string, a number) must still be handled',
          ],
          starter: ``,
          hints: [
            '`super(message, { cause })` is the modern way to chain errors (Node 16.9+).',
            '`safeRun` needs a try/catch and it must catch non-Error throws too.',
            'Preserve an existing status with `err?.status ?? 500`.',
          ],
          solution: `class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'INTERNAL';
    this.expected = options.status !== undefined;
  }
}

function wrapError(err, message = 'Unexpected failure') {
  if (err instanceof AppError) return err;
  return new AppError(err && err.message ? err.message : String(err), {
    cause: err,
    status: err && err.status,
    code: err && err.code,
  });
}

function safeRun(fn) {
  try {
    return [fn(), null];
  } catch (error) {
    return [null, wrapError(error)];
  }
}

function toHttpResponse(err) {
  const error = wrapError(err);
  return {
    status: error.status,
    body: { error: error.message, code: error.code },
  };
}`,
          checks: [
            T.js('AppError is a real Error subclass', 'new AppError("x") instanceof Error && new AppError("x") instanceof AppError'),
            T.js('AppError carries status and code', '(() => { const e = new AppError("nope", { status: 404, code: "NOT_FOUND" }); return e.status === 404 && e.code === "NOT_FOUND" && e.name === "AppError"; })()'),
            T.js('AppError defaults to 500 INTERNAL', '(() => { const e = new AppError("boom"); return e.status === 500 && e.code === "INTERNAL"; })()'),
            T.js('AppError keeps a cause', '(() => { const root = new Error("disk"); const e = new AppError("wrapped", { cause: root }); return e.cause === root; })()'),
            T.js('wrapError preserves an AppError untouched', '(() => { const e = new AppError("x", { status: 400 }); return wrapError(e) === e; })()'),
            T.js('wrapError converts a plain Error', '(() => { const w = wrapError(new Error("plain")); return w instanceof AppError && w.message === "plain" && w.cause instanceof Error; })()'),
            T.js('wrapError keeps an existing status', 'wrapError({ message: "gone", status: 410 }).status === 410'),
            T.js('wrapError survives a thrown string', '(() => { const w = wrapError("just text"); return w instanceof AppError && w.message === "just text"; })()'),
            T.js('safeRun returns a value tuple', 'JSON.stringify(safeRun(() => 42)) === JSON.stringify([42, null])'),
            T.js('safeRun returns an error tuple without throwing', '(() => { const [value, error] = safeRun(() => { throw new Error("bad"); }); return value === null && error instanceof AppError && error.message === "bad"; })()'),
            T.js('safeRun handles a thrown non-error', '(() => { const [value, error] = safeRun(() => { throw 7; }); return value === null && error.message === "7"; })()'),
            T.js('toHttpResponse maps status and body', 'JSON.stringify(toHttpResponse(new AppError("missing", { status: 404, code: "NOT_FOUND" }))) === JSON.stringify({ status: 404, body: { error: "missing", code: "NOT_FOUND" } })'),
            T.js('toHttpResponse defaults unknown errors to 500', 'toHttpResponse(new Error("kaboom")).status === 500 && toHttpResponse("weird").status === 500'),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'node-capstone',
    title: 'Capstone: a command line tool that does real work',
    minutes: 180,
    brief:
      'Build a CLI that indexes a directory of markdown files and generates a JSON manifest plus an HTML index page. This is the exercise that ' +
      'makes the filesystem, paths, streams and error handling concrete.\n\n' +
      'Target: `node src/index.js ./notes --out ./dist`. It should run on any folder of markdown files without modification.',
    starter: `notes-cli/
├── package.json      { "type": "module" }
├── .env.example
├── .gitignore
└── src/
    ├── index.js      # argv parsing + the run loop
    ├── config.js     # env + flags -> frozen config
    ├── walk.js       # recursive directory listing
    ├── parse.js      # front matter + excerpt extraction
    └── render.js     # manifest JSON + index.html`,
    requirements: [
      '`node src/index.js <dir>` works, and `--out <dir>` changes the destination (default `./dist`)',
      '`--help` prints usage and exits with code 0; a missing directory exits with code 1 and a clear message',
      'A recursive walk using `readdir` + `withFileTypes`, ignoring `node_modules` and dotfiles',
      'Front matter parsing: `--- key: value ---` becomes an object; malformed front matter is a warning, not a crash',
      'Every file object carries `path`, `slug`, `title`, `excerpt`, `words`, `readingTime` and `mtime`',
      'Output: `dist/manifest.json` (sorted, pretty-printed) and `dist/index.html` (a list of links, escaped)',
      'Parallel reads with `Promise.all`, not a sequential `await` in a loop',
      'Structured errors: an `AppError` class with a `code`, and every caught error reported with `console.error`',
      'A `--json` flag that prints the manifest to stdout instead of writing files',
      'A SIGINT handler that finishes the current write before exiting',
    ],
    checks: [
      'Run it on a folder with 3 markdown files: manifest.json has exactly 3 entries, sorted by slug',
      'Run it on a file (not a directory): exits 1 with a message, does not throw a stack trace',
      'Run it with a missing `--out` value: exits 1 with usage',
      'A markdown file with no front matter still gets a title derived from its first heading, or its filename',
      'A markdown file with unclosed front matter produces a warning and the file still appears in the manifest',
      'The HTML output escapes `<script>` in a note title',
      'Run it twice: the second run overwrites cleanly and does not duplicate entries',
      'Deleting a file and re-running removes it from the manifest',
      'Timing 200 files: it finishes faster than a sequential version (log the duration and compare)',
      '`node --check` passes on every source file',
    ],
    stretch: [
      'Add a `--watch` mode using `fs.watch` that re-indexes on change',
      'Add word-level search: `--search "rebase"` filters the manifest',
      'Publish it as a local package with a `bin` entry so `npx notes-cli` works',
      'Add a `--csv` output using streams',
      'Add tests with `node:test` and run them in CI',
    ],
  },
};
