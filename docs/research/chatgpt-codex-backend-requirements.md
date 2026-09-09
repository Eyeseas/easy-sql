# ChatGPT Codex `/backend-api/codex/responses` 请求体硬约束

**检索截止：2026-09-02 UTC。** 本笔记只使用 GitHub 一手来源（源代码、GitHub API、issue/PR 原文）。没有对 ChatGPT 实际 endpoint 发起 live request；下文的“实测”若出现，均是原作者在一手 issue/PR 中的陈述，而不是本次研究的测试结果。

> `badlogic/pi-mono` 的 GitHub API 当前重定向到 `earendil-works/pi`；因此“当前 pi”按 `earendil-works/pi` `main` 分支读取。检索时 HEAD 为 `b8b873b9872db04a938fb4357b5e8e824ddc051c`，提交时间 2026-09-01（见[当前仓库提交](https://github.com/earendil-works/pi/commit/b8b873b9872db04a938fb4357b5e8e824ddc051c)）。

## 结论（直接证据）

| 字段/形状              | `/backend-api/codex/responses` 可确认的要求                                                                                                                                                                                                                                                                                                 | 证据边界                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store`                | 必须是布尔值 `false`。`true` 会得到 `{"detail":"Store must be set to false"}`。                                                                                                                                                                                                                                                             | PR #39197 的正文明确写出该响应；当前官方 Codex 客户端也固定发送 `store: false`。                                                                                                                                                                                                  |
| `stream`               | 必须是布尔值 `true`。`false`/未按流式请求会得到 `{"detail":"Stream must be set to true"}`。                                                                                                                                                                                                                                                 | 同上。这里的 `true` 是后端硬要求，不只是客户端偏好。                                                                                                                                                                                                                              |
| `instructions`         | 必须是**顶层字段**，且值必须非空。缺失或空值会得到 `400 {"detail":"Instructions are required"}`；`undefined` 经 `JSON.stringify` 会直接丢字段。                                                                                                                                                                                             | pi issue #4184 明确记录缺失/空值；当前 pi 用 `context.systemPrompt                                                                                                                                                                                                                |     | "You are a helpful assistant."`。 |
| `input`                | 使用 Responses API 的 `input` 数组，而不是 Chat Completions 的 `messages`。元素是 Responses input item，例如 `type: "message"` 加 `role` 与 `content`，以及 function/custom tool output 等。                                                                                                                                                | 官方 Codex 的 `ResponsesApiRequest` 定义为 `input: Vec<ResponseItem>`；官方源代码的 `ResponseInputItem` 也定义了这些 item 形状。官方 issue #14743 另记录了兼容网关对 `messages` 的 `Unsupported parameter: messages`，但那是自定义 provider 场景，不能单独当作 ChatGPT 后端错误。 |
| system prompt          | 对标准 Responses/Codex 路径，应从 `input` 中拿出来，放入顶层 `instructions`。当前 pi 明确调用 `convertResponsesMessages(..., { includeSystemPrompt: false })`，再单独填顶层 `instructions`。                                                                                                                                                | pi PR #5859、当前 pi 源码、官方 Codex `build_responses_request()` 一致支持这一点。                                                                                                                                                                                                |
| `developer` input item | **没有找到允许把任意 developer message 放入标准 `/backend-api/codex/responses` 的明确后端契约，也没有找到该后端明确拒绝普通 `type:"message", role:"developer"` 的证据。** 不应把这两种说法混为已证实事实。官方 Codex 的 Responses-Lite 分支确实会把工具/自定义 instructions 放成 developer input item，但那是另一条带 Lite 语义的内部路径。 | 见官方 `build_responses_request()` 的标准分支与 Responses-Lite 分支；见官方 issue #38355。对普通 system prompt，已明确应提升到顶层 `instructions`。                                                                                                                               |
| `max_output_tokens`    | 必须省略。后端响应为 `{"detail":"Unsupported parameter: max_output_tokens"}`。                                                                                                                                                                                                                                                              | PR #39197 正文及其 diff 的注释/测试；当前 pi 的 Codex body 根本不写该字段。                                                                                                                                                                                                       |
| 其它字段               | 在允许的来源中，没有找到另一个可泛化为该 endpoint 硬拒绝的字段。`model`、`tool_choice`、`reasoning`、`text`、`include`、`prompt_cache_key`、`parallel_tool_calls`、`service_tier` 等在官方客户端或当前 pi 请求体中仍被发送；不能凭猜测删掉。                                                                                                | `reasoning.summary`、`prompt_cache_retention`、`additional_tools` 等确有其它 issue 报告过错误，但分别是特定模型或自定义/Responses-Lite provider 场景，见下文“不要泛化”。                                                                                                          |

## PR #39197：准确的 body rewrite

[PR #39197](https://github.com/anomalyco/opencode/pull/39197) 标题为 `feat(plugin): rewrite codex request body for ChatGPT backend requirements`。GitHub API 在 2026-09-02 返回：`state: closed`、`merged: false`、`merged_at: null`，关闭时间为 2026-08-28；因此它是**已关闭、未合并**的 PR，不是 anomalyco/opencode 已发布的修复。

PR 有两个 commit：

- [`e7a7f841...`](https://github.com/anomalyco/opencode/commit/e7a7f84163fe2e2207f33513b115203eb9349ab5)：2026-07-25 authored、2026-07-27 committed，先加入可配置 Codex endpoint 路由。
- [`2611a584...`](https://github.com/anomalyco/opencode/commit/2611a58441561258616a30d1d54a3f5bbbb3dc65)：2026-07-27 authored/committed，加入 body rewrite。

完整 diff 可见 [`39197.diff`](https://github.com/anomalyco/opencode/pull/39197.diff)。核心实现的语义等价于：

```ts
function rewriteCodexRequestBody(body) {
  if (body === undefined || body === null) return undefined;

  // string、ArrayBuffer、ArrayBufferView、Buffer 转成文本；
  // 其它 BodyInit（例如 Blob/FormData/URLSearchParams）原样返回。
  const text = bodyToTextIfSupported(body);
  if (text === undefined) return body;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return body;
  }
  if (typeof parsed !== 'object' || parsed === null) return body;

  parsed.store = false;
  parsed.stream = true;
  delete parsed.max_output_tokens;
  return JSON.stringify(parsed);
}
```

实际 diff 中的关键语句是：

```ts
json.store = false;
json.stream = true;
delete json.max_output_tokens;
return JSON.stringify(json);
```

因此，**它只改这三个方面**：强制 `store: false`、强制 `stream: true`、删除 `max_output_tokens`。它不添加或修复 `instructions`，不改变 `input`，也不改变其它字段。非 JSON body、无法解析的字符串、以及非字符串/ArrayBuffer 类 body 保持不变；数组 JSON 实际序列化后也不会出现这些新对象属性，PR 测试将其视为不变。

rewrite 只在 Codex 路径触发。该 PR 的 `isCodexPath` 判断为原 URL pathname 包含 `/v1/responses` 或 `/chat/completions`；命中后才把 URL 改成 Codex endpoint 并调用 `rewriteCodexRequestBody(init?.body)`。非 Codex 请求不改 body，保持 byte-identical 的意图。这个路径判定和 body rewrite 都在 [diff 的第 82--98 行](https://github.com/anomalyco/opencode/pull/39197.diff#L82-L98)附近。

## `instructions`、system/developer 与 `input` 的细节

### 当前 pi

当前 [pi `openai-codex-responses.ts`](https://github.com/earendil-works/pi/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/ai/src/api/openai-codex-responses.ts#L82-L99) 的 `RequestBody` 类型包含 `instructions?: string` 和 `input?: ResponseInput`。实际构造请求时（[L529-L560](https://github.com/earendil-works/pi/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/ai/src/api/openai-codex-responses.ts#L529-L560)）：

```ts
const messages = convertResponsesMessages(model, context, ..., {
  includeSystemPrompt: false,
  ...
})

const body = {
  model: model.id,
  store: false,
  stream: true,
  instructions: context.systemPrompt || "You are a helpful assistant.",
  input: messages,
  ...
}
```

[共享转换器](https://github.com/earendil-works/pi/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/ai/src/api/openai-responses-shared.ts#L138-L182) 显示：若启用 `includeSystemPrompt`，它会将 system prompt 作为顶层 Responses message；Codex 调用显式关闭该选项。转换后的普通历史主要是 user/assistant 与 tool output；在 deferred-tools 的特定模式中，当前 pi 还会生成 `type: "additional_tools", role: "developer"`（[L321-L326](https://github.com/earendil-works/pi/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/ai/src/api/openai-responses-shared.ts#L321-L326)）。这不能推导出任意 developer message 对官方标准 Codex endpoint 都被接受。

pi 的 [PR #5859](https://github.com/earendil-works/pi/pull/5859) 明确写道：OpenAI Responses API 要求 system prompt 位于顶层 `instructions`，而不是作为 replayed `input` message；`input` 只保留 conversation 和 tool replay。当前 issue [#4184](https://github.com/earendil-works/pi/issues/4184) 进一步记录了 `instructions: undefined` 被 JSON 序列化丢弃后，后端返回 `Instructions are required`，并指出空字符串也不满足要求。两者都是 pi 仓库中的一手报告；#4184 创建/关闭于 2026-05-05。

### 官方 openai/codex 源码

当前官方 Codex HEAD 为 [`671d5d1b...`](https://github.com/openai/codex/commit/671d5d1b3531d7251d6c59709b8d29fb7927e685)，提交于 2026-09-02，研究时取得。

- [`ResponsesApiRequest`](https://github.com/openai/codex/blob/671d5d1b3531d7251d6c59709b8d29fb7927e685/codex-rs/codex-api/src/common.rs#L274-L300) 将 `instructions`、`input`、`store`、`stream` 作为请求结构的核心字段；它**没有** `max_output_tokens` 字段。
- 标准请求构造 [`build_responses_request()`](https://github.com/openai/codex/blob/671d5d1b3531d7251d6c59709b8d29fb7927e685/codex-rs/core/src/client.rs#L927-L1031) 在非 Responses-Lite 分支使用 `prompt.base_instructions.text` 作为顶层 `instructions`，随后固定 `store: false` 与 `stream: true`。
- [`ResponseInputItem`](https://github.com/openai/codex/blob/671d5d1b3531d7251d6c59709b8d29fb7927e685/codex-rs/protocol/src/models.rs#L816-L852) 的 `Message` 是 `role: String`、`content: Vec<ContentItem>`；还定义了 function/MCP/custom tool output 等 input item。这个 Rust 类型层允许字符串形式的 role，但**不是** ChatGPT 后端对每个 role 的允许列表证明。
- `build_responses_request()` 的 Responses-Lite 分支与标准分支不同：它把顶层 `instructions` 设为空字符串，并将 `additional_tools` 及 base instructions 放入 developer input item（[L938-L969](https://github.com/openai/codex/blob/671d5d1b3531d7251d6c59709b8d29fb7927e685/codex-rs/core/src/client.rs#L938-L969)）。官方 issue [#38355](https://github.com/openai/codex/issues/38355) 也记录了该行为。这个 Lite/内部协议不能拿来证明普通标准 Codex 请求可以随意把 system prompt 放进 input。

**因此对 system/developer 的最稳妥表述是：** system prompt 的顶层提升是已证实要求；普通 developer item 在标准 endpoint 上的“必拒绝”没有足够一手证据，不能硬编成契约。若目标是标准 ChatGPT Codex 请求，使用非空顶层 `instructions`，并把 system/developer 指令内容合并到该字段，是与当前 pi 和官方 Codex 标准路径一致的做法；不要把 Responses-Lite 的 `additional_tools`/developer 机制混入普通兼容请求。

## Transport、SSE 与 WebSocket

### PR #39197 的直接改动

该 PR 的代码注释和测试明确将 ChatGPT Codex 路径按 **plain HTTP + SSE** 处理：

- Codex path 不走其 `websocketFetch` 分支；条件改成 `if (websocketFetch && !isCodexPath && parsed.pathname.endsWith("/responses"))`。
- Codex path 用普通 `fetch(url, requestInit)`；测试检查没有 WebSocket upgrade，并返回 `content-type: text/event-stream` 的 SSE 内容。
- 非 Codex `/responses` 请求在启用实验 WebSocket 时仍可走 WebSocket。

这表示：若采用该 PR 的路由策略，relay/gateway 必须保留一个可持续读取的 HTTP SSE response，而不是把请求升级为 WebSocket，或把 SSE 缓冲成一次性 JSON。后半句是由 SSE transport 语义推导出的运行要求，不是 ChatGPT 服务公开承诺。

### 官方 Codex 与当前 pi 的 corroboration

官方 HTTP client 的 [`ResponsesClient::stream()`](https://github.com/openai/codex/blob/671d5d1b3531d7251d6c59709b8d29fb7927e685/codex-rs/codex-api/src/endpoint/responses.rs#L102-L190) 使用 POST，设置 `Accept: text/event-stream`，然后交给 `spawn_response_stream` 解析响应。官方 request struct 还支持可选 zstd compression。当前 pi 也在 SSE fallback 中设置 `accept: text/event-stream`、`content-type: application/json`，并在可用时以 `Content-Encoding: zstd` 发送 body（[pi L368-L397](https://github.com/earendil-works/pi/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/ai/src/api/openai-codex-responses.ts#L368-L397)）。

当前 pi 的实现已经不等同于未合并的 PR：它默认 `transport` 为 `auto`，先尝试 Responses WebSocket，失败后可回退到 SSE；SSE URL 是 `.../codex/responses`，WebSocket URL 则把同一路径转换为 `ws:`/`wss:`（[pi URL helpers](https://github.com/earendil-works/pi/blob/b8b873b9872db04a938fb4357b5e8e824ddc051c/packages/ai/src/api/openai-codex-responses.ts#L633-L646)）。这说明“body contract”和“可用 transport”是两个问题：body 仍需 `store:false`、`stream:true`、非空顶层 `instructions`、无 `max_output_tokens`；是否使用 WS 取决于客户端/网关能力。

## 其它错误不要泛化成本 endpoint 的硬约束

允许的官方 `openai/codex` issue 中还能看到以下**有范围限制**的错误：

- [#14743](https://github.com/openai/codex/issues/14743)：自定义 OpenAI-compatible provider 看到 `Unsupported parameter: messages`，并要求 `input` list；这是兼容网关场景的 Responses 形状问题，不是 ChatGPT endpoint 的独立验证。
- [#31181](https://github.com/openai/codex/issues/31181)：某些自定义网关拒绝 `max_output_tokens`；该 issue 也指出官方 Codex 原生 `ResponsesApiRequest` 不含该字段。
- [#31969](https://github.com/openai/codex/issues/31969)：`reasoning.summary` 对 `gpt-5.3-codex-spark` 不支持，是模型能力限制，不是所有 Codex endpoint 请求的全局禁项。
- [#39439](https://github.com/openai/codex/issues/39439)：`prompt_cache_retention` 对 `gpt-5.6-sol` 不支持，是特定模型/版本路径问题。
- [#39532](https://github.com/openai/codex/issues/39532)：普通 OpenAI-compatible `/v1/responses` 拒绝 Responses-Lite 的 `additional_tools` input item；这是自定义 provider 不认识 Codex 内部 item 的证据，不是对 ChatGPT Codex backend 的普通 input role 契约。

## 可执行的最小标准请求形状

在没有额外 endpoint/模型能力证据时，针对标准 ChatGPT Codex HTTP/SSE 路径，至少应确保：

```json
{
  "model": "<codex-model>",
  "store": false,
  "stream": true,
  "instructions": "<non-empty top-level instructions>",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [{ "type": "input_text", "text": "..." }]
    }
  ]
}
```

可以在此基础上加入当前 pi/官方 Codex 已使用且目标模型支持的工具、reasoning、text、include、cache key 等字段；**不要**加入 `max_output_tokens`。若有 system prompt，放 `instructions`；不要把它作为普通 input message 重放。对任意 developer input item，除非已确认目标是支持该内部/Responses-Lite语义的服务，否则不要把“官方类型可表示”误当成“ChatGPT backend 已公开保证可接受”。
