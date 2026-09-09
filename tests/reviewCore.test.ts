import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewPlanFor } from '../src/scripts/reviewCore.ts';
import type { Day } from '../src/types/curriculum.ts';

/** 造一个最小可用的学习日；只填复盘取材会碰到的字段 */
function day(no: number, over: Partial<Day> = {}): Day {
  return {
    no,
    title: `第 ${no} 天`,
    split: [40, 65, 15],
    learn: [`D${no} 知识点一`, `D${no} 知识点二`],
    drill: [`D${no} 练习一`, `D${no} 练习二`],
    drillAnswers: [{ sql: `select ${no};`, note: `D${no} 要点` }, undefined],
    pass: `D${no} 过关`,
    ...over,
  };
}

/** 常规课程：D01–D12 都是完整的天 */
const days: readonly Day[] = Array.from({ length: 12 }, (_, i) => day(i + 1));

test('常规天取到 D+1 一格，来源是上一个学习日', () => {
  const plan = reviewPlanFor(11, days);
  assert.equal(plan.length, 1);

  const [item] = plan;
  assert.ok(item);
  assert.equal(item.gap, 1);
  assert.equal(item.action, 'recite');
  assert.equal(item.fromDay, 10);
  assert.equal(item.fromTitle, '第 10 天');
});

test('D+1 格取来源学习日「练」栏第 1 题与它的参考答案', () => {
  const [item] = reviewPlanFor(11, days);
  assert.ok(item);
  assert.equal(item.prompt, 'D10 练习一');
  assert.deepEqual(item.answer, { sql: 'select 10;', note: 'D10 要点' });
});

test('复盘项 id 由来源学习日 + 素材类型 + 下标拼成，跨天稳定', () => {
  const [a] = reviewPlanFor(11, days);
  const [b] = reviewPlanFor(11, days);
  assert.ok(a);
  assert.ok(b);
  assert.equal(a.id, 'd10-drill-0');
  assert.equal(a.id, b.id);
});

test('D01 往回越界：计划为空（区块整体不渲染）', () => {
  assert.deepEqual(reviewPlanFor(1, days), []);
});

test('课程里缺这一天时那一格不出现，不补位也不顶替', () => {
  // 只有 D05 存在：D06 的 D-5... 往回一天是 D05，能取到；D07 往回是 D06，缺
  const sparse = [day(5)];
  assert.equal(reviewPlanFor(6, sparse).length, 1);
  assert.deepEqual(reviewPlanFor(7, sparse), []);
});

test('来源学习日没有练习题（测评日那类）：跳过而不是产出空项', () => {
  const withTestDay = [day(9), day(10, { drill: [] }), day(11)];
  assert.deepEqual(reviewPlanFor(11, withTestDay), []);
});

test('来源学习日有题但没有参考答案：照常出题面，answer 缺省', () => {
  const noAnswers = [day(10, { drillAnswers: undefined }), day(11)];
  const [item] = reviewPlanFor(11, noAnswers);
  assert.ok(item);
  assert.equal(item.prompt, 'D10 练习一');
  assert.equal(item.answer, undefined);
});

test('同一输入连续两次调用结果全等：取材确定性，不随机', () => {
  assert.deepEqual(reviewPlanFor(8, days), reviewPlanFor(8, days));
});
