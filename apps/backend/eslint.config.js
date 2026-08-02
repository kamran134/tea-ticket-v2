const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommended,
  { files: ['eslint.config.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
