import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_LOG,
  applyVerdict,
  dueIds,
  dueItems,
  fillItem,
  normalizeLog,
  reviewPlanFor,
  reviewSourceFor,
  isMistake,
  mistakeBook,
  mistakesMarkdown,
  removeItem,
  DUE_LIMIT,
  verdictOn,
} from '../src/scripts/reviewCore.ts';
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
    plan.map((x) => [x.origin, x.action, x.fromDay]),
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
  assert.equal(item.origin, 7);
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
    reviewPlanFor(2, days).map((x) => x.origin),
    [1],
  );
  assert.deepEqual(
    reviewPlanFor(4, days).map((x) => x.origin),
    [1, 3],
  );
});

test('跨周不断链：D08 的 D+7 落回第一周的 D01', () => {
  const item = reviewPlanFor(8, days).find((x) => x.origin === 7);
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
    reviewPlanFor(11, withTestDay).map((x) => x.origin),
    [1, 7],
  );
});

test('来源学习日没有知识点：D+7 那一格跳过', () => {
  const noLearn = [day(4, { learn: [] }), day(8), day(10), day(11)];
  assert.deepEqual(
    reviewPlanFor(11, noLearn).map((x) => x.origin),
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

/* ---------- 复盘记录 ---------- */

test('素材索引只收已学过的天：练第 1 题 + 全部知识点', () => {
  const source = reviewSourceFor(4, days);
  assert.deepEqual(Object.keys(source).sort(), [
    'd1-drill-0',
    'd1-learn-0',
    'd1-learn-1',
    'd2-drill-0',
    'd2-learn-0',
    'd2-learn-1',
    'd3-drill-0',
    'd3-learn-0',
    'd3-learn-1',
  ]);
  assert.equal(source['d3-drill-0']?.prompt, 'D3 练习一');
});

test('标「忘了」：下一个学习日到期，连续记得次数清零', () => {
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  assert.deepEqual(log.items['d10-drill-0']?.dueOn, 12);
  assert.equal(log.items['d10-drill-0']?.streak, 0);
  assert.deepEqual(dueIds(12, log), ['d10-drill-0']);
  assert.deepEqual(dueIds(11, log), []);
});

test('标「记得」：不再排队，连续记得次数加一', () => {
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'known');
  assert.equal(log.items['d10-drill-0']?.dueOn, null);
  assert.equal(log.items['d10-drill-0']?.streak, 1);
  assert.deepEqual(dueIds(99, log), []);
});

test('欠下的到期项不会过期消失：到期日之后的每一天都还在', () => {
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  assert.deepEqual(dueIds(20, log), ['d10-drill-0']);
});

test('判定历史逐次累加，verdictOn 取当天最后一次', () => {
  let log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  log = applyVerdict(log, 'd10-drill-0', 11, 'known');
  assert.deepEqual(log.items['d10-drill-0']?.history, [
    { dayNo: 11, verdict: 'forgot' },
    { dayNo: 11, verdict: 'known' },
  ]);
  assert.equal(verdictOn(log, 'd10-drill-0', 11), 'known');
  assert.equal(verdictOn(log, 'd10-drill-0', 12), null);
  assert.equal(verdictOn(log, 'd8-drill-0', 11), null);
});

test('applyVerdict 不改入参', () => {
  const before = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  const snapshot = JSON.stringify(before);
  applyVerdict(before, 'd10-drill-0', 12, 'known');
  assert.equal(JSON.stringify(before), snapshot);
});

test('到期错题渲染成复盘项，origin 标成 due，固定格占过的不重复出', () => {
  const source = reviewSourceFor(12, days);
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');

  const [item] = dueItems(12, log, source);
  assert.ok(item);
  assert.equal(item.origin, 'due');
  assert.equal(item.action, 'redo');
  assert.equal(item.prompt, 'D10 练习一');

  assert.deepEqual(dueItems(12, log, source, new Set(['d10-drill-0'])), []);
});

test('素材索引里查不到的 id 静默丢弃（课程内容改过之后的旧记录）', () => {
  const log = applyVerdict(EMPTY_LOG, 'd99-drill-7', 11, 'forgot');
  assert.deepEqual(dueItems(12, log, reviewSourceFor(12, days)), []);
});

test('损坏 / 版本不符的记录退回空，不抛错', () => {
  assert.deepEqual(normalizeLog(null), EMPTY_LOG);
  assert.deepEqual(normalizeLog('坏了'), EMPTY_LOG);
  assert.deepEqual(normalizeLog({ version: 99, items: {} }), EMPTY_LOG);
  assert.deepEqual(normalizeLog({ version: 1 }), EMPTY_LOG);
  assert.deepEqual(
    normalizeLog({ version: 1, items: { a: { history: 'nope', dueOn: 1, streak: 0 } } }).items,
    {},
  );
  assert.deepEqual(
    normalizeLog({ version: 1, items: { a: { history: [{ dayNo: 'x' }], dueOn: 1, streak: 0 } } })
      .items,
    {},
  );
});

test('正常记录原样读回', () => {
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  assert.deepEqual(normalizeLog(JSON.parse(JSON.stringify(log))), log);
});

test('空记录时今日复盘与第 1 层完全一致', () => {
  const source = reviewSourceFor(11, days);
  assert.deepEqual(dueItems(11, EMPTY_LOG, source), []);
});

/* ---------- 间隔阶梯与毕业 ---------- */

const ID = 'd10-drill-0';

/** 按一串「在第几个学习日标了什么」依次判定，返回最终记录 */
function judge(seq: readonly [number, 'known' | 'forgot'][]) {
  return seq.reduce((log, [dayNo, verdict]) => applyVerdict(log, ID, dayNo, verdict), EMPTY_LOG);
}

test('答对一次往上走一档：忘了 -> +1 -> +3 -> +7', () => {
  assert.equal(judge([[11, 'forgot']]).items[ID]?.dueOn, 12);
  assert.equal(
    judge([
      [11, 'forgot'],
      [12, 'known'],
    ]).items[ID]?.dueOn,
    15,
  );
  assert.equal(
    judge([
      [11, 'forgot'],
      [12, 'known'],
      [15, 'known'],
    ]).items[ID]?.dueOn,
    22,
  );
});

test('连续 3 次「记得」后毕业：不再排队', () => {
  const log = judge([
    [11, 'forgot'],
    [12, 'known'],
    [15, 'known'],
    [22, 'known'],
  ]);
  assert.equal(log.items[ID]?.streak, 3);
  assert.equal(log.items[ID]?.dueOn, null);
  assert.deepEqual(dueIds(999, log), []);
});

test('中途再标「忘了」：间隔重置回最短一档，连对次数清零', () => {
  const log = judge([
    [11, 'forgot'],
    [12, 'known'],
    [15, 'forgot'],
  ]);
  assert.equal(log.items[ID]?.dueOn, 16);
  assert.equal(log.items[ID]?.streak, 0);
});

test('毕业后再标「忘了」：重新进入调度', () => {
  const log = judge([
    [11, 'forgot'],
    [12, 'known'],
    [15, 'known'],
    [22, 'known'],
    [30, 'forgot'],
  ]);
  assert.equal(log.items[ID]?.dueOn, 31);
  assert.equal(log.items[ID]?.streak, 0);
});

test('固定格里顺手答对的不会被拉进错题本', () => {
  const log = judge([[11, 'known']]);
  assert.equal(log.items[ID]?.dueOn, null);
  assert.equal(isMistake(log.items[ID]!), false);
  assert.deepEqual(dueIds(99, log), []);
});

test('忘过一次就算进过错题本，毕业了也还算', () => {
  const log = judge([
    [11, 'forgot'],
    [12, 'known'],
    [15, 'known'],
    [22, 'known'],
  ]);
  assert.equal(isMistake(log.items[ID]!), true);
});

test('每天最多给 DUE_LIMIT 条到期错题，先欠的先还', () => {
  // 8 条都欠着：D01–D08 的练习第 1 题，分别在 D02..D09 到期
  let log = EMPTY_LOG;
  for (let n = 1; n <= 8; n += 1) log = applyVerdict(log, `d${n}-drill-0`, n + 1, 'forgot');

  const source = reviewSourceFor(20, days);
  const shown = dueItems(20, log, source);
  assert.equal(shown.length, DUE_LIMIT);
  assert.deepEqual(
    shown.map((x) => x.id),
    ['d1-drill-0', 'd2-drill-0', 'd3-drill-0', 'd4-drill-0', 'd5-drill-0'],
  );
});

test('超出上限的到期项不销账：之后的学习日照样排队', () => {
  let log = EMPTY_LOG;
  for (let n = 1; n <= 8; n += 1) log = applyVerdict(log, `d${n}-drill-0`, n + 1, 'forgot');

  // 还没做的那 3 条到期日没动，第二天仍然全部在队里
  assert.equal(dueIds(21, log).length, 8);

  // 前 5 条做掉之后，剩下的顶上来
  for (const id of ['d1-drill-0', 'd2-drill-0', 'd3-drill-0', 'd4-drill-0', 'd5-drill-0']) {
    log = applyVerdict(log, id, 20, 'known');
  }
  assert.deepEqual(
    dueItems(21, log, reviewSourceFor(20, days)).map((x) => x.id),
    ['d6-drill-0', 'd7-drill-0', 'd8-drill-0'],
  );
});

/* ---------- 补漏格 ---------- */

/** 每天 3 条知识点的课程，用来验证第 2 条及以后能不能被捞出来 */
const rich: readonly Day[] = Array.from({ length: 12 }, (_, i) =>
  day(i + 1, {
    learn: [`D${i + 1} 知识点一`, `D${i + 1} 知识点二`, `D${i + 1} 知识点三`],
  }),
);

test('素材索引收全每天的知识点，不再只收第 1 条', () => {
  const source = reviewSourceFor(3, rich);
  assert.deepEqual(Object.keys(source).sort(), [
    'd1-drill-0',
    'd1-learn-0',
    'd1-learn-1',
    'd1-learn-2',
    'd2-drill-0',
    'd2-learn-0',
    'd2-learn-1',
    'd2-learn-2',
  ]);
});

test('补漏取第一条没有判定记录的知识点：学习日号升序、下标升序', () => {
  const item = fillItem(EMPTY_LOG, reviewSourceFor(11, rich));
  assert.ok(item);
  assert.equal(item.origin, 'fill');
  assert.equal(item.action, 'explain');
  assert.equal(item.id, 'd1-learn-0');
});

test('判定过的知识点不再被补漏选中，一条条往后推', () => {
  const source = reviewSourceFor(11, rich);
  let log = applyVerdict(EMPTY_LOG, 'd1-learn-0', 11, 'known');
  assert.equal(fillItem(log, source)?.id, 'd1-learn-1');

  log = applyVerdict(log, 'd1-learn-1', 12, 'forgot');
  assert.equal(fillItem(log, source)?.id, 'd1-learn-2');

  log = applyVerdict(log, 'd1-learn-2', 13, 'known');
  assert.equal(fillItem(log, source)?.id, 'd2-learn-0');
});

test('不判定就不前进：同一份记录反复取，永远是同一条', () => {
  const source = reviewSourceFor(11, rich);
  assert.equal(fillItem(EMPTY_LOG, source)?.id, fillItem(EMPTY_LOG, source)?.id);
  // 换一天也一样——补漏不看今天是第几天，只看还欠什么
  assert.equal(fillItem(EMPTY_LOG, reviewSourceFor(12, rich))?.id, 'd1-learn-0');
});

test('补漏能取到下标非 0 的知识点——这是这一格存在的理由', () => {
  // 每天第 1 条都判定过了：固定间隔格能碰到的就这些
  let log = EMPTY_LOG;
  for (let n = 1; n <= 10; n += 1) log = applyVerdict(log, `d${n}-learn-0`, 11, 'known');

  const item = fillItem(log, reviewSourceFor(11, rich));
  assert.ok(item);
  assert.equal(item.id, 'd1-learn-1');
  assert.equal(item.prompt, 'D1 知识点二');
});

test('当天固定格已经占了的那条跳过，往后找下一条', () => {
  const source = reviewSourceFor(11, rich);
  const item = fillItem(EMPTY_LOG, source, new Set(['d1-learn-0']));
  assert.equal(item?.id, 'd1-learn-1');
});

test('全部判定过之后补漏格不出现', () => {
  const source = reviewSourceFor(11, rich);
  let log = EMPTY_LOG;
  for (const id of Object.keys(source)) log = applyVerdict(log, id, 11, 'known');
  assert.equal(fillItem(log, source), null);
});

test('D01 没有已学过的天：补漏格不出现', () => {
  assert.equal(fillItem(EMPTY_LOG, reviewSourceFor(1, rich)), null);
});

test('补漏只挑知识点，不挑练习题', () => {
  const source = reviewSourceFor(11, rich);
  let log = EMPTY_LOG;
  for (const [id, m] of Object.entries(source)) {
    if (m.action === 'explain') log = applyVerdict(log, id, 11, 'known');
  }
  // 练习题一条都没判定过，但补漏已经没得挑了
  assert.equal(fillItem(log, source), null);
});

/* ---------- 错题本 ---------- */

test('错题本只收忘过的，按来源学习日排，带忘过次数与下次到期', () => {
  let log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  log = applyVerdict(log, 'd4-learn-0', 11, 'forgot');
  log = applyVerdict(log, 'd8-drill-0', 11, 'known'); // 顺手答对的，不进错题本

  const book = mistakeBook(log, reviewSourceFor(12, days));
  assert.deepEqual(
    book.map((e) => [e.material.id, e.forgot, e.dueOn, e.graduated]),
    [
      ['d4-learn-0', 1, 12, false],
      ['d10-drill-0', 1, 12, false],
    ],
  );
});

test('毕业的条目留在错题本里，标成已掌握', () => {
  const log = judge([
    [11, 'forgot'],
    [12, 'known'],
    [15, 'known'],
    [22, 'known'],
  ]);
  const [entry] = mistakeBook(log, reviewSourceFor(12, days));
  assert.ok(entry);
  assert.equal(entry.graduated, true);
  assert.equal(entry.dueOn, null);
  assert.equal(entry.forgot, 1);
});

test('移除一条：错题本里没有了，也不再排队', () => {
  let log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  log = removeItem(log, 'd10-drill-0');
  assert.deepEqual(mistakeBook(log, reviewSourceFor(12, days)), []);
  assert.deepEqual(dueIds(99, log), []);
});

test('移除不存在的条目：记录原样返回', () => {
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  assert.equal(removeItem(log, '不存在'), log);
});

test('导出 markdown：按来源学习日分节，带动作、忘过次数、题面与参考答案', () => {
  let log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  log = applyVerdict(log, 'd4-learn-0', 11, 'forgot');

  const md = mistakesMarkdown(mistakeBook(log, reviewSourceFor(12, days)));
  assert.match(md, /^# 错题本/);
  assert.match(md, /共 2 条/);
  assert.match(md, /## D04 第 4 天/);
  assert.match(md, /## D10 第 10 天/);
  assert.match(md, /### 重做 · 忘过 1 次 · 下次 D12/);
  assert.match(md, /D10 练习一/);
  assert.match(md, /```sql\nselect 10;\n```/);
  // D04 取的是「学」栏第 1 条，一行式字符串没有参考答案
  assert.match(md, /### 口头解释 · 忘过 1 次 · 下次 D12/);
});

test('导出 markdown：题面里的内联标签清掉，别把 HTML 贴进 mistakes.md', () => {
  const tagged = [day(10, { drill: ['用 <code>count(*)</code> 数一下'] }), day(11)];
  const log = applyVerdict(EMPTY_LOG, 'd10-drill-0', 11, 'forgot');
  const md = mistakesMarkdown(mistakeBook(log, reviewSourceFor(11, tagged)));
  assert.match(md, /用 count\(\*\) 数一下/);
  assert.equal(md.includes('<code>'), false);
});

test('导出 markdown：空错题本也给一份能读的文件', () => {
  assert.equal(mistakesMarkdown([]), '# 错题本\n\n还没有错题。\n');
});

test('固定格占过的不算进上限之外，也不重复出', () => {
  let log = EMPTY_LOG;
  for (let n = 1; n <= 8; n += 1) log = applyVerdict(log, `d${n}-drill-0`, n + 1, 'forgot');

  const shown = dueItems(20, log, reviewSourceFor(20, days), new Set(['d1-drill-0']));
  assert.equal(shown.length, DUE_LIMIT);
  assert.equal(
    shown.some((x) => x.id === 'd1-drill-0'),
    false,
  );
});
