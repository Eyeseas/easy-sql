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
    const text = parsed.data.type === 'openai' ? await callOpenAI(parsed.data) : await callAnthropic(parsed.data);
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

async function callAnthropic(cfg: Body): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/v1/messages'), {
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
  if (!res.ok) throw new Error(await httpError(res));

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

async function callOpenAI(cfg: Body): Promise<string> {
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
        { role: 'system', content: cfg.system },
        { role: 'user', content: cfg.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(await httpError(res));

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}
