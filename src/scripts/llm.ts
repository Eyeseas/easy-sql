/**
 * LLM 出题。端点类型/地址/模型/key 存在 localStorage，默认值来自构建时 .env 的
 * PUBLIC_LLM_*（会被打进前端产物，只在自己部署时填 key）。
 *
 * 实际转发由同站点的服务端代理 /api/llm 完成（见 src/pages/api/llm.ts）：各种
 * 中转 / OpenAI 兼容端点通常不带 CORS 头，浏览器直连会跨域失败，服务端没有这
 * 个限制。key 仍然只存在浏览器里，代理只透传不落盘。
 */
import { z } from 'zod';
import { schemaForPrompt, dataFactsForDay } from '../data/schema';
import { learnTitle, type LearnEntry } from '../types/curriculum';

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
  learn: LearnEntry[];
  drill: string[];
  pass: string;
  weekNo: number;
  weekTitle: string;
  /** 截至当天已学内容概览（见 data/index.ts 的 coveredForDay），防模型出超纲题 */
  covered?: string;
}

function defaults(): LlmConfig {
  const env = import.meta.env;
  const type = env.PUBLIC_LLM_TYPE === 'openai' ? 'openai' : 'anthropic';
  return {
    type,
    baseUrl:
      env.PUBLIC_LLM_BASE_URL ||
      (type === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'),
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
  exercises: z
    .array(
      z.object({
        task: z.string().min(1).describe('题目描述，中文，说清要查什么、输出哪几列'),
        hint: z.string().min(1).describe('卡住时的提示，一句话，点破关键思路但不给答案'),
        referenceSql: z
          .string()
          .min(1)
          .describe('可直接在 PostgreSQL 16 上运行的参考答案'),
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

/**
 * 课程文案里带 <code>/<b> 标签和 HTML 实体，喂给模型前都处理掉：省 token、
 * 避免它学着输出 HTML，也避免 SQL 里的 &gt; 之类实体干扰语义。
 */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // amp 最后解，避免「&amp;gt;」二次解码成 '>'
}

/**
 * 小讲义展开成一行文字：标题 + 场景 + 讲解 + 示例 SQL + 易错点。示例 SQL 是
 * 「今天教了什么语法」最直接的证据，带上它参考答案的语法水平才能对齐当天进度。
 */
function learnForPrompt(x: LearnEntry): string {
  if (typeof x === 'string') return stripTags(x);
  const parts = [stripTags(learnTitle(x))];
  if (x.scene) parts.push(`场景：${stripTags(x.scene)}`);
  parts.push(stripTags(x.body));
  if (x.sql) parts.push(`示例：${stripTags(x.sql.replace(/\s+/g, ' '))}`);
  if (x.pitfall) parts.push(`易错：${stripTags(x.pitfall)}`);
  return parts.join(' ');
}

/* ---------- 调服务端代理 ---------- */

async function callViaProxy(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...cfg, system, user }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `代理返回 ${res.status}`);
  if (!data.text) throw new Error('端点没有返回内容，重试一次通常就好');
  return data.text;
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
): Promise<Exercise[]> {
  const cfg = loadConfig();
  if (!cfg.apiKey.trim()) throw new Error('没有配置 API key，先点右上「出题设置」');

  const user = buildPrompt(day, count, priorTasks);
  const text = await callViaProxy(cfg, SYSTEM, user);
  return parseExercises(text);
}
