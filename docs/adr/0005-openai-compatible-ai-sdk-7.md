# OpenAI-compatible 上游迁移到 AI SDK 7，保留 Chat Completions 线协议

日期：2026-09-06

## Context

`POST /api/llm` 同时承载出题、答疑、旧浏览器非流式响应、自定义 SSE、15 秒保活和完整取消链。OpenAI-compatible 上游此前在路由里手写 Chat Completions 请求及 SSE/JSON 解析；迁移必须继续接受用户自带地址和 key，并保持 T2 已验收的思考等级、token 字段与单次生成约定。Codex 的 Responses API 是不同协议，不能随本次迁移改变。

实施前通过 Context7 复核 AI SDK 7 的 `streamText`、重试、取消、raw chunk 及 `createOpenAICompatible` 的显式 provider、Chat Completions、base URL、自定义 fetch 和 request transform API，并通过 npm registry 核对发布元数据。锁定组合为：

- `ai@7.0.93`
- `@ai-sdk/openai-compatible@3.0.44`
- 两者要求 Node.js `>=22`，均为 ESM，Zod peer 范围为 `^3.25.76 || ^4.1.8`
- 项目继续直接依赖 `zod@4.4.3`，本地验证使用 Node.js `24.14.1`

Cloudflare 继续使用 `compatibility_date: 2026-09-01` 和 `nodejs_compat`。应用创建的是 openai-compatible provider，不配置或调用 AI Gateway。

## Decision

只迁移 `type: openai` 的 Chat Completions 上游。`type: codex` 继续使用原有专用 Responses transport、请求字段和 completed-only 兼容；Anthropic 继续使用上一阶段的 provider。

- 每次请求用用户的 `baseUrl` 和 `apiKey` 创建 `createOpenAICompatible` provider，并显式选择 `chatModel`。地址先归一为 Chat Completions 前缀，因此根地址、`/v1` 前缀和完整 `/v1/chat/completions` 地址不会重复追加后缀。
- OpenAI-compatible 与 Anthropic 共用 `src/server/llm/sdk.ts` 的 headers 超时、响应体生命周期、取消和 AI SDK 事件消费。路由不再保留第二套标准 Chat Completions 请求/SSE/JSON 实现。
- `streamText` 固定 `maxRetries: 0`、`streamRetries: 0`，传入请求取消 signal，并消费包含 raw provider chunk 的完整事件流。reasoning 事件只记录存在性，不进入正文。
- 模型默认不传 reasoning。显式等级由 AI SDK 映射为 `reasoning_effort`；未知兼容模型仍只显式尝试 low/medium/high 一次。与 reasoning 或输出预算有关的 SDK 降档/忽略 warning 会失败，无关 warning 不机械失败。
- 应用输出上限仍为 8000。未知模型和默认配置继续发送 `max_tokens`；只有已验证 GPT-5 且显式选择等级时，provider request transform 才把同一额度改为 `max_completion_tokens`。已知更低模型上限仍会通过 `min` 收紧。
- 出题继续发送 `response_format: { type: "json_object" }`，答疑继续发送自由文本和完整历史；未启用 structured output。
- SDK provider 不会把完整 JSON 响应当作流。自定义 fetch 因此从同一次响应读取并验证完整 JSON，再适配成内存中的规范 Chat Completions SSE 给 SDK 消费；不会重发请求。保留 string/content-part、`choice.text` 和 `output_text` 提取兼容。
- 标准流必须同时出现正常 `finish_reason=stop` 和 `[DONE]`。SDK 的 finish 事件不能替代项目终止标志；看到 `[DONE]` 后包装层会关闭并释放仍保持连接的上游。错误、截断、空答案、reasoning-only、缺终止或提前断开均失败且不向浏览器发送成功 `[DONE]`。

## Consequences

浏览器配置、`POST /api/llm` body、出题 `ExercisesSchema` 校验、答疑历史和本站 `{text}` / `{error}` / `[DONE]` SSE 不变。旧非流式浏览器仍由服务端累计同一次 SDK 流后返回 JSON；HTTP 200 error body、完整 JSON 降级、分片 SSE、15 秒保活、180 秒 headers 超时和 headers 前/流中/下游取消仍由契约测试覆盖。

AI SDK server types、provider options 和兼容适配只存在于 `src/server/llm/`。Codex 不经过新增 provider，不新增 reasoning summary、temperature、max output 或 store 变化。

## Verification

本地完成：68 个单元/HTTP 测试、类型检查、lint、3 个浏览器测试、Astro production build、Wrangler `deploy --dry-run`。浏览器测试用受控本地 OpenAI-compatible 上游贯通 AI 设置、出题和连续答疑，并由独立停止测试验证浏览器取消。

Wrangler 4.127.1 构建产物连接受控本地上游，验证了标准流正文与 `[DONE]`、同次完整 JSON 降级、15 秒 `: keepalive`，以及原始 HTTP 客户端断开后上游连接关闭。Node fetch 的本地 Wrangler 客户端取消没有触发 workerd 的断开通知；改用原始 HTTP socket 断开后取消验收通过，该差异记录为本地验收工具限制。

未调用真实付费端点，也未部署到 Cloudflare 公网边缘。因此真实模型质量、计费、第三方中转的其它非标准变体及生产边缘网络行为仍需获得授权后的运行时验收。
