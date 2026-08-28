import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default defineConfig([
  globalIgnores(['dist/**', '.astro/**', 'legacy/**', 'node_modules/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // 客户端脚本跑在浏览器里
    files: ['src/scripts/**/*.ts'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        Notification: 'readonly',
        AudioContext: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        IntersectionObserver: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        CustomEvent: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // 服务端代码跑在 Node 里
    files: ['src/lib/**/*.ts', 'src/pages/api/**/*.ts'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Response: 'readonly' },
    },
  },
]);
