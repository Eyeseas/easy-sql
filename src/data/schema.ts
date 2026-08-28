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
}

export const TABLES: readonly TableDef[] = [
  {
    name: 'orders',
    columns: 'id, user_id, status, total_amount, created_at, paid_at',
    note: 'D01 老板发来的订单导出，全课程第一张表',
    since: 1,
  },
  { name: 'users', columns: 'id, name, email, city, created_at', note: 'D08 运营导来的用户表', since: 8 },
  {
    name: 'products',
    columns: 'id, name, category_id, price numeric(10,2), stock, created_at',
    note: 'D09 商品表（category_id 要等 D15 类目上线才填）',
    since: 9,
  },
  {
    name: 'order_items',
    columns: 'id, order_id, product_id, qty, unit_price',
    note: 'D09 订单明细，连接 orders 和 products 的桥',
    since: 9,
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
  },
  {
    name: 'payments',
    columns: 'id, order_id, method, amount, status, paid_at',
    note: 'D32 支付模块上线的流水表',
    since: 32,
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

export const DOCKER_SETUP = `docker run -d --name pg16 -e POSTGRES_PASSWORD=dev -p 5432:5432 \\
  -v pgdata:/var/lib/postgresql/data postgres:16
docker exec -it pg16 psql -U postgres

CREATE DATABASE shop;
\\c shop`;

export const PSQL_COMMANDS = '\\l   \\dt   \\d orders   \\di   \\x   \\timing on';

export const DATA_VOLUME =
  '数据分阶段灌入，对应 <code>seed.sql</code> 的分段：D01 老板的 <b>5 万订单</b> -> W2 三张表（1 万用户 / 500 商品 / 约 12 万明细）-> W3 类目 -> W4 30 万登录日志 -> W5 支付流水 -> <b>W6 D36「时间快进」冲到 100 万订单、250 万明细、80 万支付、50 万登录</b>。百万级是第 6 周索引优化的前提：小表上做优化没有任何现象，那一周会白学。';
