// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// 静态优先：页面全部预渲染成静态 HTML，只有 /api/llm（LLM 出题代理，见
// src/pages/api/llm.ts）是 on-demand 路由，需要 node adapter。
// 部署：astro build 后跑 ./dist/server/entry.mjs。
export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'standalone' }),
});
