import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let upstream: Server;
let upstreamBaseUrl = '';
const requestBodies: Record<string, unknown>[] = [];

function anthropicEvent(event: Record<string, unknown>): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

test.setTimeout(60_000);

test.beforeAll(async () => {
  upstream = createServer(async (request, response) => {
    let rawBody = '';
    for await (const chunk of request) rawBody += String(chunk);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    requestBodies.push(body);

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const text =
      requestBodies.length === 1
        ? JSON.stringify({
            exercises: [
              {
                task: '浏览器贯通题',
                hint: '查看请求配置',
                referenceSql: 'SELECT 1;',
                checkpoint: '返回一行',
              },
            ],
          })
        : `Claude 答疑 ${messages.filter((message) => (message as { role?: string }).role === 'user').length}`;

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    response.end(
      [
        {
          type: 'message_start',
          message: {
            id: `msg_browser_${requestBodies.length}`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: typeof body.model === 'string' ? body.model : 'test-model',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 1 },
        },
        { type: 'message_stop' },
      ]
        .map(anthropicEvent)
        .join(''),
    );
  });

  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  upstreamBaseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

test.beforeEach(() => {
  requestBodies.length = 0;
});

test('Claude setting reaches generation and successive QA turns in the native mode', async ({
  page,
}) => {
  await page.goto('/day/1');
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island');
    return island !== null && !island.hasAttribute('ssr');
  });

  await page.getByRole('button', { name: 'AI 设置' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  const type = dialog.locator('[data-llm-field="type"]');
  const baseUrl = dialog.locator('[data-llm-field="baseUrl"]');
  const model = dialog.locator('[data-llm-field="model"]');
  const reasoning = dialog.locator('[data-llm-field="reasoning"]');
  const apiKey = dialog.locator('[data-llm-field="apiKey"]');

  await type.selectOption('anthropic');
  await baseUrl.fill(upstreamBaseUrl);
  await model.fill('claude-opus-5');
  await model.press('Tab');
  await expect(reasoning.locator('option')).toHaveText([
    '模型默认（不发送推理参数）',
    '不推理',
    '低',
    '中',
    '高',
    '超高',
  ]);
  await expect(dialog.locator('[data-llm-reasoning-note]')).toContainText('已验证自适应思考');
  await reasoning.selectOption('high');
  await apiKey.fill('browser-secret');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(dialog.locator('[data-llm-status]')).toContainText('思考：高');
  await dialog.getByRole('button', { name: '关闭' }).click();

  await page.getByRole('button', { name: '生成补充练习' }).click();
  await expect(page.getByText('浏览器贯通题')).toBeVisible();

  await page.getByRole('button', { name: '打开答疑面板' }).click();
  const input = page.getByPlaceholder('问今天的课程……（Enter 发送）');
  await input.fill('第一问');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('Claude 答疑 1')).toBeVisible();
  await expect.poll(() => requestBodies.length).toBe(2);

  for (const body of requestBodies) {
    expect(body.max_tokens).toBe(16_000);
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'high' });
  }

  await page.getByRole('button', { name: '收起答疑面板' }).click();
  await page.getByRole('button', { name: 'AI 设置' }).click();
  await reasoning.selectOption('xhigh');
  await model.fill('claude-haiku-4-5');
  await model.press('Tab');
  await expect(dialog.locator('[data-llm-status]')).toContainText('已回到模型默认');
  await expect(reasoning).toHaveValue('provider-default');
  await expect(reasoning.locator('option')).toHaveText([
    '模型默认（不发送推理参数）',
    '不推理',
    '低',
    '中',
    '高',
  ]);
  await expect(dialog.locator('[data-llm-reasoning-note]')).toContainText('固定预算');
  await reasoning.selectOption('medium');
  await dialog.getByRole('button', { name: '保存' }).click();
  await dialog.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '打开答疑面板' }).click();

  await input.fill('第二问');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('Claude 答疑 2')).toBeVisible();
  await expect.poll(() => requestBodies.length).toBe(3);
  expect(requestBodies[2]?.max_tokens).toBe(16_000);
  expect(requestBodies[2]?.thinking).toEqual({ type: 'enabled', budget_tokens: 4_096 });
  expect(requestBodies[2]?.output_config).toBeUndefined();

  await page.getByRole('button', { name: '收起答疑面板' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'AI 设置' }).click();
  await expect(reasoning).toBeVisible();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(390);
  expect(dialogBounds?.height ?? 1).toBeLessThanOrEqual(844);
});
