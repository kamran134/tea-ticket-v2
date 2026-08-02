const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommended,
  { files: ['eslint.config.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    // Only the two hook rules this project actually needs: the "recommended"
    // bundle also ships several React Compiler-oriented checks (set-state-
    // in-effect, immutability, ...) tuned for a different paradigm — they
    // flag ordinary, correct patterns (reset-then-fetch effects, a local
    // accumulator in useMemo) used throughout this stable React 18 codebase.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
