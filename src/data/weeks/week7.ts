import type { Week } from '../../types/curriculum';

export const week7: Week = {
  no: 7,
  title: '大促备战：优化实战与工程化',
  short: '优化实战',
  story:
    '大促进入倒计时。技术负责人把「慢查询清单」「后台深分页超时」「历史数据归档」「秒杀防超卖」四座大山压过来--正是从初级到中级的分界线。',
  goal: '目标：从「能写对」到「能写好」，具备工程判断力--这是中级岗和初级岗的分界。',
  days: [
    {
      no: 43,
      title: '不能靠用户投诉才知道慢：排查方法论',
      brief: '大促前第一件事：建立慢查询的发现与排查机制。',
      split: [40, 50, 30],
      learn: [
        {
          title: '五步法：定位 -&gt; 分析 -&gt; 假设 -&gt; 验证 -&gt; 回归',
          scene: '用户说「后台很卡」--从一句抱怨到一条被治好的 SQL，中间是可复现的流程。',
          body: '① <b>定位</b>：哪条慢？（pg_stat_statements / 慢日志，拿语句拿数字）；② <b>分析</b>：EXPLAIN ANALYZE 找瓶颈节点（W6 的功夫）；③ <b>假设</b>：缺索引？统计过期？写法失效？一次只验证一个；④ <b>验证</b>：改一处、重测、对比；⑤ <b>回归</b>：确认没伤到别的查询，把前后数据存档。优化是流程，不是灵感。',
          sql: `-- 定位：TOP 10 慢语句
select calls, round(mean_exec_time::numeric,1) as 平均ms, left(query,70)
from pg_stat_statements order by mean_exec_time desc limit 10;`,
          pitfall: '跳过「分析」直接加索引是玄学优化：碰巧好了也不知道为什么，下次照样抓瞎。',
        },
        {
          title: 'log_min_duration_statement 慢日志配置',
          scene: '没有 pg_stat_statements 的环境（或要抓「原始完整语句」），慢日志是底线配置。',
          body: '设成 200（毫秒）：执行超过 200ms 的语句连原文带耗时自动进日志。改它不用重启：<code>alter system</code> + <code>pg_reload_conf()</code> 即可。日志里能拿到<b>带字面量的完整 SQL</b>（pg_stat_statements 是归一化后的模板），这是两者互补的点。',
          sql: `alter system set log_min_duration_statement = 200;
select pg_reload_conf();          -- 不重启生效

show log_min_duration_statement;  -- 验证：200ms`,
          pitfall: '阈值太小日志爆炸（磁盘被拖垮），太大漏网；200ms~1s 是常见起步档，按业务调。',
        },
        {
          title: 'auto_explain 模块自动记录慢查询计划',
          scene: '慢查询是「偶发」的：事后手动 EXPLAIN，它偏偏又快了--你需要案发当时的计划。',
          body: 'auto_explain 预载后，超过阈值的语句<b>执行时自动把执行计划写进日志</b>。它抓的是现场：当时的统计信息、当时的缓存状态、当时的计划。偶发慢查询（plan 抖动、冷缓存）只有它抓得住。',
          sql: `-- 会话级试开（不用重启）：
set session_preload_libraries = 'auto_explain';
set auto_explain.log_min_duration = '500ms';
set auto_explain.log_analyze = on;      -- 真实执行数据（有开销，谨慎）

-- 跑一条慢查询，然后看日志里有完整计划`,
          pitfall:
            'log_analyze = on 会给被记录的语句加额外开销，生产常开要评估；先只开 log_min_duration 版本。',
        },
        {
          title: '优化前必须确认的三件事：数据量、频率、可接受延迟',
          scene: '三个优化候选摆在面前，先做哪个？不是哪个慢做哪个。',
          body: '① <b>数据量</b>：多大的表、返回多少行；② <b>频率</b>：一天一次的报表还是每秒 100 次的接口；③ <b>可接受延迟</b>：报表 1 分钟无妨，交易接口 200ms 是红线。优先级 = 频率 × 收益空间。每天跑一次的 30 秒报表，优化的性价比是零。',
          sql: `-- 频率证据：这条查询被调了多少次
select calls, round(total_exec_time::numeric) as 总耗时ms
from pg_stat_statements
order by calls desc limit 10;`,
          pitfall: '只按「绝对耗时」排优先级是错的：一条 5 秒但每天一次的查询，排不进前三优先级。',
        },
      ],
      drill: [
        '把慢日志阈值设为 200ms 并重载配置',
        '故意跑几条慢查询，从日志里捞出来',
        '开启 auto_explain，看它记录的计划',
        '画出属于你自己的排查流程图（一页纸）',
        '写下「优化前必须先确认的 3 个问题」',
      ],
      drillAnswers: [
        {
          sql: `alter system set log_min_duration_statement = 200;
select pg_reload_conf();           -- 不重启生效

show log_min_duration_statement;   -- 验证：200ms`,
          note: 'alter system 写的是 postgresql.auto.conf，重载即生效。日志默认打到容器 stdout，docker logs pg16 里就能翻到。',
        },
        {
          sql: `-- 故意慢的三条（在百万行库上都远超 200ms）
select count(*) from orders;
select count(distinct user_id) from orders;
select o.user_id, sum(i.qty * i.unit_price)
from orders o join order_items i on i.order_id = o.id
group by 1 order by 2 desc limit 10;`,
          note: '预期：日志里每条形如「duration: 800.123 ms statement: select ...」，带完整原文和真实耗时。这是慢日志相对 pg_stat_statements 的独特价值：拿到带字面量的现场原文。',
        },
        {
          sql: `set session_preload_libraries = 'auto_explain';
set auto_explain.log_min_duration = '100ms';
set auto_explain.log_analyze = on;      -- 有额外开销，练习环境随便开

-- 再跑一条慢查询，然后去日志里找执行计划
select count(*) from orders o
join order_items i on i.order_id = o.id;`,
          note: '预期：日志里出现以 QUERY 开头的完整计划（带 actual time）。它抓的是「案发当时」的计划--偶发慢查询（冷缓存、计划抖动）只有这招能留现场。会话级设置断开连接即失效。',
        },
        {
          note: '一页纸流程图：用户抱怨/监控告警 -> 定位（pg_stat_statements 按总耗时排 TOP、慢日志拿原文）-> 分析（explain analyze，圈出最贵节点）-> 假设（一次只立一个：缺索引/统计过期/写法失效/数据量变了）-> 验证（只改这一处，重测对比）-> 回归（确认别的查询没被伤到，前后数据存档进文档）。面试就照着这张图讲。',
        },
        {
          note: '三问：① 数据量--表多大、返回多少行（pg_class.reltuples 或 \\dt+ 看体积）；② 频率--一天一次还是每秒上百次（pg_stat_statements 的 calls 列）；③ 可接受延迟--业务红线是多少（报表分钟级可忍，交易接口 200ms 封顶）。优先级 = 频率 × 收益空间：每天跑一次的 30 秒报表，优化性价比是零。',
        },
      ],
      pass: '有一张能对着面试官讲的排查流程图。',
    },
    {
      no: 44,
      title: '后台翻到第 5000 页就超时：深分页与改写',
      brief: '运营后台的订单列表翻到第 5000 页直接超时。你治好了自己的 OFFSET 恐惧症。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: 'SELECT * 的三项代价',
          scene: '深分页优化的第一步不是改分页，是先把 select * 扫掉。',
          body: '① <b>传输</b>：列表页要 20 行 8 列，select * 把整行几十列全传；② <b>回表</b>：所有列都要回堆取，Index Only Scan 的机会被掐死；③ <b>扩展性</b>：表加一列，这个接口的流量悄悄变大。只取需要的列是成本最低的优化。',
          sql: `-- 反面
select * from orders order by created_at desc offset 100000 limit 20;
-- 正面
select id, user_id, status, total_amount, created_at
from orders order by created_at desc offset 100000 limit 20;`,
          pitfall: 'select * 还会破坏 prepare 语句的缓存效果（结构一变计划全重算）。',
        },
        {
          title: '谓词下推与提前过滤：能早过滤就别晚过滤',
          scene: '「先 join 宽表再过滤」和「先过滤再 join」结果一样、速度差十倍。',
          body: '数据<b>越早变小，后面每一步越便宜</b>：过滤条件尽量推到扫描层（走索引），聚合前先收窄范围。深分页的「延迟关联」就是它的应用：第一步只在索引里拿 20 个 id（窄而快），第二步再拿 id 回表取全部列。',
          sql: `-- 延迟关联：先 id 后详情
select o.*
from (
  select id from orders
  where user_id = '...'
  order by created_at desc
  offset 100000 limit 20        -- 只在索引层翻页
) page
join orders o on o.id = page.id;   -- 20 次回表`,
          pitfall: '外层的排序和过滤条件别丢：内层不排序，外层顺序就是乱的。',
        },
        {
          title: '<b>OFFSET 深分页为什么越翻越慢</b>（要先扫过并丢弃前 N 行）',
          scene: '第 1 页 5ms，第 5000 页 8 秒--OFFSET 的工作方式决定了它。',
          body: '<code>offset 100000 limit 20</code> 的执行 = <b>扫过前 100000 行、全部丢掉</b>，再取 20 行。翻得越深，丢弃越多，耗时线性增长。OFFSET 的本意是「跳过 N 行」，而跳过也是要一行行数过去的。',
          sql: `-- 耗时曲线实验
\\timing on
select id from orders order by id offset 0       limit 20;
select id from orders order by id offset 10000   limit 20;
select id from orders order by id offset 500000  limit 20;
-- 记录三档耗时，画出来就是一条上升直线`,
          pitfall:
            '愿意翻到 5000 页的多半是爬虫不是用户--限页深 + 返回条数上限，本身就是防爬设计。',
        },
        {
          title: 'keyset 分页（游标分页）的写法与限制',
          scene: '治本方案：让「下一页」的代价和「第一页」一样。',
          body: '记住上一页最后一行的排序键，下一页从它接着取：<code>where (排序键) &lt; :last_value order by 排序键 desc limit 20</code>。无论第几页，都只扫 20 行。排序键必须<b>唯一且有序</b>（复合排序加 id 兜底），否则边界行会漏或重。',
          sql: `-- 下一页：拿着上一页最后的 (created_at, id) 来
select id, created_at, total_amount
from orders
where (created_at, id) < (:last_created_at, :last_id)   -- 行比较语法
order by created_at desc, id desc
limit 20;`,
          pitfall:
            '限制要主动说：不能随机跳页（只支持上一页 / 下一页）、排序键中途不能变。产品要跳页就和「延迟关联」组合用。',
        },
        {
          title: '精确 count 的替代方案',
          scene: '列表页要显示「共 1,234,567 条」--这个数字本身就要扫几秒。',
          body: 'PG 的 <code>count(*)</code> 要真数（MVCC 下不能用索引元数据偷懒），百万级秒起。替代：① <code>pg_class.reltuples</code> 估算（毫秒级，误差百分之几）；② 计数表 + 触发器维护（精确、有写放大）；③ 前端展示「约 123 万条」。绝大多数列表页，用户根本不在乎精确总数。',
          sql: `-- 估算版（毫秒）
select reltuples::bigint from pg_class where relname = 'orders';
-- 精确版（慢）
select count(*) from orders;`,
          pitfall: 'reltuples 依赖统计新鲜度（D41）；号称「精确」的功能页（对账、结算）别用估算。',
        },
      ],
      drill: [
        '<code>OFFSET 0 / 10000 / 500000</code> 各跑一次，记录耗时曲线',
        '把同一分页改写成 keyset 分页（<code>WHERE id &lt; :last_id ORDER BY id DESC LIMIT 20</code>）',
        '用延迟关联优化：先取 id 再回表取详情',
        '用 <code>pg_class.reltuples</code> 做近似总数，对比精确 count 的耗时',
        '做一张三种分页方案的对比表（耗时、能否跳页、适用场景）',
      ],
      drillAnswers: [
        {
          sql: `\\timing on
select id from orders order by id offset 0      limit 20;
select id from orders order by id offset 10000  limit 20;
select id from orders order by id offset 500000 limit 20;`,
          note: '预期：三档耗时近似线性增长（第 0 页毫秒级，50 万页慢一到两个量级）--OFFSET 不是「跳到第 N 行」，是把前 N 行扫出来再丢掉。把三档数字记进 notes.md，画出来就是一条上升直线。',
        },
        {
          sql: `-- 第一页（按 id 降序的极简版）
select id, created_at, total_amount
from orders
order by id desc
limit 20;

-- 下一页：把上一页最后一行的 id 代进来
select id, created_at, total_amount
from orders
where id < '上一页最后一行的id'::uuid
order by id desc
limit 20;

-- 业务排序版（按 created_at desc）：复合排序键必须带 id 兜底
select id, created_at, total_amount
from orders
where (created_at, id) < ('上一页末行的created_at', '上一页末行的id'::uuid)
order by created_at desc, id desc
limit 20;`,
          note: '(a, b) < (x, y) 的行比较是 PG 的标准写法。无论翻到第几页，耗时都和第一页同量级（只扫 20 行）--和第 1 题的曲线对比就是本天的核心结论。限制主动说：只能上一页/下一页，不能随机跳页，排序键中途不能换。',
        },
        {
          sql: `-- 前提：created_at 上有索引（没有就先补一个）
create index concurrently if not exists idx_orders_created on orders (created_at);

select o.id, o.user_id, o.status, o.total_amount, o.created_at
from (
  select id from orders
  order by created_at desc
  offset 500000 limit 20        -- 只在索引层翻页，先拿 20 个 id
) page
join orders o on o.id = page.id
order by o.created_at desc;`,
          note: '谓词下推的应用：内层只取 id（窄、可走索引），外层用 20 个 id 回表取全部列。对比直接 offset 500000 的版本，深页耗时明显下降。产品非要跳页时用这招，能顺序翻页就用 keyset。',
        },
        {
          sql: `\\timing on
-- 精确版：百万行逐行可见性检查
select count(*) from orders;

-- 估算版：读统计信息
select reltuples::bigint as 估算行数
from pg_class
where relname = 'orders';`,
          note: '预期：精确版慢两三个量级。reltuples 的误差取决于上次 analyze（D41），一般百分之几以内；对账、结算这类号称「精确」的页面别用估算。',
        },
        {
          note: '对比表三行：OFFSET--能随机跳页，但越翻越慢，只适合浅分页；keyset--耗时恒定最优，但只能上一页/下一页、排序键不能中途变，适合信息流和无限滚动；延迟关联--仍用 OFFSET 但只在索引层翻页，深分页救急用。列建议：方案 / 耗时（用本天实测数字填）/ 能否跳页 / 适用场景。',
        },
      ],
      pass: '能写出 keyset 分页 SQL，并主动说出它的限制（不能随机跳页）。',
    },
    {
      no: 45,
      title: '历史数据归档：分区表',
      brief:
        '两年攒下的订单里 90% 是不会再查的历史数据。你把 orders 按月分区，最老的分区直接归档下线。',
      split: [45, 60, 15],
      learn: [
        {
          title: '声明式分区：RANGE / LIST / HASH 三种',
          scene: '两年 24 个月的订单挤在一张表里--按月切开后，每月一张「小表」。',
          body: 'PG 10+ 的声明式分区：父表带 <code>partition by range/list/hash</code>，子表带 <code>for values ...</code> 定义归属。<b>range</b> 按值区间（时间分区本命）；<b>list</b> 按枚举值（按城市、按租户）；<b>hash</b> 散列均衡（无明显查询边界时摊数据）。对查询和 DML 而言父子表是一张表，写入自动路由到子分区。',
          sql: `create table orders_p (
  id uuid not null,
  created_at timestamp not null,
  ...
  primary key (id, created_at)          -- 分区键必须进主键
) partition by range (created_at);

create table orders_p_2026_08 partition of orders_p
  for values from ('2026-08-01') to ('2026-09-01');`,
          pitfall:
            '分区键必须是主键 / 唯一键的一部分--「按月分区但主键只有 id」建不起来，这是第一个坑。',
        },
        {
          title: '分区裁剪的触发条件与验证方法',
          scene: '分区表凭什么快：查询条件包含分区键时，别的分区<b>碰都不碰</b>。',
          body: '「分区裁剪」= 优化器按 WHERE 里的分区键排除无关分区。<b>常量条件</b>在计划期裁剪（explain 直接只列一个分区）；「参数化条件」要到执行期裁剪（计划里显示全部分区但实际只扫一个，看 analyze 的 actual）。验证永远用 <code>explain analyze</code> 的 actual 行数。',
          sql: `explain select count(*) from orders_p
where created_at >= '2026-08-01' and created_at < '2026-09-01';
-- Subplans Only / 只出现一个分区 = 裁剪生效

-- 条件不含分区键 = 全分区扫（24 个分区全摸一遍）
explain select count(*) from orders_p where total_amount > 1000;`,
          pitfall: '对分区键套函数（date_trunc(created_at)）会让裁剪失效--和索引失效同一个道理。',
        },
        {
          title: '分区键选择原则，以及分区带来的代价',
          scene: '「该不该分区、按什么分」的决策框架。',
          body: '选键原则：<b>高频查询条件里出现的那一列</b>（时间是最常见的）。代价照单全收：① 跨分区查询 / 不含分区键的查询反而变慢；② 全局唯一约束做不了（唯一键必须含分区键）；③ 分区键定了一般改不了；④ 运维复杂度（几百个子表的管理）。<b>索引能解决的性能问题不要用分区解决</b>。',
          sql: `-- 分区数量也要克制：几百个分区后规划开销开始可感知
select count(*) from pg_inherits
where inhparent = 'orders_p'::regclass;`,
          pitfall:
            '为了「显得专业」上分区、按 hash 分 16 区但查询从不带分区键 = 白白放大了复杂度。',
        },
        {
          title: 'CREATE INDEX CONCURRENTLY 不锁写',
          scene: '大促前要在百万行表上补索引--普通建索引期间全表写入被锁。',
          body: '普通 <code>create index</code> 拿排他锁，建完才放行写入；<code>concurrently</code> 分两趟扫表、不阻塞 DML，代价是耗时更长、不能在事务里跑。生产大表加索引的默认姿势。',
          sql: `-- 普通版：锁写直到完成
create index idx_created on orders_p (created_at);

-- 并发版：写入不受阻（另开窗口验证）
create index concurrently idx_created on orders_p (created_at);
-- 别忘了：不能包在 begin...commit 里`,
          pitfall:
            'concurrently 中途失败会留下 <b>invalid 索引</b>（占空间不可用），要 drop 掉重建：查 pg_index 的 indisvalid 列。',
        },
        {
          title: '大批量更新为什么要分批提交',
          scene: '一条 UPDATE 把 200 万行历史数据打标--事务日志爆炸、复制延迟、长锁。',
          body: '单个巨型事务的三重罪：WAL 洪峰（磁盘和复制跟不上）、锁持有全程（别人排队）、失败回滚代价同样是巨型。分批：每批 1 万行、循环提交，每批影响可控，失败从断点重跑。注意批间会有别的事务插进来，过滤条件要<b>幂等</b>（每批重新筛选还没处理的行）。',
          sql: `do $$
declare n int := 1;
begin
  while n > 0 loop
    with 批 as (
      select id from orders_p
      where status is null
      limit 10000
      for update skip locked
    )
    update orders_p o
    set status = 0
    from 批 where 批.id = o.id;
    get diagnostics n = row_count;   -- 没得改了就停
  end loop;
end $$;`,
          pitfall:
            '「一次更新所有行」的失败重试等于再来一遍全量；分批 + 幂等筛选才有断点续跑能力。',
        },
      ],
      drill: [
        '把 orders 按月做 RANGE 分区，迁移数据',
        '用 EXPLAIN 验证带时间条件的查询只扫了一个分区',
        '用 CONCURRENTLY 在大表上建索引，另开窗口验证写入不被阻塞',
        '写一个每次更新 1 万行、循环提交的批量更新脚本',
        '把最老的一个分区 <code>DETACH</code> 出来归档',
      ],
      drillAnswers: [
        {
          sql: `-- ① 分区父表：结构同 orders，但主键必须含分区键
create table orders_p (
  id           uuid not null,
  user_id      uuid not null,
  status       integer,
  total_amount numeric(10,2),
  created_at   timestamp not null,
  paid_at      timestamp,
  primary key (id, created_at)          -- 分区键必须进主键
) partition by range (created_at);

-- ② 数据跨两年多，用循环把逐月分区建齐
do $$
declare
  d date := date_trunc('month', current_date) - interval '24 months';
begin
  while d <= date_trunc('month', current_date) loop
    execute format(
      'create table orders_p_%s partition of orders_p for values from (%L) to (%L)',
      to_char(d, 'YYYY_MM'), d, d + interval '1 month');
    d := d + interval '1 month';
  end loop;
end $$;

-- ③ 迁移（练习库 100 万行一次搬可接受；线上要走双写或停写窗口）
insert into orders_p (id, user_id, status, total_amount, created_at, paid_at)
select id, user_id, status, total_amount, created_at, paid_at
from orders;

-- ④ 核对行数一致后切换
select (select count(*) from orders) as 老表,
       (select count(*) from orders_p) as 新表;
-- 一致后：drop table orders; alter table orders_p rename to orders;`,
          note: '第一个坑就是主键：分区键 created_at 不进主键，建表直接报错。超出所有分区范围的行 insert 会报错，线上可以再补一个 default 分区兜底。',
        },
        {
          sql: `explain analyze select count(*)
from orders_p
where created_at >= timestamp '2026-08-01'
  and created_at <  timestamp '2026-09-01';
-- 计划里只出现 1 个分区 = 裁剪生效

explain analyze select count(*) from orders_p where total_amount > 1000;
-- 条件不含分区键：25 个月分区全部被摸一遍`,
          note: '常量条件在计划期就裁剪（explain 里只见一个分区）；应用传参的参数化条件是执行期裁剪，计划里列全部分区但只有真扫的分区有 actual 耗时--验证永远看 actual。对分区键套函数会让裁剪失效。',
        },
        {
          sql: `-- 窗口 A：建索引（concurrently 不能包在 begin...commit 里）
create index concurrently idx_orders_p_created on orders_p (created_at);

-- 窗口 B：建索引期间持续写入，验证不被阻塞
insert into orders_p (id, user_id, status, total_amount, created_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000042',
        2, 99.00, timestamp '2026-08-29 10:00:00');`,
          note: '预期：窗口 B 的 insert 立刻返回，不排队。若 concurrently 中途失败会留下占空间但不可用的 invalid 索引：查 pg_index 的 indisvalid 列，drop 掉重建。',
        },
        {
          sql: `-- 逐批 commit 要用过程（DO 块里不能 commit）
create or replace procedure fix_status_batch()
language plpgsql as $$
declare
  n int := 1;
begin
  while n > 0 loop
    with 批 as (
      select id from orders_p
      where status is null
      order by id
      limit 10000
      for update skip locked
    )
    update orders_p o
    set status = 0
    from 批 where 批.id = o.id;
    get diagnostics n = row_count;   -- 本批影响行数，0 就停
    commit;                          -- 每批一提交：锁、WAL、回滚代价都可控
  end loop;
end $$;

call fix_status_batch();`,
          note: '每批的筛选条件是幂等的（status is null 的行越改越少），中途失败从断点重跑不会重复处理。本库脏数据只有几百行，一批就跑完--重点是掌握「循环 + 提交 + 幂等筛选」的结构。',
        },
        {
          sql: `-- 先看分区清单，确认最老的那个
select c.relname as 分区
from pg_inherits i
join pg_class c on c.oid = i.inhrelid
where i.inhparent = 'orders_p'::regclass
order by 1
limit 1;

alter table orders_p detach partition orders_p_2024_09;
-- detach 后它变成一张普通表，数据原样还在

-- 核对行数后归档下线
\\copy (select * from orders_p_2024_09) to 'orders_2024_09.csv' csv header
drop table orders_p_2024_09;`,
          note: 'detach 只是改元数据，秒级完成、对父表影响极小。之后子表是独立普通表：先 \\copy 导出核对，再 drop--老数据从主查询路径彻底消失，文件留档。这就是「归档硬删」对软删除的胜利。',
        },
      ],
      pass: '能说出分区的两个好处和两个代价（如跨分区查询变慢、分区键不能随便改）。',
    },
    {
      no: 46,
      title: '仪表盘拖慢了全库：视图、物化视图与权限',
      brief:
        '老板天天开的后台仪表盘每次都实时算全量报表，把库拖慢了。你用物化视图提速，顺手给运营开了只读账号。',
      split: [40, 65, 15],
      learn: [
        {
          title: '视图不存数据、物化视图存数据',
          scene: '老板的仪表盘每次打开都实时聚合百万行--先把「视图」和「物化视图」分清楚。',
          body: '<b>视图</b> = 存起来的一条查询，每次 select 都重新执行（不省任何计算，价值在封装和安全）；<b>物化视图</b> = 查询<b>结果</b>落盘，查它就是查表，毫秒级。代价：数据是快照，必须定期 REFRESH 才更新。仪表盘这种「容忍分钟级延迟、查询巨重」的场景是物化视图的本命。',
          sql: `create view v_monthly as
select date_trunc('month', created_at) as 月份, count(*), sum(total_amount)
from orders group by 1;                    -- 每次都实时算

create materialized view mv_monthly as
select date_trunc('month', created_at) as 月份, count(*), sum(total_amount)
from orders group by 1;                    -- 算一次存下来

refresh materialized view mv_monthly;      -- 手动更新快照`,
          pitfall:
            '视图改名/换定义不影响底表；但「以为视图能提速」是最常见误解--它是查询的别名，不是缓存。',
        },
        {
          title: 'REFRESH MATERIALIZED VIEW CONCURRENTLY 需要唯一索引',
          scene: '普通 REFRESH 期间仪表盘直接查询报错/排队--大促时这不能忍。',
          body: '普通 refresh 拿排他锁：刷新期间读也被挡。<code>concurrently</code> 版对比新旧结果、增量替换，<b>刷新期间可读</b>。代价和前提各一：刷新本身更慢；<b>物化视图上必须有唯一索引</b>。',
          sql: `create unique index on mv_monthly (月份);   -- 前提

refresh materialized view concurrently mv_monthly;
-- 另一个窗口此刻查询 mv_monthly 不受阻塞`,
          pitfall:
            '没有唯一索引时用 concurrently 直接报错--这是「为什么刷新锁表」排查时最先查的一项。',
        },
        {
          title: '物化视图的刷新代价与数据新鲜度取舍',
          scene: '刷新多勤？这是个业务问题不是技术问题。',
          body: '刷新 = 全量（或增量）重算：表越大刷新越贵，还占双倍空间（新旧快照切换）。决策框架：业务能容忍多旧的数据？分钟级延迟换十倍查询提速，绝大多数报表都愿意。<b>定时刷新</b>（pg_cron / crontab）+ 查询时标注「数据截至 HH:MM」是标准交付形态。',
          sql: `-- 看物化视图多大、上次刷新何时（自己维护一列刷新时间也行）
select relname, pg_size_pretty(pg_relation_size(relname::regclass))
from pg_class where relname = 'mv_monthly';`,
          pitfall: '对「必须实时」的数据上物化视图是方向错误--那该做的是优化查询本身或上缓存层。',
        },
        {
          title: '角色、GRANT 与最小权限原则',
          scene: '运营要查数据，总不能把超级用户密码给他。',
          body: '<code>create role readonly nologin</code> 建角色，<code>grant select on 表 to readonly</code> 授权，再把登录账号（role login + 密码）加进角色。最小权限原则：每个账号的权限刚好够干自己的活、多一点都不给--运营只读，分析只读几张表，写入只走应用账号。',
          sql: `create role readonly nologin;
grant usage on schema public to readonly;
grant select on all tables in schema public to readonly;

create role ops_report login password '...';
grant readonly to ops_report;    -- 运营账号继承只读权限

-- 验证越权：用 ops_report 连上后
-- update orders set status = 1;   -- ERROR: permission denied`,
          pitfall:
            '新表不会自动继承 grant（除非 alter default privileges）--「加了张表运营看不到」先查这个。',
        },
        {
          title: '行级安全（RLS）简介',
          scene: '「每个用户只能看自己的订单」--不用改任何查询，数据库层强制。',
          body: 'RLS 给表挂策略：<code>alter table ... enable row level security</code> 开关 + <code>create policy ... using (...)</code> 定义哪些行可见。开启后，普通角色查这张表自动被策略过滤（比如 <code>user_id = current_setting(...)</code>）。多租户 SaaS 的标配防线。',
          sql: `alter table orders enable row level security;

create policy own_orders on orders
  using (user_id = current_setting('app.user_id')::uuid);
-- 会话里 set app.user_id = '...' 后，select 自动只见自己的单`,
          pitfall:
            '表的 <b>owner 默认绕过 RLS</b>--要真拦住自己得 <code>force row level security</code>；应用连接千万别用 owner 账号。',
        },
      ],
      drill: [
        '把 D13 的月报查询建成普通视图',
        '改成物化视图，对比两者查询耗时',
        '加唯一索引后用 CONCURRENTLY 刷新，验证刷新期间可读',
        '建一个只读角色，授予部分表的 SELECT 权限并测试越权访问',
        '给 orders 加一条 RLS 策略，让「用户」只能看自己的订单',
      ],
      drillAnswers: [
        {
          sql: `create view v_monthly as
select date_trunc('month', created_at) as 月份,
       count(*) as 单数,
       sum(total_amount) as gmv
from orders
group by 1;

select * from v_monthly order by 月份;`,
          note: '视图只是把一条查询存了起来：对它 select 每次都重新聚合百万行，\\timing 一开就能感受到。它的价值是封装和权限边界，不是提速。',
        },
        {
          sql: `create materialized view mv_monthly as
select date_trunc('month', created_at) as 月份,
       count(*) as 单数,
       sum(total_amount) as gmv
from orders
group by 1;

-- 对比（\\timing on）
select * from v_monthly  order by 月份;   -- 实时聚合：秒级
select * from mv_monthly order by 月份;   -- 查落盘快照：毫秒级`,
          note: '预期：物化视图快两三个量级。代价是数据停在建立那一刻--往 orders 插一单，mv_monthly 里看不到，必须 refresh 才更新。',
        },
        {
          sql: `-- 前提：物化视图上必须有唯一索引
create unique index on mv_monthly (月份);

-- 窗口 A：刷新（concurrently 版刷新期间可读）
refresh materialized view concurrently mv_monthly;

-- 窗口 B：刷新进行时反复查
select * from mv_monthly order by 月份 desc limit 1;`,
          note: '预期：窗口 B 的查询全部正常返回。对照组：去掉唯一索引改用普通 refresh，窗口 B 会被挡到刷新结束；而没有唯一索引时用 concurrently 会直接报错--这是「刷新为什么锁表」排查的第一项。',
        },
        {
          sql: `create role readonly nologin;
grant usage on schema public to readonly;
grant select on orders, order_items, products to readonly;   -- 只给需要的表

create role ops_report login password 'ops_dev_123';
grant readonly to ops_report;

-- 新开连接验证：psql "dbname=shop user=ops_report" 后
-- select count(*) from orders;    -- OK
-- select * from users;            -- ERROR: permission denied（没授权这张表）
-- update orders set status = 1;   -- ERROR: permission denied`,
          note: '最小权限：ops_report 只能读授权过的三张表，写不进任何表。注意新表不会自动继承 grant，「加了张表运营看不到」先查 alter default privileges。',
        },
        {
          sql: `alter table orders enable row level security;

create policy own_orders on orders
  using (user_id = current_setting('app.user_id', true)::uuid);

-- 用普通账号（如 ops_report，已授过 orders 的 select）连上后测试：
-- set app.user_id = '00000000-0000-0000-0000-000000000042';
-- select count(*) from orders;   -- 只剩该用户的单
-- reset app.user_id;`,
          note: 'current_setting 的第二个参数 true：参数没设置时返回 NULL 而不是报错，策略判假=一行都看不到（安全默认）。两个坑：超级用户和表 owner 天生绕过 RLS，必须换普通账号验证，或 alter table orders force row level security。',
        },
      ],
      pass: '能说清物化视图的适用场景，以及它带来的数据延迟问题怎么权衡。',
    },
    {
      no: 47,
      title: '大促前的代码评审：反模式清点',
      brief: '大促前的代码评审，你把这一年里见过的反模式整理成清单，替后端把了关。',
      tags: ['hot'],
      split: [45, 50, 25],
      learn: [
        {
          title: 'N+1 查询、SELECT *、大事务、无限制 IN 列表',
          scene: '后端代码评审，四大常客一个不落。',
          body: '① <b>N+1</b>：取 100 个订单再循环逐个查用户 = 101 次往返，改成 join 或 <code>where id = any(数组)</code> 一次取回；② <b>select *</b>（D44 讲过三宗罪）；③ <b>大事务</b>：事务里夹外部 HTTP 调用，锁陪你等超时；④ <b>无限制 IN 列表</b>：塞一万个 id 进 in (...)，解析慢、计划烂，改 values join / 临时表 / 数组。',
          sql: `-- N+1 的解药：一次取回
select o.*, u.name from orders o join users u on u.id = o.user_id
where o.id = any($1::uuid[]);    -- 数组参数版，替代 in (一万个字面量)`,
          pitfall:
            'N+1 的识别：应用日志里短时间海量<b>相同模板</b>语句；ORM 的懒加载是重灾区，列表场景要显式预取。',
        },
        {
          title: '隐式类型转换、软删除导致的表膨胀',
          scene: '另外两个慢性病：一个杀索引，一个悄悄膨胀。',
          body: '① <b>隐式转换</b>：varchar 列 = 整数，索引失效（D41）；② <b>软删除</b>：全表 update 置 is_deleted，看似温柔实则：死元组暴涨（vacuum 压力）、表和索引双膨胀、每条查询都要带过滤条件（漏写就是事故）。历史数据定期<b>归档硬删</b>（D45 的分区 detach）才是正解。',
          sql: `-- 软删除的膨胀体检
select n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup, 0), 1) as 死活比
from pg_stat_user_tables where relname = 'orders';`,
          pitfall:
            '软删除不是免费开关：它的账单（膨胀 + 遗忘过滤条件 + 索引全量变大）往往在半年后才寄到。',
        },
        {
          title: 'count(*) 慢的成因与近似方案',
          scene: '「为什么 PG 的 count 这么慢，MySQL 不是挺快？」--考点。',
          body: 'PG 的 count 必须<b>逐行检查可见性</b>（MVCC：每行版本对不同事务可见性不同，索引里没有这个信息），所以再好的索引也只能加速定位、不能免检。MySQL 的 MyISAM 引擎表头存了行数所以快，但那是「不支持事务的快」，InnoDB 同样要数。方案：reltuples 估算 / 计数表 / 业务上接受「约 N 条」（D44 详述）。',
          sql: `explain analyze select count(*) from orders;
-- 计划再优也是全量可见性检查：这就是它的成本下限`,
          pitfall:
            '「MySQL count 快 PG 慢所以 PG 不行」是拿古董引擎（MyISAM）比的错觉，面试要能拆穿。',
        },
        {
          title: 'EAV 模型的代价、把数据库当消息队列的取舍',
          scene: '评审里最「聪明」的两个设计，往往最贵。',
          body: '① <b>EAV</b>（实体-属性-值三列表）：想存任意自定义属性。代价：查一个完整对象要 pivot 出几十个 join、类型约束丢失（value 列只能用 text）、无法建外键。真有半结构化需求，PG 的 <b>jsonb</b> 是更体面的答案。② <b>拿表当队列</b>（状态列 + 轮询）：并发抢占有竞态，必须 <code>for update skip locked</code>（D35 的方案）；撑得住小规模，量大还是上消息中间件。',
          sql: `-- EAV 的日常：想拿「颜色」就得 pivot
select e.id,
       max(case when a.attr = '颜色' then a.value end) as 颜色,
       max(case when a.attr = '尺寸' then a.value end) as 尺寸
from entities e join eav a on a.entity_id = e.id
group by e.id;   -- 属性一多就是灾难现场`,
          pitfall:
            '两个模式的共同话术是「灵活」；共同账单是「查询地狱 + 约束真空」。评审时听到「灵活」先警惕。',
        },
      ],
      drill: [
        '写出 N+1 的具体现象，并给出 JOIN 或批量查询的改法',
        '实测三种 count 方案（精确 / reltuples 估算 / 计数表）的耗时',
        '找出自己这个库里可能存在的 EAV 或软删除膨胀',
        'IN 列表塞 1 万个 id，观察计划与耗时，改成 <code>VALUES</code> join 或临时表',
        '整理成 <code>antipatterns.md</code>，每条含「为什么坏 + 怎么改」',
      ],
      drillAnswers: [
        {
          sql: `-- 现象：后端先取 100 个订单，再循环逐个查用户 = 101 次往返
-- 日志特征：同一语句模板几毫秒内刷屏 100 次

-- 改法一：join 一次取回
select o.id, o.total_amount, u.name as 用户名
from orders o
join users u on u.id = o.user_id
where o.status = 2
order by o.created_at desc
limit 100;

-- 改法二：数组参数批量取（ORM 里就是预取）
select id, name from users
where id = any((select array_agg(user_id)
                from (select user_id from orders
                      where status = 2
                      order by created_at desc limit 100) t));`,
          note: '识别特征比改法更重要：应用日志里同一模板的语句海量出现，基本就是 N+1。ORM 懒加载是重灾区，列表场景必须显式预取。',
        },
        {
          sql: `\\timing on
-- ① 精确：百万行逐行可见性检查
select count(*) from orders;

-- ② 估算：读统计信息
select reltuples::bigint from pg_class where relname = 'orders';

-- ③ 计数表：预聚合好，查询只扫几十行
create table order_counts (status int, cnt bigint);
insert into order_counts
select status, count(*) from orders group by status;
select sum(cnt) from order_counts;`,
          note: '预期：②③毫秒级，①慢两三个量级。计数表要靠触发器或应用双写维护增量--用查询提速换写入侧的代价和复杂度。',
        },
        {
          sql: `-- 软删除膨胀体检：死活比持续偏高 = vacuum 跟不上
select relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup, 0), 1) as 死活比
from pg_stat_user_tables
order by n_dead_tup desc;

-- EAV 排查：看有没有「一张表一个 value 列」的设计
select table_name, column_name, data_type
from information_schema.columns
where column_name in ('attr', 'attribute', 'value', 'entity_id');`,
          note: '本库按课程设计没有 EAV 和软删除列，这题的产出是排查动作本身：两条体检 SQL + \\d 过一遍表结构确认。真实项目里死活比超过 20% 就要警惕（先 vacuum，再查是不是长事务挡住了它）。',
        },
        {
          sql: `-- ① 复现：拼一条带一万个字面量的 in 查询（\\gexec 把查询结果当语句执行）
select format(
  'explain analyze select count(*) from orders where id in (%s)',
  (select string_agg(quote_literal(id::text), ',')
   from (select id from orders limit 10000) t)
)\\gexec

-- ② 正面：数组参数
\\timing on
select count(*) from orders
where id = any((select array_agg(id)
                from (select id from orders limit 10000) t));

-- ③ 正面：临时表 join
create temp table t_ids (id uuid primary key);
insert into t_ids select id from orders limit 10000;
select count(*) from orders o join t_ids on t_ids.id = o.id;`,
          note: '预期：三者行数一致，但①要先把一万个字面量解析成语法树，语句越长解析和计划开销越大（这部分耗时 explain analyze 里看不到，用 \\timing 测端到端）。②③把 id 当数据传：语句恒短、计划稳定，顺便也是防注入的正道。',
        },
        {
          note: 'antipatterns.md 每条三段式：反模式名 + 为什么坏（讲机制，不讲感觉）+ 怎么改（带改法示例或 SQL）。本天可覆盖：N+1、select *、大事务、无限制 IN、隐式类型转换、软删除膨胀、count(*) 滥用、EAV、拿表当队列--凑满 8 条，每条都能对照自己库里的证据。',
        },
      ],
      pass: '反模式清单至少 8 条，每条都能说出改法。',
    },
    {
      no: 48,
      title: '秒杀压测：1000 人抢 100 件，超卖了 37 件',
      brief: '大促压测结果：1000 个并发抢 100 件库存，超卖 37 件。你要用三种武器把超卖清零。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: '用唯一索引 + 幂等键实现幂等写入',
          scene: '同一用户连点五次「抢购」按钮，只能成交一件--第一道防线。',
          body: '把「同一件事」定义成唯一键（用户 + 活动 / 商品），建唯一约束 + <code>on conflict do nothing</code>。重复请求在数据库层被无声吞掉，第二次起的插入<b>根本不生效</b>。这是所有幂等设计里最便宜、最可靠的一档：不依赖任何应用层逻辑。',
          sql: `create unique index uq_seckill on seckill_orders (user_id, activity_id);

insert into seckill_orders(user_id, activity_id, ...)
values (:uid, :aid, ...)
on conflict (user_id, activity_id) do nothing
returning id;   -- 有返回 = 抢到，无返回 = 重复请求`,
          pitfall:
            '幂等键的颗粒度是<b>业务</b>定义的：用户+活动？用户+商品+秒？定义错颗粒度，要么吞单要么重复。',
        },
        {
          title: '乐观锁：版本号 / CAS 更新与重试策略',
          scene: '「读-改-写」三步之间数据被人改了怎么办--提交时校验，冲突就重试。',
          body: '<code>update ... set x = 新值, version = version + 1 where id = ? and version = 旧version</code>：影响行数为 0 说明被抢先，应用层重读再试。没有锁等待、吞吐高，适合<b>冲突少</b>的场景；冲突率高时重试风暴反而拖垮吞吐。',
          sql: `-- 先读：select stock, version from products where id = 1;  -- version=5
update products
set stock = stock - 1, version = version + 1
where id = 1 and version = 5;      -- CAS
-- 返回 0 行 = 被别人抢先改了：重读、重算、重试（应用层循环）`,
          pitfall:
            'CAS 的 where 条件是「旧值」不是「目标值」--写成 stock &gt;= 0 就变成了下一条的原子扣减，语义混了。',
        },
        {
          title: '悲观锁：SELECT ... FOR UPDATE',
          scene: '复杂的多步「读-算-写」，一步锁住，别人排队。',
          body: '事务里先 <code>select ... for update</code> 把行锁住，读到的值保证不被别人动，算完再 update、commit 放锁。绝对正确、逻辑最直白；代价是<b>串行化</b>：后到的全部排队，吞吐由事务长度决定。',
          sql: `begin;
select stock from products where id = 1 for update;   -- 锁住
-- 应用判断 stock > 0
update products set stock = stock - 1 where id = 1;
commit;   -- 放锁，下一个排队者进来`,
          pitfall:
            '锁持有时间 = 整个事务长度：锁住行之后再调外部接口、发短信，就是把全队列按住陪等。',
        },
        {
          title: '原子扣减：UPDATE ... SET stock = stock - 1 WHERE stock &gt;= 1',
          scene: '其实大多数「防超卖」只需要这一条语句。',
          body: '把「判断 + 扣减」压进<b>一条 UPDATE</b>：<code>set stock = stock - 1 where id = ? and stock &gt;= 1</code>。单语句的原子性由数据库保证，不为 0 就扣不成负。影响行数 0 = 没抢到，应用直接处理失败分支。没有读-改-写间隙、没有竞态窗口。',
          sql: `update products
set stock = stock - 1
where id = 1 and stock >= 1
returning stock;    -- 返回新库存 = 成功；无返回 = 售罄`,
          pitfall:
            '条件是 <code>stock &gt;= 1</code> 而不是应用层先判断--判断放应用层，间隙里库存就被别人扣了（这就是当初超卖 37 件的机制）。',
        },
        {
          title: '三种方案的并发吞吐与失败率差异',
          scene: '三把武器都造好了，压测台上见真章。',
          body: '① <b>原子扣减</b>：单字段扣减的最优解，无重试无等待，吞吐最高；② <b>悲观锁</b>：多步业务逻辑（扣库存 + 建订单 + 记流水）必须串行时的正确解，吞吐受事务长度限制；③ <b>乐观锁</b>：冲突稀疏时近于无锁，冲突密集时重试风暴。选型口诀：简单扣减用原子，复杂流转用悲观，冲突少才乐观。',
          sql: `-- 压测脚本骨架：pgbench 或多会话并发
-- 每个会话循环执行：
update products set stock = stock - 1
where id = 1 and stock >= 1;
-- 记录三种方案下：成功数 / 失败数 / 平均耗时 / 超卖数（必须 = 0）`,
          pitfall:
            '别为「显得高级」上乐观锁重试框架--简单场景一条原子 UPDATE 完胜，工程判断力恰恰体现在克制。',
        },
      ],
      drill: [
        '用唯一索引 + <code>ON CONFLICT DO NOTHING</code> 实现幂等下单',
        '用版本号乐观锁扣库存，模拟冲突后重试',
        '用 <code>FOR UPDATE</code> 悲观锁扣库存',
        '用原子条件更新扣库存，验证不会扣成负数',
        '用 <code>pgbench</code> 或多个会话并发压测，对比三种方案的成功率与耗时',
      ],
      drillAnswers: [
        {
          sql: `-- 秒杀订单表：幂等键 = (user_id, activity_id)，一人一单
create table seckill_orders (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  activity_id int  not null,
  created_at  timestamp not null default now(),
  unique (user_id, activity_id)
);

-- 同一用户连点五次 = 同一条语句发五遍，连跑五遍看效果
insert into seckill_orders (user_id, activity_id)
values ('00000000-0000-0000-0000-000000000042', 1)
on conflict (user_id, activity_id) do nothing
returning id;

select * from seckill_orders;   -- 无论跑几遍，永远只有一行`,
          note: '只有第一次 returning 返回 id（= 抢到），之后每次都返回 0 行=重复请求在数据库层被无声吞掉。幂等键的颗粒度是业务定的：用户+活动还是用户+商品，想清楚再建。',
        },
        {
          sql: `-- products 加版本号
alter table products add column if not exists version int not null default 0;

-- 第一步：读（假设拿到 stock=100, version=5）
select id, stock, version from products order by id limit 1;

-- 第二步：CAS 写--把上面查到的 id 代进来
update products
set stock = stock - 1, version = version + 1
where id = '查到的id'::uuid
  and version = 5;      -- UPDATE 1：成功

-- 冲突现场：还拿旧版本 5 再试一次（另一个会话已把它改成 6）
update products
set stock = stock - 1, version = version + 1
where id = '查到的id'::uuid
  and version = 5;      -- UPDATE 0：被抢先`,
          note: 'where 带的是「读到的旧版本号」，不是目标值--写成 stock >= 0 就变成原子扣减了，语义混掉。返回 0 行 = 冲突，重读、重算、重试的循环放在应用层；冲突密集时重试风暴会拖垮吞吐，所以乐观锁只适合冲突稀疏的场景。',
        },
        {
          sql: `-- 窗口 A（事务一）：
begin;
select id, stock from products
where id = '某商品id'::uuid
for update;                        -- 行锁到手，别人排队
-- 此处应用判断 stock > 0：锁保护下读到的值不会被人偷改
update products set stock = stock - 1
where id = '某商品id'::uuid;
commit;                            -- 放锁，下一个排队者进来

-- 窗口 B：在 A 未 commit 时跑同样的 select ... for update
-- 会一直卡住，直到 A commit 才返回`,
          note: '绝对正确、逻辑最直白，代价是串行化：吞吐由事务长度决定。锁住行之后千万别再调外部接口、发短信--那等于按住整个队列陪等。',
        },
        {
          sql: `-- 把第一个商品的库存压到 1，再连扣三次
update products set stock = 1
where id = (select id from products order by id limit 1);

update products set stock = stock - 1
where id = (select id from products order by id limit 1)
  and stock >= 1
returning stock;                   -- 第一次返回 0
-- 同一条再跑两遍：返回 0 行 = 售罄

select stock from products
where id = (select id from products order by id limit 1);   -- 0，永远不会是 -1`,
          note: '「判断 + 扣减」压进同一条 UPDATE，原子性由单语句事务保证，不存在读-改-写的竞态窗口。当初超卖 37 件的病根，就是把 stock > 0 的判断放在了应用层。',
        },
        {
          sql: `-- bench.sql：pgbench 每个事务干两件事（幂等下单 + 原子扣减）
\\set uid random(1, 10000)
insert into seckill_orders (user_id, activity_id)
values ('00000000-0000-0000-0000-' || lpad(:uid::text, 12, '0'), 1)
on conflict (user_id, activity_id) do nothing;

update products set stock = stock - 1
where id = '压测商品id'::uuid and stock >= 1;

-- 压测前重置现场：
-- update products set stock = 100 where id = '压测商品id';
-- truncate seckill_orders;

-- 跑法：pgbench -c 50 -j 4 -t 20 -f bench.sql shop

-- 压测后核对（超卖必须为 0）
select stock from products where id = '压测商品id';
select count(*) as 抢到人数 from seckill_orders;   -- 不得超过 100`,
          note: '记录指标：TPS、平均/最大延迟、成功扣减数（100 - stock）、抢到人数、超卖数（必须 = 0）。三个变体各跑一轮：原子扣减直接跑；悲观锁把两条语句包进 begin...commit；乐观锁在脚本外加重试循环--预期原子版吞吐最高。',
        },
      ],
      pass: '能讲清三种防超卖方案各自的适用场景和代价。',
    },
    {
      no: 49,
      title: '大促收官：写一份优化案例文档',
      brief: '大促平稳收官。你把 W6–W7 的优化经历写成文档--这将是简历上最硬的一条。',
      tags: ['lab'],
      split: [0, 90, 30],
      learnLabel: '文档结构',
      drillLabel: '练 · 120 min',
      learn: [
        '背景 -&gt; 现象 -&gt; 定位过程 -&gt; 计划对比 -&gt; 方案 -&gt; 结果数据 -&gt; 反思',
        '关键：每一步都要有<b>数字</b>和<b>证据</b>',
      ],
      drill: [
        '把 D42 的三条优化整理成一份完整案例文档',
        '贴上优化前后的执行计划截图或文本',
        '写出「为什么这个方案，而不是另一个方案」的取舍',
        '写一段 3 分钟的口头版本，录音听一遍',
        '提炼成简历上的一句话（带数字）',
      ],
      drillAnswers: [
        {
          note: '七段结构：背景（库的量级、业务场景，两三句）-> 现象（谁报的、什么症状，量化成超时/耗时数字）-> 定位过程（用了什么工具拿到哪条 SQL，贴 pg_stat_statements 或慢日志的证据）-> 计划对比（优化前后 explain analyze 并排，标出最贵节点怎么消失的）-> 方案（改了什么、为什么）-> 结果数据（前后耗时对比表）-> 反思（重来会怎么做、监控能不能更早发现）。每一段都要有数字，没有数字的段落删掉重写。',
        },
        {
          note: '贴 explain analyze 的文本原文即可（截图也行）：优化前的计划标出耗时最大的节点、rows 估算与 actual 的偏差；优化后贴同一条查询的计划，用箭头标出变化（如 Seq Scan -> Index Scan、扫描行数从百万降到 20）。前后并排是关键，单独一张计划说服力减半。',
        },
        {
          note: '取舍段写法：列至少两个候选方案、各自的代价、一句结论。例：深分页选 keyset 而不是延迟关联，因为后台只有上一页/下一页的场景、keyset 耗时恒定；仪表盘选物化视图而不是优化原查询，因为业务容忍分钟级延迟、而实时优化要动五张表的 join。没有取舍过程的文档 = 没做过选择题，面试官一眼看穿。',
        },
        {
          note: '口头版结构：一句话现象 -> 定位用了哪两步 -> 方案一句话 -> 结果数字（从 X 到 Y）-> 一句反思。对着手机录 3 分钟再回放：卡壳的地方就是还没想透的地方，回文档补上；第二遍脱稿讲，不许念稿。',
        },
        {
          note: '简历句式：「用 A 手段把 B 指标从 X 做到 Y」。例：定位并修复后台深分页慢查询，列表接口 P99 从 8s 降到 50ms（keyset 分页 + 延迟关联）；或：为百万订单表设计按月分区归档方案，历史查询扫描量降 90%。X/Y 必须是文档里真实测过的数字--面试官一定会追问这个数字怎么来的。',
        },
      ],
      pass: '文档能独立看懂；口头版本 3 分钟内讲完且每句都经得起追问。',
    },
  ],
};
