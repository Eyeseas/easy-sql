import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { POST } from '../src/pages/api/llm.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(type: 'openai' | 'anthropic' = 'openai'): Request {
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
    }),
  });
}

async function post(type?: 'openai' | 'anthropic'): Promise<Response> {
  const response = await POST({ request: request(type) } as Parameters<typeof POST>[0]);
  assert.ok(response instanceof Response);
  return response;
}

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
