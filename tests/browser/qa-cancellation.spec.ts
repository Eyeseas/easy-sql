import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let upstream: Server;
let upstreamBaseUrl = '';
let firstStarted: Promise<void>;
let firstClosed: Promise<void>;
let markFirstStarted: () => void;
let markFirstClosed: () => void;
const requestBodies: unknown[] = [];

test.beforeAll(async () => {
  firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });
  firstClosed = new Promise((resolve) => {
    markFirstClosed = resolve;
  });

  upstream = createServer(async (request, response) => {
    let rawBody = '';
    for await (const chunk of request) rawBody += String(chunk);
    requestBodies.push(JSON.parse(rawBody) as unknown);

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    if (requestBodies.length === 1) {
      response.write('data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n');
      response.on('close', markFirstClosed);
      markFirstStarted();

      // A canceled first run must not deliver this late text into either assistant message.
      setTimeout(() => {
        if (!response.destroyed) {
          response.write('data: {"choices":[{"delta":{"content":"旧请求迟到内容"}}]}\n\n');
        }
      }, 2_000);
      return;
    }

    response.end(
      'data: {"choices":[{"delta":{"content":"第二轮回答"}}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n',
    );
  });

  await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const address = upstream.address() as AddressInfo;
  upstreamBaseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

test('stopping an answer cancels upstream and a fresh question completes', async ({ page }) => {
  await page.addInitScript((baseUrl) => {
    localStorage.setItem(
      'sql8w.llm.v1',
      JSON.stringify({
        type: 'openai',
        baseUrl,
        model: 'controlled-browser-test',
        apiKey: '<REDACTED>',
      }),
    );
  }, upstreamBaseUrl);

  await page.goto('/day/1');
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island');
    return island !== null && !island.hasAttribute('ssr');
  });
  await page.getByRole('button', { name: '打开答疑面板' }).click();

  const input = page.getByPlaceholder('问今天的课程……（Enter 发送）');
  await input.fill('第一问，等待时停止');
  await page.getByRole('button', { name: '发送' }).click();
  await firstStarted;

  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible();
  await firstClosed;

  await input.fill('第二问，可以继续吗');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('第二轮回答')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible();

  await page.waitForTimeout(2_100);
  await expect(page.getByText('旧请求迟到内容')).toHaveCount(0);
  expect(requestBodies).toHaveLength(2);
});
