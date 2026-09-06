# 为零 React 的站点引入 React island，用 assistant-ui 跑天页答疑面板

站点至今是零 React 的 Astro + vanilla TS + 自定义 CSS（终端美学，无 Tailwind）。答疑（天页悬浮 AI 问答）需要的是一整套有状态的聊天 UI：流式渲染、中断、消息列表、输入框状态——手写是个不小的状态机，而 assistant-ui 恰好把这层 runtime 做成了库。决定：接受 React island——`@astrojs/react` + `react` + `react-dom` + `@assistant-ui/react` 只在天页作为 island 加载，assistant-ui 只用它的 runtime（`useLocalRuntime` + `ChatModelAdapter`）与无样式 primitives，样式全部自写以匹配终端美学；不引入它的 styled 组件与 Tailwind/shadcn 体系。多轮对话靠扩展 `/api/llm`（可选 `messages[]`，对话模式为自由文本、不设 `response_format`；不带则维持出题的 JSON mode 旧行为）——代理契约保持薄，island 才能薄。

## Considered Options

- Vanilla 聊天面板（复用 `readSseText`，约两百行）：体积最省、最贴现状，但流式中断、重发等状态机全手写，且明确放弃了使用 assistant-ui 的意图，被否。
- assistant-ui styled 组件（shadcn/Tailwind 全家桶）：得先给整个站引入 Tailwind，推翻现有自定义 CSS 体系，被否。
- 新开 `/api/chat` 端点：只会复制 `/api/llm` 的 SSE 转发与三端点归一逻辑，无收益，被否。

## Consequences

- 天页多出 React + react-dom + assistant-ui + react-markdown 的 JS 增量；island 只在天页挂载，其余页面维持零 React。
- assistant-ui 的使用面被钉死在 runtime + primitives 层；若未来移除答疑，删 island 与依赖即回到零 React。
- 高亮只留 prismjs 一家（复用 `highlightSql`），不引入 react-syntax-highlighter。
- `/api/llm` 变成双模式端点（一次性 JSON mode / 多轮自由文本），靠 body 里有无 `messages` 区分；旧调用方与测试不受影响。
- React island 成为先例：后续若再出现重状态 UI，默认走 island 而不是把手写状态机塞进 vanilla 脚本。
