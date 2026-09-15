import { T } from '../core/grade.js';

/**
 * The operational side of fullstack work: configuration, containers, pipelines,
 * logging, graceful shutdown, migrations and flags.
 *
 * Everything that can be executed is: config loaders, redactors, Dockerfile and
 * workflow linters, deploy planners, loggers, shutdown coordinators, migration
 * planners, flag gates and release gates all run for real against fakes you
 * inject. The Dockerfiles and workflow files themselves are graded structurally
 * (`T.src`) because they are not JavaScript - but you also write the linter that
 * would catch those mistakes, which is the skill that lasts.
 */
const DOCKER_PRELUDE = `
const __dockerSamples = {
  good: \`FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["node", "dist/index.js"]
\`,
  rootAndDeps: \`FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm test

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app .
USER root
RUN npm ci
CMD ["node", "src/index.js"]
\`,
  cacheBusting: \`FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm install

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app .
USER node
HEALTHCHECK CMD node -e "process.exit(0)"
CMD ["node", "src/index.js"]
\`,
  singleStage: \`FROM node:latest
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev
COPY . .
USER node
HEALTHCHECK CMD node -e "process.exit(0)"
CMD ["node", "src/index.js"]
\`,
};
`;

const WORKFLOW_PRELUDE = `
const __workflows = {
  good: {
    name: 'CI',
    concurrency: { group: 'ci-\${{ github.ref }}', 'cancel-in-progress': true },
    on: { push: { branches: ['main'] }, pull_request: {} },
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        strategy: { matrix: { node: [20, 22] } },
        steps: [
          { uses: 'actions/checkout@v4' },
          { uses: 'actions/setup-node@v4', with: { 'node-version': '\${{ matrix.node }}', cache: 'npm' } },
          { run: 'npm ci' },
          { run: 'npm test' },
          { run: 'npm run build' },
        ],
      },
      deploy: {
        'runs-on': 'ubuntu-latest',
        needs: 'build',
        if: "github.ref == 'refs/heads/main'",
        steps: [
          { uses: 'actions/checkout@v4' },
          { run: 'npm run deploy', env: { API_TOKEN: '\${{ secrets.API_TOKEN }}' } },
        ],
      },
    },
  },
  noCheckout: {
    concurrency: { group: 'ci' },
    on: { push: {} },
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        steps: [{ run: 'npm ci' }, { run: 'npm test' }],
      },
    },
  },
  noTests: {
    concurrency: { group: 'ci' },
    on: { push: {} },
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        steps: [{ uses: 'actions/checkout@v4' }, { uses: 'actions/setup-node@v4' }, { run: 'npm ci' }, { run: 'npm run build' }],
      },
    },
  },
  floatingAction: {
    concurrency: { group: 'ci' },
    on: { push: {} },
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        steps: [{ uses: 'actions/checkout@main' }, { run: 'npm ci' }, { run: 'npm test' }],
      },
    },
  },
  deployOnPr: {
    on: { push: {}, pull_request: {} },
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        steps: [{ uses: 'actions/checkout@v4' }, { run: 'npm ci' }, { run: 'npm test' }],
      },
      deploy: {
        'runs-on': 'ubuntu-latest',
        needs: 'build',
        steps: [{ uses: 'actions/checkout@v4' }, { run: 'npm run deploy' }],
      },
    },
  },
  plainSecret: {
    concurrency: { group: 'ci' },
    on: { push: {} },
    jobs: {
      build: {
        'runs-on': 'ubuntu-latest',
        steps: [
          { uses: 'actions/checkout@v4' },
          { run: 'npm ci' },
          { run: 'npm test' },
          { run: 'npm run deploy', env: { API_TOKEN: 'a-real-looking-token-12345' } },
        ],
      },
    },
  },
};
`;

const RETRY_LOG_PRELUDE = `
function __sink() {
  const lines = [];
  return {
    lines: lines,
    write: function (line) { lines.push(line); },
  };
}
`;

export default {
  id: 'devops',
  title: 'Deploy & DevOps',
  badge: 'OPS',
  color: 'warn',
  tagline: 'From your laptop to production - and staying up once you are there',
  hours: 14,
  why:
    'The gap between "works on my machine" and "works for users" is configuration, containers, pipelines and observability. This is the part of ' +
    'fullstack work that separates someone who can write a feature from someone who can ship one: a build that is reproducible, secrets that ' +
    'stay secret, logs you can actually search, a shutdown that does not drop requests, and a rollback you have rehearsed.',
  source: {
    course: 'Dave Gray - deploying a full-stack app (Node, Docker, CI/CD)',
    url: 'https://www.youtube.com/watch?v=l134cBAJCuc',
    roadmap: 'https://roadmap.sh/devops',
    docs: 'https://docs.docker.com/get-started/',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'ops-01',
      title: 'Config, Environments and Secrets',
      minutes: 40,
      objectives: [
        'Load configuration from the environment and validate it at startup',
        'Fail fast with a message that names every problem at once',
        'Keep secrets out of logs, code and error messages',
      ],
      sections: [
        {
          heading: 'Configuration lives in the environment',
          body:
            'The same build should run in every environment; only the environment changes. That is the third of the twelve factors and the reason ' +
            'you never branch on `process.env.NODE_ENV` eight levels deep in your business logic.\n\n' +
            '```js\nconst config = loadConfig(process.env);   // one place, validated once\n```\n\n' +
            'Everything downstream takes `config`, or a piece of it, as a dependency. Nothing else reads the environment.',
        },
        {
          heading: 'Validate once, at startup, and fail fast',
          body:
            '```js\nfunction loadConfig(env) {\n  const problems = [];\n  if (!env.DATABASE_URL) problems.push(\'DATABASE_URL is required\');\n  const port = Number(env.PORT ?? 3000);\n  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(\'PORT must be an integer between 1 and 65535\');\n  if (problems.length) throw new Error(\'Invalid configuration:\\n\' + problems.join(\'\\n\'));\n  return { databaseUrl: env.DATABASE_URL, port };\n}\n```\n\n' +
            'Crash on boot with *all* the problems, not one at a time. A container that exits immediately with a clear message is far better than ' +
            'one that starts and serves 500s at 3am because `PORT` was `"abc"`.',
        },
        {
          heading: 'Secrets: never in code, never in logs',
          body:
            '- Put secrets in the platform\'s secret store or CI secrets, injected as env vars at runtime\n' +
            '- Never commit a `.env` file; commit `.env.example` with the keys and no values\n' +
            '- Redact on the way *out*: tokens, cookies, passwords and API keys must never reach a log line, an error response or a screenshot\n' +
            '- Rotate a secret the moment it is exposed - assume it is already used\n\n' +
            '```js\nlog.info(\'request\', { path: req.url, bodyKeys: Object.keys(req.body) });   // keys, not values\n```\n\n' +
            'The reason to redact by key-name pattern rather than by remembering to be careful: the next developer adds a field called ' +
            '`refresh_token` and forgets.',
        },
      ],
      pitfalls: [
        'Scattered `process.env` reads with no validation, so a typo becomes `undefined` at runtime',
        'Reporting one problem per restart, so three missing vars take three deploys to discover',
        '`Number(env.PORT)` without checking - `"abc"` and `"0"` both sail through',
        'Logging a whole request body, or an error object that contains the config',
        'Committing `.env` "just for now"',
      ],
      keyPoints: [
        'One validated config object, built at startup from the environment',
        'Collect every problem and throw them together - fail fast, fail loud',
        'Redact by key name on the way out; secrets never reach a log',
      ],
      resources: [
        { label: 'The Twelve-Factor App: Config', url: 'https://12factor.net/config' },
        { label: 'Node.js: How to read environment variables', url: 'https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs' },
        { label: 'OWASP: Secrets Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
      ],
      challenges: [
        {
          id: 'write-config-loader',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'js',
          prompt:
            'Write `loadConfig(env)` returning `{ nodeEnv, port, databaseUrl, logLevel, isProduction }`. It validates the whole environment and ' +
            'throws one `Error` naming every problem it found. This is the function that decides whether your container boots.',
          requirements: [
            '`DATABASE_URL` is required',
            '`PORT` defaults to `3000` and must be an integer from 1 to 65535 - reject `"abc"`, `0` and `70000`',
            '`NODE_ENV` defaults to `"development"` and must be `development`, `test` or `production`',
            '`LOG_LEVEL` defaults to `"info"` and must be `debug`, `info`, `warn` or `error`',
            'Every problem is reported together: an empty `env` names all of the missing/invalid values in one throw',
            '`isProduction` is `true` only for `"production"`',
          ],
          starter: `function loadConfig(env) {
  return {
    nodeEnv: env.NODE_ENV || 'production',
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL,
    logLevel: env.LOG_LEVEL,
    isProduction: env.NODE_ENV === 'production',
  };
}
`,
          hints: [
            'Collect messages in an array and throw once at the end: `if (problems.length) throw new Error(\'Invalid configuration: \' + problems.join(\', \'));`',
            '`Number.isInteger(port)` catches both `NaN` and `3000.5`.',
            'A helper like `const oneOf = (value, allowed) => allowed.includes(value)` keeps the checks readable.',
          ],
          solution: `function loadConfig(env) {
  const problems = [];

  if (!env.DATABASE_URL) problems.push('DATABASE_URL is required');

  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('PORT must be an integer between 1 and 65535');
  }

  const nodeEnv = env.NODE_ENV === undefined ? 'development' : env.NODE_ENV;
  if (['development', 'test', 'production'].indexOf(nodeEnv) === -1) {
    problems.push('NODE_ENV must be development, test or production');
  }

  const logLevel = env.LOG_LEVEL === undefined ? 'info' : env.LOG_LEVEL;
  if (['debug', 'info', 'warn', 'error'].indexOf(logLevel) === -1) {
    problems.push('LOG_LEVEL must be debug, info, warn or error');
  }

  if (problems.length) {
    throw new Error('Invalid configuration: ' + problems.join('; '));
  }

  return {
    nodeEnv,
    port,
    databaseUrl: env.DATABASE_URL,
    logLevel,
    isProduction: nodeEnv === 'production',
  };
}
`,
          checks: [
            T.js(
              'a valid environment loads with the right defaults',
              `(function () {
  const config = loadConfig({ DATABASE_URL: 'postgres://localhost/app' });
  __must(config.port === 3000, 'PORT should default to 3000, got ' + JSON.stringify(config.port));
  __must(config.nodeEnv === 'development', 'NODE_ENV should default to development, got ' + JSON.stringify(config.nodeEnv));
  __must(config.logLevel === 'info', 'LOG_LEVEL should default to info');
  __must(config.databaseUrl === 'postgres://localhost/app', 'pass DATABASE_URL through');
  __must(config.isProduction === false, 'development is not production');
  return true;
})()`,
              'Defaults are `3000`, `development` and `info`.',
            ),
            T.js(
              'production is detected',
              `(function () { const config = loadConfig({ DATABASE_URL: 'x', NODE_ENV: 'production', PORT: '8080', LOG_LEVEL: 'warn' }); __must(config.isProduction === true, 'NODE_ENV=production should set isProduction'); __must(config.port === 8080, 'the port should be a number, got ' + JSON.stringify(config.port)); return true; })()`,
              'Coerce the port with `Number(...)` and compare `nodeEnv`.',
            ),
            T.js(
              'a missing DATABASE_URL throws naming it',
              `(function () { try { loadConfig({}); } catch (err) { __must(/DATABASE_URL/.test(err.message), 'the message should name DATABASE_URL, got ' + JSON.stringify(err.message)); return true; } __must(false, 'an empty environment must throw'); })()`,
              'Start by requiring `DATABASE_URL`.',
            ),
            T.js(
              'every problem is reported in one go',
              `(function () { try { loadConfig({ PORT: 'abc', NODE_ENV: 'staging', LOG_LEVEL: 'chatty' }); } catch (err) { const m = err.message; __must(/PORT/.test(m) && /NODE_ENV/.test(m) && /LOG_LEVEL/.test(m) && /DATABASE_URL/.test(m), 'all four problems should appear in one message, got ' + JSON.stringify(m)); return true; } __must(false, 'invalid values must throw'); })()`,
              'Push into a `problems` array and throw once, after every check.',
            ),
            T.js(
              'bad ports are rejected',
              `(function () { const bad = ['abc', '0', '70000', '3000.5', '-1']; const survived = bad.filter((value) => { try { loadConfig({ DATABASE_URL: 'x', PORT: value }); return true; } catch (err) { return false; } }); __must(survived.length === 0, 'these ports were accepted: ' + survived.join(', ')); return true; })()`,
              '`Number.isInteger(port) && port >= 1 && port <= 65535`.',
            ),
          ],
        },
        {
          id: 'debug-leaky-config',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Three problems in one small file: the API key is hard-coded, an empty-but-present value is treated as missing (so `"0"` or `""` ' +
            'slip through in other places), the default environment is `production`, and the error message prints the secret it was given. Fix ' +
            'all four.',
          requirements: [
            'Nothing sensitive is hard-coded - the key comes from `env`',
            'A required value must be checked for `undefined`/`null`/empty, not for truthiness',
            'The default `NODE_ENV` is `development`',
            'No secret value ever appears in a thrown error message',
            'Returns `{ apiKey, timeoutMs, nodeEnv }` with `timeoutMs` defaulting to 5000',
          ],
          starter: `function loadServiceConfig(env) {
  const apiKey = 'sk_live_hardcoded_12345';
  const timeoutMs = env.TIMEOUT_MS || 5000;
  const nodeEnv = env.NODE_ENV || 'production';

  if (!apiKey) {
    throw new Error('Missing API key: ' + apiKey);
  }

  return { apiKey, timeoutMs, nodeEnv };
}
`,
          hints: [
            'Read the key from `env.API_KEY` and validate that it is a non-empty string.',
            '`env.TIMEOUT_MS || 5000` turns a legitimate `0` into 5000 - use `??`.',
            'Error messages should name the *variable*, never the value.',
          ],
          solution: `function loadServiceConfig(env) {
  const apiKey = env.API_KEY;
  const timeoutMs = env.TIMEOUT_MS ?? 5000;
  const nodeEnv = env.NODE_ENV ?? 'development';

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('API_KEY is required');
  }

  return { apiKey, timeoutMs, nodeEnv };
}
`,
          checks: [
            T.js(
              'the key comes from the environment',
              `(function () { const config = loadServiceConfig({ API_KEY: 'from-env' }); __must(config.apiKey === 'from-env', 'API_KEY should come from env, got ' + JSON.stringify(config.apiKey)); __must(config.nodeEnv === 'development', 'the default environment should be development, got ' + JSON.stringify(config.nodeEnv)); __must(config.timeoutMs === 5000, 'timeoutMs should default to 5000'); return true; })()`,
              'No literals: everything comes from `env`.',
            ),
            T.js(
              'zero and empty values are handled honestly',
              `(function () { const config = loadServiceConfig({ API_KEY: 'k', TIMEOUT_MS: 0 }); __must(config.timeoutMs === 0, 'an explicit 0 should stay 0, got ' + JSON.stringify(config.timeoutMs)); let threw = false; try { loadServiceConfig({ API_KEY: '   ' }); } catch (err) { threw = true; } __must(threw, 'a whitespace-only API key must be rejected'); return true; })()`,
              'Use `??` for defaults and a real emptiness check for required values.',
            ),
            T.js(
              'errors never echo a secret',
              `(function () { try { loadServiceConfig({ API_KEY: '', OTHER: 'super-secret-value' }); } catch (err) { __must(!/super-secret-value/.test(err.message), 'the error leaked a value from the environment'); __must(/API_KEY/.test(err.message), 'the message should name the variable, got ' + JSON.stringify(err.message)); return true; } __must(false, 'an empty key must throw'); })()`,
              'Name the variable; never interpolate the value.',
            ),
            T.js(
              'no hard-coded key survives in the source',
              `(!/sk_live|hardcoded/i.test(__src) || 'remove the hard-coded key from the source') && (!/\\?\\?\\s*['"]production['"]|\\|\\|\\s*['"]production['"]/.test(__src) || 'the empty NODE_ENV default should be development, not production')`,
              'A safe default is the least powerful one.',
            ),
          ],
        },
        {
          id: 'write-redact',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Write `redact(value)` that returns a deep copy of whatever it is given, with the values of sensitive keys replaced by ' +
            '`"[redacted]"`. Sensitive means the key, lower-cased, contains `password`, `token`, `secret`, `authorization`, `apikey`, ' +
            '`api_key` or `cookie`. The input must not be mutated.',
          requirements: [
            'Nested objects and objects inside arrays are redacted too',
            'Matching is case-insensitive and works on `snake_case` and `camelCase`',
            'Non-plain values (`Date`, functions, numbers, `null`) pass through unchanged',
            'The original object is untouched',
            'Repeated/undefined keys do not crash it',
          ],
          starter: `function redact(value) {
  return value;
}
`,
          hints: [
            'A prefix check is easier than a list: `const SENSITIVE = [\'password\', \'token\', \'secret\', \'authorization\', \'apikey\', \'api_key\', \'cookie\'];` then `SENSITIVE.some((s) => key.toLowerCase().includes(s))`.',
            'Recurse: for arrays use `map`, for objects rebuild with `Object.fromEntries` or a loop.',
            'Check `typeof value === \'object\' && value !== null` before recursing so `Date` and `null` pass through.',
          ],
          solution: `function redact(value) {
  const SENSITIVE = ['password', 'token', 'secret', 'authorization', 'apikey', 'api_key', 'cookie'];

  const isSensitive = (key) => SENSITIVE.some((fragment) => key.toLowerCase().includes(fragment));

  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    if (node instanceof Date) return node;

    const out = {};
    for (const key of Object.keys(node)) {
      out[key] = isSensitive(key) ? '[redacted]' : walk(node[key]);
    }
    return out;
  }

  return walk(value);
}
`,
          checks: [
            T.js(
              'redacts top-level secrets',
              `(function () { const clean = redact({ user: 'ama', password: 'hunter2', apiKey: 'abc' }); __must(clean.user === 'ama', 'non-sensitive values should survive'); __must(clean.password === '[redacted]', 'password was not redacted, got ' + JSON.stringify(clean.password)); __must(clean.apiKey === '[redacted]', 'apiKey (camelCase) was not redacted, got ' + JSON.stringify(clean.apiKey)); return true; })()`,
              'Compare the lower-cased key against a list of fragments.',
            ),
            T.js(
              'redacts nested objects and arrays',
              `(function () { const clean = redact({ headers: { Authorization: 'Bearer x', 'X-Trace': 't' }, items: [{ access_token: 'a', id: 1 }] }); __must(clean.headers.Authorization === '[redacted]', 'Authorization was not redacted'); __must(clean.headers['X-Trace'] === 't', 'a benign header should survive'); __must(clean.items[0].access_token === '[redacted]', 'secrets inside arrays must be redacted'); __must(clean.items[0].id === 1, 'the rest of the array item should survive'); return true; })()`,
              'Recurse into arrays with `map` and objects with a loop.',
            ),
            T.js(
              'does not mutate the input',
              `(function () { const original = { password: 'hunter2', nested: { cookie: 'session=1' } }; const clean = redact(original); __must(original.password === 'hunter2', 'the input object was mutated'); __must(original.nested.cookie === 'session=1', 'the nested object was mutated'); __must(clean !== original, 'redact should return a new object'); return true; })()`,
              'Build new objects; never assign into the input.',
            ),
            T.js(
              'passes non-object values straight through',
              `(function () { const date = new Date('2026-01-01'); __must(redact(5) === 5, 'numbers pass through'); __must(redact(null) === null, 'null passes through'); __must(redact(undefined) === undefined, 'undefined passes through'); __must(redact(date) === date, 'a Date should not be turned into a plain object'); __must(redact('token').valueOf() === 'token', 'a bare string passes through'); return true; })()`,
              'Guard the recursion with `typeof node === \'object\' && node !== null`.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ops-02',
      title: 'Containers and Reproducible Builds',
      minutes: 45,
      objectives: [
        'Write a multi-stage Dockerfile for a Node service',
        'Order layers so the dependency cache survives code changes',
        'Run as a non-root user with a health check',
      ],
      sections: [
        {
          heading: 'Layers are a cache, and order is the trick',
          body:
            'A Docker build caches each instruction, and a changed layer invalidates every layer after it. So:\n\n' +
            '```dockerfile\n# correct: manifests first, install, then the source\nCOPY package.json package-lock.json ./\nRUN npm ci\nCOPY . .\n\n' +
            '# wrong: any source change reinstalls everything\nCOPY . .\nRUN npm ci\n```\n\n' +
            'Copying only the manifests means the install layer is reused on every code change. On a Node project that is the difference between a ' +
            '12-second build and a 3-minute one - times every CI run, forever.',
        },
        {
          heading: 'Multi-stage: build with everything, ship with little',
          body:
            '```dockerfile\nFROM node:22-alpine AS deps\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\n\n' +
            'FROM node:22-alpine AS build\nWORKDIR /app\nCOPY --from=deps /app/node_modules ./node_modules\nCOPY . .\nRUN npm run build\n\n' +
            'FROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=deps /app/node_modules ./node_modules\nCOPY --from=build /app/dist ./dist\n' +
            'USER node\nEXPOSE 3000\nHEALTHCHECK CMD node -e "fetch(\'http://127.0.0.1:3000/health\').then(r => process.exit(r.ok ? 0 : 1))"\n' +
            'CMD ["node", "dist/index.js"]\n```\n\n' +
            'The final image gets no source, no dev dependencies, no test files and no build tools - just the artefact, production dependencies ' +
            'and a non-root user. Smaller image, smaller attack surface, faster pulls.',
        },
        {
          heading: 'The rules that matter in review',
          body:
            '- **Pin the base**: `node:22-alpine`, never `node:latest`. `latest` is a different image next week\n' +
            '- **Install deterministically**: `npm ci` with a committed lockfile, not `npm install`\n' +
            '- **Never run as root**: `USER node` (or create a user). UID 0 inside a container is a genuine escape risk\n' +
            '- **One process per container**: no supervisord running nginx and node\n' +
            '- **EXPOSE is documentation**, not a firewall; publish deliberately\n' +
            '- **A HEALTHCHECK is how the platform knows to restart you**, and how a load balancer knows to stop sending traffic\n' +
            '- **`.dockerignore`** keeps `node_modules`, `.git` and `.env` out of the build context - and out of the image',
        },
      ],
      pitfalls: [
        '`COPY . .` before installing dependencies, destroying the layer cache on every commit',
        'Shipping dev dependencies (and sometimes test files) in the production image',
        'Running as root because "it just worked"',
        '`node:latest`, so the runtime changes under you on the next build',
        'No HEALTHCHECK, so a hung process keeps serving errors instead of being restarted',
        'Copying `.env` into the image - secrets baked into a layer, forever readable',
      ],
      keyPoints: [
        'Copy manifests, install, then copy source - layer order is the cache',
        'Multi-stage builds keep the runtime image small and free of build tools',
        'Pin the base, use `npm ci`, run as non-root, and declare a health check',
      ],
      resources: [
        { label: 'Docker: Multi-stage builds', url: 'https://docs.docker.com/build/building/multi-stage/' },
        { label: 'Docker: Building best practices', url: 'https://docs.docker.com/build/building/best-practices/' },
        { label: 'Node.js: Dockerizing a Node.js web app', url: 'https://nodejs.org/en/learn/getting-started/nodejs-with-docker' },
      ],
      challenges: [
        {
          id: 'write-dockerfile',
          kind: 'write',
          difficulty: 'medium',
          minutes: 20,
          lang: 'dockerfile',
          prompt:
            'Write a production `Dockerfile` for a Node 22 API: a dependency stage that installs production dependencies from the lockfile, a ' +
            'build stage that runs the build, and a small final stage that runs the compiled output as the non-root `node` user with a health ' +
            'check and an `EXPOSE`.',
          requirements: [
            'At least two `FROM` lines (a build stage and a runtime stage)',
            '`FROM node:22-alpine` - a pinned tag, not `latest`',
            'Dependencies are installed from `package.json` + `package-lock.json` with `npm ci` *before* the source is copied',
            'The runtime stage installs production dependencies only (`--omit=dev` or `NODE_ENV=production`)',
            '`USER node` in the final stage',
            '`EXPOSE 3000` and a `HEALTHCHECK` that hits `/health`',
            '`CMD ["node", "dist/index.js"]` in exec form',
          ],
          starter: `FROM node:latest
WORKDIR /app
COPY . .
RUN npm install
CMD node dist/index.js
`,
          hints: [
            'Name your stages: `FROM node:22-alpine AS deps`, `... AS build`, then a bare final `FROM node:22-alpine`.',
            '`COPY package.json package-lock.json ./` then `RUN npm ci --omit=dev`, then `COPY . .`.',
            'The final stage copies the artefact in: `COPY --from=build /app/dist ./dist`.',
          ],
          solution: `FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
`,
          checks: [
            T.src(
              'is a multi-stage build with a pinned base image',
              `/(^|\\n)\\s*FROM\\s+node:22[^\\s]*\\s+AS\\s+\\w+/i`,
              'Use `FROM node:22-alpine AS build` for the first stage.',
            ),
            T.src(
              'has a second FROM for the runtime image',
              `/(^|\\n)\\s*FROM[^\\n]*\\n[\\s\\S]*(^|\\n)\\s*FROM\\s/i`,
              'A final `FROM node:22-alpine` stage keeps the build tools out of production.',
            ),
            T.notSrc(
              'never uses the latest tag',
              `/(^|\\n)\\s*FROM\\s+node:latest/i`,
              'Replace `node:latest` with `node:22-alpine`.',
            ),
            T.src(
              'installs dependencies before copying the source',
              `COPY\\s+package(\\*|\\.json)[^\\n]*\\n([^\\n]*\\n){0,3}\\s*RUN\\s+npm\\s+ci`,
              'Copy `package.json` and `package-lock.json`, run `npm ci`, and only then `COPY . .`.',
            ),
            T.src(
              'installs production dependencies for the runtime image',
              `/npm\\s+ci\\s+--omit=dev|NODE_ENV=production/`,
              'The runtime stage should not carry dev dependencies.',
            ),
            T.src(
              'runs as a non-root user',
              `/(^|\\n)\\s*USER\\s+(?!root)\\w+/i`,
              'Add `USER node` before `CMD`.',
            ),
            T.src(
              'declares EXPOSE and a HEALTHCHECK that hits /health',
              `/EXPOSE\\s+3000/i`,
              'Document the port with `EXPOSE 3000`.',
            ),
            T.src(
              'has a health check',
              `/(^|\\n)\\s*HEALTHCHECK[^\\n]*\\/health/i`,
              'A `HEALTHCHECK` directive that requests `/health` lets the platform restart a hung process.',
            ),
            T.src(
              'starts the server in exec form',
              `/CMD\\s*\\[\\s*["']node["']\\s*,/`,
              'Use the JSON form: `CMD ["node", "dist/index.js"]`.',
            ),
          ],
        },
        {
          id: 'write-dockerfile-linter',
          kind: 'write',
          difficulty: 'hard',
          minutes: 25,
          lang: 'js',
          prelude: DOCKER_PRELUDE,
          prompt:
            'Write `lintDockerfile(text)` that returns an array of issue codes for a Dockerfile string. It is the check you want in CI so the ' +
            'next person does not re-introduce the cache bug. The good sample must come back clean.',
          requirements: [
            '`"single-stage"` when there is only one `FROM` line',
            '`"unpinned-base"` when a base image has no tag or uses `latest`',
            '`"runs-as-root"` when no `USER` line sets a non-root user',
            '`"dev-deps-in-image"` when an install runs without `--omit=dev` or `--production`',
            '`"cache-busting-copy"` when a source-wide `COPY . ` appears before the dependency install',
            '`"no-healthcheck"` when there is no `HEALTHCHECK`',
            'The good sample returns an empty array, and running it twice gives the same answer',
          ],
          starter: `function lintDockerfile(text) {
  const issues = [];
  // Implement the checks.
  return issues;
}
`,
          hints: [
            'Split into lines once: `const lines = text.split(\'\\n\').map((l) => l.trim());` then use the line index to reason about order.',
            'Count the FROM lines with `lines.filter((l) => /^FROM\\s/i.test(l)).length`.',
            'For the ordering rule, find the index of the first `COPY . ` and the index of the first install `RUN`, and compare.',
          ],
          solution: `function lintDockerfile(text) {
  const issues = [];
  const lines = String(text).split('\\n').map((line) => line.trim());
  const fromLines = lines.filter((line) => /^FROM\\s/i.test(line));
  const lower = lines.join('\\n').toLowerCase();

  if (fromLines.length < 2) issues.push('single-stage');

  const unpinned = fromLines.some((line) => {
    const image = line.split(/\\s+/)[1] || '';
    const withoutDigest = image.split('@')[0];
    const tag = withoutDigest.includes(':') ? withoutDigest.split(':').pop() : '';
    return tag === '' || tag === 'latest';
  });
  if (unpinned) issues.push('unpinned-base');

  const userLine = lines.find((line) => /^USER\\s+/i.test(line));
  if (!userLine || /^USER\\s+(root|0)$/i.test(userLine)) issues.push('runs-as-root');

  const installLines = lines.filter((line) => /^RUN\\s+.*npm\\s+(ci|install)\\b/i.test(line));
  const installsProductionOnly = installLines.length > 0 && installLines.every((line) => /--omit=dev|--production/.test(line) || /NODE_ENV=production/.test(lower));
  if (installLines.length && !installsProductionOnly) issues.push('dev-deps-in-image');

  const copyAllIndex = lines.findIndex((line) => /^COPY\\s+\\.\\s/.test(line));
  const installIndex = lines.findIndex((line) => /^RUN\\s+.*npm\\s+(ci|install)\\b/i.test(line));
  if (copyAllIndex !== -1 && installIndex !== -1 && copyAllIndex < installIndex) issues.push('cache-busting-copy');

  if (!/^HEALTHCHECK\\b/im.test(text)) issues.push('no-healthcheck');

  return issues;
}
`,
          checks: [
            T.js(
              'the good Dockerfile is clean',
              `(function () { const issues = lintDockerfile(__dockerSamples.good); __must(Array.isArray(issues), 'lintDockerfile should return an array'); __must(issues.length === 0, 'the good sample should pass, but it reported: ' + issues.join(', ')); return true; })()`,
              'Only report an issue you are sure about - false positives make the linter useless.',
            ),
            T.js(
              'a root user and dev dependencies are caught',
              `(function () { const issues = lintDockerfile(__dockerSamples.rootAndDeps); __must(issues.includes('runs-as-root'), 'USER root should be caught, got ' + issues.join(', ')); __must(issues.includes('dev-deps-in-image'), 'the unqualified npm ci should be caught, got ' + issues.join(', ')); return true; })()`,
              'Compare the USER line against `root` and `0`; check the install flags.',
            ),
            T.js(
              'cache-busting copies are caught',
              `(function () { const issues = lintDockerfile(__dockerSamples.cacheBusting); __must(issues.includes('cache-busting-copy'), 'COPY . . before the install should be caught, got ' + issues.join(', ')); return true; })()`,
              'Compare the index of the first `COPY . ` with the index of the first install.',
            ),
            T.js(
              'single-stage and unpinned bases are caught',
              `(function () { const issues = lintDockerfile(__dockerSamples.singleStage); __must(issues.includes('single-stage'), 'one FROM line should be caught, got ' + issues.join(', ')); __must(issues.includes('unpinned-base'), 'node:latest should be caught, got ' + issues.join(', ')); return true; })()`,
              'Count the FROM lines, and check the tag on each.',
            ),
            T.js(
              'the missing health check is caught and the linter is stable',
              `(function () {
  const noHealth = 'FROM node:22-alpine AS build\\nWORKDIR /app\\nCOPY package.json ./\\nRUN npm ci --omit=dev\\n\\nFROM node:22-alpine\\nCOPY --from=build /app .\\nUSER node\\nCMD ["node", "index.js"]';
  const issues = lintDockerfile(noHealth);
  __must(issues.includes('no-healthcheck'), 'a Dockerfile with no HEALTHCHECK should be flagged, got ' + issues.join(', '));
  const again = lintDockerfile(noHealth);
  __must(again.join(',') === issues.join(','), 'the linter should be deterministic');
  return true;
})()`,
              'A regex over the whole text is fine for the health check.',
            ),
          ],
        },
        {
          id: 'debug-image-bloat',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'dockerfile',
          prompt:
            'This Dockerfile builds and "works", but the image is 1.2GB, the CI build takes three minutes for a one-line change, and it runs as ' +
            'root. Restructure it into a multi-stage build without changing what it does.',
          requirements: [
            'Keep the final CMD serving `dist/index.js`',
            'Dependencies install from the lockfile before the source is copied',
            'The build stage compiles TypeScript; the runtime stage runs the compiled output',
            'The runtime image carries production dependencies only',
            'The process runs as the `node` user, with a health check',
          ],
          starter: `FROM node:latest
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
`,
          hints: [
            'One stage does three jobs here: install dev deps, build, and run. Split it.',
            '`COPY package.json package-lock.json ./` + `RUN npm ci` before `COPY . .` fixes the cache.',
            'In the last stage: `COPY --from=deps /app/node_modules ./node_modules` and `USER node`.',
          ],
          solution: `FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
`,
          checks: [
            T.src(
              'the source is copied after the install',
              `COPY\\s+package(\\*|\\.json)[^\\n]*\\n([^\\n]*\\n){0,3}\\s*RUN\\s+npm\\s+ci`,
              'Manifests first, install, then the source.',
            ),
            T.src(
              'there are separate build and runtime stages',
              `/(^|\\n)\\s*FROM[^\\n]*AS\\s+build/i`,
              'A named build stage runs the compile; the final stage runs the output.',
            ),
            T.src(
              'production dependencies only in the runtime image',
              `/npm\\s+ci\\s+--omit=dev/`,
              'The runtime stage installs with `--omit=dev`.',
            ),
            T.src(
              'runs as the node user',
              `/(^|\\n)\\s*USER\\s+node\\b/i`,
              'Add `USER node` in the final stage.',
            ),
            T.src(
              'still starts the server the same way',
              `/CMD\\s*\\[\\s*["']node["']\\s*,\\s*["']dist\\/index\\.js["']\\s*\\]/`,
              'Do not change the entry point.',
            ),
            T.src(
              'the health check is present',
              `/(^|\\n)\\s*HEALTHCHECK/i`,
              'Add a HEALTHCHECK so the platform can restart a hung process.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ops-03',
      title: 'CI/CD Pipelines and Safe Deploys',
      minutes: 45,
      objectives: [
        'Write a pipeline that installs, tests and builds on every pull request',
        'Gate a deploy on branch, environment and manual approval',
        'Make deploy scripts default to a dry run',
      ],
      sections: [
        {
          heading: 'A pipeline is a contract, not a script',
          body:
            '```yaml\nname: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n\nconcurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\n\n' +
            'jobs:\n  build:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n      - uses: actions/checkout@v4\n' +
            '      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node }}\n          cache: npm\n      - run: npm ci\n' +
            '      - run: npm test\n      - run: npm run build\n```\n\n' +
            'Points worth noticing: a pinned major version on every action, `npm ci` (lockfile-exact) rather than `npm install`, a matrix so you ' +
            'find out about the next Node version before your users do, and `concurrency` so a force-push cancels the stale run instead of racing ' +
            'it.',
        },
        {
          heading: 'Tests before deploy, always',
          body:
            '```yaml\n  deploy:\n    needs: build\n    if: github.ref == \'refs/heads/main\'\n    environment: production\n    steps:\n' +
            '      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run deploy\n        env:\n' +
            '          DATABASE_URL: ${{ secrets.DATABASE_URL }}\n```\n\n' +
            '`needs: build` makes deploy impossible before the tests pass. `if:` restricts it to `main`, so a pull request can never deploy. ' +
            '`environment: production` gives you required reviewers and per-environment secrets. Secrets come from `secrets.*`, never a literal ' +
            'in the YAML - a literal in a workflow file is a secret in git history.',
        },
        {
          heading: 'Deploys should be boring and reversible',
          body:
            'Rules that keep deploys boring:\n\n' +
            '- **Dry run by default.** `deploy` with no explicit confirmation prints what it *would* do\n' +
            '- **One command, idempotent.** Running it twice must not double-apply anything\n' +
            '- **Migrate before you switch code**, in a backwards-compatible order (next lesson)\n' +
            '- **Deploy the artefact you tested** - the same image digest, not a rebuild from the same commit\n' +
            '- **Verify after deploy**: a health check and a smoke test, then mark the release good\n' +
            '- **Roll back by pointing at the previous artefact**, not by reverting commits under pressure at 2am',
        },
      ],
      pitfalls: [
        'Deploying from a `pull_request` trigger, or without `needs: build`',
        'A secret written as a literal in the workflow file',
        '`uses: some/action@main` - you are trusting whatever is pushed tomorrow',
        'No concurrency group, so two pushes race and the older one finishes last',
        'A deploy script that defaults to applying, so a fat-fingered command ships to production',
        'Rebuilding the artefact for production instead of promoting the one that passed CI',
      ],
      keyPoints: [
        'Pin action versions, use `npm ci`, and cancel stale runs with a concurrency group',
        'Deploy only after tests pass, only from `main`, with secrets from the secret store',
        'Dry run by default; promote the tested artefact; verify and be able to roll back',
      ],
      resources: [
        { label: 'GitHub Actions: Workflow syntax', url: 'https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions' },
        { label: 'GitHub Actions: Using secrets', url: 'https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions' },
        { label: 'GitHub Actions: Deployment environments', url: 'https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment' },
        { label: 'The Twelve-Factor App: Build, release, run', url: 'https://12factor.net/build-release-run' },
      ],
      challenges: [
        {
          id: 'write-workflow',
          kind: 'write',
          difficulty: 'medium',
          minutes: 20,
          lang: 'yaml',
          prompt:
            'Write `.github/workflows/ci.yml` for a Node app: tests and a build on every pull request and on `main`, a matrix over Node 20 and ' +
            '22 with dependency caching, and a deploy job that only runs on `main`, only after the build job, using a secret for the token.',
          requirements: [
            '`on:` includes `pull_request` and a push to `main`',
            'A `concurrency` group with `cancel-in-progress: true`',
            'Every `uses:` action is pinned to a major version (`@v4`)',
            'Steps: checkout, setup-node with `cache: npm`, `npm ci`, `npm test`, `npm run build`',
            'The matrix covers Node 20 and 22',
            'The deploy job has `needs: build`, an `if:` that restricts it to `main`, and an `environment:`',
            'The token comes from `${{ secrets.* }}`, never a literal',
          ],
          starter: `name: CI\non:\n  push:\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm install\n      - run: npm test\n`,
          hints: [
            'Matrix: `strategy: matrix: node: [20, 22]` then `node-version: ${{ matrix.node }}`.',
            'The deploy gate is `if: github.ref == \'refs/heads/main\'`.',
            'Put the token under the step\'s `env:` as `${{ secrets.API_TOKEN }}`.',
          ],
          solution: `name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run deploy
        env:
          API_TOKEN: \${{ secrets.API_TOKEN }}
`,
          checks: [
            T.src(
              'runs on pull requests and on main',
              `/on:[\\s\\S]*pull_request/`,
              'Add `pull_request:` under `on:` so every PR is tested.',
            ),
            T.src(
              'cancels superseded runs',
              `/concurrency:[\\s\\S]*group:[\\s\\S]*cancel-in-progress:\\s*true/`,
              'A concurrency group with `cancel-in-progress: true` stops two pushes racing.',
            ),
            T.src(
              'pins every action to a version',
              `/uses:\\s*[\\w-]+\\/[\\w-]+@v?\\d/`,
              'Write `actions/checkout@v4`, not `actions/checkout@main`.',
            ),
            T.src(
              'installs from the lockfile with caching',
              `/run:\\s*npm\\s+ci\\b[\\s\\S]*cache:\\s*npm|cache:\\s*npm[\\s\\S]*run:\\s*npm\\s+ci\\b/`,
              'Use `npm ci`, and point `setup-node` at the npm cache.',
            ),
            T.src(
              'runs the tests and the build',
              `/run:\\s*npm\\s+test[\\s\\S]*run:\\s*npm\\s+run\\s+build/`,
              'A pipeline that never runs the tests is decoration.',
            ),
            T.src(
              'tests on a matrix of Node versions',
              `/matrix:[\\s\\S]*node:\\s*\\[[^\\]]*20[^\\]]*22/`,
              '`matrix: node: [20, 22]` with `node-version: ${{ matrix.node }}`.',
            ),
            T.src(
              'gates the deploy on build and on main',
              `/needs:\\s*build[\\s\\S]*if:\\s*github\\.ref\\s*==\\s*['"]refs\\/heads\\/main['"]/`,
              '`needs: build` then `if: github.ref == \'refs/heads/main\'`.',
            ),
            T.src(
              'uses the secret store for the token',
              `/secrets\\.[A-Z_]+/`,
              '`API_TOKEN: ${{ secrets.API_TOKEN }}` - never a literal.',
            ),
            T.notSrc(
              'never writes a token as a literal',
              `/(token|secret|password)\\s*:\\s*['"]?[a-zA-Z0-9_-]{16,}/i`,
              'Any real-looking value in the file is a leak; keep it in secrets.',
            ),
          ],
        },
        {
          id: 'write-workflow-linter',
          kind: 'write',
          difficulty: 'hard',
          minutes: 25,
          lang: 'js',
          prelude: WORKFLOW_PRELUDE,
          prompt:
            'Write `lintWorkflow(workflow)` where `workflow` is an already-parsed GitHub Actions file. It returns issue codes for the hygiene ' +
            'problems that cause real incidents. The good workflow must come back clean.',
          requirements: [
            '`"no-checkout"` when a job with steps never uses `actions/checkout`',
            '`"no-tests"` when no step runs the tests',
            '`"floating-action"` when a `uses` is pinned to `main`/`master` or has no `@version`',
            '`"deploy-on-pr"` when a job that looks like a deploy can run on `pull_request`',
            '`"no-concurrency"` when the workflow has no `concurrency` key',
            '`"plain-text-secret"` when an `env` value looks like a real secret instead of `${{ secrets.* }}`',
            'The good sample returns an empty array and the checks are deterministic',
          ],
          starter: `function lintWorkflow(workflow) {
  const issues = [];
  // Implement the rules.
  return issues;
}
`,
          hints: [
            'Collect steps from every job: `Object.values(workflow.jobs).flatMap((job) => job.steps || [])`.',
            'A deploy job is one whose id or any `run` step matches `/deploy/i`.',
            'Secrets: a key matching `/token|secret|password|key/i` whose value does not start with `${{`.',
          ],
          solution: `function lintWorkflow(workflow) {
  const issues = [];
  const jobs = workflow.jobs || {};
  const jobIds = Object.keys(jobs);
  const allSteps = jobIds.flatMap((id) => (jobs[id].steps || []));

  const hasCheckout = allSteps.some((step) => typeof step.uses === 'string' && /actions\\/checkout/.test(step.uses));
  if (allSteps.length && !hasCheckout) issues.push('no-checkout');

  const runsTests = allSteps.some((step) => typeof step.run === 'string' && /\\btest\\b|vitest|jest|node --test/i.test(step.run));
  if (allSteps.length && !runsTests) issues.push('no-tests');

  const floating = allSteps.some((step) => {
    if (typeof step.uses !== 'string') return false;
    if (!step.uses.includes('@')) return true;
    return /@(main|master|HEAD)$/i.test(step.uses);
  });
  if (floating) issues.push('floating-action');

  const triggers = workflow.on || {};
  const runsOnPr = Object.prototype.hasOwnProperty.call(triggers, 'pull_request');
  const deployJob = jobIds.find((id) => /deploy|release|publish/i.test(id) || (jobs[id].steps || []).some((step) => typeof step.run === 'string' && /deploy|publish/i.test(step.run)));
  if (runsOnPr && deployJob) {
    const gated = jobs[deployJob].if || '';
    if (!/refs\\/heads\\/main/.test(gated)) issues.push('deploy-on-pr');
  }

  if (!workflow.concurrency) issues.push('no-concurrency');

  const looksLikeSecret = (key, value) => {
    if (typeof value !== 'string') return false;
    if (value.startsWith('\${{')) return false;
    return /token|secret|password|passwd|api[_-]?key/i.test(key) && value.length >= 12;
  };

  const allEnvs = [
    workflow.env || {},
    ...jobIds.map((id) => jobs[id].env || {}),
    ...allSteps.map((step) => step.env || {}),
  ];
  const leaked = allEnvs.some((env) => Object.keys(env).some((key) => looksLikeSecret(key, env[key])));
  if (leaked) issues.push('plain-text-secret');

  return issues;
}
`,
          checks: [
            T.js(
              'the good workflow is clean',
              `(function () { const issues = lintWorkflow(__workflows.good); __must(Array.isArray(issues), 'lintWorkflow should return an array'); __must(issues.length === 0, 'the good workflow should pass, but it reported: ' + issues.join(', ')); return true; })()`,
              'Do not flag a workflow that does all of this correctly.',
            ),
            T.js(
              'a missing checkout is caught',
              `(function () { const issues = lintWorkflow(__workflows.noCheckout); __must(issues.includes('no-checkout'), 'expected no-checkout, got ' + issues.join(', ')); return true; })()`,
              'Look for an `actions/checkout` step in any job.',
            ),
            T.js(
              'a missing test step is caught',
              `(function () { const issues = lintWorkflow(__workflows.noTests); __must(issues.includes('no-tests'), 'expected no-tests, got ' + issues.join(', ')); return true; })()`,
              'Check the `run` strings for a test command.',
            ),
            T.js(
              'floating action versions are caught',
              `(function () { const issues = lintWorkflow(__workflows.floatingAction); __must(issues.includes('floating-action'), 'expected floating-action for @main, got ' + issues.join(', ')); return true; })()`,
              '`@main` and a missing `@` are equally unpinned.',
            ),
            T.js(
              'a deploy job that can run on a pull request is caught',
              `(function () { const issues = lintWorkflow(__workflows.deployOnPr); __must(issues.includes('deploy-on-pr'), 'expected deploy-on-pr, got ' + issues.join(', ')); __must(issues.includes('no-concurrency'), 'this workflow also has no concurrency group, got ' + issues.join(', ')); return true; })()`,
              'An ungated deploy job plus a `pull_request` trigger is the bug.',
            ),
            T.js(
              'plain-text secrets are caught',
              `(function () { const issues = lintWorkflow(__workflows.plainSecret); __must(issues.includes('plain-text-secret'), 'expected plain-text-secret, got ' + issues.join(', ')); return true; })()`,
              'A token-shaped value that is not `${{ secrets.* }}` in a workflow file is a leak.',
            ),
          ],
        },
        {
          id: 'debug-unsafe-deploy',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          prompt:
            '`planDeploy(request)` decides what a deploy command does - and right now a typo in the environment name silently ships to ' +
            'production, migrations run after the app is switched over, and an unconfirmed production deploy goes ahead anyway. Make it ' +
            'default-deny and ordered correctly.',
          requirements: [
            'Known environments only: `development`, `staging`, `production` - anything else throws',
            'Anything other than production runs as `apply` without confirmation',
            'A production deploy without `confirm: true` returns `{ mode: "dry-run", steps }` and does not include the switch step',
            'When allowed, the steps are ordered: `verify-config`, `run-migrations`, `deploy-app`, `smoke-test`',
            'A production deploy of a service with pending destructive migrations is blocked with a reason',
          ],
          starter: `function planDeploy(request) {
  const env = request.env || 'production';
  const steps = [];

  if (request.migrate) steps.push('run-migrations');
  steps.push('deploy-app');

  return { mode: 'apply', env, steps };
}
`,
          hints: [
            'An unknown environment should throw, not fall back to production - default-deny.',
            'Return a dry run for production unless `request.confirm === true`.',
            'Destructive migrations on production need an explicit `allowDestructive: true`, otherwise return `{ blocked: \'...\' }`.',
          ],
          solution: `function planDeploy(request) {
  const ALLOWED = ['development', 'staging', 'production'];
  const env = request.env;

  if (ALLOWED.indexOf(env) === -1) {
    throw new Error('Unknown environment: ' + JSON.stringify(env));
  }

  const steps = ['verify-config'];

  const destructive = request.destructiveMigrations === true;
  if (env === 'production' && destructive && request.allowDestructive !== true) {
    return { mode: 'blocked', env, blocked: 'destructive migrations on production need allowDestructive: true', steps };
  }

  if (request.migrate) steps.push('run-migrations');

  const confirmed = env !== 'production' || request.confirm === true;
  if (!confirmed) {
    return { mode: 'dry-run', env, steps };
  }

  steps.push('deploy-app', 'smoke-test');
  return { mode: 'apply', env, steps };
}
`,
          checks: [
            T.js(
              'unknown environments are rejected',
              `(function () { ['prod', 'PRODUCTION', '', undefined, 'staging2'].forEach((env) => { let threw = false; try { planDeploy({ env: env }); } catch (err) { threw = true; } __must(threw, 'the environment ' + JSON.stringify(env) + ' should have been rejected, not defaulted'); }); return true; })()`,
              'Default-deny: throw unless the environment is on an explicit allowlist.',
            ),
            T.js(
              'a non-production deploy applies in order',
              `(function () { const plan = planDeploy({ env: 'staging', migrate: true }); __must(plan.mode === 'apply', 'staging should apply without confirmation, got ' + plan.mode); __must(plan.steps.join(' > ') === 'verify-config > run-migrations > deploy-app > smoke-test', 'steps out of order: ' + plan.steps.join(' > ')); return true; })()`,
              'Migrations must land before the app that depends on them.',
            ),
            T.js(
              'an unconfirmed production deploy is a dry run',
              `(function () { const plan = planDeploy({ env: 'production', migrate: true }); __must(plan.mode === 'dry-run', 'production without confirm should be dry-run, got ' + plan.mode); __must(plan.steps.indexOf('deploy-app') === -1, 'a dry run must not include switching the app over: ' + plan.steps.join(' > ')); return true; })()`,
              'Return early with the plan so far.',
            ),
            T.js(
              'a confirmed production deploy applies in full',
              `(function () { const plan = planDeploy({ env: 'production', migrate: true, confirm: true }); __must(plan.mode === 'apply', 'a confirmed production deploy should apply, got ' + plan.mode); __must(plan.steps.join(' > ') === 'verify-config > run-migrations > deploy-app > smoke-test', 'steps out of order: ' + plan.steps.join(' > ')); return true; })()`,
              'The confirmation only changes the mode, not the order.',
            ),
            T.js(
              'destructive production migrations are blocked',
              `(function () { const plan = planDeploy({ env: 'production', migrate: true, confirm: true, destructiveMigrations: true }); __must(plan.mode === 'blocked', 'a destructive production migration should be blocked, got ' + plan.mode); __must(typeof plan.blocked === 'string' && plan.blocked.length > 0, 'a blocked plan should explain why'); const allowed = planDeploy({ env: 'production', migrate: true, confirm: true, destructiveMigrations: true, allowDestructive: true }); __must(allowed.mode === 'apply', 'an explicit allowDestructive should let it through'); return true; })()`,
              'Require an explicit opt-in for the dangerous case.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ops-04',
      title: 'Logging, Health and Graceful Shutdown',
      minutes: 45,
      objectives: [
        'Emit structured logs with redaction and levels',
        'Expose health and readiness honestly',
        'Shut down without dropping in-flight requests',
      ],
      sections: [
        {
          heading: 'Structured, not printed',
          body:
            '```js\nlog.info(\'task.created\', { taskId: 42, durationMs: 12 });\n// {"level":"info","time":"2026-04-01T10:00:00.000Z","msg":"task.created","taskId":42,"durationMs":12}\n```\n\n' +
            'One JSON object per line means your log platform can filter, group and alert on fields. String-concatenated logs ("user 42 created task ' +
            'in 12ms") cannot be queried without a regex, and the regex breaks the next time someone rewords the message.\n\n' +
            'Rules that pay off immediately: log **events in the past tense** (`task.created`), never log the whole request body, always include a ' +
            'request id so you can follow one request through a distributed system, and redact by key name as a safety net.',
        },
        {
          heading: 'Liveness and readiness answer different questions',
          body:
            '- **Liveness**: "is the process alive?" - if not, restart me. It must not touch the database; a database blip should not trigger a ' +
            'restart storm\n' +
            '- **Readiness**: "should traffic come to me right now?" - checks the database connection pool, migrations, any mandatory dependency. ' +
            'Failing readiness removes you from the load balancer without killing you\n\n' +
            '```js\napp.get(\'/healthz\', (req, res) => res.status(200).json({ status: \'ok\' }));\n' +
            'app.get(\'/readyz\', async (req, res) => {\n  const ok = await db.ping();\n  res.status(ok ? 200 : 503).json({ status: ok ? \'ready\' : \'not ready\' });\n});\n```\n\n' +
            'The container orchestrator uses these. A `HEALTHCHECK` in your Dockerfile should hit `/healthz`.',
        },
        {
          heading: 'Graceful shutdown, in order',
          body:
            'When the platform sends `SIGTERM` you have a short window (often 30 seconds) before `SIGKILL`:\n\n' +
            '1. **Stop accepting new connections** - `server.close()`\n' +
            '2. **Let in-flight requests finish**, with a deadline\n' +
            '3. **Flush** logs, metrics and any buffered writes\n' +
            '4. **Close the database pool**\n' +
            '5. **Exit** with a status code, forcibly if the deadline expires\n\n' +
            '```js\nprocess.on(\'SIGTERM\', () => { stop(\'SIGTERM\').then(() => process.exit(0)); });\n```\n\n' +
            'Without this, every deploy returns 502s for the requests that were in flight - and the deploy that looked green was not.',
        },
      ],
      pitfalls: [
        'Concatenating strings instead of emitting fields, so nothing is queryable',
        'Logging request bodies and headers - a password in the log is a password leak',
        'A liveness probe that checks the database, turning a blip into a restart loop',
        'Returning 200 from readiness while the pool is exhausted',
        'Exiting on SIGTERM immediately, cutting off in-flight requests',
        'No timeout on shutdown, so the container hangs until SIGKILL',
      ],
      keyPoints: [
        'One JSON line per event, with fields, a request id, and redaction by key name',
        'Liveness = am I alive; readiness = should traffic reach me',
        'SIGTERM: stop accepting, drain with a deadline, flush, close, exit',
      ],
      resources: [
        { label: 'Node.js: process signal events', url: 'https://nodejs.org/api/process.html#signal-events' },
        { label: 'Kubernetes: Liveness, readiness and startup probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
        { label: 'Google SRE Book: Monitoring distributed systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
      ],
      challenges: [
        {
          id: 'write-logger',
          kind: 'write',
          difficulty: 'medium',
          minutes: 20,
          lang: 'js',
          prelude: RETRY_LOG_PRELUDE,
          prompt:
            'Write `createLogger({ sink, level, context })` returning `{ debug, info, warn, error, child }`. Every call writes exactly one JSON ' +
            'string to `sink.write`, with `level`, `time`, `msg`, the inherited context and the call\'s fields merged in - and secrets redacted ' +
            'on the way out.',
          requirements: [
            'Levels are ordered `debug < info < warn < error`; a call below the configured level writes nothing',
            'Each line is `JSON.stringify` of an object containing `level`, `msg` and the merged fields',
            '`child(extraContext)` returns a logger that adds `extraContext` to every line, without mutating its parent',
            'Keys matching password/token/secret/authorization/apikey/cookie are written as `[redacted]`',
            '`error(msg, errorObject)` includes the error message and stack, not the whole error object',
          ],
          starter: `function createLogger(options) {
  const sink = options.sink;
  const context = options.context || {};

  return {
    info: (msg, fields) => sink.write(msg),
    debug: (msg, fields) => sink.write(msg),
    warn: (msg, fields) => sink.write(msg),
    error: (msg, fields) => sink.write(msg),
    child: () => createLogger(options),
  };
}
`,
          hints: [
            'A numeric level map makes filtering trivial: `const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };`',
            'Build the record then stringify once: `sink.write(JSON.stringify({ level, time: new Date().toISOString(), msg, ...context, ...fields }))`.',
            'Reuse the `redact` idea from the first lesson: walk the fields and replace sensitive keys.',
          ],
          solution: `function createLogger(options) {
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const SENSITIVE = ['password', 'token', 'secret', 'authorization', 'apikey', 'api_key', 'cookie'];

  const sink = options.sink;
  const threshold = LEVELS[options.level || 'info'];
  const context = options.context || {};

  const isSensitive = (key) => SENSITIVE.some((fragment) => key.toLowerCase().includes(fragment));

  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = isSensitive(key) ? '[redacted]' : clean(value[key]);
    }
    return out;
  }

  function write(level, msg, fields) {
    if (LEVELS[level] < threshold) return;
    const extra = fields || {};
    if (extra.error instanceof Error) {
      extra.error = { message: extra.error.message, stack: extra.error.stack, name: extra.error.name };
    }
    sink.write(JSON.stringify(Object.assign({ level, time: new Date().toISOString(), msg }, clean(context), clean(extra))));
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (extra) => createLogger({ sink, level: options.level, context: Object.assign({}, context, extra) }),
  };
}
`,
          checks: [
            T.js(
              'emits one JSON object per line',
              `(function () {
  const sink = __sink();
  const log = createLogger({ sink: sink, level: 'info', context: { service: 'api' } });
  log.info('task.created', { taskId: 42 });
  __must(sink.lines.length === 1, 'expected exactly one line, got ' + sink.lines.length);
  const record = JSON.parse(sink.lines[0]);
  __must(record.level === 'info' && record.msg === 'task.created', 'level and msg are required fields, got ' + sink.lines[0]);
  __must(record.service === 'api', 'the context should be merged in, got ' + sink.lines[0]);
  __must(record.taskId === 42, 'the call fields should be merged in, got ' + sink.lines[0]);
  __must(typeof record.time === 'string', 'each line needs a timestamp');
  return true;
})()`,
              'Build the record object first, then `JSON.stringify` it once.',
            ),
            T.js(
              'filters by level',
              `(function () { const sink = __sink(); const log = createLogger({ sink: sink, level: 'warn' }); log.debug('nope'); log.info('nope'); log.warn('kept'); log.error('kept'); __must(sink.lines.length === 2, 'expected only the warn and error lines, got ' + sink.lines.length); return true; })()`,
              'Compare the numeric level of the call with the threshold.',
            ),
            T.js(
              'child loggers add context without mutating the parent',
              `(function () {
  const sink = __sink();
  const root = createLogger({ sink: sink, context: { service: 'api' } });
  const child = root.child({ requestId: 'r-1' });
  child.info('handled');
  root.info('root line');
  const first = JSON.parse(sink.lines[0]);
  const second = JSON.parse(sink.lines[1]);
  __must(first.requestId === 'r-1' && first.service === 'api', 'the child should carry both contexts, got ' + sink.lines[0]);
  __must(second.requestId === undefined, 'the parent must not be changed by the child, got ' + sink.lines[1]);
  return true;
})()`,
              '`child` returns a new logger with merged context.',
            ),
            T.js(
              'secrets are redacted in fields and context',
              `(function () {
  const sink = __sink();
  const log = createLogger({ sink: sink, context: { dbPassword: 'hunter2' } });
  log.info('login', { user: 'ama', token: 'abc', nested: { cookie: 'session=1', ok: true } });
  const line = sink.lines[0];
  __must(!/hunter2/.test(line), 'the context secret leaked: ' + line);
  __must(!/"token":"abc"/.test(line) && !/session=1/.test(line), 'a field secret leaked: ' + line);
  __must(/"user":"ama"/.test(line) && /"ok":true/.test(line), 'benign fields must survive: ' + line);
  return true;
})()`,
              'Walk the merged record and redact by key name.',
            ),
            T.js(
              'error objects are summarised, not dumped',
              `(function () {
  const sink = __sink();
  const log = createLogger({ sink: sink, level: 'error' });
  const boom = new Error('database is down');
  log.error('request failed', { error: boom });
  const record = JSON.parse(sink.lines[0]);
  __must(record.error && record.error.message === 'database is down', 'the error message should be included, got ' + sink.lines[0]);
  __must(typeof record.error.stack === 'string', 'the stack is what you actually need at 3am');
  return true;
})()`,
              'Detect `instanceof Error` and store message, name and stack.',
            ),
          ],
        },
        {
          id: 'write-graceful-shutdown',
          kind: 'write',
          difficulty: 'hard',
          minutes: 22,
          lang: 'js',
          prelude: RETRY_LOG_PRELUDE,
          prompt:
            'Write `createShutdown({ server, log, timeoutMs, setTimeoutFn })` returning `stop(signal)`. It stops accepting connections, waits for ' +
            'in-flight work with a deadline, logs the outcome, and is idempotent - the second call returns the same promise rather than closing ' +
            'twice.',
          requirements: [
            '`stop(signal)` calls `server.close()` exactly once',
            'It resolves `"closed"` when the server finishes draining, `"timeout"` when the deadline wins',
            'A timeout logs a warning; a clean close logs an info line',
            'Calling `stop` twice returns the identical promise (no second `close()`)',
            '`timeoutMs` defaults to 5000, and `setTimeoutFn` is injectable so the test never waits',
          ],
          starter: `function createShutdown(options) {
  const server = options.server;
  const log = options.log;

  return function stop(signal) {
    log('info', 'shutting down', { signal });
    server.close();
  };
}
`,
          hints: [
            'Cache the promise: `if (stopping) return stopping; stopping = (async () => {...})(); return stopping;`',
            'Race the close callback against a timer: `Promise.race([closed, timeout])`.',
            'The injected timer gives you the timeout path instantly: `setTimeoutFn: (fn) => { fn(); return 0; }`.',
          ],
          solution: `function createShutdown(options) {
  const server = options.server;
  const log = options.log || function () {};
  const timeoutMs = options.timeoutMs === undefined ? 5000 : options.timeoutMs;
  const setTimeoutFn = options.setTimeoutFn || setTimeout;

  let stopping = null;

  return function stop(signal) {
    if (stopping) return stopping;

    log('info', 'shutting down', { signal, timeoutMs });

    stopping = (async function () {
      const closed = new Promise((resolve) => {
        server.close(() => resolve('closed'));
      });

      const timedOut = new Promise((resolve) => {
        setTimeoutFn(() => resolve('timeout'), timeoutMs);
      });

      const outcome = await Promise.race([closed, timedOut]);

      if (outcome === 'timeout') {
        log('warn', 'forced shutdown after the deadline', { signal, timeoutMs });
      } else {
        log('info', 'shutdown complete', { signal });
      }

      return outcome;
    })();

    return stopping;
  };
}
`,
          checks: [
            T.js(
              'resolves "closed" when the server drains',
              `(async function () {
  let closed = 0;
  const server = { close: (cb) => { closed += 1; cb(); } };
  const events = [];
  const stop = createShutdown({ server, log: (level, msg) => events.push(level + ':' + msg) });
  const outcome = await stop('SIGTERM');
  __must(outcome === 'closed', 'expected "closed", got ' + JSON.stringify(outcome));
  __must(closed === 1, 'server.close should be called once, called ' + closed + ' time(s)');
  __must(events.some((e) => e.startsWith('info:')), 'a clean shutdown should log at info, got ' + events.join(' | '));
  return true;
})()`,
              'Wrap `server.close` in a promise that resolves in its callback.',
            ),
            T.js(
              'resolves "timeout" when the deadline wins',
              `(async function () {
  const server = { close: () => {} };
  const events = [];
  const stop = createShutdown({
    server,
    timeoutMs: 1000,
    setTimeoutFn: (fn) => { fn(); return 0; },
    log: (level, msg) => events.push(level + ':' + msg),
  });
  const outcome = await stop('SIGTERM');
  __must(outcome === 'timeout', 'expected "timeout", got ' + JSON.stringify(outcome));
  __must(events.some((e) => e.startsWith('warn:')), 'a forced shutdown must log a warning, got ' + events.join(' | '));
  return true;
})()`,
              'Race the close against the injected timer.',
            ),
            T.js(
              'is idempotent',
              `(async function () {
  let closed = 0;
  const server = { close: (cb) => { closed += 1; setTimeout(() => cb(), 0); } };
  const stop = createShutdown({ server, log: function () {} });
  const first = stop('SIGTERM');
  const second = stop('SIGTERM');
  __must(first === second, 'the second call must return the same promise, not start a second shutdown');
  await Promise.all([first, second]);
  __must(closed === 1, 'server.close should run once, ran ' + closed + ' times');
  return true;
})()`,
              'Cache the promise and return it early.',
            ),
            T.js(
              'logs the signal it received',
              `(async function () {
  const events = [];
  const server = { close: (cb) => cb() };
  const stop = createShutdown({ server, log: (level, msg, fields) => events.push({ level, msg, fields }) });
  await stop('SIGINT');
  const start = events[0];
  __must(start && start.fields && start.fields.signal === 'SIGINT', 'the log should carry the signal, got ' + JSON.stringify(events));
  return true;
})()`,
              'Pass the signal through to the log fields.',
            ),
          ],
        },
        {
          id: 'debug-leaky-request-log',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            '`summariseRequest(request)` is used in an access log. It leaks the auth header and the request body (passwords included), and it ' +
            'blows up on a body that cannot be stringified. Rewrite it to return only what an access log needs.',
          requirements: [
            'Returns `{ method, path, authScheme, bodyKeys, hasBody }`',
            '`authScheme` is the scheme only (`"Bearer"`, `"Basic"`), never the token',
            'Cookies and any other headers are not included at all',
            '`bodyKeys` is the list of top-level keys, sorted',
            'A missing method, headers or body does not throw',
            'Nothing in the result can contain a secret value',
          ],
          starter: `function summariseRequest(request) {
  return {
    method: request.method,
    path: request.url,
    headers: request.headers,
    body: JSON.stringify(request.body),
  };
}
`,
          hints: [
            '`authScheme`: split the Authorization header on a space and take the first word.',
            '`bodyKeys`: `Object.keys(request.body || {}).sort()` - keys, never values.',
            'Guard every optional access with `|| []` or `|| {}` so a bare request does not crash.',
          ],
          solution: `function summariseRequest(request) {
  const req = request || {};
  const headers = req.headers || {};
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const authorization = String(headers.authorization || headers.Authorization || '');
  const authScheme = authorization ? authorization.split(' ')[0] : null;

  return {
    method: req.method || null,
    path: req.url || req.path || null,
    authScheme,
    bodyKeys: Object.keys(body).sort(),
    hasBody: Object.keys(body).length > 0,
  };
}
`,
          checks: [
            T.js(
              'returns the shape an access log needs',
              `(function () {
  const summary = summariseRequest({
    method: 'POST',
    url: '/api/tasks',
    headers: { authorization: 'Bearer sk_live_12345', cookie: 'session=secret' },
    body: { title: 'Ship it', password: 'hunter2' },
  });
  __must(summary.method === 'POST' && summary.path === '/api/tasks', 'method and path should pass through, got ' + JSON.stringify(summary));
  __must(summary.authScheme === 'Bearer', 'authScheme should be the scheme only, got ' + JSON.stringify(summary.authScheme));
  __must(summary.bodyKeys.join() === 'password,title', 'bodyKeys should be the sorted top-level keys, got ' + JSON.stringify(summary.bodyKeys));
  __must(summary.hasBody === true, 'hasBody should be true here');
  return true;
})()`,
              'Keys, never values: the whole point is that no secret can appear.',
            ),
            T.js(
              'not a single secret value survives',
              `(function () {
  const summary = summariseRequest({
    method: 'POST',
    url: '/login',
    headers: { authorization: 'Bearer sk_live_12345', cookie: 'session=secret' },
    body: { user: 'ama', password: 'hunter2', refresh_token: 'rt_999' },
  });
  const text = JSON.stringify(summary);
  ['sk_live_12345', 'hunter2', 'rt_999', 'session=secret'].forEach((secret) => {
    __must(text.indexOf(secret) === -1, 'the summary leaked ' + secret + ': ' + text);
  });
  return true;
})()`,
              'Do not include headers or body values anywhere in the result.',
            ),
            T.js(
              'survives a sparse or broken request',
              `(function () {
  const empty = summariseRequest({});
  __must(empty.authScheme === null, 'no auth header should mean a null scheme, got ' + JSON.stringify(empty.authScheme));
  __must(Array.isArray(empty.bodyKeys) && empty.bodyKeys.length === 0, 'no body should mean no keys');
  __must(empty.hasBody === false, 'hasBody should be false');
  const weird = summariseRequest({ body: 'not-an-object' });
  __must(Array.isArray(weird.bodyKeys), 'a non-object body must not crash the logger');
  return true;
})()`,
              'Guard every read - an access logger must never be the thing that crashes.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ops-05',
      title: 'Migrations, Feature Flags and Rolling Back',
      minutes: 45,
      objectives: [
        'Plan a backwards-compatible (expand/contract) schema migration',
        'Gate risky work behind a flag with a kill switch',
        'Define what "healthy" means before you deploy, so you can roll back on data',
      ],
      sections: [
        {
          heading: 'Expand, migrate, contract',
          body:
            'A deploy is not atomic: old code and new code run at the same time. So a schema change must be compatible with both. The pattern is ' +
            'always the same three releases:\n\n' +
            '1. **Expand** - add the new column, nullable, with no constraints. Both versions of the code work\n' +
            '2. **Migrate** - backfill existing rows, dual-write from the new code, then switch the reads\n' +
            '3. **Contract** - once no code reads the old column, drop it\n\n' +
            'That means a rename is **never** a `RENAME COLUMN` in a live system: it is add, backfill, dual-write, stop writing the old one, drop. ' +
            'It is slower to write and the only version that never causes an outage.',
        },
        {
          heading: 'Flags: ship dark, turn on deliberately',
          body:
            '```js\nif (flags.enabled(\'new-checkout\')) {\n  return newCheckout(req);\n}\nreturn legacyCheckout(req);\n```\n\n' +
            'A flag decouples *deploy* from *release*. The standard shape has, in order of precedence:\n\n' +
            '1. **Kill switch** - off means off, for everyone, immediately (this is the one you reach for during an incident)\n' +
            '2. **Allowlist** - specific user ids, for internal testing\n' +
            '3. **Percentage rollout** - a deterministic bucket per user, so a user does not flicker between variants\n' +
            '4. **Default** - usually off\n\n' +
            'That "deterministic" part matters: `Math.random()` per request would show some users both experiences. Hash `flagName + userId` ' +
            'instead, so the decision is stable for that user.',
        },
        {
          heading: 'Rollback is a decision, so define the trigger first',
          body:
            'Write down what "healthy" means *before* the deploy: error rate below 1%, p95 latency under 300ms, no drop in conversion. Then:\n\n' +
            '- Watch the metrics for a fixed window (a few minutes, not a single successful probe)\n' +
            '- Roll back on the *artefact* - point the platform at the previous image, do not revert commits under pressure\n' +
            '- Roll back the code first, then decide about the data: with expand/contract, the data needs no rollback at all\n' +
            '- For flag-gated work, the fastest rollback is turning the flag off - no deploy at all\n' +
            '- Blameless postmortem afterwards: what did the system let through, not who typed it',
        },
      ],
      pitfalls: [
        '`RENAME COLUMN` or `DROP COLUMN` in the same release as the code change',
        'A `NOT NULL` column added without a default, so old code cannot insert',
        'A percentage rollout using `Math.random()` per request, so users flicker',
        'No kill switch on a flag, so an incident needs a deploy to stop',
        'Marking a release healthy from one probe instead of a window of metrics',
        'Rolling back by reverting commits while the database has already moved on',
      ],
      keyPoints: [
        'Expand, migrate, contract: every schema change stays compatible with the code that is still running',
        'Kill switch first, allowlist, deterministic percentage - in that precedence',
        'Decide the rollback trigger before the deploy, and roll back the artefact, not the commits',
      ],
      resources: [
        { label: 'Martin Fowler: ParallelChange (expand/contract)', url: 'https://martinfowler.com/bliki/ParallelChange.html' },
        { label: 'Martin Fowler: Feature Toggles', url: 'https://martinfowler.com/articles/feature-toggles.html' },
        { label: 'Google SRE Book: Postmortem culture', url: 'https://sre.google/sre-book/postmortem-culture/' },
      ],
      challenges: [
        {
          id: 'write-migration-plan',
          kind: 'write',
          difficulty: 'hard',
          minutes: 22,
          lang: 'js',
          prompt:
            'Write `planMigration(current, next)` where each is an array of `{ name, type }` columns. It returns an ordered array of steps that ' +
            'moves the database from `current` to `next` without ever breaking the code that is still running: expansions first, then backfills ' +
            'and dual writes, then type changes, and every drop last.',
          requirements: [
            'An added column produces `add: <name>`, then `backfill: <name>`, then `set-not-null: <name>`',
            'A column whose name changed (same position or type, new name) is treated as add + backfill + dual-write - never `rename`',
            'A dropped column produces `stop-writing: <name>` and `drop: <name>`, and every `drop:` step comes last',
            'Type changes produce `type-change: <name>` and land after backfills but before drops',
            'The original arrays are not mutated',
            'Step order is stable: two runs on the same input give the same array',
          ],
          starter: `function planMigration(current, next) {
  const steps = [];

  // Produce the ordered plan.
  return steps;
}
`,
          hints: [
            'Three passes: additions and renames first, then type changes, then removals - that is the expand/contract shape.',
            'Detect a rename as a removed name plus an added name with the same `type`: treat it as add + backfill + dual-write of both names.',
            'Guard the arrays: `const before = current || [];` and build new arrays, never `splice`.',
          ],
          solution: `function planMigration(current, next) {
  const before = current || [];
  const after = next || [];
  const beforeNames = before.map((column) => column.name);
  const afterNames = after.map((column) => column.name);

  const added = after.filter((column) => beforeNames.indexOf(column.name) === -1);
  const removed = before.filter((column) => afterNames.indexOf(column.name) === -1);
  const kept = after.filter((column) => beforeNames.indexOf(column.name) !== -1);

  const steps = [];

  // Expand: new columns arrive nullable, so old code keeps working.
  added.forEach((column) => {
    steps.push('add: ' + column.name);
    steps.push('backfill: ' + column.name);
    steps.push('set-not-null: ' + column.name);
  });

  // Renames are an add + dual write, never a RENAME COLUMN.
  removed.forEach((column) => {
    const replacement = added.find((candidate) => candidate.type === column.type);
    if (replacement) {
      steps.push('backfill: ' + column.name + ' -> ' + replacement.name);
      steps.push('dual-write: ' + column.name + ', ' + replacement.name);
    }
  });

  // Type changes squeeze in after the backfills.
  kept.forEach((column) => {
    const original = before.find((candidate) => candidate.name === column.name);
    if (original && original.type !== column.type) {
      steps.push('type-change: ' + column.name);
    }
  });

  // Contract: nothing is dropped until every reader has moved on.
  removed.forEach((column) => {
    steps.push('stop-writing: ' + column.name);
  });
  removed.forEach((column) => {
    steps.push('drop: ' + column.name);
  });

  return steps;
}
`,
          checks: [
            T.js(
              'an added column expands before it is enforced',
              `(function () {
  const plan = planMigration([{ name: 'id', type: 'int' }], [{ name: 'id', type: 'int' }, { name: 'due', type: 'date' }]);
  __must(plan.join(' > ') === 'add: due > backfill: due > set-not-null: due', 'expected add, backfill then set-not-null, got ' + plan.join(' > '));
  return true;
})()`,
              'The column must exist and be filled before anything requires it.',
            ),
            T.js(
              'a rename is never a rename',
              `(function () {
  const plan = planMigration([{ name: 'title', type: 'text' }], [{ name: 'summary', type: 'text' }]);
  __must(plan.some((step) => step.indexOf('dual-write') !== -1), 'a rename should include a dual-write step, got ' + plan.join(' > '));
  __must(!plan.some((step) => step.indexOf('rename') !== -1), 'never emit a rename step: ' + plan.join(' > '));
  const dropIndex = plan.findIndex((step) => step.indexOf('drop:') === 0);
  const writeIndex = plan.findIndex((step) => step.indexOf('stop-writing') === 0);
  __must(writeIndex !== -1 && dropIndex > writeIndex, 'stop-writing must come before the drop, got ' + plan.join(' > '));
  return true;
})()`,
              'Add the new column, backfill from the old, dual-write both, then stop and drop.',
            ),
            T.js(
              'drops always come last',
              `(function () {
  const plan = planMigration(
    [{ name: 'id', type: 'int' }, { name: 'legacy', type: 'text' }],
    [{ name: 'id', type: 'bigint' }, { name: 'due', type: 'date' }],
  );
  const firstDrop = plan.findIndex((step) => step.indexOf('drop:') === 0);
  const lastNonDrop = plan.map((step, i) => (step.indexOf('drop:') === 0 ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  __must(firstDrop > lastNonDrop, 'every drop must come after every other step, got ' + plan.join(' > '));
  const typeIndex = plan.indexOf('type-change: id');
  __must(typeIndex !== -1, 'the id type change should be planned, got ' + plan.join(' > '));
  __must(typeIndex < firstDrop, 'the type change must happen before the drops');
  return true;
})()`,
              'Order the passes: expand, backfill/dual-write, type changes, then contract.',
            ),
            T.js(
              'the input arrays are untouched and the plan is stable',
              `(function () {
  const before = [{ name: 'a', type: 'int' }, { name: 'b', type: 'text' }];
  const after = [{ name: 'a', type: 'int' }, { name: 'c', type: 'text' }];
  const beforeCopy = JSON.stringify(before);
  const afterCopy = JSON.stringify(after);
  const first = planMigration(before, after);
  const second = planMigration(before, after);
  __must(JSON.stringify(before) === beforeCopy && JSON.stringify(after) === afterCopy, 'the inputs were mutated');
  __must(first.join('|') === second.join('|'), 'the plan should be deterministic');
  __must(Array.isArray(first) && first.length > 0, 'there should be steps to run');
  return true;
})()`,
              'Build new arrays; sort nothing that depends on iteration order.',
            ),
          ],
        },
        {
          id: 'write-flag-gate',
          kind: 'write',
          difficulty: 'medium',
          minutes: 20,
          lang: 'js',
          prompt:
            'Write `createFlags({ rules, user })` returning `{ enabled(name) }`. Precedence: kill switch, then allowlist, then a deterministic ' +
            'percentage rollout, then the flag default. An unknown flag is off.',
          requirements: [
            'A rule of `{ kill: true }` disables the flag for everyone, even allowlisted users',
            '`{ users: ["u1"] }` enables it for exactly those ids',
            '`{ percent: 50 }` enables it for a stable, deterministic subset - the same user always gets the same answer',
            '`percent: 0` enables nobody, `percent: 100` enables everybody',
            'An unknown flag name is `false`',
            'A missing `user.id` never enables a percentage rollout (fall back to the default)',
          ],
          starter: `function createFlags(options) {
  const rules = options.rules || {};
  const user = options.user || {};

  return {
    enabled: (name) => Boolean(rules[name] && rules[name].default),
  };
}
`,
          hints: [
            'Do not use `Math.random()` - the same user must always get the same answer. Hash `name + ":" + user.id` instead.',
            'A simple deterministic hash: `let hash = 0; for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;` then `(hash % 100) < percent`.',
            'Order the checks: kill, then allowlist, then percent, then default.',
          ],
          solution: `function createFlags(options) {
  const rules = options.rules || {};
  const user = options.user || {};

  function bucket(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) % 100000;
    }
    return hash % 100;
  }

  return {
    enabled(name) {
      const rule = rules[name];
      if (!rule) return false;
      if (rule.kill === true) return false;
      if (Array.isArray(rule.users) && user.id !== undefined && rule.users.indexOf(user.id) !== -1) return true;
      if (typeof rule.percent === 'number') {
        if (user.id === undefined) return Boolean(rule.default);
        return bucket(name + ':' + user.id) < rule.percent;
      }
      return Boolean(rule.default);
    },
  };
}
`,
          checks: [
            T.js(
              'the kill switch beats everything',
              `(function () {
  const flags = createFlags({ rules: { checkout: { kill: true, users: ['u1'], percent: 100, default: true } }, user: { id: 'u1' } });
  __must(flags.enabled('checkout') === false, 'a kill switch must disable the flag even for allowlisted users');
  return true;
})()`,
              'Check `kill` before anything else.',
            ),
            T.js(
              'the allowlist and the default behave',
              `(function () {
  const flags = createFlags({ rules: { beta: { users: ['u1'], default: false }, gamma: { default: true } }, user: { id: 'u2' } });
  __must(createFlags({ rules: { beta: { users: ['u1'] } }, user: { id: 'u1' } }).enabled('beta') === true, 'an allowlisted user should get the flag');
  __must(flags.enabled('beta') === false, 'a user outside the allowlist should fall through to the default');
  __must(flags.enabled('gamma') === true, 'the default should apply when there is no rollout');
  __must(flags.enabled('nope') === false, 'an unknown flag must be false');
  return true;
})()`,
              'Allowlist, then percent, then default; unknown flag returns false immediately.',
            ),
            T.js(
              'the percentage rollout is deterministic per user',
              `(function () {
  const make = (id) => createFlags({ rules: { rollout: { percent: 40 } }, user: { id } });
  for (let i = 0; i < 50; i += 1) {
    const first = make('user-' + i).enabled('rollout');
    const second = make('user-' + i).enabled('rollout');
    __must(first === second, 'user-' + i + ' flickered between variants - the bucket must be stable');
  }
  return true;
})()`,
              'Hash `name + ":" + user.id`, never `Math.random()`.',
            ),
            T.js(
              'zero and one hundred are absolute',
              `(function () {
  for (let i = 0; i < 30; i += 1) {
    __must(createFlags({ rules: { off: { percent: 0 } }, user: { id: 'u' + i } }).enabled('off') === false, 'percent 0 must enable nobody');
    __must(createFlags({ rules: { on: { percent: 100 } }, user: { id: 'u' + i } }).enabled('on') === true, 'percent 100 must enable everybody');
  }
  return true;
})()`,
              '`bucket < percent` with 0 and 100 at the extremes.',
            ),
            T.js(
              'the rollout is roughly the requested size and needs a user',
              `(function () {
  let enabled = 0;
  for (let i = 0; i < 500; i += 1) {
    if (createFlags({ rules: { r: { percent: 50 } }, user: { id: 'u' + i } }).enabled('r')) enabled += 1;
  }
  __must(enabled > 150 && enabled < 350, 'a 50% rollout enabled ' + enabled + ' of 500 - the bucketing is not distributed');
  const anonymous = createFlags({ rules: { r: { percent: 100, default: false } }, user: {} });
  __must(anonymous.enabled('r') === false, 'without a user id a percentage rollout should fall back to the default');
  return true;
})()`,
              'A modulo hash spreads keys across the 0-99 range.',
            ),
          ],
        },
        {
          id: 'debug-release-gate',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          prompt:
            '`evaluateRelease(samples, thresholds)` is what a deploy pipeline calls before promoting a release. Right now a single healthy probe ' +
            'promotes it, a 40% error rate still passes, and a release with almost no traffic counts as healthy. Fix the gate.',
          requirements: [
            'Health is judged over a window, not a single sample',
            'It needs at least 3 samples before it will say `"healthy"`; fewer means `"insufficient-data"`',
            'Every sample must be within `thresholds.maxErrorRate` and `thresholds.maxP95Ms`',
            'If any sample breaches a threshold, the result is `"rollback"`, with the failing sample in the reason',
            'A sample with fewer than `thresholds.minRps` requests is treated as insufficient traffic',
            'An empty list gives `"insufficient-data"`, and the input array is not mutated',
          ],
          starter: `function evaluateRelease(samples, thresholds) {
  const sample = samples[0];

  if (!sample) return { verdict: 'healthy' };
  if (sample.errorRate > 0.5) return { verdict: 'rollback' };

  return { verdict: 'healthy' };
}
`,
          hints: [
            'Return `{ verdict: "insufficient-data" }` whenever `samples.length < 3`.',
            'Any sample over the threshold means rollback; do not average the errors away.',
            'A sample with `rps < thresholds.minRps` should not be used to prove health - count those separately.',
          ],
          solution: `function evaluateRelease(samples, thresholds) {
  const limits = thresholds || { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 1 };
  const list = samples || [];

  if (list.length < 3) {
    return { verdict: 'insufficient-data', reason: 'need at least 3 samples, got ' + list.length };
  }

  const tooQuiet = list.filter((sample) => sample.rps < limits.minRps);
  if (tooQuiet.length === list.length) {
    return { verdict: 'insufficient-data', reason: 'no sample had at least ' + limits.minRps + ' requests per second' };
  }

  const bad = list.find((sample) => sample.errorRate > limits.maxErrorRate || sample.p95Ms > limits.maxP95Ms);
  if (bad) {
    return { verdict: 'rollback', reason: 'error rate ' + bad.errorRate + ', p95 ' + bad.p95Ms + 'ms in sample ' + bad.at };
  }

  return { verdict: 'healthy', reason: list.length + ' samples within thresholds' };
}
`,
          checks: [
            T.js(
              'a healthy window is promoted',
              `(function () {
  const samples = [
    { at: 't1', errorRate: 0.002, p95Ms: 120, rps: 40 },
    { at: 't2', errorRate: 0.004, p95Ms: 140, rps: 42 },
    { at: 't3', errorRate: 0.001, p95Ms: 110, rps: 38 },
  ];
  const result = evaluateRelease(samples, { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 1 });
  __must(result.verdict === 'healthy', 'three clean samples should be healthy, got ' + JSON.stringify(result));
  return true;
})()`,
              'All three samples must be inside the thresholds.',
            ),
            T.js(
              'one bad sample rolls back',
              `(function () {
  const samples = [
    { at: 't1', errorRate: 0.002, p95Ms: 120, rps: 40 },
    { at: 't2', errorRate: 0.4, p95Ms: 200, rps: 40 },
    { at: 't3', errorRate: 0.001, p95Ms: 110, rps: 38 },
  ];
  const result = evaluateRelease(samples, { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 1 });
  __must(result.verdict === 'rollback', 'a 40% error rate must roll back, got ' + JSON.stringify(result));
  __must(typeof result.reason === 'string' && result.reason.length > 0, 'the reason should say what failed');
  return true;
})()`,
              'Find the first sample that breaches either threshold.',
            ),
            T.js(
              'a single probe is not enough to promote',
              `(function () {
  const samples = [{ at: 't1', errorRate: 0, p95Ms: 100, rps: 50 }];
  const result = evaluateRelease(samples, { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 1 });
  __must(result.verdict === 'insufficient-data', 'one good sample is not evidence of health, got ' + JSON.stringify(result));
  __must(evaluateRelease([], { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 1 }).verdict === 'insufficient-data', 'an empty window is insufficient data');
  return true;
})()`,
              'Require at least three samples.',
            ),
            T.js(
              'a near-silent window is not healthy',
              `(function () {
  const samples = [
    { at: 't1', errorRate: 0, p95Ms: 100, rps: 0.1 },
    { at: 't2', errorRate: 0, p95Ms: 100, rps: 0.1 },
    { at: 't3', errorRate: 0, p95Ms: 100, rps: 0.1 },
  ];
  const result = evaluateRelease(samples, { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 5 });
  __must(result.verdict === 'insufficient-data', 'no traffic means no evidence, got ' + JSON.stringify(result));
  return true;
})()`,
              'Compare `sample.rps` with `thresholds.minRps`.',
            ),
            T.js(
              'the input is not mutated',
              `(function () {
  const samples = [
    { at: 't1', errorRate: 0.5, p95Ms: 900, rps: 10 },
    { at: 't2', errorRate: 0.5, p95Ms: 900, rps: 10 },
    { at: 't3', errorRate: 0.5, p95Ms: 900, rps: 10 },
  ];
  const copy = JSON.stringify(samples);
  evaluateRelease(samples, { maxErrorRate: 0.01, maxP95Ms: 300, minRps: 1 });
  __must(JSON.stringify(samples) === copy, 'the samples array was mutated');
  return true;
})()`,
              'Read only - no sorting, no marking.',
            ),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'ops-capstone',
    title: 'Capstone: ship the task app to production, then prove you can roll it back',
    minutes: 360,
    brief:
      'Take the app you have built across this curriculum and put it in production for real: containerised, configured from the environment, ' +
      'built and tested by a pipeline, observable, and reversible.\\n\\n' +
      'The measured part is not "does it run" - it is whether you can answer, from your own logs and dashboards, whether the deploy was ' +
      'healthy, and whether you can get back to the previous version in under five minutes without touching the database.\\n\\n' +
      'Write it up in `RUNBOOK.md`: the deploy steps, the rollback steps, the health definitions, and the pager rules. A runbook somebody else ' +
      'can follow at 3am is the deliverable.',
    starter: `task-app/
├── Dockerfile
├── .dockerignore
├── .env.example
├── .github/workflows/ci.yml
├── docker-compose.yml
├── ops/
│   ├── load-config.js
│   ├── logger.js
│   ├── health.js
│   ├── shutdown.js
│   └── migrate.js
├── migrations/
│   ├── 001_init.sql
│   └── 002_add_due_date.sql
└── RUNBOOK.md`,
    requirements: [
      'A multi-stage Dockerfile: pinned base, `npm ci` before the source copy, non-root `node` user, EXPOSE, HEALTHCHECK on `/healthz`',
      'A `.dockerignore` that excludes `node_modules`, `.git`, `.env` and test files',
      '`.env.example` lists every variable with a placeholder; no real value is ever committed',
      'Config validated at boot - the process exits non-zero with every problem listed',
      'Structured JSON logs with a request id, redaction by key name, and levels from `LOG_LEVEL`',
      '`/healthz` (liveness, no dependencies) and `/readyz` (readiness, checks the database) as separate endpoints',
      'SIGTERM handling that stops accepting, drains within a deadline, flushes and exits',
      'A CI pipeline that tests on Node 20 and 22, caches dependencies, pins action versions and cancels superseded runs',
      'A deploy job gated on `main`, on a successful build, with secrets from the secret store only',
      'Migrations written in expand/contract order and safe to run twice',
      'A reverse-proxy or orchestration config with the health check wired to the same endpoints',
      'A rolling release with either zero-downtime or a documented, acceptable window - your choice, stated explicitly',
      'One feature flag with a kill switch in front of a new behaviour',
      '`RUNBOOK.md` with deploy steps, rollback steps, health definitions, alerts and the postmortem template',
    ],
    checks: [
      '`docker build` succeeds and the image is under 200MB',
      '`docker run` with no environment variables exits non-zero in under 5 seconds with a message naming every missing variable',
      'Kill the container with SIGTERM during a request: the request completes, and the logs show a clean shutdown',
      'Stop the database and hit `/readyz`: 503; hit `/healthz`: still 200 (do not restart a healthy process)',
      'Log in and grep the log output for the password you typed: nothing found',
      'Push to a branch: CI runs the tests, and a pull request cannot deploy',
      'Run migrations twice in a row: no errors, no duplicated rows',
      'Deploy a change that adds a column, then roll the app back one version: the old code still works',
      'Roll back to the previous image: under five minutes, no database changes needed, users see no error page',
      'Flip the flag off: the old behaviour returns without a deploy',
      'Load test 100 concurrent requests while deploying: zero failed requests',
      '`RUNBOOK.md` is followable by someone who has never seen the repo - have a friend attempt it cold',
    ],
    stretch: [
      'Add a blue/green deploy with an automatic rollback on failed smoke tests',
      'Add OpenTelemetry traces and follow one request across the app and the database',
      'Add a queue-backed worker container with its own health check and scaling rule',
      'Add a synthetic check that exercises the critical path every minute',
      'Add a load-shedding rule: reject low-priority traffic before the database pool is exhausted',
      'Run a game day: kill the database in production-like conditions and write the postmortem',
    ],
  },
};
