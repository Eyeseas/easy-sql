import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { ChatModelRunOptions, ThreadMessage } from '@assistant-ui/react';
import {
  clearConfig,
  generateExercises,
  loadConfig,
  saveConfig,
  type GenContextDay,
  type LlmConfig,
} from '../src/scripts/llm.ts';
import { qaChatAdapter } from '../src/qa/chat.ts';

const STORAGE_KEY = 'sql8w.llm.v1';
const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

function codexConfig(reasoning: LlmConfig['reasoning']): LlmConfig {
  return {
    type: 'codex',
    baseUrl: 'https://llm.invalid/v1',
    model: 'gpt-5-codex',
    apiKey: '<REDACTED>',
    reasoning,
  };
}

function proxySse(text: string): Response {
  return new Response(`data: ${JSON.stringify({ text })}\n\ndata: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

const day: GenContextDay = {
  no: 1,
  title: '第一天',
  learn: ['SELECT 基础'],
  drill: ['查询订单'],
  pass: '能写出查询',
  weekNo: 1,
  weekTitle: '入职',
};

test('saved, legacy, invalid, and cleared browser settings normalize reasoning', () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      type: 'codex',
      baseUrl: 'https://legacy.invalid/v1',
      model: 'gpt-5-codex',
      apiKey: 'legacy-key',
    }),
  );
  assert.deepEqual(loadConfig(), {
    ...codexConfig('provider-default'),
    baseUrl: 'https://legacy.invalid/v1',
    apiKey: 'legacy-key',
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...codexConfig('high'), reasoning: 'turbo' }));
  assert.equal(loadConfig().reasoning, 'provider-default');

  saveConfig(codexConfig('high'));
  assert.equal(loadConfig().reasoning, 'high');
  assert.equal(
    (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { reasoning?: string }).reasoning,
    'high',
  );

  clearConfig();
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  assert.equal(loadConfig().reasoning, 'provider-default');
});

test('generation sends the reasoning saved in shared browser settings', async () => {
  saveConfig(codexConfig('high'));
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/llm');
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return proxySse(
      JSON.stringify({
        exercises: [
          {
            task: '查订单',
            hint: '用 SELECT',
            referenceSql: 'SELECT * FROM orders;',
            checkpoint: '能返回订单',
          },
        ],
      }),
    );
  };

  const exercises = await generateExercises(day, 1);

  assert.equal(requestBody.reasoning, 'high');
  assert.equal(exercises[0]?.referenceSql, 'SELECT * FROM orders;');
});

function chatOptions(text: string): ChatModelRunOptions {
  const message: ThreadMessage = {
    id: `message-${text}`,
    role: 'user',
    createdAt: new Date(),
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  };
  return {
    messages: [message],
    runConfig: {},
    abortSignal: new AbortController().signal,
    context: {},
    unstable_getMessage: () => message,
  };
}

async function consumeQaRun(
  adapter: ReturnType<typeof qaChatAdapter>,
  options: ChatModelRunOptions,
): Promise<void> {
  const result = adapter.run(options);
  if (result instanceof Promise) {
    await result;
    return;
  }
  for await (const _update of result) {
    // Consume the adapter exactly as assistant-ui does.
  }
}

test('the same QA adapter reads a newly saved reasoning level on the next turn', async () => {
  const requestBodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return proxySse('回答');
  };

  const adapter = qaChatAdapter(day);
  saveConfig(codexConfig('low'));
  await consumeQaRun(adapter, chatOptions('第一问'));

  saveConfig(codexConfig('high'));
  await consumeQaRun(adapter, chatOptions('第二问'));

  assert.deepEqual(
    requestBodies.map((body) => body.reasoning),
    ['low', 'high'],
  );
  assert.equal(requestBodies.length, 2);
});
