import { expect, test } from '@playwright/test';

/**
 * 今日复盘的判定要真的落到浏览器里：标「忘了」之后刷新还在，而且第二天会作为
 * 到期的错题再来一次。纯逻辑（阶梯、毕业、上限）在 reviewCore 的 node:test 里
 * 打，这里只打一遍真实的持久化链路。
 */

const ITEM = 'li[data-review-item]';

test('标「忘了」写进浏览器，刷新后还在，下一个学习日作为错题再来', async ({ page }) => {
  await page.goto('/day/11');

  const first = page.locator(ITEM).first();
  const itemId = await first.getAttribute('data-review-item');
  expect(itemId).toBeTruthy();

  await expect(first).not.toHaveClass(/is-judged/);
  await first.getByRole('button', { name: '忘了' }).click();
  await expect(first).toHaveClass(/is-judged/);
  await expect(first.locator('.rv-said')).toHaveText('已标忘了');

  // 刷新：判定仍在（dev 下的 HMR 连接会拖住 load 事件，等到 DOM 就绪即可）
  await page.reload({ waitUntil: 'domcontentloaded' });
  const same = page.locator(`li[data-review-item="${itemId}"]`);
  await expect(same).toHaveClass(/is-judged/);
  await expect(same.locator('.rv-said')).toHaveText('已标忘了');

  // 下一个学习日：同一条以「错题」身份再来一次，且尚未判定
  await page.goto('/day/12');
  const due = page.locator(`li[data-review-item="${itemId}"]`);
  await expect(due).toHaveCount(1);
  await expect(due.locator('.rv-origin')).toHaveText('错题');
  await expect(due).not.toHaveClass(/is-judged/);
});

test('标「记得」写进浏览器，且不会作为错题再来', async ({ page }) => {
  await page.goto('/day/11');

  const first = page.locator(ITEM).first();
  const itemId = await first.getAttribute('data-review-item');
  await first.getByRole('button', { name: '记得' }).click();
  await expect(first.locator('.rv-said')).toHaveText('已标记得');

  await page.goto('/day/12');
  // D12 的固定格取的是别的天，这一条不该以错题身份冒出来
  await expect(page.locator(`li[data-review-item="${itemId}"]`)).toHaveCount(0);
});
