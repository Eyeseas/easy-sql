// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// 静态优先：页面全部预渲染成静态 HTML（CF Workers 上静态资源请求免费不限量），
// 只有 /api/llm（LLM 代理，见 src/pages/api/llm.ts）是 on-demand 路由，
// 打进 dist/_worker.js 由 Worker 执行。
// React 只为天页答疑 island 而引入（ADR-0003），其余页面维持零 React。
// 部署：npm run deploy（astro build + wrangler deploy），配置见 wrangler.jsonc。
export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  integrations: [react()],
});
