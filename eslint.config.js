// Minimal dev tooling (P1-5, loose-ends-spec): one small strict flat config.
// tools/check.js already enforces the house-specific style (no useInput, no
// hardcoded colours, no dead exports); ESLint catches the general JS issues
// it cannot. Deliberately NOT here: TypeScript, plugin sprawl, import
// sorting, formatting rules — Prettier owns whitespace via `npm run format`.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.data/**',
      '.workspace/**',
      'coverage/**',
      // Generated from the command registry — lint the source, not the output.
      'docs/keymap.md',
      'docs/vim.md',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      // The spec's named four, at strict settings:
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      // Off on purpose: this is a TERMINAL app — regexes that match ESC/control
      // bytes are the product (input parsing, SGR stripping, OSC52, tier-D
      // assertions). The rule's risk model does not apply to exact-byte matchers.
      'no-control-regex': 'off',
      // JSX needs no plugin to parse (core handles it); the one hook that
      // catches real bugs is the rules-of-hooks ladder. exhaustive-deps
      // warns: sessionRef/ref patterns here intentionally skip some deps.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
