# /api/llm 代理走 SSE 流式转发，规避 Cloudflare 边缘 100 秒超时（524）

LLM 出题代理原本攒完上游整个响应再一次性返回 JSON。Cloudflare 边缘对「迟迟不吐字节」的响应只等约 100 秒（Free/Pro/Business 改不了），而慢模型（推理模型、走中转的端点）生成整套题目 JSON 动辄一两分钟：Worker 自己的超时是 180 秒，边缘先放弃，浏览器看到 524。决定：前端带 `stream: true` 请求时，代理向上游要 SSE 流、边收边往浏览器转发自己的 SSE（`{text}` 增量 + `[DONE]` 收尾），等上游首字节期间每 15 秒发一行 SSE 注释保活；只要开始有字节流动就不受 100 秒限制。

## Considered Options

- 压生成时间（调小 max_tokens / 换快模型）：治标，题目质量取决于 token 预算，且用户自带端点不可控，被否。
- 把 Worker 的 `UPSTREAM_TIMEOUT_MS` 降到 95 秒换友好报错：只是把 524 换成更体面的错误，长生成仍然失败，被否。
- 请求排队 + 轮询取结果（Durable Object / KV 暂存）：代理无状态、单人使用场景，复杂度不匹配，被否。
- 流式转发（选定）：改动集中在 `src/pages/api/llm.ts` 与 `src/scripts/llm.ts`，上游不支持流式时自动降级为整段补发。

## Consequences

- 不带 `stream` 的请求保持旧的整段 JSON 行为（状态码语义不变）：部署切换期浏览器里缓存的旧产物仍可用；旧测试原样通过。
- 上游「不支持流式、返回完整 JSON」与「直接报错」共用完整 JSON 解析路径；流式路径里流内错误、max_tokens 截断、提前断开都以 `{error}` 事件收尾，前端抛错文案不变风格。
- Worker 子请求到上游仍受 Cloudflare 约 100 秒首包限制（等不了首字节的极端中转无解）；SSE 保活只保浏览器↔Worker 这一段。
- 前端 `generateExercises` 多了 `onProgress` 回调（已收字符数），生成按钮旁能显示「已收到 N 字」的实时进度。
- 代理的 SSE 是自定义线格式（`{text}` / `{error}` / `[DONE]`），不是上游协议的逐字节透传：Anthropic 与 OpenAI 两种事件格式在服务端归一，前端只有一种解析逻辑。
