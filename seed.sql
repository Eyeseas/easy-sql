-- ═══════════════════════════════════════════════════════════════════
--  练习库灌数脚本 · 按剧情分阶段执行
--
--  前提：先按课程页面的表结构建好对应的表（D01 只建 orders，其余随周上线），
--  然后只在到达相应的那天时，跑对应的那一段。别一口气全灌：
--  表和数据是随业务「上线」的，提前灌会破坏后面几周的现象。
--
--    §A  D01  老板的订单导出：orders 5 万行（含脏数据）
--    §B  D08  运营导数据：users / products / order_items（约 12 万明细）
--    §C  D15  类目上线：categories + 回填 products.category_id
--    §D  D22  增长团队接入：user_logins 30 万
--    §E  D32  支付模块上线：payments 约 4 万
--    §F  D36  时间快进：冲到 100 万订单 / 250 万明细 / 80 万支付 / 50 万登录
--
--  【坑】random() 写在不相关（未引用外层列）的 LATERAL 子查询里时，
--  会被优化成整条语句只求值一次的 Init Plan：100 万行拿到的是同一个随机数。
--  想每行都随机：放 SELECT 列表里，或放进 MATERIALIZED CTE。
--
--  【时间锚点】所有日期都用 current_date 相对偏移（如「近 90 天」「两年前到
--  四个月前」），不管哪天灌数、灌完过多少天，数据分布都成立，练习题不失效。
--
--  【user_id 的戏法】orders.user_id 是 uuid，但 D01 时 users 表还没上线。
--  这里按编号 1~10000 生成确定性 uuid（全零前缀 + 12 位左补零的编号），
--  §B 建 users 时用同一映射当主键，订单才能 join 上用户。
--  例：编号 42 → 00000000-0000-0000-0000-000000000042
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
--  §A · D01  老板的订单导出（5 万行，近 90 天，埋了三类脏数据）
--     脏数据：① 约 1% 的 status 为 NULL；② 约 0.2% 金额为负；
--             ③ 20 单 paid_at 比 created_at 还早（D05 找它们）
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO orders (user_id, status, total_amount, created_at, paid_at)
SELECT ('00000000-0000-0000-0000-' || lpad((1 + floor(random() * 10000))::int::text, 12, '0'))::uuid,
       CASE WHEN r.s < 0.70 THEN 2            -- 已支付
            WHEN r.s < 0.80 THEN 1            -- 待支付
            WHEN r.s < 0.90 THEN 3            -- 已取消
            WHEN r.s < 0.91 THEN NULL         -- 脏数据：状态丢失
            ELSE 2 END,
       CASE WHEN r.a < 0.002
            THEN -round((20 + random() * 2000)::numeric, 2)   -- 脏数据：负金额
            ELSE round((20 + random() * 2000)::numeric, 2) END,
       r.ts,
       CASE WHEN r.s < 0.70 THEN r.ts + (random() * 60) * interval '1 minute' END
FROM (
  SELECT random() AS s, random() AS a,
         current_date - (random() * 90) * interval '1 day' AS ts
  FROM generate_series(1, 50000) g
) r;

-- 脏数据③：20 单「支付时间早于下单时间」
UPDATE orders SET paid_at = created_at - interval '5 minutes'
WHERE id IN (SELECT id FROM orders WHERE paid_at IS NOT NULL ORDER BY random() LIMIT 20);


-- ═══════════════════════════════════════════════════════════════════
--  §B · D08/D09  运营把三张表导给你
--     users 1 万（city 含约 2% NULL，留作口径练习）
--     products 500（category_id 先留空，等 §C 类目上线再回填）
--     order_items：给已有的 5 万订单每单展开 1~4 件，约 12 万行
-- ═══════════════════════════════════════════════════════════════════

-- ① users：1 万（random 都在 SELECT 列表，安全）
--    id 用和 orders.user_id 相同的确定性映射，保证能 join 上
INSERT INTO users (id, name, email, city, created_at)
SELECT ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       '用户' || g,
       'user' || g || '@example.com',
       CASE WHEN random() < 0.02 THEN NULL
            ELSE (ARRAY['北京','上海','广州','深圳','杭州','成都'])[1 + floor(random() * 6)::int] END,
       current_date - 360 + (random() * 360) * interval '1 day'
FROM generate_series(1, 10000) g;

-- ② products：500（类目还没上线，category_id 留空）
INSERT INTO products (name, category_id, price, stock, created_at)
SELECT '商品' || g,
       NULL,
       round((10 + random() * 990)::numeric, 2),
       (random() * 500)::int,
       current_date - 360 + (random() * 360) * interval '1 day'
FROM generate_series(1, 500) g;

-- ③ order_items：每单 1~4 件（随机数都在 MATERIALIZED CTE 里逐行掷好）
--    unit_price 是商品价 ×0.9~1.1 的抖动——「价格快照」语义（D31 会论证它）
WITH p AS (SELECT array_agg(id) AS ids, array_agg(price) AS prices FROM products),
     o AS MATERIALIZED (
       SELECT id, 1 + floor(random() * 4)::int AS n,
              1 + floor(random() * 500)::int AS i
       FROM orders
     )
INSERT INTO order_items (order_id, product_id, qty, unit_price)
SELECT o.id, p.ids[o.i], 1 + floor(random() * 3)::int,
       round((p.prices[o.i] * (0.9 + random() * 0.2))::numeric, 2)
FROM o CROSS JOIN LATERAL generate_series(1, o.n) k CROSS JOIN p;

-- ④ orders.total_amount 对齐明细之和
UPDATE orders o SET total_amount = s.sum
FROM (SELECT order_id, sum(qty * unit_price) AS sum
      FROM order_items GROUP BY order_id) s
WHERE s.order_id = o.id;

-- ⑤ 对齐之后再重新埋 100 单负金额（对不上的明细，正是 D05 要抓的脏数据）
UPDATE orders SET total_amount = -total_amount
WHERE id IN (SELECT id FROM orders ORDER BY random() LIMIT 100);


-- ═══════════════════════════════════════════════════════════════════
--  §C · D15  类目上线：30 个一级 + 45 个二级，回填 products.category_id
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO categories (name, parent_id)
SELECT '分类' || g, NULL FROM generate_series(1, 30) g;

-- 子级先在 MATERIALIZED CTE 里掷好骰子（每行一个随机父类序号），再 JOIN 回去
WITH pick AS MATERIALIZED (
  SELECT g, 1 + floor(random() * 30)::int AS rn FROM generate_series(1, 45) g
),
tops AS (SELECT id, row_number() OVER (ORDER BY id) AS rn
         FROM categories WHERE parent_id IS NULL)
INSERT INTO categories (name, parent_id)
SELECT '子分类' || p.g, t.id
FROM pick p JOIN tops t ON t.rn = p.rn;

-- 回填：每个商品随机挂一个二级类目（骰子照旧在 MATERIALIZED CTE 里逐行掷；
-- 写在 SET 里的子查询会被优化成只求值一次的 InitPlan，500 个商品全挂同一个类目）
WITH pick AS MATERIALIZED (
  SELECT id, 1 + floor(random() * 45)::int AS rn FROM products
),
kids AS (SELECT id, row_number() OVER (ORDER BY id) AS rn
         FROM categories WHERE parent_id IS NOT NULL)
UPDATE products
SET category_id = k.id
FROM pick p JOIN kids k ON k.rn = p.rn
WHERE products.id = p.id;


-- ═══════════════════════════════════════════════════════════════════
--  §D · D22  增长团队接入登录日志（30 万行）
--     每个用户有自己的「活跃窗口」，窗口内随机散布 10~50 次登录——
--     这样才查得出「连续登录 7 天」的用户，纯随机是查不出来的
-- ═══════════════════════════════════════════════════════════════════

WITH u AS (
  SELECT id,
         current_date - 90 + (random() * 60) * interval '1 day' AS win_start,
         (10 + floor(random() * 70))::int AS win_days,
         (10 + floor(random() * 40))::int AS n_logins
  FROM users
)
INSERT INTO user_logins (user_id, login_at, ip)
SELECT u.id,
       u.win_start + (random() * u.win_days) * interval '1 day',
       (floor(random() * 223 + 1) || '.' || floor(random() * 256) || '.' ||
        floor(random() * 256) || '.' || (1 + floor(random() * 254)))::inet
FROM u CROSS JOIN LATERAL generate_series(1, u.n_logins) k;


-- ═══════════════════════════════════════════════════════════════════
--  §E · D32  支付模块上线：已支付订单各一条流水（约 4 万）
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO payments (order_id, method, amount, status, paid_at)
SELECT o.id, 1 + floor(random() * 4)::int, o.total_amount, 1, o.paid_at
FROM orders o WHERE o.status = 2 AND o.paid_at IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
--  §F · D36  时间快进：公司跑了一年多
--     新增 95 万历史订单（2024-09 ~ 2026-05）及其明细 / 支付 / 登录
--     灌完这个，报表开始变慢——第 6 周的现象从这里开始
-- ═══════════════════════════════════════════════════════════════════

-- ① 新增 95 万历史订单（8 成已支付、1 成待支付、1 成已取消）
WITH r AS MATERIALIZED (
  SELECT ('00000000-0000-0000-0000-' || lpad((1 + floor(random() * 10000))::int::text, 12, '0'))::uuid AS ui,
         floor(random() * 10)::int AS n,
         current_date - 730 + (random() * 610) * interval '1 day' AS ts
  FROM generate_series(1, 950000) g
)
INSERT INTO orders (user_id, status, total_amount, created_at, paid_at)
SELECT r.ui,
       CASE WHEN r.n <= 7 THEN 2 WHEN r.n = 8 THEN 1 ELSE 3 END,
       round((20 + random() * 2000)::numeric, 2),
       r.ts,
       CASE WHEN r.n <= 7 THEN r.ts + (random() * 60) * interval '1 minute' END
FROM r;

-- ② 给「还没有明细」的订单（即刚灌入的历史订单）展开明细，约 228 万行
WITH p AS (SELECT array_agg(id) AS ids, array_agg(price) AS prices FROM products),
     o AS MATERIALIZED (
       SELECT id, 1 + floor(random() * 4)::int AS n,
              1 + floor(random() * 500)::int AS i
       FROM orders
       WHERE id > (SELECT coalesce(max(order_id), 0) FROM order_items)
     )
INSERT INTO order_items (order_id, product_id, qty, unit_price)
SELECT o.id, p.ids[o.i], 1 + floor(random() * 3)::int,
       round((p.prices[o.i] * (0.9 + random() * 0.2))::numeric, 2)
FROM o CROSS JOIN LATERAL generate_series(1, o.n) k CROSS JOIN p;

-- ③ 历史 total_amount 对齐明细
UPDATE orders o SET total_amount = s.sum
FROM (SELECT order_id, sum(qty * unit_price) AS sum
      FROM order_items GROUP BY order_id) s
WHERE s.order_id = o.id;

-- ④ 历史已支付订单补支付流水（约 75 万）
INSERT INTO payments (order_id, method, amount, status, paid_at)
SELECT o.id, 1 + floor(random() * 4)::int, o.total_amount, 1, o.paid_at
FROM orders o
WHERE o.status = 2 AND o.paid_at IS NOT NULL
  AND o.id > (SELECT coalesce(max(order_id), 0) FROM payments);

-- ⑤ 登录日志补 20 万条历史（散布在两年里）
WITH r AS MATERIALIZED (
  SELECT 1 + floor(random() * 10000)::int AS ui,
         current_date - 720 + (random() * 600) * interval '1 day' AS ts
  FROM generate_series(1, 200000) g
)
INSERT INTO user_logins (user_id, login_at, ip)
SELECT r.ui, r.ts,
       (floor(random() * 223 + 1) || '.' || floor(random() * 256) || '.' ||
        floor(random() * 256) || '.' || (1 + floor(random() * 254)))::inet
FROM r;
