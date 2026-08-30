/**
 * LLM 出题代理：浏览器把端点配置（type/baseUrl/model/apiKey）和提示词 POST 到这里，
 * 由 Node 服务端转发给 LLM 端点。服务端之间没有 CORS 限制，浏览器直连各种中转 /
 * 兼容端点缺 CORS 头的问题就此解决。
 *
 * key 仍然只存在用户自己的 localStorage（或自部署时的构建产物）里，服务端只透传
 * 不落盘。注意：站点公开部署时，这个端点任何人都能借用你的服务器转发请求
 * （不消耗你的 key，但占带宽）；介意的话可以自行加访问限制。
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';

export const prerender = false;

const BodySchema = z.object({
  type: z.enum(['anthropic', 'openai']),
  baseUrl: z.url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  system: z.string(),
  user: z.string(),
});

type Body = z.infer<typeof BodySchema>;

export const POST: APIRoute = async ({ request }) => {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: '请求参数不对' }, { status: 400 });
  }
  try {
    const text =
      parsed.data.type === 'openai'
        ? await callOpenAI(parsed.data)
        : await callAnthropic(parsed.data);
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
};

/* ---------- 转发逻辑（从 src/scripts/llm.ts 迁来，改为服务端视角） ---------- */

/** 用户可能把路径的一部分写进 baseUrl（…/v1、…/v1/messages），只补缺的后缀 */
function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, '');
  if (b.endsWith(path)) return b;
  if (path === '/v1/messages' && b.endsWith('/v1')) return `${b}/messages`;
  return `${b}${path}`;
}

const UPSTREAM_TIMEOUT_MS = 180_000;

interface JsonObject {
  [key: string]: unknown;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function errorDetail(data: JsonObject): string {
  const error = data.error;
  if (typeof error === 'string') return error;
  const nestedMessage = asObject(error)?.message;
  if (typeof nestedMessage === 'string') return nestedMessage;
  return typeof data.message === 'string' ? data.message : '';
}

async function readJson(res: Response): Promise<JsonObject> {
  try {
    const data = asObject(await res.json());
    if (data) return data;
  } catch {
    /* 统一在下面给出带状态码的错误 */
  }
  throw new Error(`端点返回 ${res.status}，但响应不是 JSON 对象`);
}

function endpointError(res: Response, data: JsonObject, hasExpectedPayload: boolean): Error | null {
  const detail = errorDetail(data);
  if (res.ok && !data.error && (hasExpectedPayload || !detail)) return null;
  return new Error(`端点返回 ${res.status}${detail ? `：${detail}` : ''}`);
}

async function fetchEndpoint(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`端点请求超过 ${UPSTREAM_TIMEOUT_MS / 1000} 秒，已取消`);
    }
    throw error;
  }
}

function elapsed(startedAt: number): string {
  return `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`;
}

async function callAnthropic(cfg: Body): Promise<string> {
  const startedAt = Date.now();
  const res = await fetchEndpoint(joinUrl(cfg.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 16000,
      system: cfg.system,
      messages: [{ role: 'user', content: cfg.user }],
    }),
  });

  const data = await readJson(res);
  const content = Array.isArray(data.content) ? data.content : [];
  const failure = endpointError(res, data, content.length > 0);
  if (failure) throw failure;

  const text = content
    .map(asObject)
    .filter((block): block is JsonObject => block?.type === 'text')
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('');

  if (!text.trim()) {
    const stopReason =
      typeof data.stop_reason === 'string' ? `，stop_reason=${data.stop_reason}` : '';
    throw new Error(
      `端点返回 ${res.status}，但 content 中没有文本（${elapsed(startedAt)}${stopReason}）`,
    );
  }
  return text;
}

async function callOpenAI(cfg: Body): Promise<string> {
  const startedAt = Date.now();
  const res = await fetchEndpoint(joinUrl(cfg.baseUrl, '/chat/completions'), {
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
        { role: 'system', content: cfg.system },
        { role: 'user', content: cfg.user },
      ],
    }),
  });

  const data = await readJson(res);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = asObject(choices[0]);
  const message = asObject(choice?.message);
  const failure = endpointError(res, data, choice !== null);
  if (failure) throw failure;

  const content = message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map(asObject)
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
        : typeof choice?.text === 'string'
          ? choice.text
          : typeof data.output_text === 'string'
            ? data.output_text
            : '';

  if (!text.trim()) {
    const details = [elapsed(startedAt)];
    if (typeof choice?.finish_reason === 'string')
      details.push(`finish_reason=${choice.finish_reason}`);
    if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) {
      details.push('只返回了 reasoning_content，没有最终答案');
    }
    if (typeof message?.refusal === 'string' && message.refusal.trim()) {
      details.push(`模型拒绝：${message.refusal}`);
    }
    throw new Error(
      `端点返回 ${res.status}，但 choices[0].message.content 为空（${details.join('，')}）`,
    );
  }
  return text;
}
