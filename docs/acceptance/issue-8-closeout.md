# Issue #8 收口验收

日期：2026-09-07（CST）

## 结论

**父规格 #8 在受控本地生产候选范围内通过。** 本次以 `de5fec9` 为基线，逐项复核 #8、#9--#15 的 issue 正文和全部评论，并重新检查最终代码、HTTP/浏览器/生产测试与发布记录。#9--#15 均已合入并关闭；没有发现仍需补代码或测试的父规格范围内缺口。

本记录是父规格的收口索引；详细的三协议运行时证据、环境版本和限制仍以 [#15 生产构建发布验收记录](issue-15-production-release.md) 为准。

## 子任务集成

| 子任务 | 合入提交  | 父规格职责                      | 收口结果 |
| ------ | --------- | ------------------------------- | -------- |
| #9     | `f3df417` | 共享设置、Codex 思考等级        | 通过     |
| #10    | `14334ca` | OpenAI-compatible 思考等级      | 通过     |
| #11    | `44e0774` | Claude adaptive/固定预算思考    | 通过     |
| #12    | `3f08c48` | 答疑停止与全链取消              | 通过     |
| #13    | `88830e4` | Claude 迁移 AI SDK 7            | 通过     |
| #14    | `c9ec341` | OpenAI-compatible 迁移 AI SDK 7 | 通过     |
| #15    | `de5fec9` | Wrangler 生产构建跨端点验收     | 通过     |

## 用户故事逐项复核

| #8 用户故事 | 决策与最终证据                                                                                                                                                                                         | 结果 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1--5        | [共享能力策略](../../src/shared/llmConfig.ts)定义完整应用枚举、模型默认、常用档位、已验证额外档位和明确的不兼容错误；[设置界面](../../src/scripts/llmSettings.ts)按端点/模型重建可选项并显示能力状态。 | 通过 |
| 6--7        | [出题与答疑客户端](../../src/scripts/llm.ts)都从同一配置读取并显式发送 `reasoning`；浏览器和生产流程分别断言两条路径的真实出站字段。                                                                   | 通过 |
| 8--9        | 答疑 adapter 每轮重新读取配置；生产浏览器测试证明进行中请求不重启，下一轮才采用新端点和等级。                                                                                                          | 通过 |
| 10--13      | 旧 localStorage key 保留；缺失/非法 reasoning 归一为模型默认，刷新恢复、清空和模型/协议切换重校验均有单元及生产浏览器覆盖。                                                                            | 通过 |
| 14--18      | Chat Completions 使用 `reasoning_effort`，Codex 使用 `reasoning.effort`，Claude 按能力使用 adaptive effort 或 1024/4096/8192 固定预算；默认不注入推理字段，8000/16000 应用上限不随档位增大。           | 通过 |
| 19--20      | 出题仍经 `ExercisesSchema` 校验；三协议流只交付最终文本，reasoning/thinking 事件不进入练习 JSON 或答疑正文。                                                                                           | 通过 |
| 21--22      | 下游每 15 秒保活；浏览器停止、HTTP signal、下游 cancel、上游 fetch/reader 串联，覆盖 headers 前、流中和暂无正文阶段。                                                                                  | 通过 |
| 23          | 三协议均从同一次完整 JSON 响应降级，旧非流式客户端累计同一次生成；每个场景断言单次上游调用。                                                                                                           | 通过 |
| 24--25      | HTTP 200 error body、流内错误、截断、空答案、reasoning-only、缺终止和断流均失败且不发成功 `[DONE]`；SDK 和应用重试均关闭。                                                                             | 通过 |
| 26--27      | UI 与 README 准确说明 key 在浏览器保存、经本站 Worker 转发且不在服务端持久化；Wrangler 本地生产产物使用用户端点，无 Vercel hosting 或 Gateway 要求。                                                   | 通过 |
| 28--30      | `POST /api/llm` 及本站 SSE 保持稳定，SDK 类型封装在服务端上游模块；两阶段交付和最终生产验收均有独立提交、测试及明确未验证项。                                                                          | 通过 |

## 实现与测试决策复核

- 配置边界：`src/shared/llmConfig.ts` 无 DOM/SDK 依赖；浏览器归一与 HTTP 严格验证复用同一枚举，不新增 reasoning 环境变量，也不重解释历史 `codex` 类型。
- 能力与预算：能力表只列精确模型别名并附一手来源；未知 OpenAI-compatible/Codex 仅允许显式尝试 low/medium/high，未知 Claude 显式档位被前置拒绝。Claude 固定预算严格小于 16000，SDK 文本额度反算后原生总上限仍为 16000。
- SDK 边界：锁文件固定 `ai@7.0.93`、`@ai-sdk/anthropic@4.0.49`、`@ai-sdk/openai-compatible@3.0.44`；两个 SDK 路径使用显式 provider、用户 base URL/key、共享流/取消封装，Codex 保留专用 Responses transport。当前 AI SDK 文档复核也确认 custom provider/fetch、`abortSignal`、完整 `stream` 事件和 Anthropic budget 加算语义与实现一致。
- 响应契约：下游仍为 `{text}` / `{error}` / `[DONE]` SSE；完整 JSON、旧非流式、Codex completed-only、分片、错误和终止标记处理都在已有 HTTP seam 下验收，没有新增公开测试接口或 SDK UI runtime。
- 取消与时间：180 秒只覆盖等待 headers，收到 headers 后清理该计时；成功、失败、主动停止和下游断开均覆盖 reader、监听器、心跳及上游资源清理。
- 凭据与范围：错误对 key 脱敏，无完整 prompt/request telemetry；未加入 reasoning 展示、精确预算 UI、别名管理、自动降档/重试、OAuth、WebSocket、代理安全体系或 Codex SDK 全面迁移。
- 测试策略：单元/HTTP 测试锁定配置、原生出站形状、结束语义与调用次数；浏览器测试覆盖设置到出题/答疑和停止；生产 Playwright 通过 Wrangler 访问实际构建产物和受控三协议上游。

## 本次重新验证

| 命令                                  | 结果                                                    |
| ------------------------------------- | ------------------------------------------------------- |
| `pnpm test`                           | 通过，68/68                                             |
| `pnpm typecheck`                      | 通过，69 个文件，0 diagnostics                          |
| `pnpm lint`                           | 通过，ESLint 0 error                                    |
| `pnpm test:browser`                   | 通过，3/3                                               |
| `pnpm test:acceptance`                | 通过，先生产构建，再由本地 Wrangler 跑 4/4；约 5.3 分钟 |
| `pnpm exec wrangler deploy --dry-run` | 通过，173 个 assets，未部署                             |
| `git diff --check`                    | 通过                                                    |

第一次把 `pnpm lint` 与 Playwright 并发运行时，Playwright 删除临时 `test-results` 目录的同时 ESLint 正在扫描，导致一次 `ENOENT`；按项目脚本的独立执行方式重跑 lint 后通过。这是并发验证命令之间的临时目录竞争，不是应用或正式验收失败。

## 未验证

- 真实 Anthropic、OpenAI/Codex 或第三方中转端点：没有获授权的凭据与调用预算，未验证真实模型质量、计费、现行别名和额外非标准变体。
- Cloudflare 公网边缘：未执行部署，未验证公网路由、边缘首包限制和远端断连传播。
- 浏览器 Fetch abort 到本地 workerd 上游 close：UI 停止、迟到内容隔离和下一轮恢复通过；本地 workerd 对该 close 通知不可复核，三协议原始 HTTP socket 断开取消已通过。
- 实体移动设备和屏幕阅读器：仅验证安装版 Chrome 的桌面/`390x844` 视口及键盘/焦点流程。

这些项目与 #15 的已知限制一致，均依赖授权或目标环境，不构成本次受控本地生产候选的剩余发布阻断项。
