# Issue #15 生产构建发布验收记录

日期：2026-09-07（CST）

## 发布结论

**受控本地生产验收通过。** Astro 生产产物由 Wrangler 本地 Workers 运行时提供，三个协议均贯通本站 `/api/llm`，完整自动化、类型检查、lint、生产构建、桌面/移动视口和键盘流程均通过。验收没有调用真实付费端点、没有部署，也没有修改或关闭 GitHub issue；真实端点与 Cloudflare 公网边缘项目仍明确列在「未验证」中。

本次发现并修复了两个发布阻断级可访问性/布局问题：AI 设置弹窗打开后没有把焦点移入弹窗、也没有循环焦点或支持 Escape/恢复触发按钮焦点；答疑中的长错误、长用户文本和宽表格可能造成窄屏横向溢出。修复后对应生产浏览器断言通过。

## 验收候选与环境

- 基线：`c9ec341`（`feat: migrate OpenAI-compatible workflow to AI SDK 7 (#14)`）；验收代码和本记录由包含本文件的 #15 提交承载。
- OS：macOS Darwin 25.4.0，x86_64。
- Node.js `24.14.1`，pnpm `10.11.0`。
- Astro `5.18.2`，`@astrojs/cloudflare` `12.6.13`。
- Wrangler `4.127.1`，配置日期 `2026-09-01`，`nodejs_compat` 保持启用。
- Playwright `1.63.0`，本地浏览器 Google Chrome `153.0.8010.12`。
- AI SDK `7.0.93`，`@ai-sdk/anthropic` `4.0.49`，`@ai-sdk/openai-compatible` `3.0.44`，Zod `4.4.3`。
- assistant-ui runtime `0.15.18`，React/React DOM `19.2.8`。

依赖来自现有锁文件和已安装工作区；本票没有更新依赖。受控上游只监听 `127.0.0.1` 的随机端口，凭据固定使用字面占位符 `<REDACTED>`，没有真实 key、敏感请求体或原始思考被写入记录或测试产物。

## 执行命令与结果

| 命令                                  | 结果                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm test`                           | 通过：68/68 Node 单元与 HTTP 合约测试                                                                    |
| `pnpm typecheck`                      | 通过：69 个文件，0 error / 0 warning / 0 hint                                                            |
| `pnpm lint`                           | 通过：ESLint 0 error                                                                                     |
| `pnpm test:browser`                   | 通过：3/3 开发运行时浏览器回归                                                                           |
| `pnpm test:acceptance`                | 通过：先执行 `astro build`，再由 Wrangler 运行 `dist/_worker.js/index.js` 和 `dist` assets；4/4 生产验收 |
| `pnpm exec wrangler deploy --dry-run` | 通过：读取 173 个 assets，Worker 总上传 2286.74 KiB / gzip 429.25 KiB；`--dry-run` 后退出，未部署        |
| `git diff --check`                    | 通过                                                                                                     |

`pnpm test:acceptance` 使用 [playwright.production.config.ts](../../playwright.production.config.ts)，不会启动 Astro 开发服务器。Wrangler 在 `127.0.0.1:8791` 运行实际构建产物；[llm-release.spec.ts](../../tests/production/llm-release.spec.ts) 启动本地受控上游并通过浏览器或原始 HTTP 客户端访问本站 Worker，未替换浏览器返回值。

## 三协议证据

| 范围     | Anthropic Messages                                               | OpenAI-compatible Chat Completions                                                                      | Codex Responses                                                               |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 正常流程 | 保存、出题、答疑；`/v1/messages`；adaptive `xhigh`；总上限 16000 | 保存/刷新恢复、出题、下一轮答疑；`/v1/chat/completions`；GPT-5 `high` 使用 `max_completion_tokens=8000` | 保存、出题、停止、取消后下一轮答疑；`/v1/responses`；专用 Responses transport |
| 同次兼容 | 完整 JSON 降级；旧非流式客户端累计同一次流                       | 完整 JSON 降级；旧非流式客户端累计同一次流                                                              | 完整 JSON 降级；旧非流式客户端累计同一次流；completed-only 正文只出现一次     |
| 失败矩阵 | HTTP 200 error body、截断、空答案、reasoning-only、缺终止、断流  | 同左                                                                                                    | 同左                                                                          |
| 取消     | headers 前下游断开、流中下游断开，受控上游连接关闭               | 同左                                                                                                    | 同左；另验证 assistant-ui「停止」、迟到正文不进入 UI、下一轮成功              |

每个 JSON 降级和失败场景都断言受控上游请求数只增加一次。失败结果只有一个 `{error}`、没有成功 `[DONE]`；因此失败和降级均未触发隐式第二次生成，也没有把失败计为成功。

### 保活、超时与资源

- OpenAI-compatible 受控流先只发 reasoning、16 秒后才发正文；Wrangler 下游在 15 秒出现 `: keepalive`，reasoning 未作为正文暴露，最终正文与 `[DONE]` 正常到达。
- 实际等待上游 headers 的受控请求在 180 秒后得到「超过 180 秒」错误；观测窗口断言为 175-195 秒，期间下游持续保活，上游连接随后关闭。
- 三协议分别验证 headers 前取消和流中取消；每次取消后立即发健康请求并成功。
- 单元合约另外用可控时钟验证 keepalive interval、abort listener、reader 和 headers timer 清理；headers 到达后不再受 180 秒总时长限制。

### 出站形状

- 默认等级在三协议均省略 `reasoning_effort` / `reasoning` / `thinking`，没有 telemetry 字段。
- Claude adaptive 发送原生 `thinking` 与 `output_config.effort`；固定预算 low/medium/high 分别保持 1024/4096/8192，且原生总 `max_tokens` 仍为 16000。
- OpenAI-compatible 出题保留 `response_format: json_object`，答疑省略它；已验证 GPT-5 显式等级用 `max_completion_tokens=8000`，未知模型继续用既定 `max_tokens=8000`。
- Codex 保持 `stream: true`、`store: false`；没有 `temperature`、`max_output_tokens` 或 reasoning `summary`。
- SDK 两协议及 Codex 专用实现均通过单次请求计数验证无自动重试；应用没有启用 telemetry。

## 设置、浏览器与兼容

- AI 设置完成保存、刷新恢复、清空；旧 localStorage 记录缺少 reasoning 时归一为模型默认。
- 从 Claude `xhigh` 切换到 OpenAI 时立即重新校验并回到模型默认，页面给出状态；随后保存 `high`，下一轮才使用新端点和新等级。
- 设置在第一轮答疑进行中变化时，进行中 Anthropic 请求没有重启或改协议；下一轮才读取 OpenAI 配置。
- 桌面视口 `1440x900` 和移动视口 `390x844` 均由安装版 Chrome 执行。移动端断言页面无横向溢出，弹窗、答疑面板和长错误边界均在视口内。
- 键盘完成 AI 设置打开/保存/关闭、答疑发送和停止。弹窗现在打开后聚焦首个字段，Tab/Shift+Tab 在弹窗内循环，Escape 关闭并把焦点还给触发按钮。
- assistant-ui 继续只使用 local runtime/primitives；停止后的空 assistant 占位不进入下一轮上游消息。

## 保留实现与约束

- Anthropic 与 OpenAI-compatible 继续使用 AI SDK 7；Codex 继续保留专用原生 Responses API 实现，三者可共存。
- 本站自定义 `{text}` / `{error}` / `[DONE]` SSE、15 秒注释保活、完整 JSON 同次降级和旧非流式响应继续保留。
- key 仍只按既有约定保存在学习者浏览器 localStorage，请求期间由 Worker 透传；没有新增服务端持久化。
- 没有新增原始思考展示、请求体 telemetry、OAuth、WebSocket、代理安全体系或 Codex 全面 SDK 化。

## 未验证

- **真实模型端点：未验证。** 未获得凭据与调用预算授权，因此没有调用 Anthropic、OpenAI/Codex 或第三方中转。真实模型质量、计费、供应商当前模型别名和非标准中转变体仍需授权后联调。
- **Cloudflare 公网边缘：未验证。** 未执行 `wrangler deploy`；公网路由、Cloudflare 边缘网络、平台级首包限制和远端断连传播仍需部署候选上的 smoke test。
- **本地 Wrangler 的浏览器 Fetch 断连通知：部分受限。** UI「停止」、迟到内容隔离和下一轮恢复已在生产构建中通过；但本地 workerd 没有为浏览器 Fetch abort 暴露可复核的上游 close 通知。使用原始 HTTP socket 断开时，三协议的上游取消均可复核；公网边缘上的浏览器 abort 到上游 close 仍列为待验证项目。
- **实体移动设备与辅助技术：未验证。** 移动验收是 Chrome 的 `390x844` 视口，不等同于实体 iOS/Android、触摸键盘或屏幕阅读器验收。

在上述授权相关项目完成前，不应把本记录解释为真实付费端点或公网部署已验收；它支持的结论是：当前候选在受控本地生产构建范围内没有剩余发布阻断回归。
