import type { Week } from '../../types/curriculum';

export const week2: Week = {
  no: 2,
  title: '第二批数据来了：多表世界',
  short: '多表与月报',
  story:
    '运营把后台的用户、商品、订单明细三张表导给你：「老板要按城市和品类看销售。」单张 orders 表答不了这些--你第一次要把多张表连起来查。月底还要交公司的第一份正式月报。',
  goal: '目标：多表报表查询不再靠试；能当场解释 LEFT JOIN 的过滤陷阱。',
  days: [
    {
      no: 8,
      title: '用户表来了：第一次 JOIN',
      brief:
        '运营发来 users 表（1 万用户）：「老板想知道都是哪些城市的人在买。」订单表里只有 user_id，你的第一次表连接。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        '跑 seed.sql「W2」段：导入 users / products / order_items 三张表，<code>count(*)</code> 核对行数',
        {
          title: 'JOIN 的直觉：按 user_id 把两张表的行拼起来',
          scene:
            '老板问「都是哪些城市的人在买」。orders 里只有 user_id 一个编号，城市藏在 users 表里--单表查不出来，要把两张表按「同一个用户」拼起来。',
          body: 'JOIN 做的事一句话：对左表（orders）的每一行，去右表（users）里找 <code>user_id</code> 相等的那一行，两行并成一行。连接之后每一行既是订单也是用户，<code>u.city</code> 这种 users 侧的列就能直接用了。',
          sql: `select o.id, o.total_amount, u.name, u.city
from orders o
join users u on u.id = o.user_id
limit 5;`,
          pitfall:
            '先想清楚「谁找谁」：从订单出发找用户，和从用户出发找订单，INNER JOIN 结果一样，但你读 SQL 的方式完全不同。业务问题问的是订单，就让 orders 打头。',
        },
        {
          title: 'INNER JOIN ... ON 的语法与表别名',
          scene: '动手写之前把语法拆干净：JOIN 发生在 FROM 里，ON 是拼接条件。',
          body: '<code>from orders o</code> 里的 <code>o</code> 是表别名，写一次后面全用短名。<code>on u.id = o.user_id</code> 是拼接条件：两行满足它才并成一行。INNER 可以省略--光写 JOIN 就是 INNER JOIN，语义是「两边都匹配才保留」。',
          sql: `select o.id, u.city
from orders o
inner join users u on u.id = o.user_id;`,
          pitfall:
            '别名一旦起了，原表名就不能再用：from orders o 之后写 orders.id 直接报错。整个查询统一用别名。',
        },
        {
          title: '连接条件表达的是业务关系，不是「列名相同」',
          scene:
            '两张表里都有 id，你顺手写 on id = id--报错 column reference is ambiguous。这个报错逼你回答一个业务问题：这两个 id 分别是谁的？（本库两表没有同名的 user_id--写 on user_id = user_id 反而<b>不报错</b>，那是更糟的笛卡尔积，见下方 pitfall。）',
          body: 'ON 的左边是 <code>orders.user_id</code>（这单是谁下的），右边是 <code>users.id</code>（这个编号的用户是谁）。写连接条件前先用嘴说一遍业务关系：「订单的用户 = 用户的编号」。说不出来，就是还没理解这两张表的关系。',
          sql: `select count(*)
from orders o
join users u on o.user_id = u.id;   -- orders 找 users
-- 条件两边反过来写 u.id = o.user_id，结果一样，语义也是同一句业务关系`,
          pitfall:
            'ON 只要求值相等，不检查列名。on o.user_id = o.user_id（自己等于自己）语法合法且恒真，结果是笛卡尔积--数据库不会替你挡这个错。',
        },
        {
          title: '连接前过滤 vs 连接后过滤：结果相同，习惯先过滤',
          scene: '「上海用户的订单数」：先筛出上海用户再连，或连完再筛，两条路都通。',
          body: '对 INNER JOIN，条件写 WHERE 还是往 ON 里塞，结果一样（优化器也常把两者变成同一个计划）。但习惯上先过滤再连接：数据先变小，读的人也先看到范围。今天先养成这个习惯--明天（D10）会看到它在 LEFT JOIN 上被打破的场景。',
          sql: `-- 习惯写法：子查询先把用户收窄到上海
select count(*) from orders o
where o.user_id in (select id from users where city = '上海');

-- 连接后过滤：结果相同
select count(*) from orders o
join users u on o.user_id = u.id
where u.city = '上海';`,
          pitfall:
            '「结果相同」只对 INNER JOIN 成立。LEFT JOIN 上 ON 和 WHERE 的过滤结果完全不同，是明天的主题。',
        },
      ],
      drill: [
        '跑 seed.sql「W2」段导入三张新表，<code>count(*)</code> 核对行数',
        'orders 连 users，让每笔订单带上用户名和城市',
        '查「上海用户」的订单数：先过滤再连、连了再过滤各写一遍，对比结果',
        '各城市的订单数和 GMV',
        '故意把连接条件写成 <code>user_id = user_id</code> 不加表名限定，记下报错',
      ],
      drillAnswers: [
        {
          sql: `-- seed.sql 的 §B 段（页面文案里的「W2」段）共五条：
-- ①users ②products ③order_items 三段 INSERT，
-- ④ 把 total_amount 对齐成明细之和 ⑤ 重新埋 100 单负金额
select (select count(*) from users)       as 用户数,    -- 10000
       (select count(*) from products)    as 商品数,    -- 500
       (select count(*) from order_items) as 明细行数;  -- ≈12 万`,
          note: '答案不是抄 SQL，是把 §B 的五条语句按顺序跑掉：④⑤ 依赖 ③ 的结果，乱序跑数字对不上。行数不对先怀疑自己重复灌过。',
        },
        {
          sql: `select o.id, o.total_amount, u.name, u.city
from orders o
join users u on o.user_id = u.id
limit 10;`,
          note: 'ON 表达的是业务关系：「订单的用户 = 用户的编号」。业务问题问的是订单，就让 orders 打头。',
        },
        {
          sql: `-- 先过滤再连（子查询把用户收窄到上海）
select count(*) from orders o
where o.user_id in (select id from users where city = '上海');

-- 连了再过滤
select count(*) from orders o
join users u on o.user_id = u.id
where u.city = '上海';`,
          note: 'INNER JOIN 上两种写法结果相同（优化器常生成同一个计划）；习惯先过滤再连接，数据先变小。这条规律到明天的 LEFT JOIN 上会被打破。',
        },
        {
          sql: `select u.city, count(*) as 单数, sum(o.total_amount) as gmv
from orders o
join users u on o.user_id = u.id
group by u.city
order by gmv desc;`,
          note: '约 2% 用户的 city 是 NULL，这批订单自己成一组（city 显示 NULL），报表里别悄悄丢掉，展示时再 coalesce 成「未知」。',
        },
        {
          sql: `-- 本库 user_id 只有 orders 有，所以这行不报错——恒真，退化成 5 亿行笛卡尔积
select o.id, u.id
from orders o
join users u on user_id = user_id
limit 5;

-- 真正的 ambiguous 报错要用两边同名的列：
select * from orders o join users u on id = id;
-- ERROR:  column reference "id" is ambiguous`,
          note: 'user_id = user_id 两边都解析成 orders.user_id，语法合法且恒真，结果 = 5 万 × 1 万 = 5 亿行（LIMIT 救了你）。ambiguous 报错只在两表真有同名列时出现（如 id = id）——报错反而是在帮你逼问：这个列到底属于谁。',
        },
      ],
      pass: '能说清 JOIN ON 的条件在业务上表示什么、两个 user_id 分别属于谁。',
    },
    {
      no: 9,
      title: '商品和明细也到了：三表链与笛卡尔积事故',
      brief:
        '明细数据到位（500 商品 / 12 万明细）。你一条查询漏写了连接条件，跑出几十亿行的组合，笔记本风扇狂转--笛卡尔积事故现场。',
      split: [35, 70, 15],
      learn: [
        {
          title: 'orders -> order_items -> products 的连接链',
          scene:
            '老板要看「每笔订单里都有什么商品」。明细表 order_items 两头各揣一个外键：order_id 指向订单，product_id 指向商品--它就是把三张表串起来的桥。',
          body: '报表要的列分布在不同表里：单号在 orders、用户名在 users、商品名在 products、数量单价在 order_items。连接链按业务关系走：orders → order_items（一笔订单含多件商品）→ products（商品详情）。四表连起来，每行就是「某笔订单里的某件商品」。',
          sql: `select o.id        as 单号,
       u.name       as 用户,
       p.name       as 商品,
       i.qty        as 数量,
       i.unit_price as 单价
from orders o
join order_items i on i.order_id = o.id
join products   p on p.id = i.product_id
join users      u on u.id = o.user_id
limit 5;`,
          pitfall:
            '连接顺序按链条写、JOIN 一行一个，别把四张表挤在 FROM 里用逗号连接--老式逗号语法没有 ON，漏条件就是笛卡尔积且不报错。',
        },
        {
          title: '一对多连接的行数放大：明细表决定结果行数',
          scene: '你连了 order_items 统计订单 GMV，总金额凭空翻了倍--数据没坏，是行数被放大了。',
          body: 'orders 和 order_items 是一对多：一笔订单平均挂 2-3 件商品，连接后同一笔订单变成 2-3 行，<code>sum(o.total_amount)</code> 就把它重复累加了。判断连接后该有多少行：沿连接链找「多」的那一端，结果行数 = 多端行数（前提都匹配上）。',
          sql: `select count(*) from orders;        -- 5 万
select count(*) from order_items;    -- ≈12 万
select count(*)
from orders o
join order_items i on i.order_id = o.id;   -- ≈12 万，等于明细行数`,
          pitfall:
            '「连了明细表之后聚合数字变大」首先怀疑一对多放大。修法：先按 order_id 聚合明细、再连接回主表（D14 周测专门考）。',
        },
        {
          title: '漏写连接条件 = 笛卡尔积（CROSS JOIN）',
          scene: '漏写一个 ON，笔记本风扇狂转--你正在计算两表所有行的组合。',
          body: '没有 ON 的 JOIN 退化为 CROSS JOIN：结果行数 = 两表行数之积。orders 5 万行 × order_items 12 万行 = 60 亿行，数据库真的会一行行算出来。这是新手把库跑挂的第一名原因。',
          sql: `-- 惰性：LIMIT 几行就停，可以看到组合的样子
select o.id, i.id
from orders o cross join order_items i
limit 5;

-- 危险：count(*) 要把 60 亿行数完才返回，别在脑子里跑
-- select count(*) from orders cross join order_items;`,
          pitfall:
            'EXPLAIN 里看到两侧都没有过滤条件、估行数 = 两表行数之积，就是在算笛卡尔积--赶紧 Ctrl+C。',
        },
        {
          title: 'USING 与 NATURAL JOIN 为什么生产不用',
          scene: 'PG 允许 using (...) 简写，natural join 甚至自动按同名列连接--看起来更省事。',
          body: '<code>using (列)</code> 要求两边的连接列同名；本库里 orders.user_id 对 users.id，名字不同，USING 根本写不了。natural join 更激进：把所有同名列全当连接条件。省几个字的代价是赌表结构永远不变--哪天加了一个同名列，natural join 的连接条件悄悄变了，结果变了，不报任何错。',
          sql: `-- 本库写不了 USING（连接列不同名），只能显式 ON：
select o.id, u.city
from orders o
join users u on o.user_id = u.id;`,
          pitfall: '生产代码里见到 natural join 就重构；显式 ON 多打几个字，换来的是改动安全。',
        },
      ],
      drill: [
        '四表连接出订单明细：单号 / 用户名 / 商品名 / 数量 / 单价',
        '验证结果行数 = order_items 行数，解释为什么',
        '故意漏写一个连接条件：<b>先笔算</b>会出多少行，再加 LIMIT 跑一遍验证',
        '统计每笔订单的商品种类数和总件数',
        '把四表连接写成不带别名的版本，感受可读性差在哪里',
      ],
      drillAnswers: [
        {
          sql: `select o.id        as 单号,
       u.name       as 用户,
       p.name       as 商品,
       i.qty        as 数量,
       i.unit_price as 单价
from orders o
join order_items i on i.order_id = o.id
join products   p on p.id = i.product_id
join users      u on u.id = o.user_id
limit 10;`,
          note: '连接链按业务关系走：orders -> order_items -> products，users 补用户维度；一行一个 JOIN，谁也别挤在逗号后面。',
        },
        {
          sql: `select (select count(*) from order_items) as 明细行数,
       (select count(*)
        from orders o join order_items i on i.order_id = o.id) as 连接后行数;`,
          note: 'orders : order_items 是一对多，沿连接链找「多」的一端--结果行数由明细表决定；seed 里每个订单都有明细、每条明细都有商品，所以两个数相等（≈12 万）。',
        },
        {
          sql: `-- 笔算：漏掉 orders -> order_items 的 ON，5 万 × 12 万 = 60 亿行
-- 用 CROSS JOIN 显式写出「没有条件的连接」，加 LIMIT 只看 5 行
select o.id as 单号, i.id as 明细号
from orders o
cross join order_items i
limit 5;`,
          note: '漏 ON 的 JOIN 就退化成 CROSS JOIN，PG 会一行行真算这 60 亿。LIMIT 让它吐 5 行就停，安全看到「组合」的样子；再想验证笔算，看 EXPLAIN 的估行数是不是两表行数之积。',
        },
        {
          sql: `select order_id,
       count(distinct product_id) as 商品种类数,
       sum(qty)                   as 总件数
from order_items
group by order_id
order by order_id
limit 10;`,
          note: '种类数要用 count(distinct product_id)：同一单里同一商品出现两行时，count(*) 会把它数成两种。这题不用连 orders--度量全躺在明细表上，别为了「报表感」白白多连一张表。',
        },
        {
          sql: `select orders.id              as 单号,
       users.name             as 用户,
       products.name          as 商品,
       order_items.qty        as 数量,
       order_items.unit_price as 单价
from orders
join order_items on order_items.order_id = orders.id
join products    on products.id = order_items.product_id
join users       on users.id = orders.user_id
limit 5;`,
          note: '功能完全等价，差的是评审成本：ON 里每列都拖全名，一行长一倍；起了别名后表改名只动 from 一行。团队协作里几乎一律用别名。',
        },
      ],
      pass: '四表连接一次写对，且结果行数与 order_items 行数一致（能解释为什么）。',
    },
    {
      no: 10,
      title: '未支付订单从月报里消失了：LEFT JOIN 陷阱',
      brief:
        '月报初稿被老板打回：「那些还没支付的订单呢？」你用了 INNER JOIN，把没有匹配行的数据全丢了。今天专门搞懂 LEFT JOIN 的坑。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: 'INNER / LEFT / RIGHT / FULL 四种连接的结果集语义',
          scene:
            '月报里「未支付订单」整段消失。你用的 INNER JOIN：右边没有匹配行时，左边这行整个被丢掉。',
          body: '一句话记四种：INNER=两边都匹配才留；LEFT=左边全留，右边匹配不上补 NULL；RIGHT 反过来；FULL=两边都全留。业务里 90% 是前两种：只看匹配上的用 INNER，左边的行一行都不能丢用 LEFT。',
          sql: `-- 各 3 行小表，四种 JOIN 各跑一遍，结果抄进 notes.md
create table a (id int, label text);
insert into a values (1,'一'), (2,'二'), (3,'三');
create table b (id int, val int);
insert into b values (2,20), (3,30), (4,40);

select a.label, b.val from a join  b on a.id=b.id;  -- (二,20)(三,30)
select a.label, b.val from a left  join b on a.id=b.id;  -- 多出 (一,NULL)
select a.label, b.val from a right join b on a.id=b.id;  -- 多出 (NULL,40)
select a.label, b.val from a full  join b on a.id=b.id;  -- 全部 4 行`,
          pitfall:
            'LEFT JOIN 补出来的 NULL 行，右边所有列都是 NULL--这正是下面反连接（IS NULL）能工作的前提。',
        },
        {
          title: '<b>过滤条件写在 ON 和写在 WHERE 的本质差异</b>（对 LEFT JOIN）',
          scene:
            '同样一个条件，写在 ON 里月报没丢行，写在 WHERE 里未支付订单又消失了。今天最重要的一节。',
          body: '执行顺序决定的：<b>ON</b> 在连接发生时判断--不合格的右表行不参与连接，但左表这行还在，右边补 NULL；<b>WHERE</b> 在连接完成后过滤--此刻 NULL 行也在候选里，任何对右表列的比较都得 UNKNOWN，行被丢弃。所以对 LEFT JOIN：右表的条件写 ON = 「匹配不上的当 NULL 留着」，写 WHERE = 「必须匹配上才要」。',
          sql: `-- 条件 b.val > 25 放 ON：a 全保留，匹配不上的 b 侧补 NULL
select a.label, b.val
from a left join b on a.id = b.id and b.val > 25;

-- 同一条件放 WHERE：NULL 行被过滤，行数退化成 INNER
select a.label, b.val
from a left join b on a.id = b.id
where b.val > 25;`,
          pitfall:
            '右表过滤条件放 WHERE 还是 ON，是 LEFT JOIN 最大的坑、面试最爱问的一条。结论先背下来：右表条件放 ON。',
        },
        {
          title: 'LEFT JOIN 如何一步步退化成 INNER JOIN',
          scene: '代码评审时前辈指着你一句 where 说：这行一加，你的 LEFT JOIN 就白写了。',
          body: '退化路径：LEFT JOIN 补出的 NULL 行，一到 WHERE 就活不过任何对右表列的判断（NULL 参与比较得 UNKNOWN，被丢弃）。判别法：把 WHERE 里提到右表列的条件挪进 ON，行数变多了，说明原来的写法已经退化。',
          sql: `-- 每个用户及其已支付订单数，没下过单的也要（显示 0）：
select u.name, count(o.id) as 单数
from users u
left join orders o on o.user_id = u.id and o.status = 2
group by u.name;
-- 把 and o.status = 2 挪到 where：没下过单的用户整行消失 = 退化`,
          pitfall:
            'where b.id is not null 是最常见的隐性退化写法--除非你就是要反连接，否则别这么过滤。',
        },
        {
          title: '「反连接」：查 A 里不在 B 中的记录',
          scene: '增长同事问：「有多少用户注册了却一单没下？」--本质是集合的减法。',
          body: '反连接 = LEFT JOIN + 右表主键 IS NULL：左行在右边找不到匹配时右表列全是 NULL，用 IS NULL 精确挑出这批行。它和 NOT IN / NOT EXISTS 语义等价、各有性能适用场景，先把 LEFT JOIN 版练熟（D12 会见另外两种）。',
          sql: `select u.name
from users u
left join orders o on o.user_id = u.id
where o.id is null;   -- 从未下过单的用户`,
          pitfall:
            'IS NULL 判断的列必须是右表的主键（或必然非空的列），否则右表本身的 NULL 会冒充「没匹配上」。',
        },
        {
          title: '连接后聚合：count(b.id) 与 count(*) 的差异',
          scene: '统计「每个用户的订单数」，没下过单的用户显示 1 而不是 0--你数的是行，不是订单。',
          body: 'LEFT JOIN 补出来的 NULL 行也被 <code>count(*)</code> 数到了；<code>count(o.id)</code> 只数非空的 o.id，NULL 行自动跳过，正好实现「没下过单 = 0」。一句话：LEFT JOIN 之后聚合右表，用 count(右表.非空列)，别用 count(*)。',
          sql: `select u.name,
       count(*)   as 错误_NULL行也数,
       count(o.id) as 正确_没下单记0
from users u
left join orders o on o.user_id = u.id
group by u.name;`,
          pitfall:
            'sum(o.total_amount) 遇 NULL 行会自动跳过、结果没错，但展示层记得 coalesce 补 0。',
        },
      ],
      drill: [
        '造两张 3 行小表，四种 JOIN 各跑一次，把结果抄进 notes.md',
        '同一个 LEFT JOIN，条件分别放 ON 和 WHERE，对比行数并解释',
        '查所有用户及其订单数，<b>没下过单的显示 0</b>',
        '用 LEFT JOIN + IS NULL 查「从未下过单的用户」',
        '构造一个 <code>count(b.id)</code> 与 <code>count(*)</code> 结果不同的查询，解释原因',
      ],
      drillAnswers: [
        {
          sql: `create table a (id int, label text);
insert into a values (1,'一'), (2,'二'), (3,'三');
create table b (id int, val int);
insert into b values (2,20), (3,30), (4,40);

select a.label, b.val from a join  b on a.id = b.id;  -- 2 行：(二,20)(三,30)
select a.label, b.val from a left  join b on a.id = b.id;  -- 3 行：多出 (一,NULL)
select a.label, b.val from a right join b on a.id = b.id;  -- 3 行：多出 (NULL,40)
select a.label, b.val from a full  join b on a.id = b.id;  -- 4 行

-- drop table a, b;   -- 下面几题还要用，全部实验做完再收走`,
          note: 'LEFT 多出的 (一,NULL) 就是「右边匹配不上补 NULL」的实体证据--第 4 题的反连接全靠它工作。四行结果抄进 notes.md。',
        },
        {
          sql: `-- 条件放 ON：a 全保留，匹配不上的 b 侧补 NULL
select a.label, b.val
from a left join b on a.id = b.id and b.val > 25;

-- 同一条件放 WHERE：NULL 行过不了比较，行数退化成 INNER
select a.label, b.val
from a left join b on a.id = b.id
where b.val > 25;`,
          note: 'ON 在连接发生时判断（不合格的右行不参与连接，但左行还在）；WHERE 在连接完成后过滤（NULL 参与比较得 UNKNOWN 被丢弃）。前者 3 行、后者 2 行--右表条件放 WHERE，LEFT JOIN 就白写了。',
        },
        {
          sql: `select u.id, u.name, count(o.id) as 单数
from users u
left join orders o on o.user_id = u.id
group by u.id, u.name
order by 单数
limit 10;`,
          note: 'count(o.id) 只数非空：LEFT JOIN 补出的 NULL 行自动记 0；换 count(*) 会把没下过单的用户也数成 1。分组键带上 u.id（name 在本库恰好唯一，但别赌）。',
        },
        {
          sql: `select u.id, u.name
from users u
left join orders o on o.user_id = u.id
where o.id is null;`,
          note: 'IS NULL 必须判断右表的主键这类必然非空的列：匹配不上时右表列全 NULL；拿可空列判断，业务 NULL 会冒充「没匹配上」。和 D12 的 EXCEPT 写法语义等价。',
        },
        {
          sql: `select u.name,
       count(*)    as 错误_NULL行也数,
       count(o.id) as 正确_没下单记0
from users u
left join orders o on o.user_id = u.id
group by u.id, u.name
order by 错误_NULL行也数
limit 10;`,
          note: '没下过单的用户那行 o.id 是 NULL：count(*) 数行得 1，count(o.id) 数非空得 0，差值 = 没匹配上的左行数。一句话：LEFT JOIN 之后聚合右表，用 count(右表.非空列)。',
        },
      ],
      pass: '用小表结果解释为什么 LEFT JOIN 把条件放 WHERE 会退化成 INNER JOIN。',
    },
    {
      no: 11,
      title: '按城市、按状态看销售：JOIN 与 GROUP BY 合体',
      brief: '老板的正式需求下来了：一张表里要同时看到总单、已付、取消和支付率--维度越来越多。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: 'SELECT 列表的约束：必须在 GROUP BY 里或被聚合包裹',
          scene:
            '「按城市统计订单数」你顺手 select 了 u.city, o.total_amount, count(*)--报错：column must appear in the GROUP BY clause。',
          body: '分组之后每组只剩一行，SELECT 的每一列要么进过 GROUP BY（组内相同，有唯一值），要么被聚合函数包裹（压成单值）。o.total_amount 组内有几百个值，一个格子放不下，PG 拒绝猜。MySQL 关掉 only_full_group_by 时会随便取一个值不报错--著名的坑。',
          sql: `-- 报错：total_amount 既不在 GROUP BY 也没被聚合
select u.city, o.total_amount, count(*)
from orders o join users u on o.user_id = u.id
group by u.city;

-- 修法：聚合它
select u.city, sum(o.total_amount) as gmv, count(*) as 单数
from orders o join users u on o.user_id = u.id
group by u.city;`,
          pitfall:
            'PG 的严格检查是帮你挡错的；看到 MySQL「不报错但结果怪」，先查 GROUP BY 列全不全。',
        },
        {
          title: '多列分组的粒度理解',
          scene: '老板要「城市 × 状态」交叉表：同一张 orders，维度从一列变两列。',
          body: '<code>group by u.city, o.status</code> 先按城市分、城市内再按状态分，每组一行。粒度 = GROUP BY 列的全体：多加一列，组数变多、每组的度量变小。写任何报表前先问自己「一行代表什么」--答案就是你的 GROUP BY。',
          sql: `select u.city, o.status,
       count(*) as 单数,
       sum(o.total_amount) as gmv
from orders o join users u on o.user_id = u.id
group by u.city, o.status
order by u.city, o.status;`,
          pitfall: '少写一个分组列，是报表「数字看起来对、粒度不对」的头号原因。',
        },
        {
          title: 'PG 特性：count(*) FILTER (WHERE ...)',
          scene:
            '老板要在一张表里同时看到总单、已付、取消。三个数字三条 SQL、三个结果对着粘？不用。',
          body: '<code>count(*) filter (where 条件)</code> 在聚合内部做条件计数：一次扫表，不同条件各数各的。比 <code>sum(case when ...)</code> 少一层嵌套、条件直读。这是 PG 特有语法（MySQL 没有），面试里写出来是加分项。',
          sql: `select u.city,
       count(*)                             as 总单,
       count(*) filter (where o.status = 2) as 已付,
       count(*) filter (where o.status = 3) as 取消,
       round(100.0 * count(*) filter (where o.status = 2) / count(*), 1) as 支付率
from orders o join users u on o.user_id = u.id
group by u.city;`,
          pitfall: 'filter 里只能写行级条件，不能引用别的聚合结果（那个要子查询或窗口函数）。',
        },
        {
          title: 'GROUPING SETS / ROLLUP：小计与总计',
          scene:
            '老板：「各城市销售额，顺便给个城市小计，最后来个总计。」--要在一个结果里出三种粒度。',
          body: '<code>rollup (u.city)</code> 在按城市分组的结果之外追加一行「所有城市合计」（该列显示 NULL）；rollup(a, b) 会出 a 小计、(a,b) 明细、总计多层。GROUPING SETS 是完全体：想要哪几种粒度自己点菜。',
          sql: `select coalesce(u.city, '【总计】') as 城市,
       count(*) as 单数,
       sum(o.total_amount) as gmv
from orders o join users u on o.user_id = u.id
group by rollup (u.city);`,
          pitfall:
            '小计行的 NULL 和业务 NULL 撞车：city 本身为 NULL 的用户会被 coalesce 吞进「总计」。用 grouping(city) 函数区分（返回 1 = 这是小计行）。',
        },
        {
          title: '报表口径三要素：<b>粒度</b>（一行代表什么）、<b>过滤</b>、<b>度量</b>',
          scene: '正式需求下来了，先别碰键盘--这一节是今天所有查询的方法论。',
          body: '任何报表口径 = 粒度（一行代表什么：一个用户？一个城市？）+ 过滤（哪些数据算进来：已支付才计 GMV？）+ 度量（算什么指标、分母是谁）。把这三行念给提需求的人确认过再写 SQL，能消灭一半返工。',
          pitfall:
            '「支付率」的分母是全部订单还是排除已取消？两个口径都合理、数字差一截--不写清楚必被追问。',
        },
      ],
      drill: [
        '按「城市 × 状态」双维度统计订单数与 GMV',
        '用 FILTER 在一条 SQL 里同时算：总单数、已支付单数、已取消单数',
        '用 <code>sum(case when ...)</code> 再写一遍第 2 题，对比可读性',
        '用 ROLLUP 输出「城市销售额 + 小计 + 总计」',
        '算各城市客单价（GMV / 订单数），并回答：city 为 NULL 的用户算哪个口径',
      ],
      drillAnswers: [
        {
          sql: `select u.city, o.status,
       count(*) as 单数,
       sum(o.total_amount) as gmv
from orders o
join users u on o.user_id = u.id
group by u.city, o.status
order by u.city nulls last, o.status;`,
          note: '粒度 = GROUP BY 列的全体：一行代表「某城市的某状态」。city 为 NULL、status 为 NULL 的行各自成组，这是口径的一部分，不是脏输出。',
        },
        {
          sql: `select u.city,
       count(*)                             as 总单,
       count(*) filter (where o.status = 2) as 已付,
       count(*) filter (where o.status = 3) as 取消
from orders o
join users u on o.user_id = u.id
group by u.city
order by u.city nulls last;`,
          note: '一次扫表、多个条件各数各的，比三条查询省两次扫描；filter 是 PG 特产，条件直读。',
        },
        {
          sql: `select u.city,
       count(*)                                      as 总单,
       sum(case when o.status = 2 then 1 else 0 end)  as 已付,
       sum(case when o.status = 3 then 1 else 0 end)  as 取消
from orders o
join users u on o.user_id = u.id
group by u.city
order by u.city nulls last;`,
          note: '结果与 FILTER 版一字不差，胜在跨库通用（MySQL 也认）；FILTER 胜在少一层嵌套、条件直读。两个都要会：面试写 FILTER 加分，接手老项目读得懂 CASE。',
        },
        {
          sql: `select coalesce(u.city, '【总计】') as 城市,
       count(*) as 单数,
       sum(o.total_amount) as gmv
from orders o
join users u on o.user_id = u.id
group by rollup (u.city);`,
          note: 'rollup 追加一行总计（city 显示 NULL）。撞车现场：city 本身为 NULL 的组也显示 NULL，会被 coalesce 一并标成「【总计】」--结果里出现两行总计就是它。严格区分用 grouping(u.city) = 1 判断小计行。',
        },
        {
          sql: `select u.city,
       count(*) as 单数,
       sum(o.total_amount) as gmv,
       round(sum(o.total_amount) / count(*), 2) as 客单价
from orders o
join users u on o.user_id = u.id
group by u.city
order by 客单价 desc;`,
          note: 'city 为 NULL 的用户（约 2%）是独立的「未知城市」口径：既不该被小计吞掉，也不该静默丢弃--报表备注写明「未知城市占 x%」。口径问题的正解永远是说清楚，不是藏起来。',
        },
      ],
      pass: '一条 SQL 输出「城市 | 总单 | 已付 | 取消 | 支付率」五列。',
    },
    {
      no: 12,
      title: '「注册了但没买过」的用户：集合运算',
      brief: '增长侧的同事问：有多少用户注册了却一单没下？你发现这本质是个集合问题。',
      split: [35, 70, 15],
      learn: [
        {
          title: 'UNION vs UNION ALL：去重的代价',
          scene: '老板要「上海和北京的用户名单合成一张表」。',
          body: 'UNION 把两个查询的结果上下叠起来<b>并去重</b>（内部要做排序或哈希）；UNION ALL 只叠不去重。去重有真实代价：数据量大时 UNION 明显更慢。上海和北京的用户本来就不重叠，用 UNION 等于白白多付一次去重。',
          sql: `select name, city from users where city = '上海'
union all
select name, city from users where city = '北京';

-- 换成 union 再跑一遍，对比 EXPLAIN 里多出来的 Unique/Sort 节点`,
          pitfall: '确认两段结果不可能重叠，就写 ALL；用它做「去重」是顺便的副作用，不是设计目标。',
        },
        {
          title: 'INTERSECT / EXCEPT：集合的交与差',
          scene: '「注册了但没下过单」「既买过商品 1 又买过商品 2」--听着就是集合的交与差。',
          body: 'INTERSECT 取两个查询都有的行；EXCEPT 取前者减去后者。配套铁律：两边<b>列数、列序、对应类型</b>必须一致（列名可以不同）。EXCEPT 天生去重：减完每行只留一份。',
          sql: `-- 注册了但从未下单（和 D10 的反连接对照着看）
select id from users
except
select user_id from orders;

-- 既买过「商品1」也买过「商品2」（明细表没有 user_id，经 orders 带出；商品 id 是 uuid，先按名字查出 id）
select o.user_id
from orders o join order_items i on i.order_id = o.id
where i.product_id = (select id from products where name = '商品1')
intersect
select o.user_id
from orders o join order_items i on i.order_id = o.id
where i.product_id = (select id from products where name = '商品2');`,
          pitfall: '集合运算的世界里没有「重复行」：两边都先去重再运算，和 JOIN 的世界规则不同。',
        },
        {
          title: 'PG 特性 DISTINCT ON：每组取一条',
          scene:
            '「每个用户最新的一单」：按用户分组、取组内 created_at 最大的那行。用 GROUP BY 写很别扭。',
          body: '<code>distinct on (user_id)</code> 是 PG 特产：结果里每个 user_id 只保留一行，而保留哪一行由 ORDER BY 决定。固定三件套：SELECT DISTINCT ON (列)、ORDER BY 的第一组列与它一致、再排取行依据。',
          sql: `select distinct on (user_id)
       user_id, id, created_at, total_amount
from orders
order by user_id, created_at desc;   -- 每个用户时间最大的一单`,
          pitfall:
            'ORDER BY 打头的列必须和 DISTINCT ON 的列一致，否则报错。它和窗口函数 row_number() 的分工在 W3 会展开。',
        },
      ],
      drill: [
        '同一查询用 UNION 和 UNION ALL 各跑一次，对比 EXPLAIN 里多出来的节点',
        '用 EXCEPT 查「注册了但从未下过单」的用户',
        '用 INTERSECT 查「既买过商品 1 也买过商品 2」的用户',
        '用 <code>DISTINCT ON (user_id)</code> 取每个用户最新一单',
        '用 LEFT JOIN 改写第 2 题，对比两种写法的执行计划',
      ],
      drillAnswers: [
        {
          sql: `explain
select name, city from users where city = '上海'
union all
select name, city from users where city = '北京';

explain
select name, city from users where city = '上海'
union
select name, city from users where city = '北京';`,
          note: 'UNION ALL 的计划只有一个 Append；UNION 在 Append 之上多出 HashAggregate（或 Sort + Unique）去重节点--去重是真实开销。两段结果天然互斥（一个用户只登记一个城市），确认不重叠就写 ALL。',
        },
        {
          sql: `select id from users
except
select user_id from orders;

-- 只要个数的话包一层
select count(*) as 从未下单用户数
from (
  select id from users
  except
  select user_id from orders
) t;`,
          note: 'EXCEPT = 集合减法：左边是全部用户 id，右边是下过单的 user_id，差集就是答案。两边列数、列序、对应类型必须一致；EXCEPT 天生去重，结果每行只一份。',
        },
        {
          sql: `-- 明细表没有 user_id，得经 orders 换算回用户；商品 id 是 uuid，先按名字查出 id
select o.user_id
from orders o join order_items i on i.order_id = o.id
where i.product_id = (select id from products where name = '商品1')
intersect
select o.user_id
from orders o join order_items i on i.order_id = o.id
where i.product_id = (select id from products where name = '商品2');`,
          note: '注意明细表没有 user_id，用户信息要到 orders 里找；两侧各是「买过某商品的用户集合」，INTERSECT 取交集。两侧本来就各自去重，intersect 外面不用再套 distinct。',
        },
        {
          sql: `select distinct on (user_id)
       user_id, id, created_at, total_amount
from orders
order by user_id, created_at desc;`,
          note: '三件套：DISTINCT ON (user_id)、ORDER BY 打头列与它一致、第二键 created_at desc 决定每组留哪一行（最新的）。打头列不一致 PG 直接报错，这是它在替你把关。',
        },
        {
          sql: `-- EXCEPT 版（第 2 题）
select id from users
except
select user_id from orders;

-- LEFT JOIN 反连接版
select u.id
from users u
left join orders o on o.user_id = u.id
where o.id is null;`,
          note: '结果相同，计划不同：反连接是 Hash Left Join + IS NULL 过滤，不用去重，数据量大时通常更快；EXCEPT 要对两边先去重再做集合减法。顺带记住 NOT IN 的坑：子查询里出现 NULL 会一行都不返回，本库 user_id 恰好非空，但别赌。',
        },
      ],
      pass: '说出 UNION 相比 UNION ALL 多做了什么操作，因此何时该用哪个。',
    },
    {
      no: 13,
      title: '月报日：八张业务报表',
      brief: '月底。老板要「公司经营月报」：品类、城市、复购、客单价……你一上午都在跟口径较劲。',
      tags: ['lab'],
      split: [10, 95, 15],
      learn: [
        {
          title:
            '报表口径三要素：<b>粒度</b>（一行代表什么）、<b>过滤</b>（算哪些数据）、<b>度量</b>（算什么指标）',
          scene: '月报日，八张报表排着队。每张动手前，先写三行字。',
          body: '拿到需求先答三个问题再写 SQL：一行代表什么（粒度）、哪些数据算进来（过滤）、算什么指标（度量）。比如「复购率」：粒度 = 用户；过滤 = 统计期内下过单的用户；度量 = 其中下单 ≥ 2 次的占比。三行写出来，SQL 就是把它翻译成代码。',
          sql: `-- 「复购率」的三要素翻译成 SQL
select round(100.0 * count(*) filter (where 单数 >= 2) / count(*), 1) as 复购率
from (
  select user_id, count(*) as 单数
  from orders
  group by user_id
) t;`,
          pitfall:
            '八张报表最容易口径打架的是分母：GMV 按全部订单还是已支付订单？全月统一一个口径，并写进报表备注。',
        },
      ],
      drillLabel: '练 · 95 min · 每题单条 SQL',
      drill: [
        '商品 GMV 的 TOP10 及其占总 GMV 的比例',
        '每月新增用户数与当月下单用户数',
        '客单价最高的 TOP10 商品',
        '下单超 24 小时仍未支付的订单明细',
        '各城市 GMV 排名',
        '复购用户数（下单 ≥ 2 次的用户）及复购率',
        '每个用户的首单时间与首单金额',
        '各状态订单的平均支付时长（paid_at 与 created_at 之差）',
      ],
      drillAnswers: [
        {
          sql: `select p.name as 商品,
       sum(i.qty * i.unit_price) as gmv,
       round(100.0 * sum(i.qty * i.unit_price)
             / sum(sum(i.qty * i.unit_price)) over (), 1) as 占比
from order_items i
join products p on p.id = i.product_id
group by p.id, p.name
order by gmv desc
limit 10;`,
          note: 'sum(...) over () 在分组之后、LIMIT 之前算出全局总 GMV，正好当分母。自洽校验：去掉 LIMIT，全部商品的占比之和 = 100%；TOP10 之和当然小于 100%。',
        },
        {
          sql: `with new_u as (
  select date_trunc('month', created_at) as 月份, count(*) as 新增用户数
  from users
  group by 1
),
act as (
  select date_trunc('month', created_at) as 月份,
         count(distinct user_id) as 当月下单用户数
  from orders
  group by 1
)
select coalesce(n.月份, a.月份) as 月份,
       coalesce(n.新增用户数, 0) as 新增用户数,
       coalesce(a.当月下单用户数, 0) as 当月下单用户数
from new_u n
full join act a on a.月份 = n.月份
order by 1;`,
          note: '两个数字来自不同的表和时间列，先各自按月聚合成「月份表」再对齐。用户注册横跨两年、订单只有近 90 天--必须 FULL JOIN，INNER JOIN 会把没订单的月份整行吃掉。',
        },
        {
          sql: `select p.name as 商品,
       sum(i.qty * i.unit_price) as gmv,
       count(distinct o.user_id) as 购买用户数,
       round(sum(i.qty * i.unit_price) / count(distinct o.user_id), 2) as 客单价
from order_items i
join orders o on o.id = i.order_id
join products p on p.id = i.product_id
group by p.id, p.name
order by 客单价 desc
limit 10;`,
          note: '口径题：分母选「购买该商品的用户数」（去重），不是订单数更不是件数--三种分母三个结果。选哪个都算对，错的是不把口径写进报表备注。',
        },
        {
          sql: `select o.id as 单号, o.created_at as 下单时间,
       p.name as 商品, i.qty as 数量, i.unit_price as 单价
from orders o
join order_items i on i.order_id = o.id
join products p on p.id = i.product_id
where o.status = 1
  and o.created_at < now() - interval '24 hours'
order by o.created_at, o.id;`,
          note: '「未支付」用 status = 1 圈定，别用 paid_at is null--已取消的单也没有 paid_at，口径会混进取消单。这里是在列明细不是聚合，一对多放大是应该的；千万别顺手 sum(o.total_amount)。',
        },
        {
          sql: `select u.city,
       sum(o.total_amount) as gmv,
       rank() over (order by sum(o.total_amount) desc) as 排名
from orders o
join users u on o.user_id = u.id
group by u.city
order by 排名;`,
          note: '窗口函数在 GROUP BY 之后求值，所以 over () 里能直接引用 sum(...)--排序键就是聚合结果。city 为 NULL 的组照常参与排名，展示时标「未知」。',
        },
        {
          sql: `select count(*) filter (where 单数 >= 2) as 复购用户数,
       count(*) as 下单用户数,
       round(100.0 * count(*) filter (where 单数 >= 2) / count(*), 1) as 复购率
from (
  select user_id, count(*) as 单数
  from orders
  group by user_id
) t;`,
          note: '三要素翻译：粒度 = 用户（先压成每人一行）、过滤 = 下过单的用户、度量 = 单数 ≥ 2 的占比。分母是「下过单的用户」而不是全部注册用户--两个口径差一截，月报里必须写明用的哪个。',
        },
        {
          sql: `select distinct on (o.user_id)
       o.user_id, u.name, o.created_at as 首单时间, o.total_amount as 首单金额
from orders o
join users u on u.id = o.user_id
order by o.user_id, o.created_at;`,
          note: 'D12 的 DISTINCT ON 直接派上用场：第二排序键改成升序，留下的就是最早一单。窗口函数 row_number() 也能做，W3 展开。',
        },
        {
          sql: `select coalesce(status::text, '未知') as 状态,
       count(*) as 单数,
       count(paid_at) as 有支付时间,
       round(avg(extract(epoch from (paid_at - created_at))) / 60, 1) as 平均支付时长_分钟
from orders
group by 1
order by 1;`,
          note: '只有已支付单有 paid_at，其余状态 avg 直接得 NULL（聚合跳空）--「平均支付时长」这个指标只对 status = 2 有意义。另外那 20 单脏数据（支付早于下单）是负数，会把均值拉低一点，正式月报该剔除。',
        },
      ],
      pass: '8 题全部单条 SQL 完成；第 1 题的占比之和必须等于 100%（自洽校验）。',
    },
    {
      no: 14,
      title: '周测：JOIN 陷阱专项',
      brief: '月报交付。复盘这一周踩过的所有 JOIN 坑，来一场限时专项测评。',
      tags: ['test'],
      split: [10, 70, 40],
      learnLabel: '复盘 · 10 min',
      drillLabel: '专项 12 题 · 110 min',
      learn: ['回看本周错题，重点看 JOIN 类'],
      drill: [
        'JOIN 之后 count 变多了，列出三种可能原因',
        '一对多连接导致订单金额被重复累加，写出两种修复方案',
        '用三种写法查「没有下过单的用户」并对比计划',
        'LEFT JOIN 后 <code>count(b.id)</code> 与 <code>count(*)</code> 结果不同，解释原因',
        '剩余 8 题：LeetCode 中等难度多表题',
      ],
      drillAnswers: [
        {
          note: '三种原因：① 一对多放大--连了 order_items 这类明细表，行数由「多」的一端决定；② 连接条件漏写或恒真（如 user_id = user_id），退化成笛卡尔积，行数 ≈ 两表行数之积；③ 右表连接列不唯一，本该一对一的关系实际是一对多。排查顺序：先笔算期望行数，再看 EXPLAIN 的估行数。',
        },
        {
          note: '方案一：先聚合再连接--CTE/子查询里按 order_id 把明细 sum 成「每单一行」，再 join 回 orders 做聚合；方案二：不连明细，直接用 orders.total_amount（seed 的 §B④ 已把它对齐成明细之和）。口述要点：重复累加的根源是「左表的列被多端的行重复携带」，先压缩多端就消掉了。',
        },
        {
          note: '三种写法：LEFT JOIN + o.id IS NULL（Hash Left Join，不用去重，大数据量通常最快）；NOT EXISTS（优化器常改写成 anti join，计划和 LEFT JOIN 版几乎一样）；EXCEPT（两边先去重再做集合减法）。EXPLAIN 对比三种节点，结论写进 notes.md。',
        },
        {
          note: 'LEFT JOIN 匹配不上时左行保留、右侧全 NULL：count(*) 数行，NULL 行也算 1；count(右表.非空列) 跳过 NULL。差值 = 没匹配上的左行数，「没下单显示 0」就是靠它实现的。',
        },
        {
          note: '选题集中在 INNER/LEFT JOIN、多表 GROUP BY、HAVING--正是本周标「高频」的内容。限时内做完；错题沿用第一周的归因法分三类（没懂概念 / 记不住语法 / 看错题意）记进 mistakes.md。',
        },
      ],
      pass: '12 题正确 ≥ 9 题；能画图解释一对多连接的金额翻倍问题。',
    },
  ],
};
