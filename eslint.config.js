// Lint for every JavaScript file in the repo. `npm run lint` (CI runs it too) fails on errors; warnings are advice.
//
// Three runtimes live here, and each gets only the globals it really has, so using `window` in the API or
// `process` in the app is caught instead of failing in production:
//   webapp/   browser
//   api/ and functions/   Cloudflare Workers (service-worker globals, no Node)
//   scripts/, tests/ and webapp/vite.config.js   Node
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // Built output, installed packages, local state, and the curricula (Markdown, plus a few code samples that are
    // teaching material, not part of this project).
    ignores: ['dist/', '**/node_modules/', 'screenshots/', '.wrangler/', 'backend/', 'learn/', 'genai/', 'lld/']
  },

  js.configs.recommended,

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Intentional empty catch blocks are fine when they say why; a bare `catch {}` is not.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // A leading underscore marks an argument or variable that is deliberately unused.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },

  {
    files: ['webapp/src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __BUILD_TIME__ is injected by Vite (webapp/vite.config.js `define`).
      globals: { ...globals.browser, __BUILD_TIME__: 'readonly' }
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Components used only in JSX would otherwise count as unused imports.
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  {
    // Plain-Node modules inside the app tree (the pre-render step imports them without Vite).
    files: ['webapp/src/**/*.test.js'],
    languageOptions: { globals: globals.node }
  },

  {
    files: ['api/**/*.js', 'functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Buffer comes from the `nodejs_compat` flag in wrangler.jsonc; the rest of Node is not there.
      globals: { ...globals.serviceworker, Buffer: 'readonly' }
    }
  },

  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs}', 'webapp/vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node }
  },

  {
    // These drive a real browser: the functions they hand to page.evaluate() run in the page, so `window`
    // and `document` are real there.
    files: ['tests/e2e/**/*.mjs', 'scripts/check/mermaid.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },

  {
    // The service worker runs in its own scope: no DOM, but `self`, `caches` and `clients`.
    files: ['webapp/public/sw.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.serviceworker }
  }
];
