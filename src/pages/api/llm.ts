/**
 * LLM 出题代理：浏览器把端点配置（type/baseUrl/model/apiKey/reasoning）和提示词 POST 到这里，
 * 由服务端转发给 LLM 端点（部署在 Cloudflare Workers 上，见 wrangler.jsonc；代码
 * 只用 Web 标准 API，本地 Node 跑也行）。服务端之间没有 CORS 限制，浏览器直连
 * 各种中转 / 兼容端点缺 CORS 头的问题就此解决。
 *
 * 端点类型三种：anthropic（Messages API）、openai（Chat Completions 兼容中转）、
 * codex（OpenAI Responses API，即 Codex 系端点；一律向上游要流式，契约见
 * upstreamRequest 里的注释）。
 *
 * body 带 stream: true 时走 SSE 流式转发（见 docs/adr/0002）：Cloudflare 边缘对
 * 「迟迟不吐字节」的响应只等约 100 秒，非流式代理慢模型（推理模型动辄一两分钟）
 * 会被掐断、浏览器看到 524；代理每 15 秒向浏览器这一侧发一行 SSE 注释保活，
 * 上游等待 headers 仍有独立的 180 秒期限，保活不代表上游连接永不超时。不带
 * stream 时保持旧行为：攒完整响应再返回 JSON（兼容部署切换期浏览器里缓存的旧
 * 产物）。上游不支持流式（返回完整 JSON）时自动降级：整段当作单个增量转发。
 *
 * key 仍然只存在用户自己的 localStorage（或自部署时的构建产物）里，服务端只透传
 * 不落盘。注意：站点公开部署时，这个端点任何人都能借用你的 Worker 转发请求
 * （不消耗你的 key，但占配额）；介意的话可以自行加访问限制。
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  DEFAULT_REASONING,
  REASONING_LEVELS,
  knownReasoningCapability,
  reasoningSupport,
} from '../../shared/llmConfig';

export const prerender = false;

const BodySchema = z.object({
  type: z.enum(['anthropic', 'openai', 'codex']),
  baseUrl: z.url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  reasoning: z.enum(REASONING_LEVELS).default(DEFAULT_REASONING),
  system: z.string(),
  /** 一次性生成的用户提示词（出题）。对话模式（messages）下不需要 */
  user: z.string().optional(),
  /** 多轮对话历史（答疑，见 docs/adr/0003）。带它即对话模式：自由文本，不设 JSON mode */
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .optional(),
  stream: z.boolean().optional(),
});

type Body = z.infer<typeof BodySchema>;

export const POST: APIRoute = async ({ request }) => {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: '请求参数不对' }, { status: 400 });
  }
  const cfg = parsed.data;
  if (reasoningSupport(cfg.type, cfg.model, cfg.reasoning) === 'unsupported') {
    return Response.json(
      { error: '所选思考等级与当前端点或模型不兼容，请在 AI 设置中改用模型默认' },
      { status: 400 },
    );
  }
  // 出题走 system + user 一次性生成；答疑走 system + messages 多轮。两者必居其一
  if (!cfg.messages && cfg.user === undefined) {
    return Response.json({ error: '请求参数不对' }, { status: 400 });
  }
  if (cfg.stream) return relayAsStream(cfg, request.signal);
  try {
    return Response.json({ text: await runUpstream(cfg, false, () => {}, request.signal) });
  } catch (e) {
    return Response.json({ error: errorMessage(e, cfg.apiKey) }, { status: 502 });
  }
};

/* ---------- 流式出口：把上游增量转成自己的 SSE ---------- */

const KEEPALIVE_MS = 15_000;

function relayAsStream(cfg: Body, requestSignal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let listeningForRequestAbort = false;

  const abortUpstream = (reason?: unknown): void => {
    if (!upstream.signal.aborted) upstream.abort(reason);
  };
  const stopKeepalive = (): void => {
    if (keepalive === undefined) return;
    clearInterval(keepalive);
    keepalive = undefined;
  };
  const onRequestAbort = (): void => {
    stopKeepalive();
    abortUpstream(requestSignal.reason);
  };
  const cleanup = (): void => {
    stopKeepalive();
    if (listeningForRequestAbort) {
      requestSignal.removeEventListener('abort', onRequestAbort);
      listeningForRequestAbort = false;
    }
  };

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        requestSignal.addEventListener('abort', onRequestAbort, { once: true });
        listeningForRequestAbort = true;
        if (requestSignal.aborted) onRequestAbort();

        const write = (chunk: string): void => {
          controller.enqueue(encoder.encode(chunk));
        };
        // 长思考可能一直只有推理事件、没有最终文本；这段时间也持续保活下游连接
        if (!upstream.signal.aborted) {
          keepalive = setInterval(() => {
            try {
              write(': keepalive\n\n');
            } catch {
              /* 浏览器已断开，cancel 会负责清理和取消上游 */
            }
          }, KEEPALIVE_MS);
        }
        void (async () => {
          try {
            let sent = '';
            const text = await runUpstream(
              cfg,
              true,
              (delta) => {
                sent += delta;
                write(`data: ${JSON.stringify({ text: delta })}\n\n`);
              },
              upstream.signal,
            );
            if (!text.trim()) throw new Error('端点没有返回内容，重试一次通常就好');
            // 不支持流式的上游走的是完整 JSON 解析，没经过 onDelta：整段补发
            if (text !== sent) write(`data: ${JSON.stringify({ text })}\n\n`);
            write('data: [DONE]\n\n');
          } catch (e) {
            const canceled = upstream.signal.aborted;
            abortUpstream(e);
            if (!canceled) {
              try {
                write(`data: ${JSON.stringify({ error: errorMessage(e, cfg.apiKey) })}\n\n`);
              } catch {
                /* 浏览器已断开 */
              }
            }
          } finally {
            cleanup();
            try {
              controller.close();
            } catch {
              /* 已断开或已关闭 */
            }
          }
        })();
      },
      cancel(reason) {
        cleanup();
        abortUpstream(reason);
      },
    }),
    {
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

/* ---------- 上游调用 ---------- */

/** 用户可能把路径的一部分写进 baseUrl（…/v1、…/v1/messages），只补缺的后缀 */
function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, '');
  if (b.endsWith(path)) return b;
  if (path.startsWith('/v1/') && b.endsWith('/v1')) return `${b}${path.slice(3)}`;
  return `${b}${path}`;
}

/** 等上游首包（headers）的上限；流出阶段不限总时长，挂着不动 Cloudflare 自己会掐 */
const UPSTREAM_TIMEOUT_MS = 180_000;

interface JsonObject {
  [key: string]: unknown;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function errorMessage(e: unknown, apiKey: string): string {
  const message = e instanceof Error ? e.message : String(e);
  const secret = apiKey.trim();
  return secret ? message.split(secret).join('<REDACTED>') : message;
}

function errorDetail(data: JsonObject): string {
  const error = data.error;
  if (typeof error === 'string') return error;
  const nestedMessage = asObject(error)?.message;
  if (typeof nestedMessage === 'string') return nestedMessage;
  return typeof data.message === 'string' ? data.message : '';
}

async function readJson(res: Response, signal: AbortSignal): Promise<JsonObject> {
  try {
    if (!res.body) throw new Error('missing response body');
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of bodyChunks(res.body, signal)) {
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    const data = asObject(JSON.parse(text));
    if (data) return data;
  } catch {
    signal.throwIfAborted();
    /* 统一在下面给出带状态码的错误 */
  }
  throw new Error(`端点返回 ${res.status}，但响应不是 JSON 对象`);
}

function endpointError(res: Response, data: JsonObject, hasExpectedPayload: boolean): Error | null {
  const detail = errorDetail(data);
  if (res.ok && !data.error && (hasExpectedPayload || !detail)) return null;
  return new Error(`端点返回 ${res.status}${detail ? `：${detail}` : ''}`);
}

interface EndpointResponse {
  response: Response;
  release: () => void;
}

async function fetchEndpoint(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<EndpointResponse> {
  // 手写超时而不是 AbortSignal.timeout：workerd 上它有过不可捕获 DOMException 的
  // 边缘 bug（cloudflare/workerd#1020）。fetch 返回即 headers 到手，计时随之结束；
  // 外部取消监听会保留到响应体读完，确保 headers 后取消也能中止底层 fetch。
  signal.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  let released = false;
  const onAbort = (): void => controller.abort(signal.reason);
  const release = (): void => {
    if (released) return;
    released = true;
    signal.removeEventListener('abort', onAbort);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, release };
  } catch (error) {
    release();
    signal.throwIfAborted();
    if (timedOut && controller.signal.aborted) {
      throw new Error(`端点请求超过 ${UPSTREAM_TIMEOUT_MS / 1000} 秒，已取消`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function elapsed(startedAt: number): string {
  return `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`;
}

function upstreamRequest(cfg: Body, stream: boolean): { url: string; init: RequestInit } {
  const streamField = stream ? { stream: true } : {};
  // 对话模式（答疑多轮）：user 一次性提示词换成完整对话历史；不设 response_format
  const chat = cfg.messages ?? null;
  if (cfg.type === 'anthropic') {
    return {
      url: joinUrl(cfg.baseUrl, '/v1/messages'),
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 16000,
          ...streamField,
          system: cfg.system,
          messages: chat
            ? chat.map((m) => ({ role: m.role, content: m.content }))
            : [{ role: 'user', content: cfg.user ?? '' }],
        }),
      },
    };
  }
  if (cfg.type === 'codex') {
    // ChatGPT Codex 后端的硬性契约：instructions 必须是顶层字符串、store 必须
    // false、只收流式；temperature / max_output_tokens 会被直接拒（订阅侧自己
    // 限长）。所以只带它认识的最小字段集——官方 api.openai.com 的 Responses API
    // 同样接受这个形状。stream 参数在这里被无视：codex 端点没有非流式可用，
    // 旧客户端的整段 JSON 请求由服务端自己攒流实现。多轮历史里 user 回合用
    // input_text、assistant 回合用 output_text（Responses API 的对话形状）
    return {
      url: joinUrl(cfg.baseUrl, '/v1/responses'),
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          ...(cfg.reasoning === DEFAULT_REASONING ? {} : { reasoning: { effort: cfg.reasoning } }),
          instructions: cfg.system,
          input: chat
            ? chat.map((m) => ({
                type: 'message',
                role: m.role,
                content: [
                  { type: m.role === 'user' ? 'input_text' : 'output_text', text: m.content },
                ],
              }))
            : [
                {
                  type: 'message',
                  role: 'user',
                  content: [{ type: 'input_text', text: cfg.user ?? '' }],
                },
              ],
          stream: true,
          store: false,
        }),
      },
    };
  }
  // Only verified OpenAI models with an explicit effort switch token fields. Provider-default
  // and unknown compatible gateways retain the existing max_tokens request shape.
  const openAiCapability = knownReasoningCapability(cfg.type, cfg.model);
  const useMaxCompletionTokens =
    cfg.reasoning !== DEFAULT_REASONING &&
    openAiCapability?.endpointType === 'openai' &&
    openAiCapability.chatCompletionTokenField === 'max_completion_tokens';
  const completionLimit = useMaxCompletionTokens
    ? {
        max_completion_tokens: Math.min(8_000, openAiCapability.maxOutputTokens ?? 8_000),
      }
    : { max_tokens: 8_000 };
  return {
    url: joinUrl(cfg.baseUrl, '/chat/completions'),
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        ...completionLimit,
        ...(cfg.reasoning === DEFAULT_REASONING ? {} : { reasoning_effort: cfg.reasoning }),
        ...streamField,
        // JSON mode 是出题（一次性生成、要解析成练习 JSON）才需要的；答疑对话要自由文本
        ...(chat ? {} : { response_format: { type: 'json_object' } }),
        messages: chat
          ? [
              { role: 'system', content: cfg.system },
              ...chat.map((m) => ({ role: m.role, content: m.content })),
            ]
          : [
              { role: 'system', content: cfg.system },
              { role: 'user', content: cfg.user ?? '' },
            ],
      }),
    },
  };
}

/**
 * 打上游、拿到完整文本。上游是 SSE 就逐段回调 onDelta；不是（不支持流式的中转、
 * 或直接报错）就按完整 JSON 响应解析。失败一律抛带人话的 Error。
 */
async function runUpstream(
  cfg: Body,
  stream: boolean,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const startedAt = Date.now();
  const { url, init } = upstreamRequest(cfg, stream);
  const { response: res, release } = await fetchEndpoint(url, init, signal);
  try {
    signal.throwIfAborted();
    if (res.ok && (res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      return await relaySse(res, cfg.type, onDelta, startedAt, signal);
    }
    return cfg.type === 'anthropic'
      ? await parseAnthropicJson(res, startedAt, signal)
      : cfg.type === 'codex'
        ? await parseResponsesJson(res, startedAt, signal)
        : await parseOpenAiJson(res, startedAt, signal);
  } finally {
    if (signal.aborted && res.body && !res.body.locked) {
      try {
        await res.body.cancel(signal.reason);
      } catch {
        /* fetch 或 reader 已经释放响应体 */
      }
    }
    release();
  }
}

/* ---------- 上游 SSE 解析 ---------- */

/**
 * 逐块读取响应体。signal 取消时主动 cancel reader，因此即使 mock/中转没有把
 * fetch signal 绑到返回的流，等待中的 read 也会立即结束并释放资源。
 */
async function* bodyChunks(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  const cancelReader = (): void => {
    void reader.cancel(signal.reason).catch(() => {
      /* 重复取消或底层已经关闭 */
    });
  };
  let listening = false;
  try {
    signal.throwIfAborted();
    signal.addEventListener('abort', cancelReader, { once: true });
    listening = true;
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      yield value;
    }
  } finally {
    if (listening) signal.removeEventListener('abort', cancelReader);
    try {
      await reader.cancel();
    } catch {
      /* 已读完或已取消时是 no-op */
    } finally {
      reader.releaseLock();
    }
  }
}

/** 从响应体逐个取出 SSE 事件的 data 负载（多行 data 按 spec 拼接） */
async function* sseData(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buf = '';
  const dataOf = (rawEvent: string): string | null => {
    const parts: string[] = [];
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('data:')) parts.push(line.slice(5).replace(/^ /, ''));
    }
    if (parts.length === 0) return null;
    const joined = parts.join('\n');
    return joined === '' ? null : joined;
  };
  for await (const value of bodyChunks(body, signal)) {
    buf += decoder.decode(value, { stream: true });
    // 统一换行后按空行切事件，残段留在 buf 里等下一轮
    buf = buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const data = dataOf(buf.slice(0, sep));
      buf = buf.slice(sep + 2);
      if (data) yield data;
    }
  }
  buf += decoder.decode(); // 冲掉 decoder 里可能残留的字节
  const tail = dataOf(buf); // 没有空行收尾的最后一段也认
  if (tail) yield tail;
}

function parseJsonObject(data: string): JsonObject | null {
  try {
    return asObject(JSON.parse(data));
  } catch {
    return null;
  }
}

/** 从 Responses API 的 response 对象（或完整 JSON 响应）里提取全部 output_text */
function responsesText(resp: JsonObject | null): string {
  if (!resp) return '';
  const output = Array.isArray(resp.output) ? resp.output : [];
  return output
    .map(asObject)
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map(asObject)
    .filter((part) => part?.type === 'output_text')
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

/** 解析上游 SSE，边转发边攒全文；流里的错误、截断、提前断开都抛 Error */
async function relaySse(
  res: Response,
  type: 'anthropic' | 'openai' | 'codex',
  onDelta: (delta: string) => void,
  startedAt: number,
  signal: AbortSignal,
): Promise<string> {
  if (!res.body) throw new Error(`端点返回 ${res.status}，但没有响应体`);
  let text = '';
  let completed = false;
  let sawReasoning = false;
  let refusal = '';
  let finishNote = '';

  for await (const data of sseData(res.body, signal)) {
    if (data === '[DONE]') {
      completed = true;
      break;
    }
    const obj = parseJsonObject(data);
    if (!obj) continue;

    if (type === 'openai') {
      if (obj.error !== undefined) {
        throw new Error(`端点在流里报错：${errorDetail(obj) || '未知错误'}`);
      }
      const choice = asObject(Array.isArray(obj.choices) ? obj.choices[0] : undefined);
      const delta = asObject(choice?.delta);
      const piece = typeof delta?.content === 'string' ? delta.content : '';
      if (piece) {
        text += piece;
        onDelta(piece);
      }
      if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content.trim()) {
        sawReasoning = true;
      }
      if (typeof delta?.refusal === 'string' && delta.refusal.trim()) refusal = delta.refusal;
      const finish = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '';
      if (finish) {
        finishNote = `finish_reason=${finish}`;
        if (finish === 'length') {
          throw new Error('输出达到 token 上限并被截断（finish_reason=length），JSON 不完整');
        }
      }
      continue;
    }

    if (type === 'codex') {
      // Responses API 的流事件：type 是 response.xxx，文本在 response.output_text.delta
      if (obj.error !== undefined) {
        throw new Error(`端点在流里报错：${errorDetail(obj) || '未知错误'}`);
      }
      const kind = typeof obj.type === 'string' ? obj.type : '';
      if (kind === 'error') {
        throw new Error(`端点在流里报错：${errorDetail(obj) || '未知错误'}`);
      }
      if (kind === 'response.failed') {
        const resp = asObject(obj.response);
        throw new Error(`端点在流里报错：${errorDetail(resp ?? obj) || '未知错误'}`);
      }
      if (kind === 'response.incomplete') {
        const reason = asObject(asObject(obj.response)?.incomplete_details)?.reason;
        throw new Error(
          `输出不完整（incomplete：${typeof reason === 'string' ? reason : '未知原因'}）`,
        );
      }
      if (kind === 'response.output_text.delta') {
        const piece = typeof obj.delta === 'string' ? obj.delta : '';
        if (piece) {
          text += piece;
          onDelta(piece);
        }
        continue;
      }
      if (
        kind === 'response.reasoning_summary_text.delta' ||
        kind === 'response.reasoning_text.delta'
      ) {
        sawReasoning = true;
        continue;
      }
      if (kind === 'response.completed') {
        completed = true;
        // 个别中转只发 completed 不发增量：从完整 response 对象里整段补上
        const full = responsesText(asObject(obj.response));
        if (!text && full) {
          text = full;
          onDelta(full);
        }
        break;
      }
      continue; // response.created / output_item.* / content_part.* 等过程事件
    }

    // anthropic
    const kind = typeof obj.type === 'string' ? obj.type : '';
    if (kind === 'error') {
      throw new Error(`端点在流里报错：${errorDetail(obj) || '未知错误'}`);
    }
    if (kind === 'message_stop') {
      completed = true;
      break;
    }
    if (kind === 'message_delta') {
      const delta = asObject(obj.delta);
      const stop = typeof delta?.stop_reason === 'string' ? delta.stop_reason : '';
      if (stop) {
        finishNote = `stop_reason=${stop}`;
        if (stop === 'max_tokens') {
          throw new Error('输出被 max_tokens 截断（stop_reason=max_tokens），JSON 不完整');
        }
      }
      continue;
    }
    if (kind === 'content_block_start') {
      const block = asObject(obj.content_block);
      if (typeof block?.text === 'string' && block.text) {
        text += block.text;
        onDelta(block.text);
      }
      continue;
    }
    if (kind === 'content_block_delta') {
      const delta = asObject(obj.delta);
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        text += delta.text;
        onDelta(delta.text);
      } else if (delta?.type === 'thinking_delta') {
        sawReasoning = true;
      }
      continue;
    }
  }

  if (!completed) throw new Error(`上游提前断开，响应不完整（${elapsed(startedAt)}）`);
  if (!text.trim()) {
    const details = [elapsed(startedAt)];
    if (finishNote) details.push(finishNote);
    if (sawReasoning) details.push('只返回了 reasoning_content，没有最终答案');
    if (refusal) details.push(`模型拒绝：${refusal}`);
    throw new Error(`端点返回 ${res.status}，但流里没有任何文本（${details.join('，')}）`);
  }
  return text;
}

/* ---------- 上游完整 JSON 响应（不支持流式的中转 / 直接报错） ---------- */

async function parseAnthropicJson(
  res: Response,
  startedAt: number,
  signal: AbortSignal,
): Promise<string> {
  const data = await readJson(res, signal);
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

async function parseOpenAiJson(
  res: Response,
  startedAt: number,
  signal: AbortSignal,
): Promise<string> {
  const data = await readJson(res, signal);
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

async function parseResponsesJson(
  res: Response,
  startedAt: number,
  signal: AbortSignal,
): Promise<string> {
  const data = await readJson(res, signal);
  const text =
    responsesText(data) || (typeof data.output_text === 'string' ? data.output_text : '');
  const failure = endpointError(res, data, text.trim() !== '');
  if (failure) throw failure;

  const status = typeof data.status === 'string' ? data.status : '';
  if (status === 'incomplete') {
    const reason = asObject(data.incomplete_details)?.reason;
    throw new Error(
      `端点返回 ${res.status}，但响应不完整（incomplete：${
        typeof reason === 'string' ? reason : '未知原因'
      }）`,
    );
  }
  if (!text.trim()) {
    const details = [elapsed(startedAt)];
    if (status) details.push(`status=${status}`);
    if (
      Array.isArray(data.output) &&
      data.output.some((item) => asObject(item)?.type === 'reasoning')
    ) {
      details.push('只返回了 reasoning，没有最终答案');
    }
    throw new Error(`端点返回 ${res.status}，但 output 里没有任何文本（${details.join('，')}）`);
  }
  return text;
}
