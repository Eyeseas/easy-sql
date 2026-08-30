import type { Week } from '../../types/curriculum';

export const week3: Week = {
  no: 3,
  title: '需求变绕了：子查询、CTE 与章法',
  short: '子查询与 CTE',
  story:
    '商品越上越多，公司上线了类目体系（categories 表进场）；运营的需求也从「统计一下」变成了「找出买过 A 又没买过 B 的用户」这种绕来绕去的活。你开始需要把复杂需求拆开、有章法地写的本事。',
  goal: '目标：拿到一个绕的需求，能拆成几步、有章法地写出来，而不是硬凑。',
  days: [
    {
      no: 15,
      title: '类目上线：树形结构与自连接',
      brief:
        '商品要归类了。类目是「电子 &gt; 手机 &gt; 配件」这样的树，存在 parent_id 里。第一个需求：按一级类目看销售。',
      split: [40, 65, 15],
      learn: [
        {
          title: '自关联表：parent_id 指回本表',
          scene: '类目是棵树：「电子 &gt; 手机 &gt; 配件」。树要怎么塞进一张表？',
          body: '每行一个类目，加一列 <code>parent_id</code> 指向<b>本表</b>里父类目的 id，顶级类目的 parent_id 为 NULL。这叫邻接表模型：树结构不需要多张表，一列自引用就够，而且加层级不用改表结构。',
          sql: `-- 表里长这样：父和子是同一张表里的行
select id, name, parent_id from categories order by id limit 6;`,
          pitfall:
            '树的深度没有上限。任何「固定跳两层 JOIN」的写法都偷偷假设了「树只有两层」--需求一说「所有层级」就得换递归（D18）。',
        },
        {
          title: '自连接：同一张表起两个别名连自己',
          scene: '要输出「一级类目名 | 二级类目名」对照表，可父和子在<b>同一张表</b>里。',
          body: '同一张表在 FROM 里出现两次、起两个别名（c 演父、s 演子），连接条件写 <code>s.parent_id = c.id</code>。对数据库来说是两个独立的数据源，对你来说是同一张表的两个角色--这就是自连接的全部秘密。',
          sql: `select c.name as 一级类目, s.name as 二级类目
from categories c
join categories s on s.parent_id = c.id
order by 1, 2;`,
          pitfall:
            '方向别写反：<code>c.parent_id = s.id</code> 查出来的是「父挂子名」，全表错位但不报错。',
        },
        {
          title: '类目树的三种基本查询：全表平铺 / 按一级分组 / 查直接孩子',
          scene: '拿到一棵树，日常打交道的就是这三个动作。',
          body: '① 平铺：直接 <code>select *</code>，树形靠 parent_id 脑补；② 按一级分组：先筛出顶级类目（<code>parent_id is null</code>），再自连接挂上孩子；③ 查某类目的直接孩子：<code>where parent_id = 某id</code>，只下一层。',
          sql: `-- ② 一级类目和它的直接孩子
select c.name as 一级, s.name as 孩子
from categories c
join categories s on s.parent_id = c.id
order by 1;

-- ③ 「手机」的直接孩子
select id, name from categories
where parent_id = (select id from categories where name = '手机');`,
          pitfall:
            '「按一级分组」要先问一句：商品的 category_id 挂在几级？可能挂二级、可能直接挂一级，路径不定就是递归的活。',
        },
        {
          title: '「按一级类目汇总」的连接链要跳两层（明细 -&gt; 商品 -&gt; 二级 -&gt; 一级）',
          scene:
            '老板要按一级类目看 GMV。order_items 里只有 product_id，商品的 category_id 还未必是顶级。',
          body: '连接链四步：order_items ->（product_id）products 拿 category_id ->（category_id）categories 第一次进，拿到二级类目 ->（parent_id）categories 第二次进，拿到一级类目的名字。categories 表进两次、两个别名，一个演二级一个演一级。',
          sql: `select c1.name as 一级类目,
       sum(i.qty * i.unit_price) as gmv
from order_items i
join products   p  on p.id = i.product_id
join categories c2 on c2.id = p.category_id
join categories c1 on c1.id = c2.parent_id
group by 1
order by gmv desc;`,
          pitfall:
            '类目树不止两层时，c2 可能本身就是顶级（parent_id 为 NULL），这些商品的 GMV 会整段消失。先 coalesce 兜底或统一归到根。',
        },
      ],
      drill: [
        '跑 seed.sql「W3」段：建 categories 并回填 products.category_id',
        '自连接输出「一级类目名 | 二级类目名」全表',
        '按一级类目统计 GMV（order_items -&gt; products -&gt; categories 连两次）',
        '给定一个二级类目，查出它的父类目',
        '想想：为什么 products 不直接冗余一级类目 id？写两句利弊进 notes.md',
      ],
      drillAnswers: [
        {
          sql: `-- seed.sql 的 §C 段共三条：插 30 个一级、插 45 个二级、回填 products.category_id
-- 在 psql 里逐条执行，灌完核对行数
select count(*) from categories;                       -- 75 = 30 + 45
select count(*) from products where category_id is not null;  -- 500：全部回填`,
          note: '答案不是抄 SQL，是把 §C 段的三条语句找出来按顺序跑掉：第 2 条插二级依赖第 1 条的父类目，第 3 条回填依赖前两条，顺序不能乱。',
        },
        {
          sql: `select c.name as 一级类目, s.name as 二级类目
from categories c
join categories s on s.parent_id = c.id
order by 1, 2;`,
          note: '自连接的全部秘密：同一张表进 FROM 两次、起两个别名，c 演父、s 演子。方向写反（c.parent_id = s.id）不报错但整表错位。',
        },
        {
          sql: `select c1.name as 一级类目,
       sum(i.qty * i.unit_price) as gmv
from order_items i
join products   p  on p.id = i.product_id
join categories c2 on c2.id = p.category_id
join categories c1 on c1.id = c2.parent_id
group by 1
order by gmv desc;`,
          note: '连接链四步画出来：明细 -> 商品 -> 二级 -> 一级，categories 进两次。seed 里商品全挂二级所以不丢行；树更深时 c1 会 join 不上（parent_id 为 NULL），防御性写法是 left join + coalesce(c1.name, c2.name) 兜底。',
        },
        {
          sql: `select c.name as 二级类目, p.name as 父类目
from categories c
join categories p on p.id = c.parent_id
where c.name = '子分类1';`,
          note: '还是自连接，只是方向反过来：从子出发找父。seed 里类目名是「子分类N」，把「子分类1」换成任意二级类目名即可。',
        },
        {
          note: '利：查询少跳一次 JOIN，按一级出报表更快、SQL 更短。弊：商品换挂类目或层级调整时要同时维护两列，两列很容易不一致，报表悄悄出错还查不到原因。当前阶段用「连接换正确性」；等第 6 周数据量上来、真的慢了，再谈反范式冗余。',
        },
      ],
      pass: '按一级类目的 GMV 报表跑通，连接链能画出来。',
    },
    {
      no: 16,
      title: '「花得比平均多的用户」：子查询三个位置',
      brief:
        '老板：「找出消费高于平均水平的那批人，我给他们发券。」平均值本身就要一条查询来算--你第一次需要查询里套查询。',
      split: [40, 65, 15],
      learn: [
        {
          title: '标量子查询（SELECT 里）：必须只返回一行一列',
          scene: '「消费高于平均水平」--平均水平这个数，得先用一条查询算出来。',
          body: '返回<b>一行一列</b>的子查询叫标量子查询，可以放在任何「单个值」能放的位置：SELECT 列表里、比较运算符右边。它先算一次，结果当一个常量用。',
          sql: `select user_id,
       sum(total_amount) as 消费额,
       sum(total_amount) - (select avg(total_amount) from orders) as 高于平均多少
from orders
group by user_id;`,
          pitfall:
            '子查询返回两行就报错 more than one row returned--而且这是<b>运行时</b>才炸：测试数据少时潜伏，上线数据多了才炸。',
        },
        {
          title: '派生表（FROM 里）：必须起别名',
          scene: '「每个用户的订单数 + 用户名」--订单数要先聚合，users 的名字在另一张表，两步走。',
          body: '<code>from (子查询) t</code>：先把子查询算成一张临时表，再对这张表连接、过滤。PG 强制要求给这个临时表起别名。它是「先聚合再连接」套路的标准载体--凡是你想说「先把 X 算出来，再和 Y 拼」，就是派生表。',
          sql: `select u.name, t.单数
from (
  select user_id, count(*) as 单数
  from orders
  group by user_id
) t
join users u on u.id = t.user_id;`,
          pitfall: '忘写别名是语法错；别名和真实表撞名，连接时列的归属会看不清。',
        },
        {
          title: '条件子查询（WHERE 里）：单值与多值',
          scene: '「有过已支付记录的订单」--过滤条件本身是一张查询的结果。',
          body: '用哪个运算符，取决于子查询吐出什么形状：<b>一行一列</b>配 <code>= &lt;&gt;</code>；<b>一列多行</b>配 <code>IN</code> / <code>NOT IN</code>；多列的极少（配行构造器）。写之前先问自己：这个子查询大概返回几行几列？',
          sql: `select *
from orders
where user_id in (select user_id from orders where status = 2);
-- 单值版：= (select avg(total_amount) from orders)`,
          pitfall:
            'ANY / ALL 也接多值一列（如 &gt; ANY 表示「大于其中任意一个」），知道存在即可，可读性差、少用。',
        },
        {
          title: '相关子查询：什么时候会被执行 N 次',
          scene: '同一条 SQL，小表上秒出，大数据量上突然慢几十倍--先怀疑它。',
          body: '判断标准：子查询里<b>引用了外层的列</b>（如 o.user_id）就是相关子查询。逻辑上外层每行都要带着自己的值进子查询算一遍，N 行 = N 次。非相关子查询只算一次、结果当常量。明天 D17 整天跟它打交道。',
          sql: `-- 相关：每个用户和"他自己的"平均客单价比
select id, total_amount
from orders o
where total_amount >= (select avg(total_amount)
                       from orders o2
                       where o2.user_id = o.user_id);`,
          pitfall:
            'EXPLAIN 里看到 SubPlan 出现在大行数节点之下，就是「每行执行一次」的现场，先估一下 总行数 × 子查询成本。',
        },
      ],
      drill: [
        '用标量子查询输出「每个用户消费额 − 全站平均消费额」',
        '用派生表先按用户聚合订单数，再连接 users 输出',
        '用 <code>WHERE id IN (子查询)</code> 查有过已支付记录的订单',
        '写一个返回多行的标量子查询，记录报错信息',
        '同一需求分别用派生表和 CTE 写，对比可读性',
      ],
      drillAnswers: [
        {
          sql: `select user_id,
       sum(total_amount) as 消费额,
       round(sum(total_amount)
             - (select avg(消费额)
                from (select user_id, sum(total_amount) as 消费额
                      from orders group by 1) x), 2) as 与全站平均的差额
from orders
group by 1;`,
          note: '口径先说清：「全站平均消费额」的分母是用户数（先按用户聚合再 avg），不是订单数。标量子查询是非相关的，整条 SQL 里只算一次、结果当常量用。',
        },
        {
          sql: `select u.name, t.单数
from (
  select user_id, count(*) as 单数
  from orders
  group by user_id
) t
join users u on u.id = t.user_id;`,
          note: '派生表必须起别名（PG 强制），它是「先聚合再连接」套路的标准载体：先把订单数算成一张临时表，再去 users 拿名字。',
        },
        {
          sql: `select *
from orders
where user_id in (select user_id from orders where status = 2);`,
          note: '子查询返回一列多行，所以配 IN。写之前先问「子查询吐出什么形状」：一行一列配 =，一列多行配 IN / NOT IN。',
        },
        {
          sql: `select id, total_amount
from orders
where total_amount = (select total_amount from orders where status = 3);
-- ERROR: more than one row returned by a subquery used as an expression`,
          note: '已取消的订单远不止一单，标量位置的子查询返回多行直接报错。注意这是运行时才炸：测试数据少时可能恰好一行、潜伏到上线。改成 in (...) 就是合法写法。',
        },
        {
          sql: `-- 派生表版：从外往里读，数括号
select u.name, t.单数
from (select user_id, count(*) as 单数 from orders group by 1) t
join users u on u.id = t.user_id;

-- CTE 版：从上往下读，先定义后使用
with 每用户单数 as (
  select user_id, count(*) as 单数 from orders group by 1
)
select u.name, t.单数
from 每用户单数 t
join users u on u.id = t.user_id;`,
          note: '两层结果完全一致，优化器眼里也是同一个东西；差别在读法。这题只有一层，差异不大--嵌到三层时 CTE 从上往下读的优势会碾压式显现，明天整天都在写它。',
        },
      ],
      pass: '能说出标量子查询在什么情况下会被执行 N 次（相关子查询）。',
    },
    {
      no: 17,
      title: 'IN、EXISTS 与一场生产事故预警',
      brief:
        '同行群里的事故通报：有人用 <code>NOT IN</code> 子查询查「没下过单的用户」，上线后返回空集，被运营当成故障投诉。你要彻底搞懂，别踩同一个坑。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: '相关子查询 vs 非相关子查询的执行方式',
          scene: 'D16 留的尾巴，今天掰开：两种子查询在引擎眼里是两种东西。',
          body: '非相关子查询（不引用外层列）算一次当常量，优化器还常把它改写成 hash semi-join，效率不差。相关子查询（引用了外层列）逻辑上每行执行一次--但现代优化器对 EXISTS / IN 也常能改写成 join，<b>别靠猜，靠 EXPLAIN</b>。看计划里是 Hash Semi Join（已改写）还是 SubPlan（真在逐行执行）。',
          sql: `-- 非相关：算一次
select * from users where city = '上海' and id in (select user_id from orders);
-- 相关：EXPLAIN 看它被改写没有
select * from users u
where exists (select 1 from orders o where o.user_id = u.id and o.status = 2);`,
          pitfall:
            '「IN 慢、EXISTS 快」这句老话在 PG 上早已不一定成立--优化器面前两者常常殊途同归，面试要按版本讲。',
        },
        {
          title: 'EXISTS 的短路特性：找到一行就返回',
          scene: '查「下过单的用户」：其实只需要为每个用户找到一个<b>证据</b>。',
          body: '<code>exists (子查询)</code> 只关心「有没有行返回」：扫到第一行立即返回 TRUE，剩下的全不看。所以子查询里 <code>select 1</code> 还是 <code>select *</code> 完全无所谓--列表根本不会被取值。NOT EXISTS 同理短路。',
          sql: `select u.name
from users u
where exists (select 1
              from orders o
              where o.user_id = u.id);`,
          pitfall:
            'exists 里别写聚合（子查询的意义是「存在性」，不是算数）；select 1 是惯例，为了读的人一眼看出「这查的是存在性」。',
        },
        {
          title: '<b>NOT IN + NULL = 空集</b>的完整推导',
          scene: '事故通报的还原：NOT IN 查「没下过单的用户」，上线返回空集，运营以为系统挂了。',
          body: '一步步推：<code>x NOT IN (a, b, c)</code> 等价于 <code>x&lt;&gt;a AND x&lt;&gt;b AND x&lt;&gt;c</code>。集合里混进一个 NULL，则 <code>x &lt;&gt; NULL</code> 得 UNKNOWN；UNKNOWN 参与 AND，整个表达式永远到不了 TRUE。WHERE 只放行 TRUE --<b>整张表一行都过不了</b>。这不是 bug，是三值逻辑的必然结论（D3 的伏笔今天收了）。',
          sql: `select 2 not in (1, 3, null);   -- 结果是 NULL，不是 true！
select count(*) from users
where id not in (select user_id from orders);   -- user_id 有脏 NULL 时 = 0 行`,
          pitfall:
            '子查询那一列<b>可能含 NULL</b>（脏数据、外连接结果），就永远别用 NOT IN--用 NOT EXISTS。',
        },
        {
          title: 'NOT EXISTS 与 LEFT JOIN ... IS NULL 两种反连接写法',
          scene: '「没下过单的用户」已经有两把枪了，加上 NOT EXISTS 是三把--该常备哪把？',
          body: '三者在正确性上等价：D10 的 LEFT JOIN + IS NULL、今天的 NOT EXISTS、以及有 NULL 陷阱的 NOT IN。性能上现代优化器常给三者生成相同计划；语义安全上 NOT EXISTS 没有 NULL 陷阱、也不要求右表连接列非空。<b>默认写 NOT EXISTS，另两种能看懂能改写</b>。',
          sql: `select u.name
from users u
where not exists (select 1 from orders o where o.user_id = u.id);

-- 等价的 LEFT JOIN 版（D10）
select u.name
from users u
left join orders o on o.user_id = u.id
where o.id is null;`,
          pitfall:
            '面试讲这道题的标准动作：先说「NOT IN 有 NULL 陷阱」，再现场推导，最后给出两种安全写法--一气呵成。',
        },
      ],
      drill: [
        '用 IN、EXISTS、JOIN 三种写法查「下过单的用户」，对比 EXPLAIN',
        '在子查询列里制造 NULL，复现 <code>NOT IN</code> 返回空集',
        '把第 2 题改成 <code>NOT EXISTS</code>，验证结果正确',
        '再用 <code>LEFT JOIN ... WHERE b.id IS NULL</code> 写第三遍',
        '在 12 万行明细上跑三种反连接写法，做一张耗时对比表',
      ],
      drillAnswers: [
        {
          sql: `-- IN 版
select u.name from users u
where u.id in (select user_id from orders);

-- EXISTS 版
select u.name from users u
where exists (select 1 from orders o where o.user_id = u.id);

-- JOIN 版（必须 distinct，否则下过多单的用户重复出现）
select distinct u.name
from users u
join orders o on o.user_id = u.id;`,
          note: '三者结果一致。对比点：EXPLAIN 里 IN / EXISTS 大概率都被优化器改写成 Hash Semi Join（半连接只判存在、不去重），JOIN 版是 Hash Join 之后靠 distinct 补救。「IN 慢 EXISTS 快」的老话在 PG 16 上早已不一定成立。',
        },
        {
          sql: `select count(*) from users
where id not in (
  select user_id from orders
  union all
  select null::uuid          -- 人为往集合里塞一个 NULL
);
-- 返回 0 行：集合含 NULL，NOT IN 永远算不出 TRUE`,
          note: 'seed 里 orders.user_id 没有脏 NULL，所以要自己 union 一行 null 制造事故现场。推导：x NOT IN (a, b, NULL) = x<>a AND x<>b AND x<>NULL，最后一项是 UNKNOWN，AND 链永远到不了 TRUE，WHERE 只放行 TRUE，整表一行都过不了。可对照 select 2 not in (1, 3, null) 的结果是 NULL。',
        },
        {
          sql: `select u.name
from users u
where not exists (select 1 from orders o where o.user_id = u.id);`,
          note: '返回真正没下过单的用户（量级几十人，1 万用户被 5 万单随机覆盖，总有漏网的）；与第 2 题的 0 行形成对比--NOT EXISTS 没有 NULL 陷阱，这是它成为反连接默认写法的原因。',
        },
        {
          sql: `select u.name
from users u
left join orders o on o.user_id = u.id
where o.id is null;`,
          note: '结果与 NOT EXISTS 完全一致。判空列要选右表「本来就不可能为 NULL」的列（主键 o.id 最稳）：连接失败的行整个右表全 NULL，判空才可靠。D10 的老朋友，今天多了个对照物。',
        },
        {
          note: '方法：\\timing on（或 explain analyze）把 NOT EXISTS / LEFT JOIN...IS NULL / NOT IN 三条各跑 3 次取中位数，记进对比表。预期：这个量级下三者耗时同一量级，计划里能看到 Hash Anti Join--现代优化器常把三种写法殊途同归。结论行写上：性能差不多时按语义安全选，默认 NOT EXISTS。',
        },
      ],
      pass: '手上有三写法耗时对比表；能完整讲出 NOT IN 遇 NULL 的推导过程。',
    },
    {
      no: 18,
      title: '类目树整棵下钻：递归 CTE',
      brief:
        '老板在类目管理页点了「电子」，想看它下面<b>所有层级</b>类目的汇总销售。层级不固定，普通 JOIN 搞不定。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: 'WITH RECURSIVE 的三段结构：初始项 + UNION ALL + 递归项',
          scene: '「电子」下面所有层级--几层不知道，JOIN 写死了就不行。',
          body: '固定模板背下来：<code>WITH RECURSIVE t AS ( 初始项 UNION ALL 递归项 )</code>。初始项（锚点）给出起点：parent_id 指向「电子」的直接孩子；递归项<b>引用 t 自己</b>再往下走一层。执行过程：先算初始项 --&gt; 结果喂给递归项 --&gt; 算出的新行再喂回去 --&gt; 直到没有新行为止。',
          sql: `with recursive sub as (
  select id, name, parent_id from categories where parent_id = 1  -- 初始项：直接孩子
  union all
  select c.id, c.name, c.parent_id
  from categories c
  join sub s on c.parent_id = s.id                                -- 递归项：往下再走一层
)
select * from sub;`,
          pitfall:
            '递归项只能引用 CTE 自己<b>一次</b>；把 UNION ALL 写成 UNION 会去重，语法没错但轮次语义悄悄变了。',
        },
        {
          title: '递归的终止条件与执行过程',
          scene: '递归没有 while，它怎么知道该停？',
          body: '终止条件是<b>隐式的</b>：某一轮递归项产出 0 行新数据，递归就停。没有「超过 N 层就停」的开关--树有多深就递归多深。想看清执行过程，在每行带一个 depth 列：初始项 depth=0，递归项 depth+1，结果按 depth 排就是「一层一层剥开」的现场。',
          sql: `with recursive sub as (
  select id, name, 0 as depth from categories where id = 1
  union all
  select c.id, c.name, s.depth + 1
  from categories c
  join sub s on c.parent_id = s.id
)
select * from sub order by depth;`,
          pitfall:
            '数据里有环（a 的父是 b、b 的父是 a）时每轮都有新行，递归永远不停--下一条讲怎么防。',
        },
        {
          title: '防死循环：记录已访问路径',
          scene: '脏数据造出环形类目树，一条递归查询把 CPU 跑满。',
          body: '两道保险：① 随身携带「已访问路径」数组，递归项里 <code>where not c.id = any(路径)</code>，走过的节点不再走；② 加 <code>depth &lt; 20</code> 硬上限兜底。生产上的递归查询两道都要有。',
          sql: `with recursive sub as (
  select id, name, parent_id, 0 as depth, array[id] as path
  from categories where id = 1
  union all
  select c.id, c.name, c.parent_id, s.depth + 1, s.path || c.id
  from categories c
  join sub s on c.parent_id = s.id
  where not c.id = any(s.path)   -- 环保险
    and s.depth < 20             -- 深度保险
)
select * from sub;`,
          pitfall:
            '递归跑不停时，从另一个窗口查 <code>pg_stat_activity</code> 能看到它 state = active 一直不动，<code>pg_terminate_backend(pid)</code> 停掉它。',
        },
        {
          title: '累积深度与路径拼接的技巧',
          scene:
            '「每个分类的完整路径（电子 &gt; 手机 &gt; 配件）」和「每个分类在第几层」--两个需求一个套路。',
          body: "递归项里维护「随身列」：depth = 父.depth + 1；path = 父.path || ' &gt; ' || 本节点名。每行都带着「我是怎么来的」--这是递归 CTE 的万金油模式，碰到任何递归需求先想这两个随身列怎么带。",
          sql: `with recursive tree as (
  select id, name, parent_id, name::text as path, 1 as depth
  from categories where parent_id is null
  union all
  select c.id, c.name, c.parent_id,
         t.path || ' > ' || c.name, t.depth + 1
  from categories c
  join tree t on c.parent_id = t.id
)
select name, path, depth from tree order by path;`,
          pitfall:
            '路径用 text 拼接，类目名本身含「&gt;」就有歧义；严格场景用数组类型存 path，展示时再 join。',
        },
      ],
      drill: [
        '查每个分类的完整路径（如「电子 &gt; 手机 &gt; 配件」）',
        '给定「电子」，查它的全部子孙分类及其销售汇总',
        '用递归 CTE 生成 2026 全年日期序列（不用 generate_series）',
        '算出每个分类所在的层级深度',
        '自建 employees 表做组织架构下钻，输出每人的汇报链',
      ],
      drillAnswers: [
        {
          sql: `with recursive tree as (
  select id, name, parent_id, name::text as 路径, 1 as 层级
  from categories
  where parent_id is null                       -- 初始项：从全部顶级开始
  union all
  select c.id, c.name, c.parent_id,
         t.路径 || ' > ' || c.name, t.层级 + 1  -- 随身列：路径和深度都从父行继承
  from categories c
  join tree t on c.parent_id = t.id
)
select name as 类目, 路径, 层级
from tree
order by 路径;`,
          note: "随身列模式：路径 = 父.路径 || ' > ' || 本名。seed 里类目名是「分类N / 子分类N」，所以路径长成「分类3 > 子分类17」；名字里的 ::text 是为了钉死路径列的类型。",
        },
        {
          sql: `with recursive sub as (
  select id, name from categories
  where parent_id = (select id from categories where name = '分类1')   -- 初始项：直接孩子
  union all
  select c.id, c.name
  from categories c
  join sub s on c.parent_id = s.id                                     -- 递归项：再往下走一层
)
select s.name as 类目, sum(i.qty * i.unit_price) as gmv
from sub s
join products p on p.category_id = s.id
join order_items i on i.product_id = p.id
group by 1
order by gmv desc;`,
          note: 'seed 里没有叫「电子」的类目，把「分类1」当成它跑。递归负责「所有层级」，不假设树只有两层；聚合在外面另起一段，别把汇总逻辑塞进递归项。',
        },
        {
          sql: `with recursive days as (
  select date '2026-01-01' as 日期      -- 初始项：起点
  union all
  select 日期 + 1                        -- 递归项：往前走一天
  from days
  where 日期 < date '2026-12-31'         -- 终止条件：走到年底不再产生新行
)
select 日期 from days order by 1;        -- 365 行`,
          note: '递归没有 while，终止是隐式的：某轮递归项产出 0 行就停。改 where 的上界就能生成任意区间--generate_series 的手写版，递归 CTE 最经典的入门题。',
        },
        {
          sql: `with recursive tree as (
  select id, name, 1 as 层级
  from categories
  where parent_id is null
  union all
  select c.id, c.name, t.层级 + 1
  from categories c
  join tree t on c.parent_id = t.id
)
select 层级, count(*) as 类目数
from tree
group by 1
order by 1;
-- 1 级 30 个、2 级 45 个；想看每个类目自己的层级，把聚合拆掉直接 select 即可`,
          note: '深度是随身列：初始项给顶级定 1，递归项每层 +1。这题结果验证了「商品的 category_id 全挂在二级」的事实。',
        },
        {
          sql: `drop table if exists employees;
create table employees (
  id      int primary key,
  name    text,
  boss_id int                    -- 顶级（老板）为 NULL
);
insert into employees values
  (1, '老板', null),
  (2, '技术总监', 1),
  (3, '后端组长', 2),
  (4, '你（DBA）', 3),
  (5, '运营总监', 1),
  (6, '运营专员', 5);

with recursive tree as (
  select id, name, boss_id, name::text as 汇报链
  from employees
  where boss_id is null
  union all
  select e.id, e.name, e.boss_id,
         t.汇报链 || ' > ' || e.name
  from employees e
  join tree t on e.boss_id = t.id
)
select name as 员工, 汇报链
from tree
order by 汇报链;
-- 「你（DBA）」那行：老板 > 技术总监 > 后端组长 > 你（DBA）`,
          note: '和类目树是同一个模板：邻接表（boss_id 指回本表）+ 递归下钻 + 路径随身列。练完 drop table employees 收尾，别留在库里污染后面的题。',
        },
      ],
      pass: '不看资料写出一个递归 CTE，并逐段解释初始项和递归项各做什么。',
    },
    {
      no: 19,
      title: '把绕需求写成人话：CTE 与五步拆解法',
      brief:
        '运营的原话：「近 3 个月，每月新客的 GMV 和老客的 GMV 分开算。」你决定以后拿到需求先拆步骤再动手，用 CTE 把每一步写成能读的段落。',
      split: [40, 65, 15],
      learn: [
        {
          title: 'WITH 基本语法与多级 CTE',
          scene: '派生表套派生表，三层括号已经读不懂了--需要给每个中间结果起名字。',
          body: '<code>with a as (...), b as (...引用 a...), c as (...引用 b...) select ...</code>：后面的能用前面的，自顶向下一条流水线。给每段起<b>业务名</b>（清洗 / 聚合 / 排名），SQL 从一坨嵌套变成分段的作文--CTE 的核心价值是给思路命名。',
          sql: `with 聚合 as (
  select user_id, sum(total_amount) as gmv from orders group by 1
),
带名字 as (
  select u.name, a.gmv from 聚合 a join users u on u.id = a.user_id
)
select * from 带名字 order by gmv desc limit 10;`,
          pitfall:
            'CTE 名别和真实表名撞（撞了会遮蔽原表，查错极难发现）；只能引用「写在它前面」的 CTE。',
        },
        {
          title: 'PG 12 起 CTE 默认可内联，之前版本是优化栅栏',
          scene: '老资料说「CTE 能防止条件推入、能提速」--按版本说话。',
          body: 'PG 11 及以前：CTE 一律物化（算一次存临时表），并且是<b>优化栅栏</b>--外层的 where 推不进去。PG 12 起：只被引用一次的 CTE 默认<b>内联</b>（像视图一样展开进主查询，栅栏没了）；被引用多次的仍然物化。',
          sql: `select version();   -- 先知道自己站在哪个版本上讨论
-- PG 12+：这个 CTE 会被内联，user_id 条件能推入
with t as (select * from orders where status = 2)
select * from t where user_id = '...';`,
          pitfall:
            '面试聊 CTE 必带版本号。不加版本说「CTE 是优化栅栏」，遇到懂 PG 的面试官直接扣分。',
        },
        {
          title: 'MATERIALIZED / NOT MATERIALIZED 的显式控制',
          scene: '一个昂贵 的 CTE 要被引用两次--到底算一遍还是两遍？',
          body: '<code>with t as materialized (...)</code> 强制算一次存结果（引用 N 次也只算一次）；<code>as not materialized</code> 强制内联（每次引用展开一次）。默认规则记不住没关系--<b>在意就显式写</b>，语义摆在自己手里。',
          sql: `with t as materialized (   -- 昂贵计算只跑一次
  select user_id, count(*) as n from orders group by 1
)
select (select count(*) from t where n = 1) as 只下一单,
       (select count(*) from t where n >= 2) as 复购;`,
          pitfall:
            '物化 = 写临时结果（可能落盘），有真实代价；不是免费缓存。「引用多次的昂贵 CTE」才值得物化。',
        },
        {
          title: '澄清误区：CTE 本身不是性能优化手段',
          scene: '网上文章标题《用 CTE 让查询快 10 倍》--你想知道它到底优化了什么。',
          body: 'CTE 解决的是<b>可读性和拆解</b>，不是速度。内联的 CTE 和一坨子查询在优化器眼里是同一个东西；物化倒是省了重复计算，但那是「你把逻辑组织对了」的副产品。快是因为索引、是因为少算了东西，从来不是因为 with 这个关键字。',
          pitfall: '为了「性能」把查询套 10 层 CTE，既不快也不可读--方向就错了。',
        },
        {
          title:
            '复杂需求五步法：定粒度 -&gt; 找主表 -&gt; 逐步补维度 -&gt; 定过滤位置 -&gt; 最后聚合排序',
          scene:
            '运营原话：「近 3 个月，每月新客的 GMV 和老客的 GMV 分开算。」--先在注释里拆，再写 SQL。',
          body: '① 定粒度：一行 = 月份 × 新老客；② 找主表：事实在 orders；③ 补维度：「新客」要判定（首单是否落在当月）--先算每个用户的首单月份；④ 定过滤：近 3 个月在哪一步过滤；⑤ 聚合排序最后写。五步写在注释里，SQL 一段对应一步，写完的需求自己都能复查。',
          sql: `-- ① 粒度：月 × 新老客  ② 主表：orders
with 首单 as (                       -- ③ 维度：首单月份
  select user_id, min(created_at)::date as 首单日 from orders group by 1
)
select date_trunc('month', o.created_at) as 月份,
       case when date_trunc('month', f.首单日) = date_trunc('month', o.created_at)
            then '新客' else '老客' end as 客群,
       sum(o.total_amount) as gmv    -- ⑤ 最后聚合
from orders o
join 首单 f on f.user_id = o.user_id
where o.created_at >= date_trunc('month', current_date) - interval '3 months'  -- ④ 过滤
group by 1, 2
order by 1, 2;`,
          pitfall: '不拆就写的人，一半概率写到一半发现粒度错了全部推翻重来。五步法是慢就是快。',
        },
      ],
      drill: [
        '把 D13 里最复杂的一题用 CTE 重写，对比可读性',
        '写一个三级 CTE：清洗 -&gt; 聚合 -&gt; 排名',
        '同一查询加与不加 <code>MATERIALIZED</code>，对比执行计划差异',
        '「近 3 个月每月新客 GMV 与老客 GMV」：先写五步拆解，再写 SQL',
        '写一个被引用两次的 CTE，观察是否被计算两次',
      ],
      drillAnswers: [
        {
          note: '挑法：找当时嵌套两层以上、中间结果没有名字的那题。改法：把每层子查询拎出来，按「它算的是什么」起业务名变成 CTE，逻辑一行不改。预期现象：读 SQL 从「从外往里、数括号」变成「从上往下读流水线」；检验标准是隔一天再读，CTE 版能一眼说出每段在干嘛，原版要重新数括号。',
        },
        {
          sql: `with 清洗 as (                            -- ① 剔除脏数据：负金额、空状态
  select *
  from orders
  where total_amount > 0 and status is not null
),
聚合 as (                              -- ② 每用户算指标
  select user_id, count(*) as 单数, sum(total_amount) as gmv
  from 清洗
  group by 1
),
排名 as (                              -- ③ 按消费额排名
  select *, row_number() over (order by gmv desc) as 排名
  from 聚合
)
select * from 排名 where 排名 <= 10;`,
          note: '每个 CTE 只干一件事、名字用业务动词，后面的引用前面的，自顶向下一条流水线。CTE 的核心价值是给思路命名，不是提速。',
        },
        {
          sql: `-- 默认（PG 12+，只引用一次会内联）：user_id 条件被推进底层扫描
explain analyze
with t as (select * from orders where status = 2)
select count(*) from t
where user_id = '00000000-0000-0000-0000-000000000042';

-- 强制物化：先算出整个 CTE，再 CTE Scan 过滤
explain analyze
with t as materialized (select * from orders where status = 2)
select count(*) from t
where user_id = '00000000-0000-0000-0000-000000000042';`,
          note: '看计划的差异点：内联版里 orders 的扫描节点直接挂着 user_id 过滤（扫的行数少）；物化版多一个 CTE Scan 节点，先算出 3 万多行已支付订单再过滤。uuid 是灌数脚本的确定性映射，编号 42 对应这个值。',
        },
        {
          sql: `-- ① 粒度：月 × 新老客  ② 主表：orders（事实在订单上）
with 首单 as (                                -- ③ 维度：每个用户的首单时间（用全历史算）
  select user_id, min(created_at) as 首单时间
  from orders
  group by 1
)
select date_trunc('month', o.created_at) as 月份,
       case when date_trunc('month', f.首单时间) = date_trunc('month', o.created_at)
            then '新客' else '老客' end as 客群,
       sum(o.total_amount) as gmv             -- ⑤ 最后聚合
from orders o
join 首单 f on f.user_id = o.user_id
where o.created_at >= date_trunc('month', current_date) - interval '3 months'  -- ④ 过滤
group by 1, 2
order by 1, 2;`,
          note: '最容易错的是③和④的配合：首单必须用全历史算，「近 3 个月」只过滤订单本身。如果先过滤再算首单，四个月前就下过单的用户会被误判成新客--五步法里「过滤放在哪一步」要想清楚再动手。',
        },
        {
          sql: `-- t 被引用两次：PG 会物化，分组只算一次
with t as (
  select user_id, count(*) as n from orders group by 1
)
select (select count(*) from t where n = 1)  as 只下一单,
       (select count(*) from t where n >= 2) as 复购用户数;

-- 强制不物化：同样的分组算两遍
with t as not materialized (
  select user_id, count(*) as n from orders group by 1
)
select (select count(*) from t where n = 1)  as 只下一单,
       (select count(*) from t where n >= 2) as 复购用户数;`,
          note: '对比两版 explain：默认版只有一个 GroupAggregate，CTE 结果被两个子查询共用；not materialized 版分组节点出现两份。结论：被引用多次的昂贵 CTE，默认的物化是在帮你省钱。',
        },
      ],
      pass: '能说清 PG 里 CTE 什么时候会被物化、物化意味着什么代价。',
    },
    {
      no: 20,
      title: '每个类目销量前三：LATERAL',
      brief:
        '运营要做「每个类目热销 TOP3」看板。你上次用整表聚合再过滤的写法，数据一大就慢；这次学个新武器。',
      split: [40, 65, 15],
      learn: [
        {
          title: 'LATERAL 让右侧子查询能引用左侧的列',
          scene: '「每个用户最近 3 笔订单」：子查询里得写「这个用户的」--普通子查询够不着外层。',
          body: '<code>join lateral (子查询)</code>：右侧子查询里<b>可以直接用左边表的列</b>。执行直觉：对左表每一行，把它的值代进右查询跑一遍，结果并上来。它是「能返回一整组行的相关子查询」。',
          sql: `select u.name, t.*
from users u
join lateral (
  select id, total_amount, created_at
  from orders o
  where o.user_id = u.id            -- 引用了左边的 u.id
  order by created_at desc
  limit 3
) t on true
order by u.name, t.created_at desc;`,
          pitfall:
            'LATERAL 只能出现在 FROM / JOIN 的右侧；子查询里引用的别名必须在它<b>左边</b>出现过。',
        },
        {
          title: 'LEFT JOIN LATERAL (...) ON true 的固定写法',
          scene: '有的用户没下过单--inner join lateral 会把他们整个吞掉。',
          body: 'lateral 子查询没有传统意义的连接条件，语法上用 <code>on true</code> 占位；改成 <code>left join lateral (...) on true</code>，右查询空结果也保留左行（右侧补 NULL）。「每个 X 及其最新 Y，没有也要」= 这句话。',
          sql: `select u.name, t.id, t.total_amount
from users u
left join lateral (
  select id, total_amount from orders o
  where o.user_id = u.id
  order by created_at desc limit 1
) t on true;`,
          pitfall: '少了 on true 是语法错；该用 left 的场景写成 inner，没下过单的用户静默消失。',
        },
        {
          title: 'Top-N per group 的三种解法对比',
          scene: '同一个需求三条路：整表 row_number、LATERAL、聚合后过滤。选哪条？',
          body: '① <code>row_number() over (partition by 组)</code> + 外层过滤：通用、组数无所谓；② LATERAL：每个组<b>只扫自己要的那几行</b>（前提：排序列上有索引），组多且每组取少量时常胜；③ 老式聚合拼接：别用了。D23 会正式展开 ①，今天先用 ② 的身体记住这个对比。',
          sql: `-- LATERAL 版：每个一级类目销量前 3 的商品
select c.name as 类目, t.name as 商品, t.销量
from categories c
join lateral (
  select p.name, sum(i.qty) as 销量
  from products p
  join order_items i on i.product_id = p.id
  where p.category_id = c.id
  group by p.id, p.name
  order by 销量 desc
  limit 3
) t on true
order by c.name, t.销量 desc;`,
          pitfall:
            'LATERAL 快的前提是「组内排序键有索引支撑」。没有索引时它退化成每组一次排序，可能更慢--所以 D20 练习要做耗时对比表。',
        },
        {
          title: 'LATERAL 与相关子查询的关系',
          scene: '越看越像 D16 的相关子查询--本来就是一家。',
          body: '本质都是「对外层每行执行一次的子查询」。区别在<b>位置和产出</b>：相关子查询放在 WHERE / SELECT 里，返回标量或布尔；LATERAL 放在 FROM 里，返回一组行、成为数据源。心法：要一个数，用相关子查询；要几行几列，用 LATERAL。',
          sql: `-- 要一个数（每用户订单数）
select u.name, (select count(*) from orders o where o.user_id = u.id) as n
from users u;
-- 要几行（每用户最近 3 单）-- 上面 LATERAL 的例子`,
          pitfall: 'SELECT 列表里的子查询必须标量；想让它返回多行多列，硬写只会报错，换 LATERAL。',
        },
      ],
      drill: [
        '用 LATERAL 查每个用户最近 3 笔订单',
        '用 LATERAL 查每个一级类目销量前 3 的商品',
        '用 <code>ROW_NUMBER</code> 把第 2 题再写一遍（预习下周窗口函数语法）',
        '用 <code>DISTINCT ON</code> 写 N=1 的版本',
        '三种写法都跑 <code>EXPLAIN ANALYZE</code>，记录耗时做成对比表',
      ],
      drillAnswers: [
        {
          sql: `select u.name, t.id as 订单id, t.total_amount, t.created_at
from users u
join lateral (
  select id, total_amount, created_at
  from orders o
  where o.user_id = u.id            -- 子查询里直接用左边的 u.id
  order by created_at desc
  limit 3
) t on true
order by u.name, t.created_at desc;`,
          note: 'LATERAL 让右侧子查询引用左侧的列：对每个用户把 u.id 代进右查询跑一遍。想保留没下过单的用户，把 join lateral 换成 left join lateral ... on true，右侧补 NULL。',
        },
        {
          sql: `select c.name as 一级类目, t.name as 商品, t.销量
from categories c
join lateral (
  select p.name, sum(i.qty) as 销量
  from products p
  join order_items i on i.product_id = p.id
  join categories c2 on c2.id = p.category_id
  where c2.parent_id = c.id         -- 该一级类目下面所有二级的商品
  group by p.id, p.name
  order by 销量 desc
  limit 3
) t on true
order by c.name, t.销量 desc;`,
          note: '别忘了商品挂在二级：LATERAL 里要经二级跳到一级（c2.parent_id = c.id）。外层没显式筛顶级也没错--二级类目匹配不到任何商品，LATERAL 返回空集被 inner join 自动丢弃；显式加 where c.parent_id is null 会更清楚。类目树更多层时，换成 D18 的递归先算子孙集合。',
        },
        {
          sql: `select 一级类目, 商品, 销量
from (
  select c1.name as 一级类目,
         p.name as 商品,
         sum(i.qty) as 销量,
         row_number() over (partition by c1.name
                             order by sum(i.qty) desc) as rn
  from order_items i
  join products   p  on p.id = i.product_id
  join categories c2 on c2.id = p.category_id
  join categories c1 on c1.id = c2.parent_id
  group by c1.name, p.name
) t
where rn <= 3;`,
          note: '整表聚合一遍、窗口函数编号、外层过滤三段式，下周的主角今天先混个脸熟。它不依赖索引，通用性最好；和 LATERAL 的性能分水岭见第 5 题。',
        },
        {
          sql: `select distinct on (c1.name)
       c1.name as 一级类目, p.name as 商品, sum(i.qty) as 销量
from order_items i
join products   p  on p.id = i.product_id
join categories c2 on c2.id = p.category_id
join categories c1 on c1.id = c2.parent_id
group by c1.name, p.name
order by c1.name, sum(i.qty) desc;`,
          note: 'distinct on (列) = 每组保留排序后的第一行，所以只能做 N=1。两个约束：order by 必须以 distinct on 的列开头，后面的排序键决定每组留哪一行。PG 方言，别的库没有。',
        },
        {
          note: '方法：把第 2 / 3 / 4 题各跑 explain analyze 三次，记录 Execution Time 做成「写法 | 计划要点 | 耗时」三列的表。预期：12 万明细、几十个组，三种都在几十毫秒量级、难分胜负；LATERAL 的优势要等「组多、每组只取少量、组内排序键有索引」才显现（每组只扫自己要的那几行）。结论先记方法，第 6 周百万行时回来重跑对比。',
        },
      ],
      pass: '能说出 LATERAL 在「分组多、每组取少量」场景下为什么可能更快。',
    },
    {
      no: 21,
      title: '周测：白板手写模拟',
      brief: '三周了。本周测评改成白板模式--纸上手写、不许运行，模拟面试现场。',
      tags: ['test'],
      split: [10, 70, 40],
      learnLabel: '复盘 · 10 min',
      drillLabel: '测评 · 110 min',
      learn: ['整理本周的 CTE / 递归 / LATERAL 模板到 notes.md'],
      drill: [
        '60 分钟<b>纸上手写</b> 6 题（不许运行、不许查文档）--模拟白板环节',
        '上机逐题验证，统计有几题一次通过',
        '把写错的地方标红，归入 mistakes.md',
        '对着镜子讲一遍其中最难那题的解题思路',
      ],
      drillAnswers: [
        {
          note: '白板规则：纸笔、不运行、不查文档，60 分钟 6 题平均每题 10 分钟。出题范围就是本周五种武器：① 子查询三个位置（标量 / 派生表 / 条件）；② NOT IN 遇 NULL 的推导 + NOT EXISTS 写法；③ 递归 CTE（路径或日期序列）；④ 多级 CTE 拆一个绕需求；⑤ LATERAL 的 Top-N per group。手写时最容易漏的是 with recursive 的 union all 和 lateral 的 on true--这两处白板上丢了整条就跑不通。',
        },
        {
          note: '上机验证时别边跑边改：整题跑完再统一对答案，才能统计出真实的「一次通过」数。一次通过 = 首次运行即返回正确结果；语法小错（漏逗号、别名拼错）不算通过，白板环节它们同样是错。',
        },
        {
          note: '归因沿用第一周的三分法：没懂概念（回当天「学」栏重看并口述）、记不住语法（连续 3 天默写模板）、看错题意（读题先圈名词和限定词）。本周新增一类高频错因：模板记住了但「初始项 / 锚点选错」--递归和 LATERAL 都是从锚点长出来的，锚点错全盘错。',
        },
        {
          note: '讲题结构：先复述需求 -> 说拆解思路（为什么分这几步）-> 逐段讲 SQL（这段在干嘛、为什么放这里）-> 收尾讲边界（NULL、空集、层级不定）。60 秒内讲完，卡壳的那一句就是还没真懂的地方，回炉。',
        },
      ],
      pass: '6 题中至少 4 题手写版本能直接跑通。',
    },
  ],
};
