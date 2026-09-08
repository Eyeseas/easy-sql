# 八周 SQL 冲刺计划

面向 PostgreSQL 面试求职的剧情化学习站点。学习者从零基础加入一家电商创业公司，在 56 个学习日里随着业务发展逐步掌握单表查询、多表分析、窗口函数、事务、索引、性能优化与系统设计。

每个学习日包含连续的「学、练、盘」三段学习流程，明确当天发生的业务问题、需要完成的任务和过关标准。课程内容以 TypeScript 数据维护，页面负责渲染，同一份库表结构和课程上下文也用于约束 AI 出题与答疑。

## 技术栈

- Astro 5：静态页面生成和服务端 API 路由
- React 19：仅用于天页答疑交互岛
- Cloudflare Workers：托管静态资源并运行 `/api/llm`
- AI SDK 7：接入 Anthropic 和 OpenAI-compatible 上游
- TypeScript、Zod、ESLint、Prettier
- Node.js Test Runner、Playwright

## 快速开始

环境要求：

- Node.js 22 或更高版本
- pnpm

```bash
pnpm install
pnpm dev
```

开发服务器默认运行在 <http://localhost:4321>。

不配置 LLM 也可以浏览课程、使用计时器和记录学习进度。需要使用「出题」或「答疑」时，可以直接在页面右上角的「AI 设置」中填写端点信息。

也可以通过 `.env` 提供构建时默认值：

```bash
cp .env.example .env
```

支持的端点类型：

- `anthropic`：Anthropic Messages API
- `openai`：OpenAI-compatible Chat Completions API
- `codex`：OpenAI Responses API / Codex 端点

> [!IMPORTANT]
> 所有 `PUBLIC_` 环境变量都会进入浏览器产物。公开部署时必须将 `PUBLIC_LLM_API_KEY` 留空，让使用者在自己的浏览器中配置 key。

## 常用命令

```bash
pnpm dev              # 启动 Astro 开发服务器
pnpm build            # 构建静态页面和 Cloudflare Worker
pnpm preview          # 使用本地 workerd 运行生产构建
pnpm test             # 单元测试和 API 契约测试
pnpm test:browser     # 浏览器测试
pnpm test:acceptance  # 构建后通过 Wrangler 运行生产验收测试
pnpm typecheck        # Astro / TypeScript 类型检查
pnpm lint             # ESLint
pnpm format:check     # 检查 Prettier 格式
pnpm run deploy       # 构建并部署到 Cloudflare Workers
```

## 一条业务主线

课程不是按知识点罗列目录，而是按公司的发展阶段推进：

| 周  | 剧情阶段                 | 被逼出来的知识                 |
| --- | ------------------------ | ------------------------------ |
| 1   | 入职，老板发来订单 CSV   | 环境搭建、单表查询、NULL、聚合 |
| 2   | 运营导来用户/商品/明细   | JOIN、多表聚合、月报           |
| 3   | 类目上线，需求变绕       | 子查询、EXISTS、CTE、递归      |
| 4   | 增长团队接入登录日志     | 窗口函数（面试分水岭）         |
| 5   | 技术债爆发，支付模块上线 | 建模、约束、事务、并发         |
| 6   | 两年后报表变慢           | 索引、执行计划、EXPLAIN        |
| 7   | 大促备战                 | 深分页、分区、防超卖、物化视图 |
| 8   | 跳槽季，把项目讲出去     | 八股、设计题、限时手写         |

表随业务逐张上线：D1 只有 `orders`，其余 6 张表分别在 D8、D9、D15、D22、D32 上线，定义见 `src/data/schema.ts` 的 `since` 字段。

`seed.sql` 也按照剧情分阶段提供数据。请只执行当前学习进度对应的分段，不要一开始灌入全部数据，否则会提前改变第 6 周需要观察的慢查询现象。

## 核心功能

### 学习计时器

点击某个学习日的「开始今天」后，计时会话会按照该日的 `split` 配置依次完成「学、练、盘」。计时使用时间戳差值计算，不依赖容易被后台标签页节流影响的 `setInterval` 累加。

全站最多存在一个进行中的计时会话。刷新或关闭页面后再次打开，计时可以根据保存的时间戳继续恢复。

### 出题

出题时会把当天剧情、知识点、已有练习、学员已学范围、数据口径和当天已经上线的库表结构发送给用户配置的 LLM 端点。

模型返回的数据经过 Zod 校验，结果包含：

- 题目
- 提示
- 参考 SQL
- 自查点

重新出题时，上一批题目会作为去重上下文一并发送。生成结果按学习日保存在浏览器中，并可复制为 Markdown。

### 答疑

天页答疑只围绕当天课程及已经学过的内容回答。答疑支持连续多轮，但对话历史仅存在于当前页面会话，刷新后清空。

答疑和出题共用同一套「AI 设置」，支持模型允许的思考等级。

## Cloudflare 架构

项目使用 **Cloudflare Workers + Static Assets**，不是传统常驻 Node.js 服务，也不依赖 Cloudflare Pages。

```text
Browser
  |-- HTML / JS / CSS ----------> Cloudflare Static Assets
  `-- POST /api/llm -----------> Astro Worker
                                      |-- Anthropic Messages API
                                      |-- OpenAI Chat Completions API
                                      `-- OpenAI Responses API
```

Astro 使用静态输出模式。课程页在构建期生成，只有 `src/pages/api/llm.ts` 设置了 `prerender = false`，因此会被编译进 Worker：

```text
dist/
|-- generated HTML, JS and CSS
`-- _worker.js/index.js
```

`wrangler.jsonc` 将 `dist/_worker.js/index.js` 配置为 Worker 入口，并将整个 `dist` 目录作为 `ASSETS` 静态资源绑定。普通页面请求由 Cloudflare 静态资源系统处理，只有 `/api/llm` 进入动态路由。

### LLM 代理

浏览器向同域的 `POST /api/llm` 提交端点类型、地址、模型、key 和提示词。Worker 校验请求后调用用户指定的上游，解决浏览器直接访问第三方兼容端点时常见的 CORS 问题。

不同上游的事件会被归一为本站 SSE 格式：

```text
data: {"text":"增量文本"}

data: [DONE]
```

流内错误使用 `{"error":"..."}` 返回。Worker 每 15 秒发送一条 SSE 注释作为下游保活，并在浏览器取消请求时尝试中止上游连接。上游 headers 等待上限为 180 秒，但仍受 Cloudflare 平台本身的网络和执行限制。

更完整的设计决策见：

- `docs/adr/0002-llm-proxy-sse-streaming.md`
- `docs/adr/0003-react-island-assistant-ui-qa.md`
- `docs/adr/0004-anthropic-ai-sdk-7.md`
- `docs/adr/0005-openai-compatible-ai-sdk-7.md`

### 部署

先登录 Cloudflare：

```bash
pnpm exec wrangler login
```

检查生产构建：

```bash
pnpm build
pnpm exec wrangler deploy --dry-run
```

确认后部署：

```bash
pnpm run deploy
```

也可以在 Cloudflare 控制台中通过 Workers Builds 连接 GitHub 仓库自动部署。`*.workers.dev` 域名在中国大陆通常不可达，面向大陆访客时需要绑定可用的自定义域名。

仓库目前记录的是本地 Wrangler 生产验收与 `deploy --dry-run` 结果；真实 Cloudflare 公网边缘仍需要部署后的 smoke test。

## 数据与安全边界

项目没有使用 D1、KV、R2、Durable Objects、Queues 或 AI Gateway。以下数据只持久化在浏览器中：

- 学习进度
- 计时会话状态
- AI 设置
- 生成的补充练习

AI key 不会写入项目服务端存储，但调用模型时必然随请求经过本站 Worker，再由 Worker 放入上游鉴权请求。错误返回前会尝试移除 key。不要在公开构建中设置 `PUBLIC_LLM_API_KEY`。

`/api/llm` 当前没有登录认证、限流或上游域名白名单。公开部署意味着任何访问者都可以使用自己的 key 通过该 Worker 请求其配置的 HTTP/HTTPS LLM 地址，这可能占用 Worker 请求、CPU 和流量配额。需要面向不受信任用户开放时，应在部署前补充 Cloudflare Access、Turnstile、限流和上游地址约束。

## 项目结构

```text
src/
|-- components/                  Astro 与 React UI 组件
|-- data/
|   |-- weeks/week1..8.ts        56 个学习日的课程主体
|   |-- index.ts                 课程汇总与派生统计
|   |-- schema.ts                练习库表结构、时间线与数据口径
|   |-- meta.ts                  标题、时间盒、复习制度与产出物
|   `-- selftest.ts              高频考点自测
|-- pages/
|   |-- index.astro              总览页
|   |-- week/[no].astro          8 个周页
|   |-- day/[no].astro           56 个学习日页
|   `-- api/llm.ts               Cloudflare Worker LLM 代理路由
|-- scripts/                     浏览器端进度、计时、AI 设置与出题逻辑
|-- server/llm/                  Anthropic / OpenAI-compatible 上游适配
|-- shared/                      浏览器和服务端共享的 LLM 配置契约
|-- styles/                      主题令牌和全局样式
`-- types/curriculum.ts          Day / Week 课程类型

tests/                           单元、API、浏览器和生产验收测试
docs/adr/                        架构决策记录
docs/acceptance/                 发布验收记录
seed.sql                         按课程阶段灌数的 PostgreSQL 脚本
wrangler.jsonc                   Cloudflare Workers 部署配置
```

## 修改课程内容

修改某一天时，编辑对应的周文件。例如 D22 位于 `src/data/weeks/week4.ts`：

```ts
{
  no: 22,
  title: '登录日志接入：窗口函数是什么',
  brief: '增长团队接入 30 万行登录日志……',
  tags: ['hot'],
  split: [45, 60, 15],
  learn: ['...'],
  drill: ['...'],
  pass: '...',
}
```

字段含义：

- `brief`：当天的业务剧情
- `tags`：`hot` 高频、`lab` 实战、`test` 测评
- `split`：「学、练、盘」三段分钟数
- `learn`：学习要点
- `drill`：编号练习任务
- `pass`：过关标准
- `learnLabel` / `drillLabel`：测评日需要自定义栏目标题时使用

`brief`、`learn`、`drill` 和 `pass` 支持内联 `<code>` 与 `<b>`。页面显示的学习日、课时和题目统计都由课程数据自动计算。

提交内容变更前建议运行：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

## License

仓库目前尚未添加开源许可证。公开可见不等于授予复制、修改或再分发许可；在选择许可证前，代码仍由版权所有者保留全部权利。
