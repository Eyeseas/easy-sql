# Claude 上游迁移到 AI SDK 7，并在同一次响应内保留非流式兼容

日期：2026-09-06

## Context

`POST /api/llm` 已经稳定承载出题、答疑、旧浏览器非流式响应、自定义 SSE、15 秒保活和完整取消链。Anthropic 上游此前在路由里手写 Messages 请求及 SSE 解析；迁移不能改变浏览器配置、HTTP body、下游 `{text}` / `{error}` / `[DONE]`，也不能让不支持流式的中转触发第二次生成。

实施前通过 Context7 复核 AI SDK 7、Anthropic provider 和 Cloudflare Workers 文档，并通过 npm registry 核对发布元数据。锁定组合为：

- `ai@7.0.93`
- `@ai-sdk/anthropic@4.0.49`
- 两者要求 Node.js `>=22`，均为 ESM；项目 manifest 同步声明该 engine，本地验证使用 Node.js `24.14.1`
- 两者的 Zod peer 范围是 `^3.25.76 || ^4.1.8`；项目直接依赖 `zod@4.4.3`

Cloudflare 产物继续使用 `compatibility_date: 2026-09-01` 和 `nodejs_compat`。Cloudflare 文档说明该日期已具备新版 Node compatibility 行为；显式 flag 保留现有部署配置，也避免本地测试隐式注入兼容层而部署缺失。AI SDK 核心包在锁文件中带有 Gateway 传递依赖，但应用没有配置或调用 AI Gateway。

## Decision

只迁移 Anthropic Messages 上游。OpenAI-compatible 与 Codex 继续使用已验收的手写协议实现；浏览器不引入 AI SDK React runtime。

- 每次请求用用户的 `baseUrl` 和 `apiKey` 创建显式 `createAnthropic` provider。地址先归一为 Messages API 前缀，所以 `https://host`、`https://host/v1` 和完整的 `https://host/v1/messages` 都只请求一次正确 endpoint。
- `streamText` 固定 `maxRetries: 0`、`streamRetries: 0`，不启用 telemetry，并消费包含 raw provider event 的完整 `result.stream`。只有观察到 Anthropic `message_stop`、SDK finish reason 为 `stop` 且正文非空才成功；reasoning 不进入正文。
- 已验收的思考策略仍由共享配置决定，SDK 层只做字段形状转换。adaptive 使用 provider-specific `thinking` 和 `effort`，fixed-budget 使用 `budgetTokens`，不同时传统一 reasoning。
- Anthropic provider 会把 fixed budget 加到 `maxOutputTokens` 上。调用 SDK 前先从既有原生总上限 16000 中减去预算，使最终原生 `max_tokens` 始终仍为 16000，不扩大成本上限。
- 与 reasoning、thinking、effort、budget 或输出上限有关的 SDK 降档/忽略 warning 会失败；无关 warning 不机械失败。已知模型不兼容仍由 HTTP 入口在出站前拒绝。
- 自定义 fetch 保留 180 秒等待 headers 的含义，并把请求取消贯通到底层响应 reader。SDK 默认错误日志被关闭，避免错误对象中的用户凭据进入控制台；对浏览器的错误仍经过既有 key 脱敏。
- 若同一次成功响应不是 SSE，则读取其完整 Anthropic JSON。有效 JSON 被适配成内存中的规范 Anthropic 事件流交给 SDK 消费；错误、截断、reasoning-only、空正文或缺 `stop_reason` 会失败。这里不会重发请求。

## Consequences

Claude 的 system/message 原生字段由 provider 生成规范 content block 数组，语义保持不变。Claude 的协议解析、warning 和 provider options 集中在 `src/server/llm/anthropic.ts`；路由只选择 Anthropic SDK 或保留的 OpenAI/Codex 路径。

HTTP 测试锁定完整 endpoint、认证头、默认字段、adaptive/预算/disabled、原生总上限、warning policy、真实事件序列、JSON 降级、流内错误、截断、空答案、缺终止、单次请求、旧浏览器累计、保活、headers 前取消、流中取消和资源释放。OpenAI-compatible 与 Codex 的原有契约测试继续运行。

## Verification

本地完成：单元/HTTP 测试、类型检查、lint、变更文件格式检查、Astro production build、Wrangler `deploy --dry-run`。仓库级 `pnpm format:check` 也已执行，但被本票未改动的 4 个既有文件阻塞：`docs/research/chatgpt-codex-backend-requirements.md`、`src/data/schema.ts`、`src/scripts/generator.ts`、`wrangler.jsonc`。另外用 Wrangler 4.127.1 运行构建产物并连接受控本地 Anthropic 上游，观察到流式正文和 `[DONE]`、15 秒 `: keepalive`、流内错误且无 `[DONE]`，以及客户端断开后上游连接关闭。

未验证：没有使用用户真实 key 调用 Anthropic 或第三方中转，也没有部署到 Cloudflare 边缘环境做公网联调。因此真实模型质量、计费、第三方中转的非标准变体和生产边缘网络行为仍需获授权后的运行时验收。
