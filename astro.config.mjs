// @ts-check
import { defineConfig } from 'astro/config';

// 纯静态站点：LLM 出题由浏览器直连用户配置的端点（见 src/scripts/llm.ts），
// 没有任何服务端代码，可以部署到任意静态托管。
export default defineConfig({
  output: 'static',
});
