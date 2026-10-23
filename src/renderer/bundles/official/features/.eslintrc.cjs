/* Extracted SFC presenters keep the same browser and TypeScript rules. */
const { typescript } = require('../../../../../.eslintrc.base.cjs')
module.exports = {
  env: { browser: true },
  overrides: [{ ...typescript, files: ['*.js'], parserOptions: { project: './tsconfig.json' } }],
}
