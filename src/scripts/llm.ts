/**
 * 浏览器直连 LLM 出题。没有服务端：端点类型/地址/模型/key 存在 localStorage，
 * 默认值来自构建时 .env 的 PUBLIC_LLM_*（会被打进前端产物，只在自己部署时填 key）。
 *
 * 两种端点：
 *  - anthropic：原生 /v1/messages（带浏览器直连专用头）
 *  - openai：OpenAI 兼容 /chat/completions（各种中转、one-api、OpenRouter 都是这套）
 */
import { z } from 'zod';
import { schemaForPrompt } from '../data/schema';

export type LlmEndpointType = 'anthropic' | 'openai';

export interface LlmConfig {
  type: LlmEndpointType;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const KEY = 'sql8w.llm.v1';

/** 出题上下文：页面里 #gen-context JSON 提供的当天数据（周页带 7 天，天页带 1 天） */
export interface GenContextDay {
  no: number;
  title: string;
  /** 业务剧情一句话，可为空（老数据） */
  brief?: string;
  learn: string[];
  drill: string[];
  pass: string;
  weekNo: number;
  weekTitle: string;
}

function defaults(): LlmConfig {
  const env = import.meta.env;
  const type = env.PUBLIC_LLM_TYPE === 'openai' ? 'openai' : 'anthropic';
  return {
    type,
    baseUrl: env.PUBLIC_LLM_BASE_URL || (type === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'),
    model: env.PUBLIC_LLM_MODEL || (type === 'openai' ? 'gpt-5' : 'claude-opus-5'),
    apiKey: env.PUBLIC_LLM_API_KEY || '',
  };
}

export function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw) as Partial<LlmConfig>;
    const merged = { ...defaults(), ...saved };
    merged.type = merged.type === 'openai' ? 'openai' : 'anthropic';
    return merged;
  } catch {
    return defaults();
  }
}

export function saveConfig(cfg: LlmConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg));
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
  exercises: z.array(
    z.object({
      task: z.string().describe('题目描述，中文，说清要查什么、输出哪几列'),
      hint: z.string().describe('卡住时的提示，一句话，点破关键思路但不给答案'),
      referenceSql: z.string().describe('可直接在 PostgreSQL 16 上运行的参考答案'),
      checkpoint: z.string().describe('自查点：怎么判断自己写对了'),
    }),
  ),
});

export type Exercise = z.infer<typeof ExercisesSchema>['exercises'][number];

const SYSTEM = `你是一位给 PostgreSQL 面试备考者出练习题的老师。课程设定是：学员零基础入职一家电商创业公司，知识点随着业务需求逐天展开。

出题要求：
- 题目必须只用给定的练习库表和字段，不要虚构表或列。
- 目标数据库是 PostgreSQL 16，可以用 PG 特有语法（FILTER、DISTINCT ON、LATERAL、生成列等）。
- 每题都要能用一条 SQL 解决，除非题目本身就是 DDL / 事务类。
- 紧扣当天的知识点，不要跑题到后面几周才学的内容。
- 题目尽量贴合当天给的业务剧情口吻（公司里谁提了什么需求），像真实业务里冒出来的问题。
- 不要重复用户已有的练习任务，要换角度、换业务场景。
- 参考答案要能直接运行，不要写伪代码，不要省略成 "..."。
- 全部用中文写题目、提示和自查点；SQL 保持原样。
- 只输出 JSON，不要输出任何其他文字或代码块标记。`;

function buildPrompt(day: GenContextDay, count: number): string {
  return `练习库表结构（截至这一天已上线的表）：
${schemaForPrompt(day.no)}

当前进度：第 ${day.weekNo} 周《${day.weekTitle}》，第 ${day.no} 天《${day.title}》。${day.brief ? `\n当天的业务剧情：${stripTags(day.brief)}` : ''}

这一天要掌握的知识点：
${day.learn.map((x) => `- ${stripTags(x)}`).join('\n')}

这一天已有的练习任务（不要重复这些）：
${day.drill.map((x, i) => `${i + 1}. ${stripTags(x)}`).join('\n')}

当天的过关标准：${stripTags(day.pass)}

请出 ${count} 道新的练习题，难度与已有任务相当或略高。
以 JSON 输出：{"exercises": [{"task": "...", "hint": "...", "referenceSql": "...", "checkpoint": "..."}]}，共 ${count} 题。`;
}

/** 课程文案里带 <code>/<b> 标签，喂给模型前去掉，省 token 也避免它学着输出 HTML */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

/* ---------- 两种端点的 HTTP 调用 ---------- */

/** 用户可能把路径的一部分写进 baseUrl（…/v1、…/v1/messages），只补缺的后缀 */
function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, '');
  if (b.endsWith(path)) return b;
  if (path === '/v1/messages' && b.endsWith('/v1')) return `${b}/messages`;
  return `${b}${path}`;
}

async function httpError(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    const err = body.error;
    detail = typeof err === 'string' ? err : (err?.message ?? body.message ?? '');
  } catch {
    /* 非 JSON 响应就算了 */
  }
  return `端点返回 ${res.status}${detail ? `：${detail}` : ''}`;
}

async function callAnthropic(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      // Anthropic 官方端点默认拒绝浏览器直连（防 key 泄露），这个头显式放开
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(await httpError(res));

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

async function callOpenAI(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(await httpError(res));

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
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

export async function generateExercises(day: GenContextDay, count: number): Promise<Exercise[]> {
  const cfg = loadConfig();
  if (!cfg.apiKey.trim()) throw new Error('没有配置 API key，先点右上「出题设置」');

  const user = buildPrompt(day, count);
  const text =
    cfg.type === 'openai' ? await callOpenAI(cfg, SYSTEM, user) : await callAnthropic(cfg, SYSTEM, user);
  return parseExercises(text);
}
