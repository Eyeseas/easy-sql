import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RECALL_SYSTEM,
  SYSTEM,
  buildRecallPrompt,
  type GenContextDay,
  type RecallPoint,
} from '../src/scripts/llm.ts';

/**
 * 随堂默写的提示词构造。与出题提示词一样「导出只为离线检查 / 调试」，
 * 这里只断言外部可见的东西：提示词里到底带了什么、边界有没有走样。
 */

const day: GenContextDay = {
  no: 11,
  title: '按城市、按状态看销售：JOIN 与 GROUP BY 合体',
  brief: '老板的正式需求下来了：维度越来越多。',
  learn: ['SELECT 列表的约束：必须在 GROUP BY 里或被聚合包裹'],
  drill: ['一条 SQL 输出「城市 | 总单 | 已付」三列'],
  pass: '一条 SQL 出五列',
  weekNo: 2,
  weekTitle: '连表与聚合',
  covered: 'W1 起步（本周已学：D8「窗口函数」）',
};

const points: readonly RecallPoint[] = [
  {
    no: 10,
    title: '未支付订单从月报里消失了：LEFT JOIN 陷阱',
    point: '造两张 3 行小表，四种 JOIN 各跑一次',
  },
  { no: 4, title: '老板要状态分布：聚合与 GROUP BY', point: 'CASE 两种写法（简单式 / 搜索式）' },
];

test('提示词带上要一起考的旧知识点，标明来自哪个学习日', () => {
  const p = buildRecallPrompt(day, points, 3);
  assert.match(p, /要一起考的旧知识点/);
  assert.match(p, /第 10 天《未支付订单从月报里消失了：LEFT JOIN 陷阱》/);
  assert.match(p, /第 4 天《老板要状态分布：聚合与 GROUP BY》/);
  assert.match(p, /CASE 两种写法/);
});

test('当天的知识点、剧情与进度照旧带上', () => {
  const p = buildRecallPrompt(day, points, 3);
  assert.match(p, /第 2 周《连表与聚合》，第 11 天《按城市、按状态看销售：JOIN 与 GROUP BY 合体》/);
  assert.match(p, /SELECT 列表的约束/);
  assert.match(p, /当天的业务剧情：老板的正式需求下来了/);
});

test('不超纲的边界仍以当天为界，不因为混入旧天而放宽', () => {
  const p = buildRecallPrompt(day, points, 3);
  assert.match(p, /学员已学范围（只能用这些之内的知识出题）：W1 起步（本周已学：D8「窗口函数」）/);
});

test('题目数量与已有练习（防撞题）带上', () => {
  const p = buildRecallPrompt(day, points, 2, ['上一批出过的题']);
  assert.match(p, /请出 2 道随堂默写题/);
  assert.match(p, /共 2 题/);
  assert.match(p, /一条 SQL 输出「城市 \| 总单 \| 已付」三列/); // 当天已有练习
  assert.match(p, /之前生成过、学员已经做过的随堂默写/);
  assert.match(p, /上一批出过的题/);
});

test('没有历史题目时不出现防撞题那一段', () => {
  assert.equal(buildRecallPrompt(day, points, 3).includes('之前生成过'), false);
});

test('内联标签清掉，不把 HTML 喂给模型', () => {
  const tagged: GenContextDay = { ...day, brief: '老板要 <code>支付率</code>' };
  const p = buildRecallPrompt(tagged, [{ no: 4, title: 'D4', point: '<b>CASE</b>' }], 1);
  assert.equal(p.includes('<code>'), false);
  assert.match(p, /老板要 支付率/);
});

test('系统提示词在出题人格上追加「新旧混在同一道题里」的要求', () => {
  assert.ok(RECALL_SYSTEM.startsWith(SYSTEM));
  assert.match(RECALL_SYSTEM, /同时用到当天的知识点和「要一起考的旧知识点」/);
  assert.match(RECALL_SYSTEM, /不是一道新题加一道旧题/);
});

test('旧知识点为空时提示词那一节是空的：调用方负责不在这种天提供入口', () => {
  const p = buildRecallPrompt(day, [], 3);
  assert.match(p, /要一起考的旧知识点[^\n]*\n\n/);
});
