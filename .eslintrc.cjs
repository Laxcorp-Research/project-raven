module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    // CMake generates compiler_depend.ts and similar non-TS artifacts under
    // native/**/build that the linter's ESTree parser chokes on.
    'src/native/**/build/**',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',

    // Allow intentionally-unused identifiers when they're prefixed with
    // an underscore — this is the conventional way to mark a callback
    // argument / destructured prop that exists only to satisfy an
    // interface but isn't consumed. Without this, every `_event` /
    // `_props` / `_source` parameter triggers no-unused-vars.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
  },
  overrides: [
    {
      // Test code legitimately needs `any` for mock casts, partial stubs,
      // and `vi.mocked(...) as any` style helpers. Enforcing no-explicit-any
      // in tests forces fragile generics in scaffolding that adds noise
      // without catching real bugs. Production code (src/**/*.ts[x] outside
      // __tests__) keeps the rule.
      files: [
        '**/__tests__/**/*.ts',
        '**/__tests__/**/*.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        'e2e/**/*.ts',
        'backend/src/__mocks__/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      // CommonJS files (electron-builder hooks, build scripts that
      // can't be ESM because they're loaded via Node's require()).
      // Declare the Node environment so process / require / exports /
      // module / __dirname etc. are recognised, and turn off the
      // TS-flavoured no-var-requires rule which doesn't apply to
      // genuine CJS source.
      files: ['**/*.cjs', 'build/**/*.js'],
      env: { node: true, browser: false },
      parserOptions: { sourceType: 'commonjs' },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
}
