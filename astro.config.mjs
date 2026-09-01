// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// 静态优先：页面全部预渲染成静态 HTML（CF Workers 上静态资源请求免费不限量），
// 只有 /api/llm（LLM 出题代理，见 src/pages/api/llm.ts）是 on-demand 路由，
// 打进 dist/_worker.js 由 Worker 执行。
// 部署：npm run deploy（astro build + wrangler deploy），配置见 wrangler.jsonc。
export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
});
