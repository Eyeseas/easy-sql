/**
 * LLM 共享层：出题与答疑两个功能共用（术语见 CONTEXT.md）。端点类型/地址/模型/
 * key/思考等级存在 localStorage（AI 设置），默认值来自构建时 .env 的 PUBLIC_LLM_*
 * （会被打进前端产物，只在自己部署时填 key）。
 *
 * 实际转发由同站点的服务端代理 /api/llm 完成（见 src/pages/api/llm.ts）：各种
 * 中转 / OpenAI 兼容端点通常不带 CORS 头，浏览器直连会跨域失败，服务端没有这
 * 个限制。key 仍然只存在浏览器里，代理只透传不落盘。代理用 SSE 保活
 * 浏览器到 Worker 的下游连接；上游仍受独立的 headers 超时及托管平台限制。
 * 出题走 system + user 一次性生成；答疑走 system + messages 多轮对话（ADR-0003）。
 */
import { z } from 'zod';
import { schemaForPrompt, dataFactsForDay } from '../data/schema';
import {
  DEFAULT_REASONING,
  normalizeReasoning,
  reasoningSupport,
  type LlmEndpointType,
  type ReasoningLevel,
} from '../shared/llmConfig';
import type { LearnEntry } from '../types/curriculum';
import { stripTags, learnForPrompt } from '../utils/promptText';

export interface LlmConfig {
  type: LlmEndpointType;
  baseUrl: string;
  model: string;
  apiKey: string;
  reasoning: ReasoningLevel;
}

const KEY = 'sql8w.llm.v1';

/** 出题上下文：页面里 #gen-context JSON 提供的当天数据（周页带 7 天，天页带 1 天）；答疑也用它 */
export interface GenContextDay {
  no: number;
  title: string;
  /** 业务剧情一句话，可为空（老数据） */
  brief?: string;
  learn: readonly LearnEntry[];
  drill: readonly string[];
  pass: string;
  weekNo: number;
  weekTitle: string;
  /** 截至当天已学内容概览（见 data/index.ts 的 coveredForDay），防模型超纲 */
  covered?: string;
}

/** 答疑的多轮对话回合（/api/llm 对话模式的 messages） */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function defaults(): LlmConfig {
  const env = import.meta.env ?? {};
  const type =
    env.PUBLIC_LLM_TYPE === 'openai' || env.PUBLIC_LLM_TYPE === 'codex'
      ? env.PUBLIC_LLM_TYPE
      : 'anthropic';
  return {
    type,
    baseUrl:
      env.PUBLIC_LLM_BASE_URL ||
      (type === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'),
    model:
      env.PUBLIC_LLM_MODEL ||
      (type === 'openai' ? 'gpt-5' : type === 'codex' ? 'gpt-5-codex' : 'claude-opus-5'),
    apiKey: env.PUBLIC_LLM_API_KEY || '',
    reasoning: DEFAULT_REASONING,
  };
}

function normalizedConfig(input: Partial<LlmConfig>): LlmConfig {
  const merged = { ...defaults(), ...input };
  merged.type = merged.type === 'openai' || merged.type === 'codex' ? merged.type : 'anthropic';
  merged.reasoning = normalizeReasoning(input.reasoning);
  if (reasoningSupport(merged.type, merged.model, merged.reasoning) === 'unsupported') {
    merged.reasoning = DEFAULT_REASONING;
  }
  return merged;
}

export function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw) as Partial<LlmConfig>;
    return normalizedConfig(saved);
  } catch {
    return defaults();
  }
}

export function saveConfig(cfg: LlmConfig): void {
  localStorage.setItem(KEY, JSON.stringify(normalizedConfig(cfg)));
}

/** 清掉浏览器里的设置，回到 .env 注入的构建时默认值 */
export function clearConfig(): void {
  localStorage.removeItem(KEY);
}

export function isConfigured(): boolean {
  return loadConfig().apiKey.trim() !== '';
}

/* ---------- schema 与提示词 ---------- */

export const ExercisesSchema = z.object({
  exercises: z
    .array(
      z.object({
        task: z.string().min(1).describe('题目描述，中文，说清要查什么、输出哪几列'),
        hint: z.string().min(1).describe('卡住时的提示，一句话，点破关键思路但不给答案'),
        referenceSql: z.string().min(1).describe('可直接在 PostgreSQL 16 上运行的参考答案'),
        checkpoint: z.string().min(1).describe('自查点：怎么判断自己写对了'),
      }),
    )
    .min(1),
});

export type Exercise = z.infer<typeof ExercisesSchema>['exercises'][number];

export const SYSTEM = `你是一位给 PostgreSQL 面试备考者出练习题的老师。课程设定是：学员零基础入职一家电商创业公司，知识点随着业务需求逐天展开；你负责在当天的课程任务之外补充几道新题。

出题要求：
- 只用「练习库表结构」里列出的表和字段，不虚构表、列和状态值；数值与口径一律按「数据口径」来。
- 只用「学员已学范围」内的语法和概念，不超前到还没教的天数。
- 紧扣当天的知识点，贴合当天业务剧情的口吻（公司里谁提了什么需求），像真实业务里冒出来的问题。
- 不与已有练习重复：换业务角度、换表组合，而不是同一道题换个数字。
- 每题都要能用一条 SQL 解决，除非题目本身就是 DDL / 事务类。
- 目标数据库是 PostgreSQL 16。PG 特有语法（FILTER、DISTINCT ON、LATERAL、生成列等）可以用，但以「已学范围 + 当天知识点」为准。
- 知识点里的示例 SQL 只是教学演示，不要把示例原样变成题目。

输出 JSON 的字段要求：
- task：题目正文。先一两句业务背景（谁、要什么），再说清要查什么、输出哪几列。
- hint：卡住时的一句话提示，点破关键思路（该想到哪个语法 / 哪张表），不给答案。
- referenceSql：可直接在 PostgreSQL 16 上运行的完整 SQL。不写伪代码、不用省略号、不要 markdown 代码围栏；列别名可以用中文。
- checkpoint：自查点，给可操作的判断方法：预期返回多少行（量级）、关键数字大概多少、或和哪道已有任务的结果能对上。

全部用中文写 task / hint / checkpoint；SQL 保持代码原样。只输出 JSON，不要任何其他文字或代码块标记。`;

/** 出题提示词。导出只为离线检查 / 调试，运行时只被本文件用 */
export function buildPrompt(
  day: GenContextDay,
  count: number,
  priorTasks: readonly string[] = [],
): string {
  return `练习库表结构（截至这一天已上线的表）：
${schemaForPrompt(day.no)}

${dataFactsForDay(day.no)}

当前进度：第 ${day.weekNo} 周《${day.weekTitle}》，第 ${day.no} 天《${day.title}》。${day.brief ? `\n当天的业务剧情：${stripTags(day.brief)}` : ''}${day.covered ? `\n学员已学范围（只能用这些之内的知识出题）：${day.covered}` : ''}

这一天要掌握的知识点：
${day.learn.map((x) => `- ${learnForPrompt(x)}`).join('\n')}

这一天已有的练习任务（不要重复这些题目和场景）：
${day.drill.map((x, i) => `${i + 1}. ${stripTags(x)}`).join('\n')}${
    priorTasks.length > 0
      ? `\n\n之前生成过、学员已经做过的补充练习（也不要重复）：\n${priorTasks.map((x, i) => `${i + 1}. ${stripTags(x)}`).join('\n')}`
      : ''
  }

当天的过关标准：${stripTags(day.pass)}

请出 ${count} 道新的补充练习，难度与已有任务相当或略高，几道题之间从巩固到综合拉开梯度。
以 JSON 输出：{"exercises": [{"task": "...", "hint": "...", "referenceSql": "...", "checkpoint": "..."}]}，共 ${count} 题。`;
}

/* ---------- 随堂默写 ---------- */

/**
 * 要一起考的旧知识点：来自「今日复盘」那几格对应的学习日。
 * 只带学习日号、标题与命中的那一条，不带讲义正文——注入页面的东西要小。
 */
export interface RecallPoint {
  no: number;
  title: string;
  /** 命中的那一条知识点 / 题面，已清掉内联标签 */
  point: string;
}

export const RECALL_SYSTEM = `${SYSTEM}

补充要求（这次是「随堂默写」）：
- 每道题都要同时用到当天的知识点和「要一起考的旧知识点」里的内容，两边在同一条 SQL 里碰上，不是一道新题加一道旧题。
- 旧知识点正是学员今天该复盘、已经开始忘的东西，借这道题把它捞回来。
- 别把旧知识点的原题照抄一遍，换业务角度、换表组合。`;

/** 随堂默写的提示词。导出只为离线检查 / 调试，运行时只被本文件用 */
export function buildRecallPrompt(
  day: GenContextDay,
  points: readonly RecallPoint[],
  count: number,
  priorTasks: readonly string[] = [],
): string {
  return `练习库表结构（截至这一天已上线的表）：
${schemaForPrompt(day.no)}

${dataFactsForDay(day.no)}

当前进度：第 ${day.weekNo} 周《${day.weekTitle}》，第 ${day.no} 天《${day.title}》。${day.brief ? `\n当天的业务剧情：${stripTags(day.brief)}` : ''}${day.covered ? `\n学员已学范围（只能用这些之内的知识出题）：${day.covered}` : ''}

这一天要掌握的知识点：
${day.learn.map((x) => `- ${learnForPrompt(x)}`).join('\n')}

要一起考的旧知识点（学员今天该复盘的，必须和当天知识点混在同一道题里）：
${points.map((p) => `- 第 ${p.no} 天《${stripTags(p.title)}》：${p.point}`).join('\n')}

这一天已有的练习任务（不要重复这些题目和场景）：
${day.drill.map((x, i) => `${i + 1}. ${stripTags(x)}`).join('\n')}${
    priorTasks.length > 0
      ? `\n\n之前生成过、学员已经做过的随堂默写（也不要重复）：\n${priorTasks.map((x, i) => `${i + 1}. ${stripTags(x)}`).join('\n')}`
      : ''
  }

请出 ${count} 道随堂默写题，每道都要新旧知识点同时用上，难度与已有任务相当或略高。
以 JSON 输出：{"exercises": [{"task": "...", "hint": "...", "referenceSql": "...", "checkpoint": "..."}]}，共 ${count} 题。`;
}

/* ---------- 调服务端代理 ---------- */

/**
 * 读代理的 SSE：逐个产出 {text} 增量；{error} 抛错；[DONE] 正常收尾；流意外
 * 断开抛错。出题（计字数进度）与答疑（逐段拼累计文本）都建立在它上面。
 */
export async function* sseDeltas(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!res.body) throw new Error('浏览器不支持流式读取，换个现代浏览器试试');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let done = false;
  const cancelReader = (): void => {
    void reader.cancel(signal?.reason).catch(() => {
      /* 重复取消或流已关闭 */
    });
  };
  let listening = false;
  try {
    signal?.throwIfAborted();
    signal?.addEventListener('abort', cancelReader, { once: true });
    listening = signal !== undefined;
    for (;;) {
      const { done: finished, value } = await reader.read();
      signal?.throwIfAborted();
      if (finished) break;
      // 统一换行后按空行切事件；残段留在 buf 里等下一轮。注释行（保活）不带 data:，自然跳过
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const event = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = sseDataOf(event);
        if (data === null) continue;
        if (data === '[DONE]') {
          done = true;
          continue;
        }
        let obj: { text?: unknown; error?: unknown };
        try {
          obj = JSON.parse(data) as { text?: unknown; error?: unknown };
        } catch {
          continue;
        }
        if (typeof obj.error === 'string') throw new Error(obj.error);
        if (typeof obj.text === 'string') yield obj.text;
      }
    }
  } finally {
    if (listening) signal?.removeEventListener('abort', cancelReader);
    await reader.cancel().catch(() => {
      /* 已读完时是 no-op */
    });
    reader.releaseLock();
  }
  signal?.throwIfAborted();
  if (!done) throw new Error('连接中断，响应不完整，重试一次通常就好');
}

/** 读代理的 SSE 并累计全文；onProgress 回调目前已收字符数 */
async function readSseText(res: Response, onProgress?: (chars: number) => void): Promise<string> {
  let text = '';
  for await (const delta of sseDeltas(res)) {
    text += delta;
    onProgress?.(text.length);
  }
  if (!text.trim()) throw new Error('端点没有返回内容，重试一次通常就好');
  return text;
}

/** 取一个 SSE 事件里 data: 行的负载（多行按 spec 拼接）；没有则 null */
function sseDataOf(event: string): string | null {
  const parts: string[] = [];
  for (const line of event.split('\n')) {
    if (line.startsWith('data:')) parts.push(line.slice(5).replace(/^ /, ''));
  }
  if (parts.length === 0) return null;
  const joined = parts.join('\n');
  return joined === '' ? null : joined;
}

/**
 * 答疑多轮对话走 /api/llm 的对话模式（body 带 messages，见 docs/adr/0003）：
 * 逐个产出增量，调用方拼累计文本；上游不支持流式时整段当单个增量补发（同
 * callViaProxy 的降级路径）。代理保活浏览器到 Worker 的下游连接（ADR-0002），
 * 不改变上游自身的 headers 超时或托管平台限制。
 */
export async function* chatViaProxy(
  cfg: LlmConfig,
  system: string,
  messages: readonly ChatTurn[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  signal?.throwIfAborted();
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: cfg.type,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      apiKey: cfg.apiKey,
      reasoning: cfg.reasoning,
      system,
      messages,
      stream: true,
    }),
    signal,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!res.ok) throw new Error(data?.error || `代理返回 ${res.status}`);
    if (!data?.text) throw new Error('端点没有返回内容，重试一次通常就好');
    yield data.text;
    return;
  }
  let text = '';
  for await (const delta of sseDeltas(res, signal)) {
    text += delta;
    yield delta;
  }
  if (!text.trim()) throw new Error('端点没有返回内容，重试一次通常就好');
}

/**
 * 出题的一次性生成（system + user，非对话模式）：代理默认以 SSE 流式转发
 * （见 docs/adr/0002），每 15 秒的注释保活浏览器到 Worker 的下游连接。
 * onProgress 回调收到目前已累计的字符数。兼容旧版代理返回的完整 JSON
 * （部署切换期 / 上游不支持流式时的降级路径）。
 */
async function callViaProxy(
  cfg: LlmConfig,
  system: string,
  user: string,
  onProgress?: (chars: number) => void,
): Promise<string> {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...cfg, system, user, stream: true }),
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!res.ok) throw new Error(data?.error || `代理返回 ${res.status}`);
    if (!data?.text) throw new Error('端点没有返回内容，重试一次通常就好');
    return data.text;
  }
  return readSseText(res, onProgress);
}

/* ---------- 解析与入口 ---------- */

function parseExercises(text: string): Exercise[] {
  // 容错：模型偶尔会用 ```json 包一层，取第一个 { 到最后一个 }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('端点返回的内容不是 JSON');
  const parsed = ExercisesSchema.safeParse(JSON.parse(m[0]));
  if (!parsed.success) throw new Error('返回的 JSON 形状不对，重试一次通常就好');
  return parsed.data.exercises;
}

export async function generateExercises(
  day: GenContextDay,
  count: number,
  /** 上一批已生成的题目描述，传进来防重新生成时撞题 */
  priorTasks: readonly string[] = [],
  /** 流式进度回调：目前已收到的字符数 */
  onProgress?: (chars: number) => void,
): Promise<Exercise[]> {
  const cfg = loadConfig();
  if (!cfg.apiKey.trim()) throw new Error('没有配置 API key，先点右上「AI 设置」');

  const user = buildPrompt(day, count, priorTasks);
  const text = await callViaProxy(cfg, SYSTEM, user, onProgress);
  return parseExercises(text);
}

/** 随堂默写：与出题同一条管道，只换系统提示词与用户提示词 */
export async function generateRecall(
  day: GenContextDay,
  points: readonly RecallPoint[],
  count: number,
  priorTasks: readonly string[] = [],
  onProgress?: (chars: number) => void,
): Promise<Exercise[]> {
  const cfg = loadConfig();
  if (!cfg.apiKey.trim()) throw new Error('没有配置 API key，先点右上「AI 设置」');

  const user = buildRecallPrompt(day, points, count, priorTasks);
  const text = await callViaProxy(cfg, RECALL_SYSTEM, user, onProgress);
  return parseExercises(text);
}
