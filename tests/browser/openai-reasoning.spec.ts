import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

interface UpstreamRequest {
  model: string;
  reasoning_effort?: string;
  max_tokens?: number;
  max_completion_tokens?: number;
  response_format?: unknown;
  messages?: unknown[];
  stream?: boolean;
}

let upstream: Server;
let upstreamBaseUrl = '';
const requestBodies: UpstreamRequest[] = [];

function upstreamSse(text: string): string {
  return (
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
    'data: [DONE]\n\n'
  );
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  return page.getByRole('dialog', { name: 'AI 设置' });
}

test.beforeAll(async () => {
  upstream = createServer(async (request, response) => {
    let rawBody = '';
    for await (const chunk of request) rawBody += String(chunk);
    const body = JSON.parse(rawBody) as UpstreamRequest;
    requestBodies.push(body);

    const qaCount = requestBodies.filter((item) => item.response_format === undefined).length;
    const text =
      body.response_format === undefined
        ? `第${qaCount}轮回答`
        : JSON.stringify({
            exercises: [
              {
                task: '浏览器贯通题',
                hint: '先筛选',
                referenceSql: 'SELECT * FROM orders;',
                checkpoint: '能返回订单',
              },
            ],
          });

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    response.end(upstreamSse(text));
  });

  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  upstreamBaseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1/chat/completions`;
});

test.afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

test.beforeEach(() => {
  requestBodies.length = 0;
});

test('saved OpenAI effort reaches SDK generation, QA, and the next QA turn', async ({ page }) => {
  await page.goto('/day/1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island');
    return island !== null && !island.hasAttribute('ssr');
  });

  const dialog = await openSettings(page);
  await dialog.getByLabel('端点类型').selectOption('openai');
  await dialog.getByLabel('端点地址').fill(upstreamBaseUrl);
  await dialog.getByLabel('模型', { exact: true }).fill('gpt-5');
  await dialog.getByLabel('模型', { exact: true }).press('Tab');
  await dialog.getByLabel('API Key').fill('<REDACTED>');
  await expect(dialog.getByLabel('思考等级').locator('option')).toHaveText([
    '模型默认（不发送推理参数）',
    '最少',
    '低',
    '中',
    '高',
  ]);
  await dialog.getByLabel('思考等级').selectOption('minimal');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText(/已保存.*思考：最少/)).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '生成补充练习' }).click();
  await expect(page.getByText('浏览器贯通题')).toBeVisible();

  await page.getByRole('button', { name: '打开答疑面板' }).click();
  const input = page.getByPlaceholder('问今天的课程……（Enter 发送）');
  await input.fill('第一问');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('第1轮回答')).toBeVisible();

  await page.getByRole('button', { name: '收起答疑面板' }).click();
  const changedDialog = await openSettings(page);
  await changedDialog.getByLabel('模型', { exact: true }).fill('private-compatible-model');
  await changedDialog.getByLabel('模型', { exact: true }).press('Tab');
  await expect(changedDialog.getByText(/原思考等级.*已回到模型默认/)).toBeVisible();
  await expect(changedDialog.getByLabel('思考等级').locator('option')).toHaveText([
    '模型默认（不发送推理参数）',
    '低',
    '中',
    '高',
  ]);
  await changedDialog.getByLabel('思考等级').selectOption('high');
  await changedDialog.getByRole('button', { name: '保存', exact: true }).click();
  await changedDialog.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '打开答疑面板' }).click();
  await input.fill('第二问');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('第2轮回答')).toBeVisible();

  expect(requestBodies).toHaveLength(3);
  expect(requestBodies.map((body) => body.reasoning_effort)).toEqual([
    'minimal',
    'minimal',
    'high',
  ]);
  expect(requestBodies.map((body) => body.model)).toEqual([
    'gpt-5',
    'gpt-5',
    'private-compatible-model',
  ]);
  expect(requestBodies[0]?.response_format).toEqual({ type: 'json_object' });
  expect(requestBodies[1]?.response_format).toBeUndefined();
  expect(requestBodies[2]?.response_format).toBeUndefined();
  expect(requestBodies[0]?.max_completion_tokens).toBe(8_000);
  expect(requestBodies[1]?.max_completion_tokens).toBe(8_000);
  expect(requestBodies[2]?.max_tokens).toBe(8_000);
  expect(requestBodies.every((body) => body.stream === true)).toBe(true);
});
