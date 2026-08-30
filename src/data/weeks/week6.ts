import type { Week } from '../../types/curriculum';

export const week6: Week = {
  no: 6,
  title: '两年之后：索引与执行计划',
  short: '索引与执行计划',
  story:
    '时间快进：公司跑了一年多，订单冲到一百万，日报从一开始的秒出变成一分多钟。老板的原话：「它是不是坏了？」你的任务：让它快回去。',
  goal: '目标：看得懂 EXPLAIN ANALYZE，能说清一条查询为什么慢、加什么索引能救。',
  days: [
    {
      no: 36,
      title: '时间快进：百万订单与人生第一个索引',
      brief:
        '「时间快进」日：把库冲到 100 万订单 / 250 万明细 / 80 万支付 / 50 万登录。灌完你会发现，上周还秒出的查询现在慢得离谱--先建第一个索引救急，顺便搞懂它为什么快。',
      tags: ['hot'],
      split: [40, 55, 25],
      learn: [
        {
          title: 'generate_series 大灌数的套路（现在你能看懂 seed.sql 了）',
          scene: 'seed.sql 的 W6 段把库从 5 万冲到百万--当年是天书，今天是套路。',
          body: '公式：<code>insert into t select ... from generate_series(...)</code>，配上 <code>random()</code> 造分布、<code>setseed()</code> 固定随机、日期锚定 current_date 平移出「过去两年」。百万行一条语句几十秒，学习成本最低的压测手段。',
          sql: `insert into orders(id, user_id, status, total_amount, created_at)
select gen_random_uuid(),
       (select id from users offset floor(random()*10000) limit 1),
       (array[1,2,2,2,3])[1 + floor(random()*5)],
       round((random()*990 + 10)::numeric, 2),
       current_date - (random()*730)::int
from generate_series(1, 1000000);
analyze orders;   -- 灌完必做，下一条讲为什么`,
          pitfall: '灌完不 ANALYZE，统计信息还停留在 5 万行时代，优化器按旧地图走路（D41 详述）。',
        },
        {
          title: 'B+ 树结构：为什么不是二叉树、不是哈希表；树高与磁盘 IO 的关系',
          scene: '第一个索引建完，查询从 400ms 变 1ms--凭什么快 400 倍？',
          body: '磁盘按<b>页</b>（PG 8KB）读取，一次 IO 拿一页。B+ 树把每个节点做成一整页、一个节点上百个分叉，所以<b>矮胖</b>：100 万行只要 3~4 层 = 3~4 次 IO。二叉树高瘦（20 层 = 20 次 IO）；哈希表虽是 O(1)，但不支持范围和排序。<b>树高 = IO 次数</b>，这就是快的全部本质。',
          sql: `-- 对比：按主键点查
select * from orders where user_id = '某个uuid';      -- 无索引：全表扫
create index on orders(user_id);
select * from orders where user_id = '某个uuid';      -- Index Scan：3~4 次 IO`,
          pitfall:
            'B+ 树 vs B 树的考点：数据全在<b>叶子层</b>、叶子间有链表--范围扫描时顺藤摸瓜，不用回到上层。',
        },
        {
          title: '<b>PG 是堆表 + 二级索引，没有聚簇索引</b>--与 MySQL InnoDB 的关键差异',
          scene: '面试官问：「PG 和 MySQL 的索引有什么区别？」--今天这个答案是加分位。',
          body: 'MySQL InnoDB：表<b>就是</b>主键索引（聚簇），数据按主键序物理存放，二级索引叶子存主键值，查完还要再走一遍主键树。PG：表是无序<b>堆</b>（heap），所有索引（含主键）一律是二级索引，叶子存 (键, ctid 物理地址)。后果：PG 的主键查询也要「回堆」，但插入没有聚簇键的排序负担。',
          sql: `select ctid, id from orders limit 3;   -- ctid = (页号, 行偏移)，行的物理地址
-- 索引叶子里存的就是它：查到键 -> 拿 ctid -> 回堆取整行`,
          pitfall:
            'PG 可以用 CLUSTER 命令按某索引重排物理顺序，但那是一次性操作、不是 MySQL 那种「聚簇索引」。',
        },
        {
          title: '「回表」在 PG 里是什么（索引 -&gt; heap 取行）',
          scene: '「回表」这个词总在性能文章里出现，在 PG 里有确切对应物。',
          body: 'Index Scan 两步走：索引里查到键、拿到 ctid；再拿 ctid 去堆里取整行。第二步就是回表。查询需要的列<b>全在索引里</b>时，理论上可以不回表--Index Only Scan（D38 展开）。回表是随机 IO，取的行一多，索引反而不如全表扫。',
          sql: `explain select * from orders where user_id = '...';
-- Index Scan using ... -> Heap Fetches 发生在扫描节点内部
explain select user_id from orders where user_id = '...';
-- 只取索引里有的列：可能变成 Index Only Scan`,
          pitfall:
            '「建了索引反而更慢」的大多数场景，就是回表的随机 IO 输给了全表扫的顺序 IO（D40 展开）。',
        },
        {
          title: '索引的三项代价：空间、写入放大、维护',
          scene: '想把每列都建上索引--先看账单。',
          body: '① <b>空间</b>：索引本身占磁盘（能到表的一半大小）；② <b>写入放大</b>：每次 insert / update 都要同步维护所有相关索引；③ <b>维护</b>：膨胀、失效索引清理、优化器选择空间变大。索引是「读加速、读付费」的交易，不是白捡的。',
          sql: `select relname, pg_size_pretty(pg_relation_size(relname::regclass)) as 大小
from pg_class
where relkind in ('r', 'i') and relname like 'orders%'
order by pg_relation_size(relname::regclass) desc;`,
          pitfall:
            '写多读少的表，索引是纯负担；没人查询的索引是纯负债（pg_stat_user_indexes 的 idx_scan = 0 可以揪出来）。',
        },
      ],
      drill: [
        '跑 seed.sql「W6」段大灌数，各表 <code>count(*)</code> 核对行数',
        '记录 3 条常用查询的基线耗时（<code>\\timing</code>，比如按用户查订单）',
        '对 <code>orders.user_id</code> 无索引查询计时，建索引后再计时，记录倍数',
        '用 <code>pg_relation_size</code> 对比表和索引各自占多大',
        '在有索引和无索引的表上各批量插 10 万行，对比写入耗时',
      ],
      drillAnswers: [
        {
          sql: `-- seed.sql 的 §F 段共五条语句，psql 里逐条执行（整段要跑几分钟）
-- 灌完必做：统计信息还停留在 5 万行时代
analyze orders; analyze order_items; analyze payments; analyze user_logins;

select (select count(*) from orders)      as 订单,     -- ≈100 万
       (select count(*) from order_items) as 明细,     -- ≈250 万
       (select count(*) from payments)    as 支付流水, -- ≈80 万
       (select count(*) from user_logins) as 登录日志; -- ≈50 万`,
          note: '行数只对量级：明细每单随机 1~4 件、支付流水只给已支付订单。D41 会看到「灌完不 ANALYZE」的后果，这里先把习惯养成。',
        },
        {
          sql: `\\timing on

-- ① 点查：某用户的订单
select * from orders where user_id = '00000000-0000-0000-0000-000000000042';
-- ② 日报：近 30 天每日单量与 GMV
select created_at::date, count(*), sum(total_amount)
from orders
where created_at >= current_date - 30
group by 1;
-- ③ 连接聚合：各城市已支付订单数
select u.city, count(*)
from orders o join users u on u.id = o.user_id
where o.status = 2
group by 1;`,
          note: '把三条耗时原样写进 notes.md--这是本周的「体检基线」，D42 算提升倍数全靠它。此刻 user_id 还没索引，①预计几百 ms（100 万行全表扫），别慌，下一题就救它。',
        },
        {
          sql: `\\timing on

-- 无索引（学栏示例若建过，先删掉）
drop index if exists orders_user_id_idx;
select * from orders where user_id = '00000000-0000-0000-0000-000000000042';
-- ≈几百 ms：Seq Scan 扫全部 100 万行

create index on orders (user_id);
select * from orders where user_id = '00000000-0000-0000-0000-000000000042';
-- ≈个位数 ms：Index Scan，B+ 树 3~4 层 = 3~4 次 IO`,
          note: '预期差一到两个数量级（机器不同有浮动），把两个数都记下来--今天的过关标准就是说出这个倍数。UUID 用 seed 的确定性映射（编号 42 拼出来的这个）保证一定查得到。',
        },
        {
          sql: `select relname,
       pg_size_pretty(pg_relation_size(relname::regclass)) as 大小
from pg_class
where relkind in ('r', 'i') and relname like 'orders%'
order by pg_relation_size(relname::regclass) desc;`,
          note: 'orders 表本体 ≈100+ MB，user_id 索引 ≈20~30 MB--索引能到表的几分之一，「读加速、空间付费」。想看含全部索引的总占用用 pg_total_relation_size。',
        },
        {
          sql: `\\timing on

-- 第一遍：带着第 3 题建好的索引
begin;
insert into orders (user_id, status, total_amount, created_at)
select '00000000-0000-0000-0000-000000000042', 2,
       round((20 + random() * 2000)::numeric, 2),
       current_date - (random() * 730)::int
from generate_series(1, 100000);
rollback;                          -- 记下耗时再回滚，数据不弄脏

-- 第二遍：删掉索引重复同样的 begin; insert ...; rollback;
drop index orders_user_id_idx;
create index on orders (user_id);  -- 测完把索引建回来`,
          note: '预期带索引慢 ≈1.5~2 倍：每行写入都要同步维护 B-tree（写入放大）。包在事务里 rollback 是标准做法，耗时照样被 \\timing 记到。',
        },
      ],
      pass: '说出加索引前后的倍数；能主动讲出 PG 与 MySQL 在表组织方式上的差异--这是很好的加分点。',
    },
    {
      no: 37,
      title: '索引类型全家福',
      brief:
        '不同的慢法用不同的索引：状态列只有几个值、搜索要忽略大小写、商品名要做全文搜。一个 B-tree 打不了天下。',
      split: [45, 60, 15],
      learn: [
        {
          title: 'B-tree / Hash / GIN / GiST / BRIN / SP-GiST 各自适用场景',
          scene: '索引类型六兄弟，先认脸再认专长。',
          body: '<b>B-tree</b>（默认）：等值 + 范围 + 排序，90% 场景；<b>Hash</b>：只等值、不支持范围（场景少）；<b>GIN</b>：倒排索引，管「一个字段里含什么」（数组、jsonb、全文）；<b>GiST</b>：几何、范围类型、近邻搜索；<b>BRIN</b>：块区间摘要，超大时序表；<b>SP-GiST</b>：前缀/四叉树类结构（IP、电话前缀）。选型看<b>数据形态</b>，不是看名字酷不酷。',
          sql: `create index on orders (user_id);                      -- B-tree（默认）
create index on orders using hash (user_id);           -- 只能等值
create index on products using gist (price_range);     -- GiST：范围/几何`,
          pitfall:
            'PG 的 Hash 索引在 PG 10 前不记 WAL（崩溃会丢），老资料直接说「别用 Hash」；PG 10+ 可用但场景依然窄。',
        },
        {
          title: 'GIN 用于 jsonb 和全文检索',
          scene: '商品加了个 jsonb 属性列，老板要按属性筛选--B-tree 对 jsonb 束手无策。',
          body: 'GIN = 倒排索引：「值 -&gt; 哪些行含有它」的映射表。<code>jsonb 的 @&gt; 包含查询</code>、<code>tsvector 全文检索</code>、数组包含，全靠它。没有 GIN，这些查询全是全表扫。',
          sql: `-- jsonb：给扩展属性建 GIN
create index on products using gin (attrs jsonb_path_ops);
select * from products where attrs @> '{"color": "红"}';

-- 全文：先转 tsvector 再 GIN
create index on products using gin (to_tsvector('simple', name));
select * from products
where to_tsvector('simple', name) @@ to_tsquery('simple', '手机 & 配件');`,
          pitfall:
            'GIN 建得慢、更新代价高（倒排表维护复杂）--写多读少的表慎用；jsonb_path_ops 比默认 operator class 更小更快但只支持 @&gt;。',
        },
        {
          title: 'BRIN 用于超大且物理有序的时序表',
          scene: '500 万行登录日志按时间查--B-tree 索引几百 MB，有没有更省的？',
          body: 'BRIN 只记录<b>每个物理块区间</b>的 min/max。数据按时间追加（物理有序）时，「login_at &gt; 昨天」这种条件能直接跳过 99% 的块。索引小到 KB 级，是「时序大表 + 追加写」的完美搭档。',
          sql: `create index on user_logins using brin (login_at);
create index on user_logins (login_at);   -- 对照组：B-tree

select relname, pg_size_pretty(pg_relation_size(relname::regclass)) as 大小
from pg_class where relname like 'user_logins%';   -- BRIN 小几个数量级`,
          pitfall:
            'BRIN 的前提是<b>物理有序</b>：数据乱序写入时 min/max 全重叠，BRIN 完全失效。先确认写入模式再选它。',
        },
        {
          title: '<b>部分索引</b>与<b>表达式索引</b>--PG 相对 MySQL 的明显优势',
          scene: '「待支付」订单只占 1%，查询却总在全表里捞；搜索要不区分大小写。',
          body: '部分索引：<code>where 条件</code> 只索引满足条件的行--索引小、写入省、命中率还高（专给高频查询用）。表达式索引：索引的不是列而是<b>表达式的结果</b>，如 <code>lower(email)</code>；查询里必须写<b>一模一样的表达式</b>才命中。MySQL 没有部分索引（8.0 才有函数索引），这两个是 PG 的招牌优势。',
          sql: `-- 部分索引：只索引待支付订单（后台高频轮询它）
create index idx_pending on orders (created_at)
where status = 1;
select * from orders where status = 1 and created_at > now() - interval '1 day';

-- 表达式索引：忽略大小写的登录
create index idx_email_lower on users (lower(email));
select * from users where lower(email) = 'a@b.com';   -- 命中`,
          pitfall:
            '表达式索引要求查询表达式<b>一字不差</b>：索引 lower(email)，查询写 upper(email) 或 email 不带函数，全都不命中。',
        },
      ],
      drill: [
        "给 <code>status = 'pending'</code> 建部分索引，对比它和全量索引的大小",
        '建 <code>lower(email)</code> 表达式索引，验证 <code>where lower(email)=...</code> 能命中',
        '加一个 jsonb 列，建 GIN 索引并做包含查询',
        '在时间列上分别建 B-tree 和 BRIN，对比索引大小',
        '用 <code>tsvector</code> + GIN 做一次商品名全文检索',
      ],
      drillAnswers: [
        {
          sql: `-- 题面的 'pending' 是业务叫法，库里 status 是 int，待支付 = 1
create index idx_orders_created_full    on orders (created_at);
create index idx_orders_created_pending on orders (created_at) where status = 1;

select relname, pg_size_pretty(pg_relation_size(relname::regclass)) as 大小
from pg_class
where relname like 'idx_orders_created%'
order by pg_relation_size(relname::regclass) desc;`,
          note: '待支付约占一成，部分索引也就只有全量索引的 ≈1/10；后台「待支付且近一天」的轮询查询照样命中它。省空间还省写入，这就是部分索引的卖点。',
        },
        {
          sql: `create index idx_users_email_lower on users (lower(email));

explain select * from users where lower(email) = 'user42@example.com';  -- 命中
explain select * from users where email = 'user42@example.com';         -- 不命中`,
          note: '表达式索引要求查询里写一字不差的表达式：索引 lower(email)，查询写裸 email 或 upper(email) 都不命中。users 才 1 万行，计划差异不一定明显，重点记住命中规则。',
        },
        {
          sql: `-- products 还没有 jsonb 列，先加一个并灌值
alter table products add column attrs jsonb;
update products
set attrs = jsonb_build_object(
      'color', (array['红','蓝','黑'])[1 + floor(random() * 3)::int],
      'weight', round((0.1 + random() * 2)::numeric, 2));

create index idx_products_attrs on products using gin (attrs jsonb_path_ops);

select count(*) from products where attrs @> '{"color": "红"}';`,
          note: '500 行的小表优化器多半仍选 Seq Scan（它算得过来账），set enable_seqscan = off 再 explain 能看到 GIN 计划。jsonb_path_ops 比默认 operator class 更小更快，但只支持 @> 一种查询。',
        },
        {
          sql: `create index idx_logins_bt   on user_logins (login_at);            -- B-tree
create index idx_logins_brin on user_logins using brin (login_at); -- BRIN

select relname, pg_size_pretty(pg_relation_size(relname::regclass)) as 大小
from pg_class
where relname like 'idx_logins%'
order by pg_relation_size(relname::regclass) desc;

explain (analyze) select count(*) from user_logins
where login_at >= current_date - 7;`,
          note: '预期 B-tree ≈十几 MB、BRIN 只有几十 KB，差两三个数量级。但注意：本库登录数据是乱序灌入的（物理不按时间有序），BRIN 的过滤效果会打折--它吃的是「追加写时序表」场景，先确认写入模式再选它。',
        },
        {
          sql: `create index idx_products_fts on products
  using gin (to_tsvector('simple', name));

select name
from products
where to_tsvector('simple', name) @@ to_tsquery('simple', '商品42');`,
          note: "查询里的表达式必须和索引里的一字不差。'simple' 配置不做中文分词，'商品42' 整体算一个词，所以只能整词命中；生产环境中文全文检索要上 zhparser / pg_jieba 这类分词扩展。",
        },
      ],
      pass: '能各举一个部分索引和表达式索引的真实用途。',
    },
    {
      no: 38,
      title: '报表查询的救命稻草：复合索引与最左前缀',
      brief: '报表查询都带着「某用户的某时间段」--单个索引救不了组合条件。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: '最左前缀原则的原理（索引按列顺序排序）',
          scene: '建了 (user_id, created_at) 复合索引，只按 created_at 查却不走索引--为什么？',
          body: '复合索引的排序规则：先按第一列排，第一列相同时再按第二列排。像电话簿「先姓后名」：知道姓能二分定位；只知道名（=只用第二列），整本电话簿还是得翻一遍。所以 <code>(user_id, created_at)</code> 支持「只 user_id」「user_id + created_at」，<b>不支持只 created_at</b>。',
          sql: `create index on orders (user_id, created_at);

-- 命中
explain select * from orders where user_id = '...';
explain select * from orders where user_id = '...' and created_at >= current_date - 30;
-- 不命中（最左前缀断了）
explain select * from orders where created_at >= current_date - 30;`,
          pitfall:
            '「(a, b) 能不能服务 where b」是索引面试的必考送分/送命题，先讲清排序原理再给结论。',
        },
        {
          title: '列顺序原则：等值列在前、范围列在后、高选择性优先',
          scene: '同样两列，先建 (user_id, created_at) 还是 (created_at, user_id)？',
          body: '① <b>等值在前、范围在后</b>：范围条件命中后，索引里它后面的列就没法继续精确定位了。(user_id = ? and created_at &gt; ?) 用 (user_id, created_at)：user_id 等值定位后，created_at 在索引里<b>还是有序的</b>，范围顺藤摸瓜。反过来范围在前，user_id 就乱序了。② 多个等值列之间，高选择性（区分度大的）优先。',
          sql: `-- 报表标配：某用户的某时间段
create index on orders (user_id, created_at);   -- 对
-- create index on orders (created_at, user_id); -- created_at 的范围会挡住 user_id 的等值定位`,
          pitfall:
            '范围列一旦「挡路」，它后面的列在索引里就只剩过滤作用（Filter），不再参与定位（Index Cond）--看 EXPLAIN 的这两个字段能立刻诊断。',
        },
        {
          title: '选择性的定义与查看方法',
          scene: '「这列建索引值不值」要拿数字说话。',
          body: '选择性 = 不同值数量 / 总行数，越接近 1 区分度越大、索引越值。status 列选择性 ≈ 0.000003（100 万行 3 个值），索引意义小；email 接近 1，必建。PG 里看 <code>pg_stats.n_distinct</code>（正数 = 绝对值、负数 = 占总行数的比例）。',
          sql: `select attname, n_distinct, null_frac
from pg_stats
where tablename = 'orders';
-- user_id 的 n_distinct ≈ -0.01（约 1% 行数即 1 万个不同用户）
-- status 的 n_distinct = 3`,
          pitfall: '「低选择性列单独建索引」= 白占空间：优化器预判命中太多行，照样全表扫。',
        },
        {
          title: 'Index Only Scan（覆盖索引）与 INCLUDE 子句',
          scene: '列表页只要 id、金额、时间--这些列全在索引里的话，连堆都不用回。',
          body: '查询涉及的列<b>全部包含在索引里</b>时，扫描器理论上可以只读索引--Index Only Scan，省掉回表的随机 IO。<code>include (列)</code> 把额外列塞进索引叶子（不参与排序），是官方支持的「为 IOS 补货」写法。',
          sql: `create index on orders (user_id, created_at) include (total_amount);

explain (analyze, buffers)
select user_id, created_at, total_amount
from orders
where user_id = '...' and created_at >= current_date - 30;
-- 计划出现 Index Only Scan，Heap Fetches = 0`,
          pitfall: 'include 会加大索引、拖慢写入--只为偶尔一条查询加它不值；高频接口查询才值得。',
        },
        {
          title: 'PG 的 visibility map 对 Index Only Scan 的影响',
          scene: '明明列都在索引里，计划却时不时回堆几万次（Heap Fetches &gt; 0）--为什么？',
          body: '索引里没有行的可见性信息（MVCC 的 xmin/xmax 在堆上），IOS 必须确认「这行对当前事务可见」。靠 <b>visibility map</b>：每个堆页一个「全可见」位，VM 置位的页才敢直接用索引。VM 由 vacuum 维护--表刚大量更新过，VM 退化，IOS 又偷偷回表了。',
          sql: `explain (analyze, buffers) select user_id from orders where user_id = '...';
-- Heap Fetches: 12345   <- 回堆了，VM 不干净
vacuum orders;
explain (analyze, buffers) select user_id from orders where user_id = '...';
-- Heap Fetches: 0       <- VM 全可见，真·只读索引`,
          pitfall:
            '「IOS 时快时慢」的老大难，先想 VM 和 vacuum；autovacuum 跟不上就调参（D41 讲）。',
        },
      ],
      drill: [
        '建 <code>(user_id, created_at)</code> 复合索引，测三种查询（只用 user_id / 只用 created_at / 两者都用）是否命中',
        '把列顺序反过来再建一次，重测上面三种查询',
        '只 SELECT 索引里的列，观察计划里出现 <code>Index Only Scan</code>',
        '用 <code>INCLUDE</code> 把 total_amount 加进索引，验证仍是 Index Only Scan',
        '查 <code>pg_stats</code> 看几个列的 <code>n_distinct</code>，判断选择性高低',
      ],
      drillAnswers: [
        {
          sql: `create index idx_orders_uid_created on orders (user_id, created_at);

-- ① 只用 user_id：命中
explain select * from orders
where user_id = '00000000-0000-0000-0000-000000000042';
-- ② 只用 created_at：不命中，Seq Scan
explain select * from orders
where created_at >= current_date - 30;
-- ③ 两者都用：命中，等值定位后范围顺藤摸瓜
explain select * from orders
where user_id = '00000000-0000-0000-0000-000000000042'
  and created_at >= current_date - 30;`,
          note: '复合索引先按第一列排、第一列相同时再按第二列排--电话簿「先姓后名」：只知道名（第二列）翻不了电话簿。②就是最左前缀断了的经典样子。',
        },
        {
          sql: `create index idx_orders_created_uid on orders (created_at, user_id);

-- 只按时间查：这次能命中了
explain select * from orders where created_at >= current_date - 30;
-- 想看它服务「user_id 等值 + 时间范围」的样子，先删掉上面那个复合索引再 explain：
-- Index Cond 里只剩 created_at，user_id 沦为 Filter
drop index idx_orders_created_uid;   -- 对照完删掉，别拖着写入`,
          note: '范围列挡在前面时，后面的 user_id 在索引里是乱序的，只能当过滤条件（Filter）不再参与定位（Index Cond）。结论：等值列在前、范围列在后。',
        },
        {
          sql: `explain (analyze, buffers)
select user_id, created_at
from orders
where user_id = '00000000-0000-0000-0000-000000000042';
-- 计划：Index Only Scan using idx_orders_uid_created

vacuum orders;                       -- 清 visibility map
explain (analyze, buffers)
select user_id, created_at
from orders
where user_id = '00000000-0000-0000-0000-000000000042';
-- Heap Fetches: 0  <- 真·只读索引`,
          note: '查询的列全在索引里就不必回堆。第一次跑常见 Heap Fetches > 0：VM 里有页不是「全可见」，得回堆确认可见性；vacuum 之后归零。',
        },
        {
          sql: `create index idx_orders_cover
  on orders (user_id, created_at) include (total_amount);

explain (analyze, buffers)
select user_id, created_at, total_amount
from orders
where user_id = '00000000-0000-0000-0000-000000000042';
-- 仍是 Index Only Scan，total_amount 不用回堆取`,
          note: 'include 把列塞进索引叶子但不参与排序，官方支持的「为 IOS 补货」写法。代价是索引更大、写入更慢，只有高频接口查询值得加。',
        },
        {
          sql: `select attname, n_distinct, null_frac
from pg_stats
where tablename = 'orders'
order by attname;`,
          note: '预期：status 的 n_distinct = 3（低选择性，单独建索引白占空间）；user_id ≈1 万个不同值；created_at 接近每行一个值。n_distinct 为负数时表示「占总行数的比例」（-1 ≈ 每行都不同）。',
        },
      ],
      pass: '给定三条查询，能设计出「最少数量」的索引集合并说明理由。',
    },
    {
      no: 39,
      title: '读懂体检报告：EXPLAIN ANALYZE',
      brief: '老板问「到底慢在哪」。你不能再说「感觉是索引问题」--要拿执行计划说话。',
      tags: ['hot'],
      split: [50, 55, 15],
      learn: [
        {
          title: 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 各选项作用',
          scene: '本周主力工具，先把每个开关是干什么的记牢。',
          body: '裸 <code>explain</code>：只<b>估算</b>不执行；<code>analyze</code>：真执行并报告实际耗时行数（注意 UPDATE / DELETE 会<b>真的执行</b>）；<code>buffers</code>：显示读了多少页、命中缓存多少（IO 真相）；<code>verbose</code>：显示每个节点输出哪些列；<code>format json</code>：机器可读，程序分析用。',
          sql: `explain (analyze, buffers)
select * from orders where user_id = '...';

-- 对 UPDATE 想安全地 analyze：包在事务里回滚
begin;
explain (analyze, buffers) update orders set status = 3 where status = 1;
rollback;`,
          pitfall:
            '<code>explain analyze</code> 一条 DELETE 把数据真删了，是新手经典事故--DML 先包 rollback 事务。',
        },
        {
          title: 'cost=0.00..123.45 两个数字分别是什么',
          scene: '计划第一行的这串数字，多数人看了三年没看懂。',
          body: '<code>cost = 启动成本..总成本</code>：启动成本 = 吐出第一行之前要干的活（排序节点几乎全部成本都在启动段）；总成本 = 整个节点干完的账。单位是<b>成本单位不是秒</b>（一次顺序页读 = 1.0 基准），只能用于计划内部比较，不能换算耗时。',
          sql: `explain select * from orders order by created_at limit 10;
-- Sort 节点：cost=....大数字....（启动贵：排完才有第一行）
-- Limit 把下游成本打了折：只需要排够 10 行的量`,
          pitfall: '「cost 100 万 = 多少毫秒」没有答案；真实耗时看 analyze 的 actual time。',
        },
        {
          title: 'rows（估算）vs actual rows（实际）偏差意味着什么',
          scene: '优化器是个做决策的会计师，账算错了路就选错。',
          body: '估算 rows 来自统计信息（pg_stats）。<b>偏差 10 倍以上就是警报</b>：优化器按错误行数选 join 算法、选扫描方式，整棵计划树跟着错。常见原因：统计过期（大更新后没 analyze）、列间相关性强（单列统计不懂「上海的用户爱买手机」这种相关）。',
          sql: `explain (analyze)
select * from orders o join users u on u.id = o.user_id
where o.status = 2 and u.city = '上海';
-- 对比每个节点的 rows=估算 与 actual rows=实际`,
          pitfall: '排错性能问题的第一步永远是找「估算和实际差最远」的节点，它常常就是病根。',
        },
        {
          title: 'loops 的含义：实际耗时要乘以 loops',
          scene: '一个 0.2ms 的节点，总耗时却是 2 秒--数字没错，你没乘 loops。',
          body: '嵌套在循环里的节点（典型：Nested Loop 的内侧）会执行多次，<code>actual time</code> 是<b>每次的平均值</b>，真实总耗时 = actual time × loops。看计划不乘 loops，就像看单价不乘数量。',
          sql: `explain (analyze)
select * from users u
join orders o on o.user_id = u.id
where u.city = '上海';
-- Index Scan on orders ... (actual time=0.2..0.3 rows=100 loops=10000)
-- 0.3ms × 10000 loops = 3 秒 <- 瓶颈在这，不在顶上那个节点`,
          pitfall: 'loops=1 时才可以直接读 actual time；大数字节点先检查它是不是被循环了。',
        },
        {
          title: '计划树从下往上、从内到外的读法',
          scene: '一份计划几十行，从哪读起？',
          body: '数据流是<b>自下而上</b>的：缩进最深的节点最先执行，把行喂给上层。读法：先找<b>最内层</b>（叶子扫描节点，看走没走索引），再往外看连接怎么组织，顶上是排序 / 聚合。找瓶颈的口诀：看 analyze 里 <b>actual time 最大的一枝</b>，顺藤摸到它的叶子。',
          sql: `explain (analyze)
select u.city, count(*), sum(o.total_amount)
from orders o
join users u on u.id = o.user_id
where o.created_at >= current_date - 7
group by u.city;
-- 读的顺序：最深的 Seq/Index Scan -> Hash -> Hash Join -> GroupAggregate`,
          pitfall: '顶层节点的成本包含所有子节点（累计值），别把父子的时间相加重复计算。',
        },
      ],
      drill: [
        '挑 5 条查询做 <code>EXPLAIN (ANALYZE, BUFFERS)</code>，逐行写注释',
        '找出一条估算 rows 与实际相差 10 倍以上的查询，分析原因',
        '找一个 Nested Loop 节点，用 loops 算出它的真实总耗时',
        '对同一条 SQL 跑 EXPLAIN 和 EXPLAIN ANALYZE，说出区别',
        '用 <code>FORMAT JSON</code> 输出一次，观察结构',
      ],
      drillAnswers: [
        {
          sql: `explain (analyze, buffers)
select * from orders where user_id = '00000000-0000-0000-0000-000000000042';

explain (analyze, buffers)
select count(*) from orders where status = 2;

explain (analyze, buffers)
select * from orders order by created_at desc limit 10;

explain (analyze, buffers)
select u.city, count(*), sum(o.total_amount)
from orders o join users u on u.id = o.user_id
group by u.city;

explain (analyze, buffers)
select * from orders o join payments p on p.order_id = o.id
where o.total_amount > 1900;`,
          note: '注释从缩进最深的节点往上写：叶子扫描走没走索引 -> 连接怎么组织 -> 顶层排序聚合。每个节点记三样：actual time、rows= vs actual rows、buffers。瓶颈 = actual time 最大的一枝。',
        },
        {
          sql: `explain (analyze)
select * from orders o join users u on u.id = o.user_id
where u.city = '上海' and o.status = 1;
-- 逐节点对比 rows=估算 与 actual rows=实际`,
          note: '本库数据是独立随机分布，偏差通常在几倍以内，找不到 10 倍偏差也正常--真实业务里列相关性强（「上海用户爱买手机」单列统计表达不了）或大更新后没 analyze 时才会爆表。排错第一步永远是找「差最远」的节点，它常是病根。',
        },
        {
          sql: `explain (analyze)
select count(*)
from users u
join orders o on o.user_id = u.id
where u.city = '上海';`,
          note: '外层筛出 ≈1600 个上海用户，内侧对 orders 的 Index Scan 跑 ≈1600 次：actual time 是每次的平均值，真实总耗时 = actual time × loops。若优化器选了 Hash Join，set enable_hashjoin = off 再看，看完记得 reset。',
        },
        {
          sql: `explain select count(*) from orders where status = 2;
-- 秒回：只有 cost 和估算 rows，没有执行

explain (analyze) select count(*) from orders where status = 2;
-- 真执行：多出 actual time、actual rows、loops`,
          note: '前者是优化器的「预算」，后者是「决算」。血泪警告：analyze 会真的执行 DML，update / delete 必须先包 begin ... rollback。',
        },
        {
          sql: `explain (analyze, format json)
select count(*) from orders where status = 2;`,
          note: '输出是棵 JSON 树：Plan 数组嵌 Plan，字段和文本版一一对应，适合程序做自动化分析。psql 里可以 \\o plan.json 把输出存成文件再看。',
        },
      ],
      pass: '拿到一份陌生执行计划，能在 2 分钟内指出瓶颈在哪个节点、依据是什么。',
    },
    {
      no: 40,
      title: '优化器的心思：扫描方式与连接算法',
      brief:
        '同一条查询，优化器有时走索引有时全表扫，有时 Hash Join 有时 Nested Loop。你要能看懂它的选择逻辑。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: 'Seq Scan / Index Scan / Index Only Scan / Bitmap Heap Scan 的触发条件',
          scene: '四种扫描方式像四档变速箱，优化器按「预计行数」换挡。',
          body: 'Seq Scan：全表顺序读，返回行多时的本命；Index Scan：索引定位 + 回表，点查和极少行数；Index Only Scan：列全在索引（D38）；<b>Bitmap Heap Scan</b>：先在索引里攒一张「命中页位图」，再<b>按页顺序批量回表</b>--把零散回表的随机 IO 拼成顺序 IO，返回行数中等时的最优解。',
          sql: `-- 放宽条件看换挡过程
explain select count(*) from orders where user_id = '...';                 -- Index
explain select count(*) from orders where created_at > current_date - 1;   -- Bitmap
explain select count(*) from orders where created_at > current_date - 365; -- Seq`,
          pitfall: 'Bitmap 不等于「一次一页只取一行」：位图去重后整页整页地读，_LOS 也能被它利用。',
        },
        {
          title: '为什么选择率高时全表扫反而更快',
          scene: '老板：「建了索引为什么还不走？」--因为优化器比你算得明白。',
          body: '取 30% 的行：走索引 = 30% 行的<b>随机</b>回表 IO；全表扫 = 100% 数据的<b>顺序</b> IO 一遍读完。顺序读的吞吐是随机读的几十倍，全表扫赢。索引只在「取少」时是捷径，「取多」时是绕路。',
          sql: `explain (analyze, buffers)
select * from orders where total_amount > 0;   -- 命中 95% 行
-- 计划选 Seq Scan，buffers 里 read 少而整齐
-- 强行 enable_seqscan=off 再跑一次：通常更慢`,
          pitfall:
            '「加索引 = 快」是错觉；优化器放弃索引常常是<b>正确决策</b>，别用 enable 开关硬拗。',
        },
        {
          title: 'Nested Loop / Hash Join / Merge Join 的原理、复杂度与前提',
          scene: '三种 join 算法，面试必考的三张牌。',
          body: '① <b>Nested Loop</b>：外层每行去内层找一次，内层<b>有索引</b>时每次 O(logM)，总 O(N·logM)--外层小 + 内层有索引时无敌；② <b>Hash Join</b>：小表建哈希表、大表扫一遍逐行探测，O(N+M)，不要求有序、不要求索引--大表无序连接的本命；③ <b>Merge Join</b>：两边按连接键<b>有序</b>（有索引或先排序）才能归并，O(N+M)--大结果集 + 已有序时最快。',
          sql: `explain select * from users u join orders o on o.user_id = u.id;
-- 1 万用户 × 100 万订单：Hash Join（users 建哈希表）

explain select * from orders o
join orders o2 on o.id = o2.id
where o.created_at >= current_date - 1 and o2.paid_at is not null;
-- 两边都能走主键索引有序输入时，可能出 Merge Join`,
          pitfall:
            '「NL 一定慢 / HJ 一定快」都是错的：NL 的前提是<b>内层有索引</b>，没有索引的 NL 是 O(N·M) 灾难。',
        },
        {
          title: 'work_mem 不足时 Hash Join 会落盘',
          scene: '同一个 Hash Join 昨天快今天慢，计划一模一样--差别在内存。',
          body: "哈希表装不进 <code>work_mem</code>（默认 4MB）时，PG 把数据分批写盘（计划里 <code>Batches: N</code>，N &gt; 1 就是落盘了），慢一个量级。会话级调大再跑：<code>set work_mem = '256MB'</code> 只影响当前连接。排序节点同理（external merge Disk）。",
          sql: `explain (analyze, buffers)
select count(*) from orders o join order_items i on i.order_id = o.id;
-- Hash Join ... Batches: 24  <- 落盘了

set work_mem = '256MB';
explain (analyze, buffers)
select count(*) from orders o join order_items i on i.order_id = o.id;
-- Batches: 1，耗时骤降`,
          pitfall:
            'work_mem 是<b>每个排序/哈希节点各一份</b>，全局调大是危险操作（连接数 × 并发节点数 × work_mem 会爆内存），只按会话调。',
        },
      ],
      drill: [
        '逐步放宽 WHERE 的选择率，观察计划从 Index Scan -&gt; Bitmap -&gt; Seq Scan 的切换点',
        '用 <code>SET enable_hashjoin = off</code> 强制换算法，对比耗时',
        '小表连大表，观察优化器选谁做驱动表（hash 表建在哪边）',
        '把 <code>work_mem</code> 调到 64kB，观察 Hash Join 落盘（计划里出现 Batches &gt; 1）',
        '整理一张「三种 join 算法 × 适用条件 × 复杂度」对比表',
      ],
      drillAnswers: [
        {
          sql: `create index on orders (created_at);   -- 先有单列索引才看得到换挡

explain select count(*) from orders where created_at >= current_date - 1;    -- Index Scan
explain select count(*) from orders where created_at >= current_date - 30;   -- Bitmap
explain select count(*) from orders where created_at >= current_date - 365;  -- Bitmap / Seq
explain select count(*) from orders where created_at >= current_date - 730;  -- Seq Scan`,
          note: '切换点不固定（取决于统计和成本模型），看的是趋势：命中少 -> Index Scan；中等 -> Bitmap Heap Scan（位图攒页、按页顺序批量回表）；多 -> Seq Scan。orders 散布在近两年，-365 大约命中一半。',
        },
        {
          sql: `explain (analyze)
select count(*) from orders o join order_items i on i.order_id = o.id;

set enable_hashjoin = off;
explain (analyze)
select count(*) from orders o join order_items i on i.order_id = o.id;
-- 换成 Merge Join / Nested Loop，对比 Execution Time

reset enable_hashjoin;`,
          note: '强制换挡后通常慢一个量级--这恰好证明优化器原来的选择是对的。enable 开关只配做实验，永远别写进生产配置。',
        },
        {
          sql: `explain (analyze)
select count(*)
from orders o join users u on u.user_id = u.id;`,
          note: '计划里 Hash 节点挂在 users 一侧：小表（1 万行）建哈希表，大表（orders 100 万）做探测端扫一遍。「哈希表建在小表上」是 Hash Join 的铁律：建表 O(M)、探测 O(N)。',
        },
        {
          sql: `set work_mem = '64kB';

explain (analyze, buffers)
select count(*) from orders o join order_items i on i.order_id = o.id;
-- Hash Join ... Batches: N（N > 1 即落盘），慢一个量级

set work_mem = '256MB';
explain (analyze, buffers)
select count(*) from orders o join order_items i on i.order_id = o.id;
-- Batches: 1，耗时骤降

reset work_mem;`,
          note: 'work_mem 默认才 4MB，哈希表 / 排序装不下就分批写盘。它是会话级参数，全局调大会乘以连接数爆内存，只在需要的会话里 set。',
        },
        {
          note: '表格进 notes.md，骨架五行：Nested Loop--O(N·logM)--内层有索引、外层行数少（外层小 + 内层点查无敌）；Hash Join--O(N+M)--等值连接、不要求有序不要索引、内存装得下（大表无序连接的本命）；Merge Join--O(N+M)--两边按连接键有序（索引或先排序）。各补一行风险：NL 内层没索引变 O(N·M) 灾难、HJ 落盘慢一个量级、MJ 要为排序预付成本。',
        },
      ],
      pass: '能说出三种 join 算法各自的复杂度和前提条件（如 Merge Join 需要有序输入）。',
    },
    {
      no: 41,
      title: '加了索引却没被用：失效场景与统计信息',
      brief:
        '索引建了，查询还是慢？你逐个复现六种「索引装死」的写法，还发现统计信息过期会让优化器选错路。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: '六类失效：函数包裹列、隐式类型转换、前导 %、OR 连接、低选择性、排序方向不匹配',
          scene: '索引明明在，查询就是不走--先过一遍六种「装死」写法。',
          body: "① <b>函数包列</b>：where date(created_at) = ...（D2 埋的伏笔今天收）；② <b>隐式类型转换</b>：varchar 列 = 整数值，列被套 cast；③ <b>前导 %</b>：like '%手机'，B-tree 没法定位（后缀通配可以反转+表达式索引）；④ <b>OR 连接</b>：OR 的两半不是每列都有索引时退化；⑤ <b>低选择性</b>：命中行太多，优化器主动放弃（D40 讲过，是正确决策）；⑥ <b>排序方向 / collation 不匹配</b>：索引的排序和 ORDER BY 要的不一致。",
          sql: `-- ①② 的修法对照
explain select * from orders where date(created_at) = current_date - 1;   -- 失效
explain select * from orders
where created_at >= current_date - 1 and created_at < current_date;       -- 命中`,
          pitfall: '六类里只有①②④是「写法病」要治；⑤ 是优化器正确判断，治了反而慢。',
        },
        {
          title: '统计信息从哪来、ANALYZE 做了什么',
          scene: '优化器的一切估算都来自一本「户口本」--谁在维护它？',
          body: 'PG 对每列维护统计（pg_stats：直方图、高频值、n_distinct、null 占比），<code>analyze</code> 命令就是<b>采样刷新</b>这本户口本（默认采样 3 万行）。优化器的 rows 估算、索引选择、join 算法全按它算。<b>大批量写入后统计就是旧的</b>，优化器拿着旧地图走新路。',
          sql: `-- 灌数后统计还是旧的（reltuples 停留在 5 万）
select relname, reltuples::bigint from pg_class where relname = 'orders';

analyze orders;   -- 刷新，reltuples 立即接近百万
select relname, reltuples::bigint from pg_class where relname = 'orders';`,
          pitfall: '「昨天好好的今天突然慢了」的排查第一步：想想昨晚是不是跑过大批量导入 / 更新。',
        },
        {
          title: 'autovacuum 与统计信息过期导致选错计划',
          scene: '没人手动 analyze，统计怎么平时还算新鲜？--autovacuum 在后台干活。',
          body: 'autovacuum 三件事：清死元组（vacuum）、刷新 VM、<b>更新统计（analyze）</b>。触发的默认规则是「变更行数超过表大小的 10%」（analyze 部分），大表上 10% 是个很大的数字--刚导入完的窗口期统计就是旧的。可以按表调小：<code>alter table t set (autovacuum_analyze_scale_factor = 0.02)</code>。',
          sql: `-- 看各表 autovacuum 的最近活动
select relname, last_autoanalyze, last_autovacuum, n_live_tup, n_dead_tup
from pg_stat_user_tables
order by last_autoanalyze nulls first;`,
          pitfall:
            '「大批量导入后手动 analyze」不是玄学仪式，是把 autovacuum 的下一次触发提前到「现在」。',
        },
        {
          title: 'pg_stat_statements 的安装与使用',
          scene: '「到底哪条 SQL 慢」不能靠猜--让数据库自己记账。',
          body: 'pg_stat_statements 扩展记录每条（归一化后）语句的调用次数、总耗时、平均耗时、返回行数。慢查询治理的第一入口：先看 TOP 10 总耗时（total_exec_time），再看平均耗时（mean_exec_time）和调用次数的组合。',
          sql: `-- postgresql.conf: shared_preload_libraries = 'pg_stat_statements'，然后重启
create extension pg_stat_statements;

select calls,
       round(total_exec_time::numeric, 0) as 总ms,
       round(mean_exec_time::numeric, 1)  as 平均ms,
       rows,
       left(query, 70) as query
from pg_stat_statements
order by total_exec_time desc
limit 10;`,
          pitfall:
            '需要 preload + 重启才生效；归一化把字面量换成 $1，同一个模板的慢查询才会被聚合统计。',
        },
      ],
      drill: [
        '逐个复现 6 种失效场景，每种都保存失效前后的执行计划',
        "把 <code>date(created_at) = '2026-01-01'</code> 改写成范围查询，验证索引恢复命中",
        '用 varchar 列与整数比较，观察隐式转换导致的全表扫',
        '大批量更新后先查计划，再手动 <code>ANALYZE</code>，对比计划变化',
        '装 <code>pg_stat_statements</code>，找出耗时 TOP10 的语句',
      ],
      drillAnswers: [
        {
          sql: `-- ① 函数包列：失效 vs 命中
explain select * from orders where date(created_at) = current_date - 1;
explain select * from orders
where created_at >= current_date - 1 and created_at < current_date;
-- ② 列被套 cast（PG 里「隐式转换失效」的实际形态）
explain select * from orders
where user_id::text = '00000000-0000-0000-0000-000000000042';
-- ③ 前导 %
explain select * from products where name like '%42';
-- ④ OR 的两半不都有索引（total_amount 没索引）
explain select * from orders
where user_id = '00000000-0000-0000-0000-000000000042' or total_amount > 1900;
-- ⑤ 低选择性：命中 ≈80% 行，Seq 是正确决策
explain select * from orders where status = 2;
-- ⑥ 排序键不在索引里：多出 Sort 节点
explain select * from orders
where user_id = '00000000-0000-0000-0000-000000000042'
order by total_amount;`,
          note: 'psql 里 \\o 文件名 可以把每份计划存档，失效 / 命中各存一份。六类里只有①②④是「写法病」要治，⑤是优化器的正确判断，治了反而慢。',
        },
        {
          sql: `explain select * from orders where date(created_at) = current_date - 1;   -- Seq Scan
explain select * from orders
where created_at >= current_date - 1
  and created_at <  current_date;                                           -- Index Scan`,
          note: '左闭右开，和 D2 学的完全一致。列上一套函数，索引就不认识这列了--D2 埋的伏笔今天正式收尾。',
        },
        {
          sql: `select * from users where email = 42;
-- ERROR:  operator does not exist: text = integer`,
          note: 'PG 直接报错、绝不静默转换--它从类型系统上堵死了 MySQL 那种隐式转换失效。PG 里等价的翻车形态是给列套 cast（第 1 题的②）：user_id::text = ... 照样全表扫。',
        },
        {
          sql: `begin;

-- 模拟大批量导入：+20 万行
insert into orders (user_id, status, total_amount, created_at)
select '00000000-0000-0000-0000-000000000042', 2,
       round((20 + random() * 2000)::numeric, 2),
       current_date - (random() * 90)::int
from generate_series(1, 200000);

-- 统计还是旧的：reltuples 停留在灌入前的值
select relname, reltuples::bigint from pg_class where relname = 'orders';
explain (analyze) select count(*) from orders where created_at >= current_date - 30;

analyze orders;   -- 刷新户口本
select relname, reltuples::bigint from pg_class where relname = 'orders';
explain (analyze) select count(*) from orders where created_at >= current_date - 30;

rollback;   -- 数据回滚，别真留下 20 万行`,
          note: '预期现象：analyze 前 reltuples 明显偏小、created_at 范围的估算 rows 和 actual rows 拉开差距；analyze 后立刻对齐。「昨天好好的今天慢了」的第一反应：昨晚是不是跑过大批量导入。',
        },
        {
          sql: `-- ① 装扩展（学栏的步骤）：改配置 + 重启容器
alter system set shared_preload_libraries = 'pg_stat_statements';
-- docker restart pg16，重连后：
create extension pg_stat_statements;

-- ② 随便跑几条查询让它记账，再看 TOP 10
select calls,
       round(total_exec_time::numeric, 0) as 总ms,
       round(mean_exec_time::numeric, 1)  as 平均ms,
       rows,
       left(query, 70) as query
from pg_stat_statements
order by total_exec_time desc
limit 10;`,
          note: '必须 preload + 重启才生效。归一化把字面量换成 $1，同一模板的慢查询才会聚合成一行；看榜单先看总耗时（谁在吃数据库），再用平均耗时 × 调用次数定位单条慢的。',
        },
      ],
      pass: '产出一张「失效写法 -&gt; 正确写法」对照表，至少 6 行，每行附执行计划证据。',
    },
    {
      no: 42,
      title: '优化实战：救活三条慢查询',
      brief: '交付日：从 pg_stat_statements 里挑出最慢的三条，把它们救活，写成可以进简历的案例。',
      tags: ['lab'],
      split: [10, 85, 25],
      learn: ['优化前先记录基线：耗时、执行计划、返回行数--没有基线，优化后说不出「快了多少倍」'],
      drill: [
        '从 pg_stat_statements 挑出 3 条秒级查询作为目标',
        '逐条记录优化前的 EXPLAIN ANALYZE 和耗时',
        '提出假设 -&gt; 加索引或改写 SQL -&gt; 验证',
        '记录优化后的计划与耗时，算出提升倍数',
        '整理成对比表格：查询 | 优化前 | 优化后 | 手段 | 提升倍数',
      ],
      drillAnswers: [
        {
          sql: `-- 前提：D41 已装好 pg_stat_statements（preload + 重启 + create extension）
select calls,
       round(total_exec_time::numeric, 0) as 总ms,
       round(mean_exec_time::numeric, 1)  as 平均ms,
       rows,
       left(query, 70) as query
from pg_stat_statements
where mean_exec_time >= 1000        -- 平均耗时 ≥1 秒才算「秒级」
order by total_exec_time desc
limit 10;`,
          note: '优先挑「总耗时高 + 平均耗时秒级」的：总耗时高说明它真的在吃数据库，优化它收益最大。没跑过几条查询榜单是空的，先把本周的练习各跑几遍。',
        },
        {
          sql: `\\timing on

-- 例：近 30 天日报（换成你自己挑的目标查询）
explain (analyze, buffers)
select created_at::date as 日期, count(*) as 单数, sum(total_amount) as gmv
from orders
where created_at >= current_date - 30
group by 1;`,
          note: '基线三件套一个都不能少：耗时（\\timing / Execution Time）、执行计划、返回行数--没有基线，优化完说不出「快了多少倍」，这是本日铁律，也是过纲里「简历素材」的数字来源。',
        },
        {
          sql: `-- 假设示例 A：「某用户的某时间段」没索引 -> 建复合索引（等值在前、范围在后）
create index idx_orders_uid_created on orders (user_id, created_at);

-- 假设示例 B：where date(created_at) = ... 函数包列失效 -> 改左闭右开范围

-- 验证：同一个查询重跑
explain (analyze, buffers)
select * from orders
where user_id = '00000000-0000-0000-0000-000000000042'
  and created_at >= current_date - 30;`,
          note: '方法论：一次只改一个变量（只加一个索引或只改一处写法），改完立刻重新 explain--同时动两处就说不清是哪个手段起的作用。假设不成立就回滚（drop index / 还原 SQL），再提下一个假设。',
        },
        {
          sql: `\\timing on

-- 与基线一模一样的查询再跑一次
explain (analyze, buffers)
select created_at::date as 日期, count(*) as 单数, sum(total_amount) as gmv
from orders
where created_at >= current_date - 30
group by 1;`,
          note: '提升倍数 = 优化前耗时 ÷ 优化后耗时，用 Execution Time 算，别用 cost（它不是秒）。注意缓存影响：第一次可能带冷读，多跑两三次取稳定值再记录。',
        },
        {
          note: '表格列就用题面那五列：查询 | 优化前 | 优化后 | 手段 | 提升倍数。示例一行：「近 30 天日报 | ≈1s | ≈100ms | created_at 加索引 | ≈10×」。每行都要能附上优化前后的执行计划--面试官追问「为什么快了」，拿计划说话，不拿感觉说话。',
        },
      ],
      pass: '三条查询都有明确提升倍数，且能解释每一条为什么快了。<b>这是简历上可以直接写的东西。</b>',
    },
  ],
};
