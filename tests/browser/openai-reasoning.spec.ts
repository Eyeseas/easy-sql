import { expect, test, type Page } from '@playwright/test';

interface ProxyRequest {
  type: string;
  model: string;
  reasoning: string;
  messages?: unknown[];
}

const requestBodies: ProxyRequest[] = [];

function proxySse(text: string): string {
  return `data: ${JSON.stringify({ text })}\n\ndata: [DONE]\n\n`;
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  return page.getByRole('dialog', { name: 'AI 设置' });
}

test.beforeEach(async ({ page }) => {
  requestBodies.length = 0;
  await page.route('**/api/llm', async (route) => {
    const body = route.request().postDataJSON() as ProxyRequest;
    requestBodies.push(body);

    const text = body.messages
      ? `第${requestBodies.filter((request) => request.messages).length}轮回答`
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

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: proxySse(text),
    });
  });
});

test('saved OpenAI effort reaches generation, QA, and the next QA turn', async ({ page }) => {
  await page.goto('/day/1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island');
    return island !== null && !island.hasAttribute('ssr');
  });

  const dialog = await openSettings(page);
  await dialog.getByLabel('端点类型').selectOption('openai');
  await dialog.getByLabel('端点地址').fill('https://llm.invalid/v1');
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
  expect(requestBodies.map((body) => body.reasoning)).toEqual(['minimal', 'minimal', 'high']);
  expect(requestBodies.map((body) => body.model)).toEqual([
    'gpt-5',
    'gpt-5',
    'private-compatible-model',
  ]);
  expect(requestBodies[0]?.messages).toBeUndefined();
  expect(requestBodies[1]?.messages).toBeDefined();
  expect(requestBodies[2]?.messages).toBeDefined();
});
