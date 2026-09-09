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

test('常规天三格齐全，由近及远，来源天号与动作各就各位', () => {
  const plan = reviewPlanFor(11, days);
  assert.deepEqual(
    plan.map((x) => [x.gap, x.action, x.fromDay]),
    [
      [1, 'recite', 10],
      [3, 'redo', 8],
      [7, 'explain', 4],
    ],
  );
  assert.equal(plan[0]?.fromTitle, '第 10 天');
});

test('D+1 与 D+3 都取来源学习日「练」栏第 1 题与它的参考答案', () => {
  const [first, second] = reviewPlanFor(11, days);
  assert.ok(first);
  assert.equal(first.prompt, 'D10 练习一');
  assert.deepEqual(first.answer, { sql: 'select 10;', note: 'D10 要点' });

  assert.ok(second);
  assert.equal(second.prompt, 'D8 练习一');
  assert.deepEqual(second.answer, { sql: 'select 8;', note: 'D8 要点' });
});

test('复盘项 id 由来源学习日 + 素材类型 + 下标拼成，跨天稳定', () => {
  const [a] = reviewPlanFor(11, days);
  const [b] = reviewPlanFor(11, days);
  assert.ok(a);
  assert.ok(b);
  assert.equal(a.id, 'd10-drill-0');
  assert.equal(a.id, b.id);
});

test('D+7 格取「学」栏第 1 条：小讲义取标题，易错点折进答案区', () => {
  const rich = [
    day(4, {
      learn: [
        { title: 'CASE 两种写法', body: '讲解正文', pitfall: '条件从上往下，第一个命中生效' },
      ],
    }),
    day(11),
  ];
  const [item] = reviewPlanFor(11, rich);
  assert.ok(item);
  assert.equal(item.gap, 7);
  assert.equal(item.action, 'explain');
  assert.equal(item.id, 'd4-learn-0');
  assert.equal(item.prompt, 'CASE 两种写法');
  assert.deepEqual(item.answer, { note: '条件从上往下，第一个命中生效' });
});

test('D+7 格的一行式知识点直接取原文，没有易错点就不折答案', () => {
  const [item] = reviewPlanFor(11, [day(4, { learn: ['限时 60 分钟，闭卷'] }), day(11)]);
  assert.ok(item);
  assert.equal(item.prompt, '限时 60 分钟，闭卷');
  assert.equal(item.answer, undefined);
});

test('D01 往回越界：计划为空（区块整体不渲染）', () => {
  assert.deepEqual(reviewPlanFor(1, days), []);
});

test('D02 只有 D+1 一格，D04 有 D+1 与 D+3 两格', () => {
  assert.deepEqual(
    reviewPlanFor(2, days).map((x) => x.gap),
    [1],
  );
  assert.deepEqual(
    reviewPlanFor(4, days).map((x) => x.gap),
    [1, 3],
  );
});

test('跨周不断链：D08 的 D+7 落回第一周的 D01', () => {
  const item = reviewPlanFor(8, days).find((x) => x.gap === 7);
  assert.ok(item);
  assert.equal(item.fromDay, 1);
});

test('课程里缺这一天时那一格不出现，不补位也不顶替', () => {
  // 只有 D05 存在：D06 往回一天是 D05，能取到；D07 往回一天是 D06，缺
  assert.equal(reviewPlanFor(6, [day(5)]).length, 1);
  assert.deepEqual(reviewPlanFor(7, [day(5)]), []);
});

test('来源学习日没有练习题（测评日那类）：只跳过那一格，别的格照出', () => {
  const withTestDay = [day(4), day(8, { drill: [] }), day(10), day(11)];
  assert.deepEqual(
    reviewPlanFor(11, withTestDay).map((x) => x.gap),
    [1, 7],
  );
});

test('来源学习日没有知识点：D+7 那一格跳过', () => {
  const noLearn = [day(4, { learn: [] }), day(8), day(10), day(11)];
  assert.deepEqual(
    reviewPlanFor(11, noLearn).map((x) => x.gap),
    [1, 3],
  );
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
