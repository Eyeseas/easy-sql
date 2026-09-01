/**
 * 练习库定义。表随业务剧情逐张上线（since = 上线日的天数号）：
 *  1. 页面「环境与数据集」区展示
 *  2. 喂给模型当出题上下文（src/scripts/llm.ts，按天过滤--还没上线的表不出题）
 *  3. seed.sql 按同样阶段分段灌数
 * 改表结构时这一个文件改完，多处同步。
 */

export interface TableDef {
  name: string;
  columns: string;
  note?: string;
  /** 上线日号：这张表随哪一天的业务事件进入练习库 */
  since?: number;
  /** 起步行数量级（描述性文字，如「5 万」）。出题上下文用，展示不显示 */
  rows?: string;
  /** D36「时间快进」后的量级；没写的表不涨 */
  rowsAfterD36?: string;
}

export const TABLES: readonly TableDef[] = [
  {
    name: 'orders',
    columns: 'id, user_id, status, total_amount, created_at, paid_at',
    note: 'D01 老板发来的订单导出，全课程第一张表',
    since: 1,
    rows: '5 万',
    rowsAfterD36: '100 万',
  },
  {
    name: 'users',
    columns: 'id, name, email, city, created_at',
    note: 'D08 运营导来的用户表',
    since: 8,
    rows: '1 万',
  },
  {
    name: 'products',
    columns: 'id, name, category_id, price numeric(10,2), stock, created_at',
    note: 'D09 商品表（category_id 要等 D15 类目上线才填）',
    since: 9,
    rows: '500',
  },
  {
    name: 'order_items',
    columns: 'id, order_id, product_id, qty, unit_price',
    note: 'D09 订单明细，连接 orders 和 products 的桥',
    since: 9,
    rows: '12 万',
    rowsAfterD36: '250 万',
  },
  {
    name: 'categories',
    columns: 'id, name, parent_id',
    note: 'D15 类目上线，自关联树，递归 CTE 用',
    since: 15,
  },
  {
    name: 'user_logins',
    columns: 'id, user_id, login_at, ip',
    note: 'D22 增长团队接入的登录日志，连续登录 / 留存题用',
    since: 22,
    rows: '30 万',
    rowsAfterD36: '50 万',
  },
  {
    name: 'payments',
    columns: 'id, order_id, method, amount, status, paid_at',
    note: 'D32 支付模块上线的流水表',
    since: 32,
    rows: '4 万',
    rowsAfterD36: '80 万',
  },
];

/** 到某天为止已上线的表 */
export function tablesForDay(no: number): readonly TableDef[] {
  return TABLES.filter((t) => (t.since ?? 1) <= no);
}

/** 给模型的纯文本 schema，不带展示用的对齐空格。给天数号则只带已上线的表 */
export function schemaForPrompt(no?: number): string {
  const tables = no === undefined ? TABLES : tablesForDay(no);
  return tables.map((t) => `${t.name}(${t.columns})${t.note ? `  -- ${t.note}` : ''}`).join('\n');
}

/**
 * 数据口径（出题上下文用）：状态值域、脏数据、NULL 占比、行数量级。
 * 这些是 seed.sql 灌数时定下的业务事实，模型不知道就会在参考答案里编造
 * status 值、漏掉口径陷阱。展示页不用这段，只喂给模型（见 scripts/llm.ts）。
 */
export function dataFactsForDay(no: number): string {
  const fast = no >= 36;
  const live = new Set(tablesForDay(no).map((t) => t.name));
  const lines = [
    '数据口径（题目、参考答案和自查点都要符合）：',
    '- orders.status：1=待支付，2=已支付，3=已取消，约 1% 是 NULL（脏数据）；total_amount 多在 20~2000 元，约 0.2% 为负（脏数据）；paid_at 只有已支付单才有，其中约 20 单比 created_at 还早（脏数据）。',
  ];
  if (live.has('users'))
    lines.push('- users.city 只有北京/上海/广州/深圳/杭州/成都六个值，约 2% 是 NULL（口径练习素材）。');
  if (live.has('payments')) lines.push('- payments 只对应已支付的订单（status = 2）。');
  const volumes = tablesForDay(no)
    .filter((t) => t.rows)
    .map((t) => `${t.name} ${fast ? t.rowsAfterD36 ?? t.rows : t.rows}`)
    .join('，');
  lines.push(
    `- 行数量级${fast ? '（D36「时间快进」后的量级）' : ''}：${volumes}。出题别跟这些量级打架（比如别假设只有几十行）。`,
  );
  return lines.join('\n');
}

export const DOCKER_SETUP = `docker run -d --name pg16 -e POSTGRES_PASSWORD=dev -p 5432:5432 \\
  -v pgdata:/var/lib/postgresql/data postgres:16
docker exec -it pg16 psql -U postgres

CREATE DATABASE shop;
\\c shop`;

export const PSQL_COMMANDS = '\\l   \\dt   \\d orders   \\di   \\x   \\timing on';

export const DATA_VOLUME =
  '数据分阶段灌入，对应 <code>seed.sql</code> 的分段：D01 老板的 <b>5 万订单</b> -> W2 三张表（1 万用户 / 500 商品 / 约 12 万明细）-> W3 类目 -> W4 30 万登录日志 -> W5 支付流水 -> <b>W6 D36「时间快进」冲到 100 万订单、250 万明细、80 万支付、50 万登录</b>。百万级是第 6 周索引优化的前提：小表上做优化没有任何现象，那一周会白学。';
