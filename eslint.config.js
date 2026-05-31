import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'apps/research-app/dist/**',
      'playwright-report/**',
      'test-results/**',
      '.playwright-browsers/**',
      '.agent/mcp-output/**',
      '.agent/runs/**',
      'coverage/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
        document: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBTransactionMode: 'readonly',
        IDBObjectStore: 'readonly',
        IDBRequest: 'readonly',
        alert: 'readonly',
        confirm: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
);
