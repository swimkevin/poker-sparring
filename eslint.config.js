// ESLint flat config — quality gate for the vanilla JS codebase.
// No build step; this is dev-only. Run: npx eslint js/ tests/
module.exports = [
  {
    files: ['js/**/*.js', 'tests/**/*.js', 'worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        // browser
        window: 'readonly', document: 'readonly', localStorage: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', URLSearchParams: 'readonly',
        WebSocket: 'readonly', navigator: 'readonly', location: 'readonly',
        // node (tests, worker)
        require: 'readonly', module: 'readonly', process: 'readonly',
        __dirname: 'readonly', console: 'readonly', Buffer: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-duplicate-case': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-undef': 'off', // cross-file globals via script tags; tsc-style check not applicable
      'eqeqeq': ['warn', 'smart'],
      'curly': 'off', // codebase style: braceless single-line ifs are intentional
      'no-var': 'off', // codebase standard is `var` (older-browser safe)
      'prefer-const': 'off'
    }
  },
  {
    // Built artifact, not source.
    ignores: ['worker/dist/**']
  },
  {
    // Cloudflare worker uses ES modules.
    files: ['worker/*.js'],
    languageOptions: { sourceType: 'module' }
  }
];
