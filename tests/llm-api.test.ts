import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { POST } from '../src/pages/api/llm.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(
  type: 'openai' | 'anthropic' | 'codex' = 'openai',
  extra: Record<string, unknown> = {},
): Request {
  return new Request('http://localhost/api/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type,
      baseUrl: 'https://llm.invalid/v1',
      model: 'test-model',
      apiKey: '<REDACTED>',
      system: 'system',
      user: 'user',
      ...extra,
    }),
  });
}

async function post(
  type?: 'openai' | 'anthropic' | 'codex',
  extra: Record<string, unknown> = {},
): Promise<Response> {
  const response = await POST({ request: request(type, extra) } as Parameters<typeof POST>[0]);
  assert.ok(response instanceof Response);
  return response;
}

/** 上游 SSE：每个元素是一段原始字节，故意切开模拟网络分片 */
function sseUp(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** 读完代理自己的 SSE，返回去掉空行后的原始事件列表 */
async function readSse(response: Response): Promise<string[]> {
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const raw = await response.text();
  return raw.split('\n\n').filter((event) => event !== '');
}

/* ---------- 旧的整段 JSON 行为（不带 stream 的兼容路径） ---------- */

test('surfaces an error body even when an OpenAI-compatible endpoint returns 200', async () => {
  globalThis.fetch = async () =>
    Response.json({ error: { message: 'upstream timed out after 200 seconds' } });

  const response = await post();
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 502);
  assert.match(body.error ?? '', /upstream timed out after 200 seconds/);
});

test('reports an empty OpenAI completion with its finish reason', async () => {
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });

  const response = await post();
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 502);
  assert.match(body.error ?? '', /content.*为空/i);
  assert.match(body.error ?? '', /length/);
});

/* ---------- 流式转发（stream: true） ---------- */

test('relays an OpenAI SSE stream and terminates with [DONE]', async () => {
  let upstreamBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      // 这个事件故意切开在两个 chunk 里，验证跨 chunk 重组
      'data: {"choices":[{"delta":{"content":"{\\"exercises\\":',
      '[]}"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.equal(upstreamBody.stream, true); // 确实向上游要了流式
  const payloads = events
    .filter((e) => e.startsWith('data: {'))
    .map((e) => JSON.parse(e.slice(6)) as { text?: string });
  assert.deepEqual(payloads, [{ text: '{"exercises":[]}' }]); // 两个 chunk 重组成了同一条增量
  assert.equal(events.at(-1), 'data: [DONE]');
});

test('relays an Anthropic SSE stream until message_stop', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"type":"message_start"}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"，世界"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ]);

  const response = await post('anthropic', { stream: true });
  const events = await readSse(response);

  assert.deepEqual(events, ['data: {"text":"你好"}', 'data: {"text":"，世界"}', 'data: [DONE]']);
});

test('falls back to one-shot JSON when the upstream ignores stream', async () => {
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: '完整结果' }, finish_reason: 'stop' }] });

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.deepEqual(events, ['data: {"text":"完整结果"}', 'data: [DONE]']);
});

test('surfaces an in-stream error event and skips [DONE]', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"choices":[{"delta":{"content":"一半"}}]}\n\n',
      'data: {"error":{"message":"boom"}}\n\n',
    ]);

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.ok(events.includes('data: {"error":"端点在流里报错：boom"}'));
  assert.ok(!events.includes('data: [DONE]'));
});

test('reports upstream truncation by max_tokens in stream mode', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"choices":[{"delta":{"content":"abc"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ]);

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.ok(events.some((e) => e.includes('max_tokens')));
  assert.ok(!events.includes('data: [DONE]'));
});

/* ---------- codex（OpenAI Responses API） ---------- */

test('codex: requests the Responses API shape and relays output_text deltas', async () => {
  let seenUrl = '';
  let seenBody: Record<string, unknown> = {};
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"type":"response.created"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"第一段"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"第二段"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"第一段第二段"}]}]}}\n\n',
    ]);
  };

  const response = await post('codex', { stream: true });
  const events = await readSse(response);

  assert.equal(seenUrl, 'https://llm.invalid/v1/responses'); // baseUrl 已含 /v1，不重复拼
  assert.equal(seenBody.stream, true);
  assert.equal(seenBody.store, false);
  assert.equal(seenBody.instructions, 'system');
  assert.deepEqual(seenBody.input, [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'user' }] },
  ]);
  // completed 事件里带了全文，但增量已发过，不能重复补发
  assert.deepEqual(events, [
    'data: {"text":"第一段"}',
    'data: {"text":"第二段"}',
    'data: [DONE]',
  ]);
});

test('codex: accumulates the SSE stream for legacy non-stream clients', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"type":"response.output_text.delta","delta":"整"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"段"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ]);

  const response = await post('codex');
  const body = (await response.json()) as { text?: string; error?: string };

  assert.match(response.headers.get('content-type') ?? '', /json/);
  assert.equal(body.text, '整段');
});

test('codex: falls back to the completed event payload when no deltas arrive', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"一次性全文"}]}]}}\n\n',
    ]);

  const response = await post('codex', { stream: true });
  const events = await readSse(response);

  assert.deepEqual(events, ['data: {"text":"一次性全文"}', 'data: [DONE]']);
});

test('codex: reports incomplete responses (max_output_tokens) as errors', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"type":"response.output_text.delta","delta":"半"}\n\n',
      'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}}\n\n',
    ]);

  const response = await post('codex', { stream: true });
  const events = await readSse(response);

  assert.ok(events.some((e) => e.includes('max_output_tokens')));
  assert.ok(!events.includes('data: [DONE]'));
});

test('codex: surfaces an in-stream error event', async () => {
  globalThis.fetch = async () =>
    sseUp(['data: {"type":"error","code":"rate_limit_exceeded","message":"too busy"}\n\n']);

  const response = await post('codex', { stream: true });
  const events = await readSse(response);

  assert.ok(events.includes('data: {"error":"端点在流里报错：too busy"}'));
  assert.ok(!events.includes('data: [DONE]'));
});

test('codex: parses a non-streaming JSON response from the Responses API', async () => {
  globalThis.fetch = async () =>
    Response.json({
      status: 'completed',
      output: [
        { type: 'reasoning' },
        { type: 'message', content: [{ type: 'output_text', text: '完整结果' }] },
      ],
    });

  const response = await post('codex', { stream: true });
  const events = await readSse(response);

  assert.deepEqual(events, ['data: {"text":"完整结果"}', 'data: [DONE]']);
});

test('codex: reports a reasoning-only JSON response with its incomplete reason', async () => {
  globalThis.fetch = async () =>
    Response.json({
      status: 'incomplete',
      output: [{ type: 'reasoning' }],
      incomplete_details: { reason: 'max_output_tokens' },
    });

  const response = await post('codex');
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 502);
  assert.match(body.error ?? '', /incomplete：max_output_tokens/);
});

test('reports a stream that ends without a terminator as incomplete', async () => {
  globalThis.fetch = async () =>
    sseUp(['data: {"choices":[{"delta":{"content":"断在半路"}}]}\n\n']);

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.ok(events.some((e) => e.includes('提前断开')));
  assert.ok(!events.includes('data: [DONE]'));
});
