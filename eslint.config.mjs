import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      '.opmap/',
      'reference/',
      'src/render/assets.generated.ts',
      'examples/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'fs/*', 'path', 'child_process', 'process'],
              message: 'src/core is isomorphic: no Node imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'process', 'window', 'document'],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass the time in as options.now.' },
      ],
    },
  },
  {
    files: ['src/render/client/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent or rich().' },
        { property: 'outerHTML', message: 'Use DOM APIs.' },
        { property: 'insertAdjacentHTML', message: 'Use DOM APIs.' },
        { object: 'document', property: 'write', message: 'Use DOM APIs.' },
      ],
      'no-restricted-globals': ['error', 'eval', 'Function'],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
        { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
        {
          selector:
            "Literal[value=/^on[a-z]+$/][parent.type='CallExpression'][parent.callee.property.name='setAttribute']",
          message: 'No inline event handler attributes.',
        },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
