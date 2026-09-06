import { expect, test, type Page } from '@playwright/test';
import { request as httpRequest, type ClientRequest } from 'node:http';
import {
  ControlledUpstream,
  type ControlledProtocol,
  type ControlledRequest,
} from './controlledUpstream';

const APP_URL = 'http://127.0.0.1:8791';
const API_KEY = '<REDACTED>';
const protocols: readonly ControlledProtocol[] = ['anthropic', 'openai', 'codex'];

let upstream: ControlledUpstream;

function endpointBaseUrl(protocol: ControlledProtocol): string {
  return protocol === 'codex' ? upstream.baseUrl : `${upstream.baseUrl}/v1`;
}

function proxyBody(protocol: ControlledProtocol, model: string) {
  return {
    type: protocol,
    baseUrl: endpointBaseUrl(protocol),
    model,
    apiKey: API_KEY,
    reasoning: 'provider-default',
    system: 'Controlled production acceptance',
    user: 'Return controlled text',
    stream: true,
  };
}

async function callProxy(protocol: ControlledProtocol, model: string) {
  const startedAt = Date.now();
  const response = await fetch(`${APP_URL}/api/llm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(proxyBody(protocol, model)),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    text: await response.text(),
    elapsedMs: Date.now() - startedAt,
  };
}

async function callLegacyProxy(protocol: ControlledProtocol) {
  const response = await fetch(`${APP_URL}/api/llm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...proxyBody(protocol, 'acceptance-legacy'), stream: false }),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: (await response.json()) as { text?: string; error?: string },
  };
}

function startAndAbortProxyRequest(protocol: ControlledProtocol, model: string): ClientRequest {
  const request = httpRequest(`${APP_URL}/api/llm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  request.on('response', (response) => response.resume());
  request.on('error', () => {});
  request.end(JSON.stringify(proxyBody(protocol, model)));
  return request;
}

async function waitForIsland(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island');
    return island !== null && !island.hasAttribute('ssr');
  });
}

async function openSettingsWithKeyboard(page: Page) {
  const button = page.getByRole('button', { name: 'AI 设置', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function configure(
  page: Page,
  protocol: ControlledProtocol,
  model: string,
  reasoning: string,
): Promise<void> {
  const dialog = await openSettingsWithKeyboard(page);
  await dialog.getByLabel('端点类型').selectOption(protocol);
  await dialog.getByLabel('端点地址').fill(endpointBaseUrl(protocol));
  await dialog.getByLabel('模型', { exact: true }).fill(model);
  await dialog.getByLabel('模型', { exact: true }).press('Tab');
  await dialog.getByLabel('API Key').fill(API_KEY);
  await dialog.getByLabel('思考等级').selectOption(reasoning);
  const save = dialog.getByRole('button', { name: '保存', exact: true });
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.locator('[data-llm-status]')).toContainText('已保存');
  const close = dialog.getByRole('button', { name: '关闭', exact: true });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}

function latestRequest(protocol: ControlledProtocol, model: string): ControlledRequest {
  const request = upstream.requests.findLast(
    (candidate) => candidate.protocol === protocol && candidate.model === model,
  );
  expect(request).toBeDefined();
  return request as ControlledRequest;
}

function expectOneErrorAndNoDone(result: Awaited<ReturnType<typeof callProxy>>): void {
  expect(result.status).toBe(200);
  expect(result.contentType).toContain('text/event-stream');
  expect(result.text.match(/"error"/g)).toHaveLength(1);
  expect(result.text).not.toContain('[DONE]');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

test.beforeAll(async () => {
  upstream = new ControlledUpstream();
  await upstream.start();
});

test.afterAll(async () => {
  await upstream.stop();
});

test('Wrangler build completes the saved cross-protocol generation and QA workflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/day/1');
  await waitForIsland(page);

  await configure(page, 'anthropic', 'claude-opus-5', 'xhigh');
  const generate = page.getByRole('button', { name: '生成补充练习' });
  await generate.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('anthropic 生产验收题')).toBeVisible();

  const anthropicGeneration = latestRequest('anthropic', 'claude-opus-5');
  expect(anthropicGeneration.path).toBe('/v1/messages');
  expect(anthropicGeneration.body.thinking).toEqual({ type: 'adaptive' });
  expect(anthropicGeneration.body.output_config).toEqual({ effort: 'xhigh' });
  expect(anthropicGeneration.body.max_tokens).toBe(16_000);
  expect(anthropicGeneration.headers['x-api-key']).toBe(API_KEY);

  const qaButton = page.getByRole('button', { name: '打开答疑面板' });
  await qaButton.focus();
  await page.keyboard.press('Enter');
  const input = page.getByPlaceholder('问今天的课程……（Enter 发送）');
  await input.fill('进行中的请求不应被设置变化重启');
  await page.keyboard.press('Enter');
  await expect.poll(() => upstream.count('anthropic', 'claude-opus-5')).toBe(2);

  const dialog = await openSettingsWithKeyboard(page);
  await dialog.getByLabel('端点类型').selectOption('openai');
  await dialog.getByLabel('端点地址').fill(endpointBaseUrl('openai'));
  await dialog.getByLabel('模型', { exact: true }).fill('gpt-5');
  await dialog.getByLabel('模型', { exact: true }).press('Tab');
  await expect(dialog.locator('[data-llm-status]')).toContainText('已回到模型默认');
  await expect(dialog.getByLabel('思考等级')).toHaveValue('provider-default');
  await dialog.getByLabel('思考等级').selectOption('high');
  await dialog.getByLabel('API Key').fill(API_KEY);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();

  await expect(page.getByText('anthropic 受控答疑完成')).toBeVisible();
  expect(upstream.count('anthropic', 'claude-opus-5')).toBe(2);
  expect(upstream.count('openai', 'gpt-5')).toBe(0);

  await input.fill('切换后下一轮使用新等级');
  await page.keyboard.press('Enter');
  await expect(page.getByText('openai 受控答疑完成')).toBeVisible();
  const openAiQa = latestRequest('openai', 'gpt-5');
  expect(openAiQa.path).toBe('/v1/chat/completions');
  expect(openAiQa.body.reasoning_effort).toBe('high');
  expect(openAiQa.body.max_tokens).toBeUndefined();
  expect(openAiQa.body.max_completion_tokens).toBe(8_000);
  expect(openAiQa.body.response_format).toBeUndefined();
  expect(openAiQa.headers.authorization).toBe(`Bearer ${API_KEY}`);

  await page.reload();
  await waitForIsland(page);
  const restored = await openSettingsWithKeyboard(page);
  await expect(restored.getByLabel('端点类型')).toHaveValue('openai');
  await expect(restored.getByLabel('端点地址')).toHaveValue(endpointBaseUrl('openai'));
  await expect(restored.getByLabel('模型', { exact: true })).toHaveValue('gpt-5');
  await expect(restored.getByLabel('思考等级')).toHaveValue('high');
  await restored.getByRole('button', { name: '关闭', exact: true }).click();

  await configure(page, 'openai', 'gpt-5', 'high');
  await page.getByRole('button', { name: '生成补充练习' }).click();
  await expect(page.getByText('openai 生产验收题')).toBeVisible();
  const openAiGeneration = latestRequest('openai', 'gpt-5');
  expect(openAiGeneration.body.response_format).toEqual({ type: 'json_object' });

  await configure(page, 'codex', 'acceptance-codex', 'high');
  await page.getByRole('button', { name: '生成补充练习' }).click();
  await expect(page.getByText('codex 生产验收题')).toBeVisible();
  const codexGeneration = latestRequest('codex', 'acceptance-codex');
  expect(codexGeneration.path).toBe('/v1/responses');
  expect(codexGeneration.body.reasoning).toEqual({ effort: 'high' });
  expect(codexGeneration.body.store).toBe(false);
  expect(codexGeneration.body.stream).toBe(true);
  expect(codexGeneration.body.temperature).toBeUndefined();
  expect(codexGeneration.body.max_output_tokens).toBeUndefined();
  expect(asRecord(codexGeneration.body.reasoning).summary).toBeUndefined();
  expect(codexGeneration.body.telemetry).toBeUndefined();

  await configure(page, 'codex', 'acceptance-cancel-browser', 'high');
  await page.getByRole('button', { name: '打开答疑面板' }).click();
  const codexInput = page.getByPlaceholder('问今天的课程……（Enter 发送）');
  await codexInput.fill('停止这一轮');
  await page.keyboard.press('Enter');
  await expect.poll(() => upstream.count('codex', 'acceptance-cancel-browser')).toBe(1);
  const stop = page.getByRole('button', { name: '停止' });
  await stop.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible();

  await codexInput.fill('取消后下一轮');
  await page.keyboard.press('Enter');
  await expect(page.getByText('codex 受控答疑完成')).toBeVisible();
  expect(upstream.count('codex', 'acceptance-cancel-browser')).toBe(2);
  await page.waitForTimeout(2_100);
  await expect(page.getByText('stale canceled text')).toHaveCount(0);

  await page.getByRole('button', { name: '收起答疑面板' }).click();
  const clearDialog = await openSettingsWithKeyboard(page);
  const clear = clearDialog.getByRole('button', { name: /清空/ });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect(clearDialog.locator('[data-llm-status]')).toContainText('已清空');
  await expect(clearDialog.getByLabel('思考等级')).toHaveValue('provider-default');
  expect(await page.evaluate(() => localStorage.getItem('sql8w.llm.v1'))).toBeNull();
});

test('production proxy covers compatibility, failures, keepalive, and all cancellations', async () => {
  for (const protocol of protocols) {
    const beforeJson = upstream.count(protocol, 'acceptance-json');
    const json = await callProxy(protocol, 'acceptance-json');
    expect(json.text).toContain(`${protocol} JSON fallback`);
    expect(json.text).toContain('[DONE]');
    expect(upstream.count(protocol, 'acceptance-json') - beforeJson).toBe(1);

    const beforeLegacy = upstream.count(protocol, 'acceptance-legacy');
    const legacy = await callLegacyProxy(protocol);
    expect(legacy.status).toBe(200);
    expect(legacy.contentType).toContain('application/json');
    expect(legacy.body.error).toBeUndefined();
    expect(legacy.body.text).toContain(protocol);
    expect(upstream.count(protocol, 'acceptance-legacy') - beforeLegacy).toBe(1);

    for (const scenario of [
      'acceptance-http200-error',
      'acceptance-truncated',
      'acceptance-empty',
      'acceptance-reasoning-only',
      'acceptance-missing-terminator',
      'acceptance-disconnect',
    ]) {
      const before = upstream.count(protocol, scenario);
      expectOneErrorAndNoDone(await callProxy(protocol, scenario));
      expect(upstream.count(protocol, scenario) - before).toBe(1);
    }

    const beforeHeadersModel = `acceptance-cancel-before-headers-${protocol}`;
    const beforeHeadersClient = startAndAbortProxyRequest(protocol, beforeHeadersModel);
    await expect.poll(() => upstream.count(protocol, beforeHeadersModel)).toBe(1);
    beforeHeadersClient.destroy();
    await expect
      .poll(() => upstream.closeCount(beforeHeadersModel), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const cancelModel = `acceptance-cancel-stream-${protocol}`;
    const client = startAndAbortProxyRequest(protocol, cancelModel);
    await expect.poll(() => upstream.count(protocol, cancelModel)).toBe(1);
    client.destroy();
    await expect
      .poll(() => upstream.closeCount(cancelModel), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const health = await callProxy(protocol, `acceptance-health-${protocol}`);
    expect(health.text).toContain(protocol);
    expect(health.text).toContain('[DONE]');
  }

  const completedOnly = await callProxy('codex', 'acceptance-completed-only');
  expect(completedOnly.text.match(/codex completed-only fallback/g)).toHaveLength(1);
  expect(completedOnly.text).toContain('[DONE]');

  const keepalive = await callProxy('openai', 'acceptance-keepalive');
  expect(keepalive.elapsedMs).toBeGreaterThanOrEqual(15_000);
  expect(keepalive.text).toContain(': keepalive');
  expect(keepalive.text).toContain('keepalive complete');
  expect(keepalive.text).not.toContain('not exposed');
  expect(keepalive.text).toContain('[DONE]');

  for (const protocol of protocols) {
    const defaultRequest = latestRequest(protocol, 'acceptance-json');
    expect(defaultRequest.body.reasoning_effort).toBeUndefined();
    expect(defaultRequest.body.reasoning).toBeUndefined();
    expect(defaultRequest.body.thinking).toBeUndefined();
    expect(defaultRequest.body.telemetry).toBeUndefined();
  }
});

test('production headers timeout remains scoped to 180 seconds and releases upstream', async () => {
  const result = await callProxy('openai', 'acceptance-headers-timeout');
  expectOneErrorAndNoDone(result);
  expect(result.elapsedMs).toBeGreaterThanOrEqual(175_000);
  expect(result.elapsedMs).toBeLessThan(195_000);
  expect(result.text).toContain('超过 180 秒');
  expect(result.text).toContain(': keepalive');
  await expect
    .poll(() => upstream.closeCount('acceptance-headers-timeout'), { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test('mobile and keyboard flow keeps the modal, panel, status, and errors in bounds', async ({
  page,
}) => {
  await page.addInitScript(
    ({ baseUrl, apiKey }) => {
      localStorage.setItem(
        'sql8w.llm.v1',
        JSON.stringify({
          type: 'openai',
          baseUrl,
          model: 'acceptance-openai',
          apiKey,
        }),
      );
    },
    { baseUrl: endpointBaseUrl('openai'), apiKey: API_KEY },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/day/1');
  await waitForIsland(page);

  const settingsButton = page.getByRole('button', { name: 'AI 设置', exact: true });
  for (let index = 0; index < 100; index += 1) {
    if (await settingsButton.evaluate((button) => button === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(settingsButton).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'AI 设置' });
  await expect(dialog.getByLabel('端点类型')).toBeFocused();
  await expect(dialog.getByLabel('思考等级')).toHaveValue('provider-default');
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(390);
  expect(dialogBounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(844);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('端点类型')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();

  const qaButton = page.getByRole('button', { name: '打开答疑面板' });
  await qaButton.focus();
  await page.keyboard.press('Enter');
  const input = page.getByPlaceholder('问今天的课程……（Enter 发送）');
  await expect(input).toBeFocused();
  await page.keyboard.type('keyboard acceptance');
  await page.keyboard.press('Enter');
  await expect(page.getByText('openai 受控答疑完成')).toBeVisible();

  await page.evaluate(() => {
    const raw = localStorage.getItem('sql8w.llm.v1');
    const config = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      'sql8w.llm.v1',
      JSON.stringify({ ...config, model: 'acceptance-ui-error' }),
    );
  });
  await input.fill('show a controlled long error');
  await page.keyboard.press('Enter');
  const error = page.locator('.qa-error');
  await expect(error).toBeVisible();

  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null;
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      panel: rect('.qa-panel'),
      error: rect('.qa-error'),
    };
  });
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewport.width);
  for (const box of [bounds.panel, bounds.error]) {
    expect(box).not.toBeNull();
    expect(box?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(box?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(bounds.viewport.width);
    expect(box?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(box?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(bounds.viewport.height);
  }
});
