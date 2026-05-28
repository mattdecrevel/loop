import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'packages/**', 'drizzle/**'],
  },
  // JS files: ESLint's recommended ruleset.
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs}'],
  },
  // TS/TSX files: use the typescript-eslint parser so type syntax parses.
  // Rules are intentionally light — this repo relies on `tsc --noEmit` as the
  // primary correctness gate; ESLint here just catches obvious mistakes.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        URLSearchParams: 'readonly',
        Buffer: 'readonly',
        crypto: 'readonly',
        React: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
