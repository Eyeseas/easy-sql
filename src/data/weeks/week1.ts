import type { Week } from '../../types/curriculum';

export const week1: Week = {
  no: 1,
  title: '入职第一周：老板的第一张表',
  short: '入职与单表',
  story:
    '公司刚成立半年，只有十来个人，你是第一个和数据沾边的人。老板把后台导出的订单表丢给你：「咱全部的生意都在里面。」你的任务：把它变成一个能查的库，然后开始接老板一个接一个的问题。',
  goal: '目标：零基础起步，周五闭卷完成 30 道单表查询题；任何单表需求不查文档能写对。',
  days: [
    {
      no: 1,
      title: '入职第一天：把老板的订单表变成库',
      brief:
        '入职第一天，老板发来订单导出文件：「明天告诉我昨天卖了多少。」你环顾四周--公司连个数据库都没有。',
      split: [40, 65, 15],
      learn: [
        {
          title: '什么是数据库 / 表 / 行 / 列：和 Excel 的对应关系',
          scene:
            '老板丢来一个订单导出文件，你只会用 Excel 打开它。今天起，同样的数据要换一种存放方式。',
          body: '对应关系一句话：数据库 = 整个工作簿文件，表 = 一个 sheet，行 = 一条订单记录，列 = 一个字段（id、金额、时间……）。本质区别在约束和访问方式：Excel 的单元格里塞什么都可以，数据库的每一列有<b>类型</b>（金额必须是数字）和<b>可空性</b>（支付时间可以没有），访问统一走 SQL 而不是鼠标点选。',
          sql: `-- 表在数据库里的样子：列有类型，行是一条条订单
select id, user_id, status, total_amount, created_at
from orders
limit 3;`,
          pitfall:
            'Excel 里「没填」和「填了 0」长得差不多；数据库里 NULL（没发生）和 0（发生了、值为零）是两个世界，D3 整天都在讲它。',
        },
        {
          title: 'Docker 起 PostgreSQL 16，psql 连进去',
          scene: '公司连个数据库都没有，你今天要自己搭一个--但不能往笔记本上裸装软件。',
          body: 'Docker 一条命令起一个干净的 PostgreSQL 16 容器，删掉重来毫无负担。<code>psql</code> 是 PG 官方命令行客户端，连进去就是你的操作台。装完先做三件事：进容器、开 psql、建库。',
          sql: `docker run -d --name pg16 -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
docker exec -it pg16 psql -U postgres
CREATE DATABASE shop;
\\c shop`,
          pitfall:
            '容器删了数据就没了。要持久化就加 <code>-v pgdata:/var/lib/postgresql/data</code> 挂个卷；练习期无所谓，崩了重灌反而干净。',
        },
        {
          title: '6 个元命令：\\l \\dt \\d \\x \\timing',
          scene: '进了 psql 就是一块黑屏--先学会「环顾四周」。',
          body: '元命令是 <b>psql 客户端</b>的功能，不是 SQL：<code>\\l</code> 列出所有库、<code>\\dt</code> 列出当前库的表、<code>\\d 表名</code> 看表结构（字段、类型、可空、默认值）、<code>\\x</code> 把宽结果竖排显示、<code>\\timing on</code> 显示每条 SQL 的耗时（W6 优化周全靠它）。',
          sql: `\\dt          -- 库里有哪些表
\\d orders    -- orders 的完整结构
\\timing on   -- 之后每条 SQL 都带耗时`,
          pitfall:
            '元命令以反斜杠开头、<b>不带分号</b>，只在 psql 里有效。换任何别的客户端（代码里连库）它们都不存在。',
        },
        {
          title: 'CREATE TABLE：orders 的字段类型你来定',
          scene: '建表没有标准答案，字段类型是业务判断题：这张表在你眼里是什么。',
          body: '每个字段回答两个问题：什么类型、能不能为空。id 用 uuid（导出文件里就是无序编号）；金额用 <code>numeric(10,2)</code> 定点小数，不是 float；status 用 int 存状态码；created_at 必填，paid_at 允许 NULL--<b>可空性是业务事实</b>：没支付的单就是没有支付时间。',
          sql: `CREATE TABLE orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  status       integer,
  total_amount numeric(10,2),
  created_at   timestamp NOT NULL,
  paid_at      timestamp
);`,
          pitfall:
            '金额用 float / double 会丢精度（二进制存不了 0.1），报表对不上账。钱永远 numeric / decimal。',
        },
        {
          title: '跑 seed.sql 的「D01」段：灌入 5 万行（里面埋了脏数据）',
          scene: '空表什么都查不了，把老板的订单灌进去。',
          body: '<code>psql -f 文件</code> 或进去之后 <code>\\i 文件</code> 执行整个脚本；今天只跑 §A 段两条语句（先 INSERT 5 万行，再 UPDATE 埋脏数据）。灌完 <code>select count(*)</code> 核对行数，数据里埋着负金额、时间倒挂、空状态--都是本周的练习素材。',
          sql: `-- 方式一：psql -f 整个文件，或编辑后只留 §A 段
-- 方式二：psql 里逐条粘贴执行
select count(*) from orders;   -- 50000`,
          pitfall:
            '同一段 INSERT 跑两遍 = 数据翻倍（或主键冲突）。发现数字不对劲，先怀疑自己重复灌过。',
        },
      ],
      drill: [
        'Docker 起 <code>pg16</code>，建库 <code>shop</code> 并连进去',
        '建 orders 表：字段类型自己定，定完对照本页下方的结构检查',
        '跑 seed.sql 的「D01」段灌入 5 万行',
        '<code>\\dt</code> 和 <code>\\d orders</code> 看结构，输出贴进 notes.md',
        '开 <code>\\timing</code>，跑 <code>select count(*) from orders</code>，记下行数与耗时',
      ],
      drillAnswers: [
        {
          sql: `docker run -d --name pg16 -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
docker exec -it pg16 psql -U postgres
CREATE DATABASE shop;
\\c shop`,
          note: 'psql 的元命令以反斜杠开头，只有 psql 认；CREATE DATABASE 是 SQL。',
        },
        {
          sql: `CREATE TABLE orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  status       integer,
  total_amount numeric(10,2),
  created_at   timestamp NOT NULL,
  paid_at      timestamp
);`,
          note: 'status 可空（业务上就是有脏数据）、paid_at 可空（没支付的单没有支付时间）--可空性是业务事实，别全写 NOT NULL。',
        },
        {
          sql: `-- seed.sql 的 §A 段共两条：先 INSERT 5 万行，再 UPDATE 埋 20 单时间倒挂
-- 在 psql 里逐条执行，或 psql -f 只跑这两条`,
          note: '答案不是抄 SQL，是把文件里 §A 的两条语句找出来跑掉；第 2 条 UPDATE 依赖第 1 条的结果。',
        },
        {
          note: '\\dt 列出库里的表（此刻只有 orders）；\\d orders 列出字段、类型、可空性、默认值和主键。把输出贴进 notes.md。',
        },
        {
          sql: `\\timing on
select count(*) from orders;   -- 50000 行`,
          note: '第一次跑会几毫秒到几十毫秒（全表扫描）；把行数和耗时记下来，第 6 周百万行时回来对比。',
        },
      ],
      pass: '库里有且只有 orders 一张表、5 万行；能不看结构说出每个字段的业务含义。',
    },
    {
      no: 2,
      title: '老板的第一个问题：昨天卖了多少',
      brief: '老板在工位后面喊：「昨天有多少单？」--你人生第一条业务查询。',
      split: [40, 65, 15],
      learn: [
        {
          title: 'SELECT 的解剖：选哪些列、从哪张表、* 与具体列',
          scene: '老板问昨天卖了多少。第一条 SQL 之前，先把 SQL 的「主谓宾」拆清楚。',
          body: '<code>select 列</code> 决定输出什么，<code>from 表</code> 决定从哪拿。<code>*</code> 是全部列，探索数据时用它看长相；正式查询写具体列--少传无用数据，读 SQL 的人一眼看出结果长什么样。',
          sql: `-- 探索：先看看数据长什么样
select * from orders limit 10;

-- 正式：要什么写什么
select id, total_amount, created_at from orders limit 10;`,
          pitfall: '生产代码里 select * 配上表结构变更会悄悄多传/错传数据，报错都懒得报。',
        },
        {
          title: 'WHERE 比较运算符与日期字面量',
          scene: '5 万行订单，老板只要昨天的。全表看一遍是人的活，不是 SQL 的。',
          body: '<code>where</code> 逐行判断表达式，结果为 TRUE 的行才保留。日期写法用「左闭右开」区间：<code>&gt;= 昨天 0 点</code> 且 <code>&lt; 今天 0 点</code>，一秒不多不少。不硬编码日期用 <code>current_date - 1</code>。',
          sql: `select count(*)
from orders
where created_at >= current_date - 1   -- 昨天 0 点起
  and created_at <  current_date;      -- 今天 0 点止`,
          pitfall:
            '时间戳别用等值判断：<code>created_at = current_date - 1</code> 只匹配「昨天 0 点整」那一瞬间。也别写 between（含两头，边界多算一天）。',
        },
        {
          title: 'ORDER BY 与 LIMIT：找「最大 / 最新」的标准姿势',
          scene: '老板要看金额最大的 10 单、最新的 10 单。',
          body: '标准姿势 = <code>order by 排序键 desc</code> 把想要的行顶到最上面，<code>limit n</code> 截取前 n 行。Top N 问题在 SQL 里永远这么解，没有别的语法。',
          sql: `select id, total_amount
from orders
order by total_amount desc
limit 10;`,
          pitfall:
            '金额或时间相同的行，顺序是未定义的--补第二排序键（如 <code>order by total_amount desc, id desc</code>）才稳定，这是面试加分点。',
        },
        {
          title: '排序不稳定：LIMIT 10 不加 ORDER BY 结果每次都不一样',
          scene: '你 <code>limit 10</code> 连跑 5 次，5 看似随机的结果，以为数据库坏了。',
          body: 'SQL 标准就不承诺无 ORDER BY 时的返回顺序：物理存储顺序、缓存、并行扫描都会影响先吐出哪 10 行。数据库没坏，是你的查询没定义「前 10」的依据。',
          sql: `-- 连跑 5 次，对比输出
select id, total_amount from orders limit 10;
select id, total_amount from orders limit 10;
select id, total_amount from orders limit 10;`,
          pitfall: '不带 order by 的 limit = 「随便给我 10 行」，业务上几乎一定是 bug。',
        },
      ],
      drill: [
        '<code>select * from orders limit 10</code> 先看看数据长什么样',
        '查昨天的订单数（先手写日期字面量，再想怎么不硬编码）',
        '查金额 &gt; 1000 的订单数',
        '按金额从大到小取前 10 单；再按 created_at 取最新 10 单',
        '<code>LIMIT 10</code> 不加 <code>ORDER BY</code> 连跑 5 次，观察差异并解释',
      ],
      drillAnswers: [
        {
          sql: `select * from orders limit 10;`,
          note: '顺眼扫一遍：哪些列有 NULL、金额长什么样、时间格式--后面几天的题都建立在对长相的印象上。',
        },
        {
          sql: `-- 先手写日期字面量（日期换成你做题时的「昨天」）
select count(*) from orders
where created_at >= timestamp '2026-08-27'
  and created_at <  timestamp '2026-08-28';

-- 不硬编码
select count(*) from orders
where created_at >= current_date - 1
  and created_at <  current_date;`,
          note: '用「左闭右开」范围，别对 created_at 套 ::date 或 date_trunc--列上套函数会让索引失效，第 6 周会亲眼看到。灌数脚本锚定 current_date，两种写法结果一致。',
        },
        {
          sql: `select count(*) from orders where total_amount > 1000;`,
        },
        {
          sql: `select id, total_amount from orders order by total_amount desc limit 10;

select id, created_at from orders order by created_at desc limit 10;`,
          note: '面试加分点：补第二排序键（如 order by created_at desc, id desc）--金额或时间相同的行顺序未定义，加个 id 才稳定。',
        },
        {
          note: '五次结果大概率不同。SQL 不承诺无 ORDER BY 时的顺序，返回顺序取决于物理存储和执行计划；「LIMIT 10 不加 ORDER BY」在业务上等于「随便取 10 行」。',
        },
      ],
      pass: '不查文档写出「日期范围 + 排序 + 取前 N」的查询。',
    },
    {
      no: 3,
      title: '「非已支付」的数字对不上：NULL 上场',
      brief:
        '你汇报「非已支付状态的订单」时数字对不上--运营说还有一批 status 为空的脏数据，而 <code>status &lt;&gt; 2</code> 把它们全漏掉了。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: '三值逻辑：TRUE / FALSE / UNKNOWN，以及 WHERE 只保留 TRUE',
          scene:
            '你用 status 不等于 2 统计「非已支付」，漏掉了一大批单。漏掉的那批 status 是 NULL--这不是 bug，是 SQL 的设计。',
          body: 'NULL 参与任何比较，结果既不是 TRUE 也不是 FALSE，而是第三个值 <b>UNKNOWN</b>。而 WHERE 只放行 TRUE--UNKNOWN 和 FALSE 一样被丢弃。所以 <code>status &lt;&gt; 2</code> 查不到 status 为 NULL 的行：不是「不等于 2」不成立，是「结果未知」就不放行。',
          sql: `select null = null,   -- NULL（UNKNOWN）
       null <> null,   -- NULL（UNKNOWN）
       not null;       -- NULL（UNKNOWN）
-- TRUE AND NULL = NULL；TRUE OR NULL = TRUE；FALSE OR NULL = NULL`,
          pitfall: '结论先背下来：NULL 和任何值比较（包括和自己）都得 UNKNOWN，永远不会是 TRUE。',
        },
        {
          title: 'IS NULL、IS NOT NULL、IS DISTINCT FROM',
          scene: '既然比较运算符对 NULL 失灵，判空就得有专门的语法。',
          body: '<code>is null</code> / <code>is not null</code> 是唯一能对 NULL 做出 TRUE/FALSE 判断的写法。进阶是 <code>is distinct from</code>：把 NULL 当成一个具体值参与比较，「不等于某值（连 NULL 也算）」的正确写法。',
          sql: `select count(*) from orders where status is null;             -- 状态为空的脏数据
select count(*) from orders where status <> 2;              -- 漏掉 NULL 行
select count(*) from orders where status is distinct from 2; -- 正确的「非已支付」`,
          pitfall: '「不等于某值」的需求永远先想到 IS DISTINCT FROM，&lt;&gt; 只对非 NULL 行负责。',
        },
        {
          title: 'NULL 参与比较、算术、排序时分别得到什么',
          scene: '脏数据的 NULL 会顺着各种运算悄悄传染，得知道传到哪一步会变成什么。',
          body: '算术：<code>null + 1 = null</code>，传染。聚合：<code>sum</code> / <code>avg</code> 把 NULL 当「这行不参与」。排序：PG 默认升序 NULL 排最后、降序排最前，可以用 <code>nulls first / last</code> 显式指定。',
          sql: `select null + 1;                          -- null
select 1 + 2 + null;                      -- null：一个环节空，整条链空

select id, status from orders
order by status desc nulls last;          -- 脏数据固定垫底`,
          pitfall:
            '各数据库对 NULL 排序位置不统一（MySQL 恒排最前），写报表想稳就显式写 nulls first/last。',
        },
        {
          title: 'count(*) vs count(col) 初见：NULL 不被 count(col) 数到',
          scene: '同一张表，三个 count 数出三个数，老板以为你在做假账。',
          body: '<code>count(*)</code> 数行，一行算一个；<code>count(列)</code> 只数该列<b>非空</b>的行。两个数字相减 = 该列为 NULL 的行数--这本身就是个查脏数据的小技巧。',
          sql: `select count(*),          -- 50000：总行数
       count(status),       -- ≈49478：有状态的
       count(paid_at)       -- ≈34968：付过钱的
from orders;`,
          pitfall: 'avg / sum 跳过 NULL 意味着「平均值」的分母变小了--分母口径问题 D4 展开。',
        },
      ],
      drill: [
        '用 <code>select null = null, null &lt;&gt; null, not null</code> 验证三值逻辑，做出 AND/OR 真值表',
        '查 status 为空的订单数；对比 <code>status &lt;&gt; 2</code> 的行数，解释差额来自哪',
        '对比 <code>count(*)</code> / <code>count(status)</code> / <code>count(paid_at)</code> 三个数字，解释差异',
        'paid_at 为 NULL 的订单在业务上是什么含义？写一句话进 notes.md',
        "用 <code>coalesce(status, '未知')</code> 把脏数据标出来，统计各状态订单数",
      ],
      drillAnswers: [
        {
          sql: `select null = null, null <> null, not null;
-- 三列结果都是 NULL（即 UNKNOWN）`,
          note: '关键结论：NULL 参与任何比较都得到 UNKNOWN，而 WHERE 只保留 TRUE。真值表两行：TRUE AND NULL=NULL、TRUE OR NULL=TRUE；FALSE AND NULL=FALSE、FALSE OR NULL=NULL。',
        },
        {
          sql: `select count(*) from orders where status is null;             -- ≈522
select count(*) from orders where status <> 2;              -- 漏掉 status 为 NULL 的行
select count(*) from orders where status is distinct from 2; -- 正确的「非已支付」`,
          note: '差额 = status 为 NULL 的行数：NULL <> 2 的结果是 UNKNOWN，不是 TRUE，被 WHERE 丢弃。「不等于某值」要用 IS DISTINCT FROM。',
        },
        {
          sql: `select count(*), count(status), count(paid_at) from orders;
-- 50000 / ≈49478 / ≈34968`,
          note: 'count(*) 数行，count(列) 只数该列非空的行；两个数字的差就是该列 NULL 的行数。',
        },
        {
          note: '业务含义：这单还没走完支付流程（待支付或已取消）。「没发生的事」在关系模型里用 NULL 表示，而不是 0 或空字符串--0 是「发生了、金额为零」，含义完全不同。',
        },
        {
          sql: `select coalesce(status::text, '未知') as 状态, count(*) as 单数
from orders
group by 1
order by 单数 desc;`,
          note: 'coalesce 两个参数类型必须一致，int 先 ::text；也可以用 CASE status WHEN ... 映射成中文。',
        },
      ],
      pass: "能解释「<code>col &lt;&gt; 'A'</code> 为什么查不到 col 为 NULL 的行」，并写出正确写法。",
    },
    {
      no: 4,
      title: '老板要状态分布：聚合与 GROUP BY',
      brief:
        '老板不想一个数字一个数字地问：「订单按状态分个类，各多少单、多少钱，顺便告诉我每档金额的分布。」',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: '聚合函数 count / sum / avg / min / max 的输入输出；count 的三种语义',
          scene: '老板要的是「分布」，不是某一个数字--把 5 万行压成几个数的运算。',
          body: '聚合函数吃很多行、吐一个值：<code>count</code> 数个数、<code>sum</code> 求和、<code>avg</code> 均值、<code>min / max</code> 极值。count 有三种语义要分清：<code>count(*)</code> 数行、<code>count(列)</code> 数非空、<code>count(distinct 列)</code> 数去重后的非空值。',
          sql: `select count(*),                      -- 总行数
       count(distinct user_id)        -- 多少个不同用户下过单
from orders;`,
          pitfall:
            'count(distinct a, b) 这种多列组合写法 PG 不直接支持，要写 count(distinct (a, b))。',
        },
        {
          title: 'GROUP BY：把很多行压成「每组一行」',
          scene: '「按状态分类」= 先按 status 把 5 万行分堆，再对每堆各算一个 count。',
          body: 'group by status 之后，5 万行变成 4 行（每个状态一行）。理解它最好的方式：把表想象成按状态码堆好的几摞，select 里的聚合函数对每一摞各算一次。status 为 NULL 的行不会消失，自己占一组。',
          sql: `select status, count(*) as 单数, sum(total_amount) as 总金额
from orders
group by status
order by 单数 desc;`,
          pitfall:
            '分组后每组只剩一行，select 里出现「既不在 group by、也没被聚合」的列会报错--W2 D11 专门拆这个约束。',
        },
        {
          title: 'WHERE（分组前过滤）vs HAVING（分组后过滤）',
          scene: '「找出订单数超过 100 的日期」--这个 100 是数出来的，数之前它还不存在。',
          body: '执行顺序说了算：WHERE 在分组<b>前</b>作用于原始行，HAVING 在分组<b>后</b>作用于组。判断条件用到聚合结果（每组数出来的那个数）的，只能进 HAVING；HAVING 里可以放心写 <code>count(*)</code>，WHERE 里写它直接报错。',
          sql: `select created_at::date as 日期, count(*) as 单数
from orders
group by 1
having count(*) > 100          -- 过滤的是「组」
order by 1;`,
          pitfall: '报错 aggregate functions are not allowed in WHERE 就是把聚合条件写错了地方。',
        },
        {
          title: 'sum / avg 自动跳过 NULL 带来的分母问题',
          scene: '运营质疑你算的「平均金额」：和 Excel 里算的不一样。',
          body: 'sum / avg 遇到 NULL 行直接跳过：sum 没影响（加零而已），但 avg 的<b>分母变小了</b>--Excel 的 AVERAGE 其实也一样，但没人意识到。想「NULL 按 0 参与平均」要自己 <code>avg(coalesce(列, 0))</code>，两个口径都对，错的是不说明口径。',
          sql: `select avg(total_amount),                 -- 分母 = 非空行数
       avg(coalesce(total_amount, 0))    -- 分母 = 全部行数
from orders;`,
          pitfall: '报「平均值」之前先回答：分母是谁？这是口径问题，不是语法问题。',
        },
        {
          title: 'CASE 两种写法（简单式 / 搜索式）：把值映射成标签、把金额分档',
          scene:
            '老板看不懂状态码，报表要输出「已支付 / 待支付」；还要把连续的金额切成 0-100 / 100-500 / 500+ 三档。',
          body: '简单式 <code>case 列 when 值 then ...</code> 做等值映射；搜索式 <code>case when 条件 then ...</code> 做任意判断（分档、多条件）。条件<b>从上往下，第一个命中生效</b>，所以分档的条件按从小到大排；<code>else</code> 兜住没列到的值和 NULL。',
          sql: `-- 简单式：值 -> 标签
select case status when 2 then '已支付'
                   when 1 then '待支付'
                   when 3 then '已取消'
                   else '未知' end as 状态
from orders limit 5;

-- 搜索式：金额分档（条件顺序就是判断顺序）
select case when total_amount < 100 then '0-100'
            when total_amount < 500 then '100-500'
            else '500+' end as 金额档, count(*)
from orders
group by 1;`,
          pitfall: '分档条件写反（先 &lt; 500 后 &lt; 100），所有小单都进了第一档--顺序就是逻辑。',
        },
      ],
      drill: [
        '按状态统计订单数和总金额',
        '算每种状态的订单占比（总单数用子查询再除）',
        '用 CASE 把状态映射成中文标签（如「已支付」「待支付」）再分组',
        '按金额分档（0–100 / 100–500 / 500+）统计订单数与占比',
        '用 HAVING 找出订单数 &gt; 100 的日期，并解释为什么这题不能用 WHERE',
      ],
      drillAnswers: [
        {
          sql: `select status, count(*) as 单数, sum(total_amount) as 总金额
from orders
group by status
order by 单数 desc;`,
          note: 'status 为 NULL 的行不会消失，自己成一组出现在结果里。',
        },
        {
          sql: `select status,
       round(count(*) * 100.0 / (select count(*) from orders), 1) as 占比
from orders
group by status
order by 占比 desc;`,
          note: '写 100.0 别写 100--整数除整数得 0。总数用标量子查询；第 4 题会见到免子查询的窗口写法。',
        },
        {
          sql: `select case status
         when 2 then '已支付'
         when 1 then '待支付'
         when 3 then '已取消'
         else '未知'
       end as 状态,
       count(*) as 单数,
       sum(total_amount) as 总金额
from orders
group by 1
order by 单数 desc;`,
          note: '这是 CASE 的「简单式」；else 兜住 NULL 和没列出的值。group by 1 = 按第一列分组。',
        },
        {
          sql: `select case when total_amount < 100 then '0-100'
            when total_amount < 500 then '100-500'
            else '500+'
       end as 金额档,
       count(*) as 单数,
       round(count(*) * 100.0 / sum(count(*)) over (), 1) as 占比
from orders
group by 1
order by 1;`,
          note: '这是「搜索式」CASE，条件从上往下第一个命中生效。sum(count(*)) over () 是窗口函数算总数，不用再写子查询（W3 正式讲）。',
        },
        {
          sql: `select created_at::date as 日期, count(*) as 单数
from orders
group by 1
having count(*) > 100
order by 1;`,
          note: '「订单数 > 100」是对聚合结果的判断，分组之前这个数还不存在，所以不能用 WHERE。WHERE 过滤行（分组前），HAVING 过滤组（分组后）。',
        },
      ],
      pass: '一条 SQL 输出「状态 | 订单数 | 金额 | 占比%」完整报表。',
    },
    {
      no: 5,
      title: '数据是脏的：函数与清洗',
      brief:
        '导数据时埋的雷陆续爆了：金额有负数、有的订单 paid_at 比 created_at 还早。老板：「能不能清洗成能看的样子？」',
      split: [35, 70, 15],
      learn: [
        {
          title: '字符串函数：concat / substring / split_part / trim / lpad',
          scene: '老板要「ORD-000001」格式的业务单号--拼接、截取、补零，全是字符串函数的活。',
          body: '一句话各记一个用途：<code>concat</code> / <code>||</code> 拼接、<code>substring</code> 按位置截取、<code>split_part(串, 分隔符, 第几段)</code> 按分隔符拆、<code>trim</code> 去首尾空白、<code>lpad(文本, 总长, 补什么)</code> 左侧补字符到指定长度。',
          sql: `select 'ORD-' || lpad('123', 6, '0');        -- ORD-000123
select split_part('ORD-000123', '-', 2);     -- 000123
select substring('ORD-000123' from 5 for 3); -- 000`,
          pitfall: 'lpad 的参数是文本，数字要先 <code>::text</code>；数字直接塞进去会报类型错。',
        },
        {
          title: '类型转换 :: 与 cast()，转换失败怎么办',
          scene: "字符串 '123' 要参与计算、'000123' 要变回数字--类型不转，SQL 寸步难行。",
          body: "<code>::</code> 是 PG 的简写（<code>cast(x as 类型)</code> 是标准写法），<code>'123'::int</code>、<code>123::text</code> 随手转。要命的是转换失败直接<b>报错</b>：整条查询挂掉，一行脏数据毁一锅。清洗脏数据时先用 <code>~</code> 正则验格式，确认能转再转。",
          sql: `select '123'::int + 1;                          -- 124
select 'ORD-000123' ~ '^ORD-\\d{6}$';          -- true：格式合法才转
select split_part('ORD-000123', '-', 2)::int;  -- 123`,
          pitfall:
            'PG 没有内置的「转换失败返回 NULL」函数（别的库叫 try_cast），要么先验格式，要么自定义函数。',
        },
        {
          title: 'COALESCE / NULLIF / GREATEST / LEAST',
          scene: '负金额要抬到 0、除法分母可能为 0、展示时 NULL 要换文字--四个小工具各治一病。',
          body: '<code>coalesce(a, b, ...)</code> 取第一个非空（NULL 兜底）；<code>nullif(a, b)</code> 在 a=b 时返回 NULL（专治除零：<code>x / nullif(y, 0)</code> 分母为 0 得 NULL 而不是崩）；<code>greatest / least</code> 取多值中的最大 / 最小（负金额抬零用 greatest(金额, 0)）。',
          sql: `select coalesce(paid_at, created_at) as 最后动作时间   -- NULL 兜底
from orders limit 5;

select greatest(total_amount, 0) as 修正展示     -- 负数抬 0
from orders where total_amount < 0 limit 5;`,
          pitfall: '除法永远配 nullif(分母, 0) 防御--报表崩在线上多半是没写它。',
        },
        {
          title: 'round / abs 修数值：整数除法的坑',
          scene: '算占比输出全是 0，数据明明没错。',
          body: '<code>round(x, n)</code> 四舍五入到 n 位，n 可以是负数（-1 舍到十位）；<code>abs</code> 绝对值。占比输出为 0 的元凶几乎总是整数除法：<code>1 / 2</code> 在 SQL 里得 0，写 <code>100.0 * a / b</code> 先把一边变浮点。',
          sql: `select round(1234.56, -1);         -- 1230：舍到十位
select 1 / 2, 100.0 * 1 / 2;       -- 0 vs 50
select abs(-42.5);                 -- 42.5`,
          pitfall: '整数 / 整数 = 整数（向零截断），参与除法前先写 100.0 或 ::numeric。',
        },
        {
          title: '清洗的正确姿势：先「展示时修正」，别急着 UPDATE 原表',
          scene: '老板说「洗成能看的样子」--你想直接把负金额 update 成 0。',
          body: '原表是<b>事实记录</b>：负金额是「导出工具出了问题」这个事实的证据，UPDATE 掉它，问题就永远查不到了。正确姿势是在查询层修正展示（greatest、coalesce、case），原表保持原样；什么时候真的要改表、怎么改才安全，W5 专门讲。',
          sql: `-- 展示时修正：原表不动
select id,
       total_amount as 原始值,
       greatest(total_amount, 0) as 展示值
from orders
where total_amount < 0 limit 5;`,
          pitfall: '动手 UPDATE 原表 = 销毁证据。清洗的第一原则：能不动原表就不动。',
        },
      ],
      drill: [
        '找出负金额订单，用 <code>greatest(total_amount, 0)</code> 修正展示',
        '查出 paid_at 早于 created_at 的异常单（数据里埋了，找出几条）',
        '金额四舍五入到十位（<code>round(x, -1)</code>），统计各档订单数',
        '用 <code>row_number()</code> 按时间顺序给订单编号，再拼出「ORD-000001」格式的业务单号（<code>lpad</code>）',
        '用 <code>split_part</code> 把第 4 题的单号反解回数字，验证与编号一致',
      ],
      drillAnswers: [
        {
          sql: `select id, total_amount as 原金额,
       greatest(total_amount, 0) as 修正展示
from orders
where total_amount < 0;     -- ≈95 行`,
          note: 'greatest(列, 0) 把负数抬到 0。注意没有 UPDATE 原表--原表是事实记录，修正只发生在展示层。',
        },
        {
          sql: `select id, created_at, paid_at
from orders
where paid_at < created_at;   -- 20 行`,
          note: '灌数时故意埋的 20 单；真实业务里这种行一般意味着时钟问题或补录数据，要上报而不是静默修掉。',
        },
        {
          sql: `select round(total_amount, -1) as 金额档, count(*) as 单数
from orders
group by 1
order by 1;`,
          note: 'round 的第二个参数可以是负数：-1 舍到十位，-2 舍到百位。',
        },
        {
          sql: `select 'ORD-' || lpad(row_number() over (order by created_at)::text, 6, '0') as 业务单号
from orders
limit 5;`,
          note: 'lpad(文本, 总长度, 补什么)：左补零到 6 位；数字要先 ::text 才能 lpad。',
        },
        {
          sql: `select split_part('ORD-000123', '-', 2)::int;   -- 123`,
          note: 'split_part(串, 分隔符, 第几段)。能成功 ::int 说明格式还原对了；真实验证时对第 4 题的输出列做反解再比对。',
        },
      ],
      pass: '负金额、时间倒挂、空状态三类脏数据各有处理办法，能说出为什么不直接改原表。',
    },
    {
      no: 6,
      title: '第一份周报：日期处理与执行顺序',
      brief:
        '老板周五要看「近 30 天每天卖多少」。你发现没有订单的日期在报表里整行消失；顺便，是时候搞清楚一条 SQL 到底按什么顺序执行了。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: 'date / timestamp / interval；date_trunc 按天周月截断、extract 取分量',
          scene: '周报要按天、按周汇总--不搞清楚时间类型，分组都是错的。',
          body: "<code>date</code> 只有日期，<code>timestamp</code> 带时分秒，<code>interval</code> 是时间段（加减日期用）。两个主力函数：<code>date_trunc('week', 列)</code> 截断到所在周周一零点（按周分组就靠它）；<code>extract('year' from 列)</code> 取出年 / 月 / 日等分量。",
          sql: `select date_trunc('week', current_date);      -- 本周一 0 点
select extract('dow' from current_date);      -- 星期几（0=周日）
select current_date + interval '1 day';       -- 明天`,
          pitfall: "date_trunc('week') 的周从<b>周一</b>开始；业务如果按周日切周，得自己算偏移。",
        },
        {
          title: 'generate_series 生成日期序列左连接补零',
          scene:
            '近 30 天日报交上去，老板发现没单的日期整行消失--不是没卖，是没卖的日子连行都没有。',
          body: "解法的骨架：用 <code>generate_series(起, 止, interval '1 day')</code> 造出完整的 30 行日期，把它当<b>左表</b>，left join orders。没订单的日期那行 o.* 全是 NULL，靠 <code>count(o.id)</code> 数出 0、<code>coalesce</code> 把 NULL 金额补 0。",
          sql: `select d::date as 日期,
       count(o.id) as 订单数,
       coalesce(sum(o.total_amount), 0) as gmv
from generate_series(current_date - 29, current_date, interval '1 day') d
left join orders o
  on o.created_at >= d and o.created_at < d + interval '1 day'
group by d
order by d;`,
          pitfall:
            '日期序列是驱动表（左表），写在 from 里、orders 去 join 它--方向反了补零就失效。',
        },
        {
          title: '查「上周一到上周日」不硬编码日期的写法',
          scene: '写死日期的报表下周就作废，老板每周都要--日期必须算出来。',
          body: "公式就一行：<code>date_trunc('week', current_date)</code> 是本周一零点，减 7 天得上周一零点，左闭右开到本周一。所有「上一个周期」的需求都是这个模板：先锚定本周期的起点，再平移。",
          sql: `where created_at >= date_trunc('week', current_date) - interval '1 week'
  and created_at <  date_trunc('week', current_date)`,
          pitfall:
            '时间戳别用 between：它含两头，上周日 23:59:59.999 之后、周一零点之前的毫秒归属说不清。',
        },
        {
          title:
            '九步逻辑执行顺序：FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> LIMIT',
          scene:
            '本周背不下来这个，下周的多表查询会处处撞墙。它是理解一切「为什么这样写不行」的钥匙。',
          body: '书写顺序和执行顺序是两回事：先有表（FROM/JOIN），再筛行（WHERE），再分组（GROUP BY）、筛组（HAVING），然后才算 SELECT 里写的东西，DISTINCT、ORDER BY、LIMIT 依次收尾。你在 WHERE 里用不了 SELECT 的别名、在 WHERE 里写不了聚合，全是这一个原因。',
          sql: `select status,                -- 6. SELECT 决定输出哪些列
       count(*) as n           -- 6. 聚合在这里算出来
from orders
where total_amount > 100      -- 3. WHERE 过滤行
group by status               -- 4. 分组，每组之后只剩一行
having count(*) > 10          -- 5. HAVING 过滤组
order by n desc               -- 8. 排序（此时才能用别名 n）
limit 3;                      -- 9. 最后才取前 3`,
          pitfall:
            '面试必背。默写不出来的话，把它当成「一句话说明书」：先拿数据，再筛数据，再算数据，最后摆盘。',
        },
        {
          title: '别名可见性：为什么 WHERE 用不了 SELECT 的别名，ORDER BY 却可以',
          scene: '你在 where 里写了 select 定义的别名，报错 column does not exist--明明拼写没错。',
          body: '还是执行顺序：WHERE 是第 3 步、SELECT 是第 6 步--WHERE 执行时别名还没出生；ORDER BY 在 SELECT 之后，别名已经存在。一句话：<b>一个子句只能用它执行时已经存在的东西</b>。',
          sql: `select total_amount as amt
from orders
where amt > 100;     -- ERROR: column "amt" does not exist
-- order by amt 却没问题`,
          pitfall:
            'PG 的 group by 其实允许用别名（group by amt 可以），但这是方言、可移植性差--按「别名只有 ORDER BY 能用」记最安全。',
        },
      ],
      drill: [
        '近 30 天每日订单数和 GMV，<b>没有订单的日期要补 0</b>（generate_series 左连接）',
        "按周统计订单数与 GMV（<code>date_trunc('week')</code>）",
        '查「上周」的订单，不许硬编码日期',
        '写一条包含全部九个子句的查询，在注释里标注每步之后大约剩多少行',
        '故意在 WHERE 里用 SELECT 定义的别名，记下报错并解释原因',
      ],
      drillAnswers: [
        {
          sql: `select d::date as 日期,
       count(o.id) as 订单数,
       coalesce(sum(o.total_amount), 0) as gmv
from generate_series(current_date - 29, current_date, interval '1 day') d
left join orders o
  on o.created_at >= d and o.created_at < d + interval '1 day'
group by d
order by d;`,
          note: '骨架是 generate_series 造出 30 行日期，左连接让「没订单的日期」也留一行（o.* 全 NULL），再靠 count(o.id) 数非空、coalesce 把 NULL 补 0。',
        },
        {
          sql: `select date_trunc('week', created_at) as 周,
       count(*) as 单数,
       sum(total_amount) as gmv
from orders
group by 1
order by 1;`,
          note: "date_trunc('week', ...) 以周一为一周的开始，截断到那天的零点。",
        },
        {
          sql: `select id, created_at
from orders
where created_at >= date_trunc('week', current_date) - interval '1 week'
  and created_at <  date_trunc('week', current_date);`,
          note: '本周一零点减 7 天 = 上周一零点，左闭右开正好是上周一到上周日。',
        },
        {
          sql: `select status,                -- 6. SELECT 决定输出哪些列
       count(*) as n           -- 6. 聚合在这里算出来
from orders
where total_amount > 100      -- 3. WHERE 过滤行
group by status               -- 4. 分组，每组之后只剩一行
having count(*) > 10          -- 5. HAVING 过滤组
order by n desc               -- 8. 排序（此时才能用别名 n）
limit 3;                      -- 9. 最后才取前 3`,
          note: '注释里的编号就是九步逻辑顺序的位置；DISTINCT 在第 7 步（SELECT 之后）。书写顺序 ≠ 执行顺序。',
        },
        {
          sql: `select total_amount as amt
from orders
where amt > 100;
-- ERROR: column "amt" does not exist`,
          note: 'WHERE 是第 3 步，SELECT 是第 6 步--WHERE 执行时别名还没出生；ORDER BY 在 SELECT 之后，所以可以用别名。',
        },
      ],
      pass: '白纸默写出九步顺序；补零日报完整无缺行。',
    },
    {
      no: 7,
      title: '周测 + 第一份经营周报',
      brief: '第一周结束。老板要一份「本周经营周报」，你就用它来验收自己这周学的一切。',
      tags: ['test'],
      split: [10, 70, 40],
      learnLabel: '复盘 · 10 min',
      drillLabel: '测评 + 周报 · 110 min',
      learn: ['翻一遍本周 notes.md，标出还讲不利索的点'],
      drill: [
        '70 分钟闭卷做 30 道单表查询题（LeetCode 简单难度 + 自出题）',
        '错题全部重写一遍，写进 mistakes.md',
        '错题归因：分成「没懂概念 / 记不住语法 / 看错题意」三类统计',
        '写出给老板的周报：总单量 / GMV / 状态分布 / 近 7 天趋势（每日一行，缺日补 0）',
        '把「逻辑执行顺序」和「NULL 三值逻辑」各写成 5 句话的口述稿',
      ],
      drillAnswers: [
        {
          note: '闭卷 70 分钟，30 题做完再对答案，中途不查任何资料。出题范围就是 D1–D6：SELECT/WHERE/ORDER BY/LIMIT、NULL 三值逻辑、聚合与 GROUP BY、CASE、日期函数与补零。',
        },
        {
          note: '重写错题时先默写「我当时的思路」，再写正确答案，两句并排放--差异在哪一步，就是下次的检查点。',
        },
        {
          note: '归因模板：① 没懂概念（回当天「学」栏重看并口述一遍）；② 记不住语法（连续 3 天每天默写一次）；③ 看错题意（以后读题先圈名词和限定词）。统计三类各占几个，集中在哪类就补哪类。',
        },
        {
          sql: `-- 总单量 / GMV
select count(*) as 总单量, sum(total_amount) as gmv from orders;

-- 状态分布（含占比）
select coalesce(status::text, '未知') as 状态,
       count(*) as 单数,
       round(count(*) * 100.0 / sum(count(*)) over (), 1) as 占比
from orders
group by 1
order by 单数 desc;

-- 近 7 天趋势（缺日补 0）
select d::date as 日期,
       count(o.id) as 单数,
       coalesce(sum(o.total_amount), 0) as gmv
from generate_series(current_date - 6, current_date, interval '1 day') d
left join orders o
  on o.created_at >= d and o.created_at < d + interval '1 day'
group by d
order by d;`,
          note: '周报的每个数字都来自这三条查询；面试官追问「这个占比怎么算的」你要能当场说出分母是什么。',
        },
        {
          note: '口述稿结构：一句话结论 -> 为什么这样设计 -> 一个例子 -> 一个边界/反例。每篇念出来控制在 60 秒内，念不顺就是还没懂。',
        },
      ],
      pass: '30 题正确 ≥ 24 题；周报里每个数字都能对应到一条你写过的查询。',
    },
  ],
};
