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
        '什么是数据库 / 表 / 行 / 列：和 Excel 的对应关系',
        'Docker 起 PostgreSQL 16，<code>psql</code> 连进去',
        '6 个元命令：<code>\\l \\dt \\d \\x \\timing</code>',
        '<code>CREATE TABLE</code>：orders 的字段类型你来定（结构见本页下方）',
        '跑 <code>seed.sql</code> 的「D01」段：灌入老板的 5 万行订单（里面埋了脏数据）',
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
        '<code>SELECT</code> 的解剖：选哪些列、从哪张表、<code>*</code> 与具体列',
        '<code>WHERE</code> 比较运算符与日期字面量',
        '<code>ORDER BY</code> 与 <code>LIMIT</code>：找「最大 / 最新」的标准姿势',
        '排序不稳定：为什么 <code>LIMIT 10</code> 不加 <code>ORDER BY</code> 结果每次都不一样',
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
        '三值逻辑：TRUE / FALSE / UNKNOWN，以及 WHERE 只保留 TRUE',
        '<code>IS NULL</code>、<code>IS NOT NULL</code>、<code>IS DISTINCT FROM</code>',
        'NULL 参与比较、算术、排序时分别得到什么',
        '<code>count(*)</code> vs <code>count(col)</code> 初见：NULL 不被 count(col) 数到',
      ],
      drill: [
        '用 <code>select null = null, null &lt;&gt; null, not null</code> 验证三值逻辑，做出 AND/OR 真值表',
        '查 status 为空的订单数；对比 <code>status &lt;&gt; 2</code> 的行数，解释差额来自哪',
        '对比 <code>count(*)</code> / <code>count(status)</code> / <code>count(paid_at)</code> 三个数字，解释差异',
        'paid_at 为 NULL 的订单在业务上是什么含义？写一句话进 notes.md',
        '用 <code>coalesce(status, \'未知\')</code> 把脏数据标出来，统计各状态订单数',
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
      brief: '老板不想一个数字一个数字地问：「订单按状态分个类，各多少单、多少钱，顺便告诉我每档金额的分布。」',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        '聚合函数 count / sum / avg / min / max 的输入输出；<code>count(*)</code> / <code>count(col)</code> / <code>count(distinct col)</code> 的语义差异',
        'GROUP BY：把很多行压成「每组一行」',
        'WHERE（分组前过滤）vs HAVING（分组后过滤）',
        'sum / avg 自动跳过 NULL 带来的分母问题',
        '<code>CASE</code> 两种写法（简单式 / 搜索式）：把值映射成标签、把金额分档',
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
        '字符串函数：<code>concat</code> <code>substring</code> <code>split_part</code> <code>trim</code> <code>lpad</code>',
        '类型转换 <code>::</code> 与 <code>cast()</code>，转换失败怎么办',
        '<code>COALESCE</code> / <code>NULLIF</code> / <code>GREATEST</code> / <code>LEAST</code>',
        '<code>round</code> / <code>abs</code> 修数值',
        '清洗的正确姿势：先「展示时修正」，别急着 <code>UPDATE</code> 原表（W5 讲为什么）',
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
        '<code>date</code> / <code>timestamp</code> / <code>interval</code>；<code>date_trunc</code> 按天周月截断、<code>extract</code> 取分量',
        '<code>generate_series</code> 生成日期序列左连接补零',
        '查「上周一到上周日」不硬编码日期的写法',
        '九步逻辑执行顺序：FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> LIMIT',
        '别名可见性：为什么 WHERE 用不了 SELECT 的别名，ORDER BY 却可以',
      ],
      drill: [
        '近 30 天每日订单数和 GMV，<b>没有订单的日期要补 0</b>（generate_series 左连接）',
        '按周统计订单数与 GMV（<code>date_trunc(\'week\')</code>）',
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
