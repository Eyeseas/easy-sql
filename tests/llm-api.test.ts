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
  signal?: AbortSignal,
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
    signal,
  });
}

async function post(
  type?: 'openai' | 'anthropic' | 'codex',
  extra: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<Response> {
  const response = await POST({ request: request(type, extra, signal) } as Parameters<
    typeof POST
  >[0]);
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
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ error: { message: 'upstream timed out after 200 seconds' } });
  };

  const response = await post();
  const body = (await response.json()) as { error?: string };

  assert.equal(calls, 1);
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

test('relays an explicit OpenAI effort for generation and terminates with [DONE]', async () => {
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

  const response = await post('openai', { stream: true, reasoning: 'medium' });
  const events = await readSse(response);

  assert.equal(upstreamBody.stream, true); // 确实向上游要了流式
  assert.equal(upstreamBody.reasoning_effort, 'medium');
  assert.equal(upstreamBody.reasoning, undefined); // Chat Completions 不用 Responses 的嵌套字段
  assert.equal(upstreamBody.max_tokens, 8_000); // 未知兼容模型保持原字段
  assert.equal(upstreamBody.max_completion_tokens, undefined);
  const payloads = events
    .filter((e) => e.startsWith('data: {'))
    .map((e) => JSON.parse(e.slice(6)) as { text?: string });
  assert.deepEqual(payloads, [{ text: '{"exercises":[]}' }]); // 两个 chunk 重组成了同一条增量
  assert.equal(events.at(-1), 'data: [DONE]');
});

test('uses max_completion_tokens for a documented GPT-5 effort without raising the app limit', async () => {
  let upstreamBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"choices":[{"delta":{"content":"完成"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  const response = await post('openai', {
    stream: true,
    model: 'gpt-5-2025-08-07',
    reasoning: 'minimal',
  });
  await readSse(response);

  assert.equal(upstreamBody.reasoning_effort, 'minimal');
  assert.equal(upstreamBody.reasoning, undefined);
  assert.equal(upstreamBody.max_completion_tokens, 8_000);
  assert.equal(upstreamBody.max_tokens, undefined);
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

test('falls back to one-shot JSON once when the upstream ignores stream', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      choices: [{ message: { content: '完整结果' }, finish_reason: 'stop' }],
    });
  };

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.equal(calls, 1);

  assert.deepEqual(events, ['data: {"text":"完整结果"}', 'data: [DONE]']);
});

test('surfaces an in-stream error event once and skips [DONE]', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return sseUp([
      'data: {"choices":[{"delta":{"content":"一半"}}]}\n\n',
      'data: {"error":{"message":"boom"}}\n\n',
    ]);
  };

  const response = await post('openai', { stream: true, reasoning: 'low' });
  const events = await readSse(response);

  assert.equal(calls, 1);
  assert.ok(events.includes('data: {"error":"端点在流里报错：boom"}'));
  assert.ok(!events.includes('data: [DONE]'));
});

test('reports a reasoning-only OpenAI stream once without exposing reasoning as text', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return sseUp([
      'data: {"choices":[{"delta":{"reasoning_content":"private reasoning"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  const response = await post('openai', { stream: true, reasoning: 'high' });
  const events = await readSse(response);

  assert.equal(calls, 1);
  assert.ok(events.some((event) => event.includes('只返回了 reasoning_content')));
  assert.ok(events.every((event) => !event.includes('private reasoning')));
  assert.ok(!events.includes('data: [DONE]'));
});

test('reports upstream truncation at the configured token limit in stream mode', async () => {
  globalThis.fetch = async () =>
    sseUp([
      'data: {"choices":[{"delta":{"content":"abc"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ]);

  const response = await post('openai', { stream: true });
  const events = await readSse(response);

  assert.ok(events.some((e) => e.includes('token 上限')));
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
  assert.equal(seenBody.reasoning, undefined); // 模型默认不注入 effort 或 summary
  assert.equal(seenBody.reasoning_effort, undefined); // Responses 不用 Chat Completions 字段
  assert.equal(seenBody.temperature, undefined);
  assert.equal(seenBody.max_output_tokens, undefined);
  assert.deepEqual(seenBody.input, [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'user' }] },
  ]);
  // completed 事件里带了全文，但增量已发过，不能重复补发
  assert.deepEqual(events, ['data: {"text":"第一段"}', 'data: {"text":"第二段"}', 'data: [DONE]']);
});

test('codex: maps an explicit effort to reasoning.effort without summary or retries', async () => {
  let calls = 0;
  let seenBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"type":"response.output_text.delta","delta":"完成"}\n\n',
      'data: {"type":"response.completed","response":{"output":[]}}\n\n',
    ]);
  };

  const response = await post('codex', { stream: true, reasoning: 'high' });
  await readSse(response);

  assert.equal(calls, 1);
  assert.deepEqual(seenBody.reasoning, { effort: 'high' });
  assert.equal(seenBody.reasoning_effort, undefined);
  assert.equal((seenBody.reasoning as Record<string, unknown>).summary, undefined);
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

/* ---------- 对话模式（body 带 messages，答疑用，见 docs/adr/0003） ---------- */

function chatRequest(
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
      messages: [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
        { role: 'user', content: '追问' },
      ],
      stream: true,
      ...extra,
    }),
  });
}

async function postChat(
  type?: 'openai' | 'anthropic' | 'codex',
  extra: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<Response> {
  const chat = chatRequest(type, extra);
  const request = signal ? new Request(chat, { signal }) : chat;
  const response = await POST({ request } as Parameters<typeof POST>[0]);
  assert.ok(response instanceof Response);
  return response;
}

test('chat mode: relays the full conversation to OpenAI-compatible endpoints without JSON mode', async () => {
  let upstreamBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      // 跨 chunk 切开的增量，验证对话模式沿用同一条重组转发路径
      'data: {"choices":[{"delta":{"content":"思"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"路是"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  const response = await postChat('openai', { reasoning: 'high' });
  const events = await readSse(response);

  assert.deepEqual(upstreamBody.messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '追问' },
  ]);
  assert.equal(upstreamBody.response_format, undefined); // 对话是自由文本，不开出题的 JSON mode
  assert.equal(upstreamBody.stream, true);
  assert.equal(upstreamBody.reasoning_effort, 'high');
  assert.equal(upstreamBody.reasoning, undefined);
  assert.equal(upstreamBody.max_tokens, 8_000);
  assert.equal(upstreamBody.max_completion_tokens, undefined);
  assert.deepEqual(events, ['data: {"text":"思"}', 'data: {"text":"路是"}', 'data: [DONE]']);
});

test('chat mode: anthropic gets system plus the conversation history', async () => {
  let upstreamBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ]);
  };

  await postChat('anthropic');

  assert.equal(upstreamBody.system, 'system');
  assert.deepEqual(upstreamBody.messages, [
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '追问' },
  ]);
});

test('chat mode: codex gets instructions plus input_text/output_text history', async () => {
  let upstreamBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"type":"response.output_text.delta","delta":"答"}\n\n',
      'data: {"type":"response.completed","response":{"output":[]}}\n\n',
    ]);
  };

  await postChat('codex', { reasoning: 'low' });

  assert.equal(upstreamBody.instructions, 'system');
  assert.deepEqual(upstreamBody.reasoning, { effort: 'low' });
  assert.equal(upstreamBody.reasoning_effort, undefined);
  assert.deepEqual(upstreamBody.input, [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: '第一问' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '第一答' }] },
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: '追问' }] },
  ]);
  assert.equal(upstreamBody.store, false);
});

test('chat mode: rejects malformed messages with 400', async () => {
  globalThis.fetch = async () => {
    throw new Error('不应触达上游');
  };

  const unknownRole = await postChat('openai', {
    messages: [{ role: 'system', content: '假扮用户' }],
  });
  assert.equal(unknownRole.status, 400);

  const emptyContent = await postChat('openai', {
    messages: [{ role: 'user', content: '' }],
  });
  assert.equal(emptyContent.status, 400);
});

test('rejects invalid or incompatible reasoning before touching the upstream', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('不应触达上游');
  };

  assert.equal((await post('codex', { reasoning: 'turbo' })).status, 400);
  assert.equal((await post('anthropic', { reasoning: 'high' })).status, 400);
  assert.equal(
    (
      await post('openai', {
        model: 'gpt-5',
        reasoning: 'xhigh',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post('codex', {
        model: 'gpt-5-codex',
        reasoning: 'xhigh',
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
});

test('allows a common effort for an unknown OpenAI-compatible model without retrying rejection', async () => {
  const apiKey = 'openai-secret-that-must-not-leak';
  let calls = 0;
  let seenBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ error: { message: `upstream rejected ${apiKey}` } }, { status: 400 });
  };

  const response = await post('openai', {
    model: 'private-chat-alias',
    apiKey,
    reasoning: 'low',
  });
  const body = (await response.json()) as { error?: string };

  assert.equal(calls, 1);
  assert.equal(seenBody.reasoning_effort, 'low');
  assert.equal(seenBody.max_tokens, 8_000);
  assert.equal(seenBody.max_completion_tokens, undefined);
  assert.equal(response.status, 502);
  assert.doesNotMatch(body.error ?? '', /openai-secret-that-must-not-leak/);
  assert.match(body.error ?? '', /<REDACTED>/);
});

test('allows a common effort for an unknown Codex model without retrying rejected requests', async () => {
  const apiKey = 'secret-key-that-must-not-leak';
  let calls = 0;
  let seenBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ error: { message: `upstream rejected ${apiKey}` } }, { status: 400 });
  };

  const response = await post('codex', {
    model: 'private-codex-alias',
    apiKey,
    reasoning: 'medium',
  });
  const body = (await response.json()) as { error?: string };

  assert.equal(calls, 1);
  assert.deepEqual(seenBody.reasoning, { effort: 'medium' });
  assert.equal(response.status, 502);
  assert.doesNotMatch(body.error ?? '', /secret-key-that-must-not-leak/);
  assert.match(body.error ?? '', /<REDACTED>/);
});

test('provider-default preserves the current GPT-5 request shape and generation JSON mode', async () => {
  let upstreamBody: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return sseUp([
      'data: {"choices":[{"delta":{"content":"{}"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };

  await post('openai', { stream: true, model: 'gpt-5' });

  // 双模式分界锁死：不带 messages 的旧调用方（出题）仍走 JSON mode
  assert.deepEqual(upstreamBody.response_format, { type: 'json_object' });
  assert.equal(upstreamBody.reasoning_effort, undefined);
  assert.equal(upstreamBody.reasoning, undefined);
  assert.equal(upstreamBody.max_tokens, 8_000);
  assert.equal(upstreamBody.max_completion_tokens, undefined);
  assert.deepEqual(upstreamBody.messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'user' },
  ]);
});

test('rejects a body with neither user nor messages', async () => {
  globalThis.fetch = async () => {
    throw new Error('不应触达上游');
  };

  const response = await post('openai', { user: undefined });
  assert.equal(response.status, 400);
});

/* ---------- 取消、保活与资源清理（issue #12） ---------- */

function controlledSse(initialChunks: readonly string[] = []): {
  response: Response;
  send: (chunk: string) => void;
  cancelCount: () => number;
} {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let canceled = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      for (const chunk of initialChunks) controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      canceled += 1;
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    send(chunk) {
      assert.ok(streamController);
      streamController.enqueue(encoder.encode(chunk));
    },
    cancelCount: () => canceled,
  };
}

test('an already-cancelled HTTP request never calls any upstream protocol', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('不应触达上游');
  };

  for (const type of ['openai', 'anthropic', 'codex'] as const) {
    const controller = new AbortController();
    controller.abort(new DOMException('stopped before start', 'AbortError'));
    const response = await postChat(type, {}, controller.signal);
    assert.equal(await response.text(), '');
  }

  assert.equal(fetchCalls, 0);
});

test('HTTP cancellation while waiting for headers aborts once without retrying', async () => {
  const upstreamSignals: AbortSignal[] = [];
  globalThis.fetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error('上游 fetch 缺少 signal');
      upstreamSignals.push(signal);
      const rejectAbort = () => reject(signal.reason);
      if (signal.aborted) rejectAbort();
      else signal.addEventListener('abort', rejectAbort, { once: true });
    });

  const controller = new AbortController();
  const response = await postChat('openai', {}, controller.signal);
  controller.abort(new DOMException('learner stopped', 'AbortError'));

  assert.equal(await response.text(), '');
  assert.equal(upstreamSignals.length, 1);
  assert.equal(upstreamSignals[0]?.aborted, true);
});

test('downstream stream cancellation aborts fetch and releases each protocol response body', async () => {
  const deltas = {
    openai: 'data: {"choices":[{"delta":{"content":"片段"}}]}\n\n',
    anthropic:
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"片段"}}\n\n',
    codex: 'data: {"type":"response.output_text.delta","delta":"片段"}\n\n',
  } as const;

  for (const type of ['openai', 'anthropic', 'codex'] as const) {
    const upstream = controlledSse([deltas[type]]);
    const upstreamSignals: AbortSignal[] = [];
    let fetchCalls = 0;
    globalThis.fetch = async (_url, init) => {
      fetchCalls += 1;
      if (init?.signal) upstreamSignals.push(init.signal);
      return upstream.response;
    };

    const response = await postChat(type);
    assert.ok(response.body);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /"text":"片段"/);
    await reader.cancel('browser disconnected');
    await Promise.resolve();

    assert.equal(fetchCalls, 1);
    assert.equal(upstreamSignals.at(-1)?.aborted, true);
    assert.equal(upstream.cancelCount(), 1);
    assert.equal(upstream.response.body?.locked, false);
  }
});

test('reasoning-only streams keep the downstream alive, then clean timers and listeners', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const upstream = controlledSse([
    'data: {"choices":[{"delta":{"reasoning_content":"still thinking"}}]}\n\n',
  ]);
  const upstreamSignals: AbortSignal[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.signal) upstreamSignals.push(init.signal);
    return upstream.response;
  };
  const requestController = new AbortController();
  const response = await postChat('openai', {}, requestController.signal);
  assert.ok(response.body);
  const reader = response.body.getReader();

  t.mock.timers.tick(15_000);
  const keepalive = await reader.read();
  assert.equal(new TextDecoder().decode(keepalive.value), ': keepalive\n\n');

  upstream.send('data: {"choices":[{"delta":{"content":"答"}}]}\n\n');
  upstream.send('data: [DONE]\n\n');
  const rest: string[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    rest.push(new TextDecoder().decode(chunk.value));
  }
  assert.match(rest.join(''), /data: \{"text":"答"\}/);
  assert.match(rest.join(''), /data: \[DONE\]/);
  assert.equal(upstream.cancelCount(), 1);

  // headers 和响应体都已完成：旧 request 的 signal 监听与 headers timeout 已移除。
  requestController.abort(new DOMException('late abort', 'AbortError'));
  t.mock.timers.tick(180_000);
  assert.equal(upstreamSignals.at(-1)?.aborted, false);
});

test('the 180-second timeout only covers waiting for upstream headers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const upstreamSignals: AbortSignal[] = [];
  let fetchCalls = 0;
  globalThis.fetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      fetchCalls += 1;
      const signal = init?.signal;
      if (!signal) throw new Error('上游 fetch 缺少 signal');
      upstreamSignals.push(signal);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

  const response = await postChat('openai');
  t.mock.timers.tick(180_000);
  const events = await readSse(response);

  assert.equal(fetchCalls, 1);
  assert.equal(upstreamSignals.at(-1)?.aborted, true);
  assert.ok(events.some((event) => event.includes('端点请求超过 180 秒，已取消')));
  assert.ok(!events.includes('data: [DONE]'));
});
