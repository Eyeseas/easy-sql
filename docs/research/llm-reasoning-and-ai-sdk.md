# LLM 思考等级与 Vercel AI SDK 接入设计

检索日期：2026-09-06。状态：研究与设计建议，尚未实施；没有安装依赖，没有使用真实 API key 调用模型，也没有验证 Cloudflare 部署产物。依据为 Context7 检索到的官方文档、直接读取的官方文档、npm registry 与固定版本发布源码。当前没有可用的研究子代理工具，本笔记由主代理完成。

## 结论

推荐采用一个应用级 `reasoning` 参数，并将 **AI SDK 7 的服务端接入作为目标实现**。AI SDK 7 已提供统一的顶层 `reasoning`，不必从零维护所有厂商的等级映射。[S1]

但这不是删除现有代理、直接换成几行 `streamText`：本项目支持用户自带中转端点、完整 JSON 降级、Codex 特殊请求体和自定义 SSE。这些兼容行为需要保留或以契约测试证明已经由新实现覆盖。

实施拆成两个可独立验收的变更：

1. 在现有代理接入思考等级，打通设置保存、出题、答疑、服务端验证和请求体映射，默认不改变上游参数。
2. 在相同应用接口之后，用 AI SDK 替换标准协议的上游实现。先验证 Anthropic 与 OpenAI-compatible；Codex 的特殊实现最后迁移，未通过兼容验证前保留。

若近期只需要 Codex 的 high/xhigh，第一步就能交付，不应把整个 SDK 迁移作为前置条件。

## 当前项目

| 位置                                                             | 现状与影响                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/llm.ts`                                             | `LlmConfig` 只有 type/baseUrl/model/apiKey；localStorage key 为 `sql8w.llm.v1`。出题使用配置展开，答疑 `chatViaProxy` 则逐项构造 body，所以新增参数必须明确补到答疑请求。 |
| `src/scripts/llmSettings.ts`、`src/components/LlmSettings.astro` | 设置读取、保存均为显式字段列表，需要同时修改。                                                                                                                            |
| `src/pages/api/llm.ts`                                           | `BodySchema` 没有 reasoning；只改浏览器不能生效。`upstreamRequest` 手写三种协议，`runUpstream` 负责 JSON/SSE 兼容。                                                       |
| 同上                                                             | OpenAI-compatible 固定 `max_tokens: 8000`；Anthropic 固定 `max_tokens: 16000`；Codex 不发输出 token 上限，强制 stream/store/instructions 约束。                           |
| `src/qa/chat.ts`                                                 | assistant-ui 的 `ChatModelAdapter` 已经通过 `chatViaProxy` 消费文本增量，无需引入第二套聊天 runtime。                                                                     |
| `tests/llm-api.test.ts`                                          | 已覆盖三协议、旧客户端、JSON 降级、Codex completed-only、错误、截断和提前断开，是迁移必须维持的行为契约。                                                                 |
| `wrangler.jsonc`                                                 | Cloudflare Workers，已设置 `nodejs_compat`；不等于新 SDK 已经在该部署上通过验证。                                                                                         |

另有一处与此接入直接相关的旧文案：AI 设置声称“浏览器直发、不经过中间服务器”，但实际经过本站 Worker。实施时应改为准确的凭据传输说明：key 保存在浏览器，请求时经本站代理转发，不在应用代码中持久化。不要承诺 key 不离开浏览器，也不要记录 key 或完整请求体。

## 已核实的 SDK 能力

### 包名和版本

不是安装 `@vercel/ai`。核心包为 `ai`，厂商包为 `@ai-sdk/*`。本次 npm registry 的 `latest` 返回：[S2]

| 包                          | 版本     | 用途                                               |
| --------------------------- | -------- | -------------------------------------------------- |
| `ai`                        | `7.0.93` | `streamText`、统一 reasoning、流事件、错误与 usage |
| `@ai-sdk/openai`            | `4.0.60` | 官方 OpenAI Chat Completions / Responses           |
| `@ai-sdk/anthropic`         | `4.0.49` | Anthropic Messages                                 |
| `@ai-sdk/openai-compatible` | `3.0.44` | 用户配置的 Chat Completions 兼容端点               |

这些发布版本的 Node engine 为 `>=22`，Zod peer 为 `^3.25.76 || ^4.1.8`。项目现有 Zod `^4.4.3` 满足范围；本地和 CI 仍需检查 Node 版本。SDK 7 为 ESM，项目已经是 ESM。[S2][S3]

不需要 `@ai-sdk/react`、Vercel 部署、Vercel AI Gateway 或替换 assistant-ui。使用 `createOpenAI` / `createAnthropic` / `createOpenAICompatible` 创建带用户 baseURL/apiKey 的 provider instance，避免把模型写成默认走 Gateway 的字符串。[S4][S5][S6]

### 统一思考等级

AI SDK 7 的 `generateText` 和 `streamText` 接受：[S1]

```ts
type ReasoningLevel = 'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
```

- 省略或 `provider-default` 使用厂商默认行为，不等于关闭，也不等于固定 medium。
- `none` 是请求关闭的意图，不是所有模型都能兑现的保证。
- 这些是相对等级，不是跨模型相同 token 数、延迟、价格或质量的承诺。
- 厂商映射可能降档并产生 warning；不支持的 provider 可能忽略参数。应用不能把“请求成功”当作“选择的等级被原样执行”。
- `providerOptions` 中的 effort/thinking budget 配置优先于统一参数，不应同时给两套冲突值。reasoning summary 等显示选项可以独立配置。
- 精确 token 预算或厂商专属 `max` 等档位仍需 provider-specific options，不应塞入统一等级枚举。

固定版本源码补充了文档未完整列出的情况：`@ai-sdk/openai-compatible@3.0.44` 也会把顶层 reasoning 映射到 `reasoning_effort`；显式 `providerOptions.<name>.reasoningEffort` 优先。[S6][S7]

### 原生协议映射

| 上游                                               | 原生请求字段                                                            | 注意事项                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OpenAI Chat Completions / 声明支持该扩展的兼容端点 | `reasoning_effort: 'high'`                                              | 不保证每个兼容中转或模型支持；例如别家的 thinking 开关不能凭“OpenAI 兼容”推导出来。     |
| OpenAI Responses / 已确认支持的 Codex 端点         | `reasoning: { effort: 'high' }`                                         | 不是顶层 `reasoning_effort`；可用等级依模型而异。                                       |
| 支持 adaptive thinking 的 Claude                   | `thinking: { type: 'adaptive' }` 与 `output_config: { effort: 'high' }` | SDK 对应 `providerOptions.anthropic.thinking` 和同级 `effort`，不是 `thinking.effort`。 |
| 旧款 budget-based Claude                           | `thinking: { type: 'enabled', budget_tokens: N }`                       | SDK 字段名为 `budgetTokens`。普通无工具请求要求预算至少 1024，且小于原生 `max_tokens`。 |

来源：[S4][S5][S8][S9][S10]。部分官方示例包含旧形状或过时流字段，以上以当前参数说明、Anthropic 官方协议和固定发布版本源码交叉核对，不照抄这些示例。

Claude 新旧模式不能仅凭 `type: anthropic` 判断；部分新模型已拒绝手动 budget 模式。[S8] SDK 内部已有模型能力判断，但自定义模型别名不一定能识别。对于未知 Claude 别名，默认不设置 reasoning；用户显式指定等级时，需要已验证的别名能力配置，否则返回明确的配置错误，不凭字符串猜预算模式。

### 预算和默认行为风险

Anthropic 原生 `max_tokens` 包含思考和最终文本。SDK 的 budget-based 实现会把 `budgetTokens` 加到 `maxOutputTokens` 上，并在已知模型上按最大输出限制截断。因此把当前原生 `16000` 机械搬成 SDK `maxOutputTokens: 16000`，再开 thinking，可能增加允许的总消耗。[S5][S7][S8]

推荐首版保持目前总输出限制，不随 high/xhigh 自动放大。旧 Claude 如必须手工映射，可采用 low/medium/high 为 1024/4096/8192 的应用预设，且始终低于总上限；这些数字是待评估的产品预算策略，不是厂商标准。SDK 迁移时优先通过 providerOptions 保留已经验收的预算策略，而不是同时传顶层 reasoning。adaptive 模式则用 effort 并保留总上限。若高等级造成截断，报错，不把半截出题 JSON 当成功。

OpenAI 推理模型也要为 reasoning 和答案共同预留输出空间。官方 Chat Completions 推理模型应核对 `max_completion_tokens`，不能假定现有 `max_tokens` 对所有官方模型都有效；任意兼容中转则需要自己的请求体契约。[S4][S10]

SDK 7 的 OpenAI Responses 在显式启用非 none reasoning 时，默认可能请求 detailed summary。当前应用只需要答案，因此设置 `providerOptions.openai.reasoningSummary: null`，避免无意增加摘要字段，尤其不能假设所有 Codex 模型都接受 summary。[S3][S4]

## 应用接口设计

### 配置

```ts
interface LlmConfig {
  type: 'anthropic' | 'openai' | 'codex';
  baseUrl: string;
  model: string;
  apiKey: string;
  reasoning: ReasoningLevel;
}
```

- 运行时配置统一有 reasoning；HTTP body 上允许缺省，以兼容旧浏览器产物。
- 继续使用现有 localStorage key。旧配置缺字段或本地保存值非法时归一为 `provider-default`，无需迁移其它字段。
- 服务端 Zod 对显式非法值返回 400；缺省按 provider-default，不发原生 effort/thinking 字段。
- 出题与答疑共享同一配置。首版不做“出题 high、答疑 low”的隐式覆盖，避免设置含义不清。
- 可选新增 `PUBLIC_LLM_REASONING`，与 localStorage 使用相同枚举验证；不是实施第一步的必要条件。
- `type` 的旧值不改名。未来若要严格区分官方 Responses 与 ChatGPT Codex profile，再做兼容扩展，不把历史 codex 配置直接重解释为普通 OpenAI。

### 设置 UI

在现有 AI 设置中添加“思考等级”下拉框，常用项为“模型默认 / 低 / 中 / 高”，模型确认支持时开放 minimal、xhigh、none。

切换端点类型或模型后重新验证已选等级；不兼容时回到模型默认并反馈状态。未知 OpenAI-compatible 端点可以由用户显式选择标准 effort 尝试，但不得声称检测到支持；上游拒绝时呈现具体错误，不去掉等级偷偷重试。Claude 未知别名按前述能力规则处理。

首版不增加“展示思考过程”、精确预算输入、任意 JSON providerOptions 编辑器。推理强度与推理内容展示是两个需求；出题 JSON 和答疑正文只能拼最终文本，不能混入 reasoning delta。[S1][S5]

### 上游模块

保留外部接口：

```text
AI 设置 -> LlmConfig.reasoning
  -> 出题 / 答疑
  -> POST /api/llm
  -> 参数与能力校验
  -> 上游模块：SDK 标准实现 / 现有兼容实现
  -> 原有 {text} / {error} / [DONE] SSE
```

SDK 类型只出现在服务端上游模块内部，不让浏览器配置依赖某家 SDK 的 options 类型。路由保留 HTTP 验证和下游 SSE 封装，上游模块隐藏 provider 创建、URL 归一、reasoning 映射、流结果检查和取消处理。不要为了这个功能抽象整个课程或答疑层。

标准 SDK 调用形状如下，仅展示参数位置，不是完整代理实现：[S1][S4]

```ts
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const provider = createOpenAI({
  baseURL: normalizedBaseUrl,
  apiKey: cfg.apiKey,
});

const result = streamText({
  model: provider.responses(cfg.model),
  system,
  messages,
  reasoning: cfg.reasoning,
  providerOptions: {
    openai: { store: false, reasoningSummary: null },
  },
  maxRetries: 0,
  abortSignal,
});
```

这里是**标准 OpenAI Responses**，不是 ChatGPT Codex 的可直接替换代码。Codex 候选实现需要显式把 system 放到 `providerOptions.openai.instructions`，避免重复放进 input，保持只发流式、store false、无 max_output_tokens/temperature 的现有约束，并检查 SDK 自动增加的其它字段。[S4][S7][S11]

对于现有 `type: openai`，默认使用 `createOpenAICompatible` 而不是无条件换成 `createOpenAI`：项目承诺的是任意 Chat Completions 兼容中转，不是只接 OpenAI 官方模型。必须显式选 chat/responses，不依赖 SDK 默认协议。各 provider 的 baseURL 是前缀；现有用户可能保存了完整 `/v1/messages` 等路径，迁移前要测试 URL 归一，不能重复追加后缀。[S4][S5][S6]

## 必须保留的兼容行为

1. 浏览器仍消费本站 `{text}` / `{error}` / `[DONE]`，不直接返回 AI SDK UI Message Stream 或纯文本流。
2. 保留每 15 秒的下游 SSE 注释保活。它不能保证上游连接不超时，不把保活当作所有网络超时的解决方案。
3. SDK 7 使用 `result.stream` 消费完整事件，而不是只消费文本：处理 error、abort、终止原因、空答案和 reasoning-only。`fullStream` 是 deprecated alias。增量字段依据固定版本类型使用 `part.text`。[S3][S12]
4. 截断、拒绝导致无答案、缺终止事件或断流不能输出成功的 `[DONE]`。不假定 SDK 的 finish 事件必然证明上游发送了项目要求的终止标志，需要协议夹具验证。
5. 保留旧非流式浏览器请求。上游仍可流式，代理自行累计后返回 JSON。
6. 上游忽略 stream 而返回完整 JSON 时，沿用已有解析降级，不重新付费调用一次。SDK 路径必须用自定义 fetch/响应适配复现这个行为，或将此兼容 profile 留在旧实现；不能在 SDK 报错后无条件重发。
7. 保留 Responses 只有 completed payload、没有 delta 的兼容结果，不能漏字或重复拼全文。
8. SDK 默认请求重试数为 2，迁移先设置 `maxRetries: 0`；不启用流中自动重试，防止额外费用和重复答案。未来重试必须单独定义策略。[S12]
9. 贯通浏览器停止、Request signal、下游 ReadableStream cancel 和上游 abort；停止后立即清理心跳。现有实现只是浏览器取消与读取异常间接传播，不能声称已具备完整取消链。
10. 180 秒现有计时是“等待上游 headers”，并非“等待首个文本 token”。不要机械替换为 SDK firstChunk timeout 改变其含义。
11. 不注册记录 prompt/request 的 telemetry；错误做凭据脱敏。已存在公开代理可被借用的问题不因 SDK 自动消失，访问控制及目标地址限制是单独的安全事项。

## 验收与实施顺序

### 第一步：思考等级

修改 `LlmConfig`、配置归一、设置 UI、两种请求构造、服务端 schema 和原生映射。服务端与 UI 的等级定义使用一个无浏览器/SDK依赖的共享配置模块，避免双方枚举漂移。

测试重点：旧配置缺字段、非法本地值、非法 HTTP 值、provider-default 不增加上游字段；出题与答疑都传参；Chat 与 Responses 的字段层级正确；Claude adaptive/budget 分支、已知不支持等级、预算上限；Codex 原有请求体硬约束；推理文本不进入出题 JSON 或答疑正文。

### 第二步：SDK 契约验证与替换

先建立固定发布版本、fake fetch 的请求/响应契约测试，再迁移一个标准 provider。复用现有 HTTP 入口测试，让调用方不用关心内部是 SDK 还是旧实现；只在 provider 请求体和兼容响应确实需要隔离时增加内部测试。

必须增加：上游 headers 前/流中取消、无最终文本的长思考期间保活、SDK warning、JSON 降级、HTTP 200 error body、终止缺失、completed-only、一次请求不重发、完整 baseURL 路径。SDK 夹具应符合真实协议，不为了通过旧的过度简化夹具而放宽生产验证。

标准路径通过后删除其被替代的解析实现；非标准 profile 保留必要实现，不在所有调用上叠加两套解析器。出题继续使用当前 JSON 契约和 `ExercisesSchema`，structured output 迁移另开变更。

最后运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`，并用 Wrangler 本地运行构建产物验证流与取消，再对用户实际使用的端点做获授权的联调。评估输出 token、首字延迟、截断率与 SQL 质量后，才考虑调整默认等级和预算。

## 来源

- [S1] [AI SDK Core: Reasoning](https://ai-sdk.dev/docs/ai-sdk-core/reasoning)，统一参数、优先级、映射和 warnings。
- [S2] npm registry 固定本次版本查询：[ai](https://registry.npmjs.org/ai/7.0.93)、[OpenAI](https://registry.npmjs.org/@ai-sdk/openai/4.0.60)、[Anthropic](https://registry.npmjs.org/@ai-sdk/anthropic/4.0.49)、[OpenAI-compatible](https://registry.npmjs.org/@ai-sdk/openai-compatible/3.0.44)。实际检索使用各包 `/latest` 并记录返回版本。
- [S3] [AI SDK 7 migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)，Node/ESM 要求、stream 更名与 Responses summary 默认值。
- [S4] [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)，provider factory、Chat/Responses、reasoningEffort、instructions、summary。
- [S5] [AI SDK Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)，adaptive thinking、effort、budget 与输出限制。
- [S6] [AI SDK OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)，自定义地址、reasoningEffort、providerOptions。
- [S7] 固定发布源码：[openai 4.0.60](https://unpkg.com/@ai-sdk/openai@4.0.60/dist/index.js)、[anthropic 4.0.49](https://unpkg.com/@ai-sdk/anthropic@4.0.49/dist/index.js)、[openai-compatible 3.0.44](https://unpkg.com/@ai-sdk/openai-compatible@3.0.44/dist/index.js)。已核对 `resolveAnthropicReasoningConfig`、compatible `reasoning_effort` 映射和 Responses `instructions` 构造。
- [S8] [Anthropic extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)，budget 约束与迁移 adaptive。
- [S9] [Anthropic steering thinking](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost)，原生 `output_config.effort`、成本与总输出限制；本次通过旧 adaptive-thinking 地址重定向取得。
- [S10] [OpenAI reasoning models](https://developers.openai.com/api/docs/guides/reasoning)，Responses reasoning、等级与 token 消耗。
- [S11] 本仓库 [Codex backend requirements](./chatgpt-codex-backend-requirements.md) 及其引用的一手源码。本次沿用仓库既有约束，未重新实测 ChatGPT 私有后端；不能把该后端的限制泛化到全部标准 OpenAI Responses。
- [S12] [AI SDK streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)，reasoning、maxRetries、streamRetries、abortSignal、timeout 与 stream 事件类型。
