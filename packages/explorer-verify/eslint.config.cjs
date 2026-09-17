module.exports = (async function config() {
  const { default: love } = await import('eslint-config-love')

  return [
    {
      ignores: [
        'coverage/**',
        'node_modules/**',
        'dist/**',
        'test/**',
        'jest.config.js',
        'eslint.config.cjs',
        '**/*.d.ts',
      ],
    },
    {
      ...love,
      files: ['src/**/*.ts', 'bin/**/*.ts'],
      rules: {
        'no-new': 0,
        '@typescript-eslint/no-unused-vars': 0,
        '@typescript-eslint/comma-dangle': 0,
        '@typescript-eslint/space-before-function-paren': 0,
        '@typescript-eslint/no-magic-numbers': 0,
        '@typescript-eslint/prefer-destructuring': 0,
        '@typescript-eslint/strict-boolean-expressions': 0,
        '@typescript-eslint/no-unsafe-type-assertion': 0,
        '@typescript-eslint/no-non-null-assertion': 0,
      },
    },
  ]
})()
