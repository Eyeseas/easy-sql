import type { Week } from '../../types/curriculum';

export const week4: Week = {
  no: 4,
  title: '增长团队入场：窗口函数',
  short: '窗口函数',
  story:
    '公司拿到融资，增长团队进场，user_logins 登录日志接了进来。他们不问「总共多少」，问「排名第几」「比上个月涨了多少」「连续登录了多少天」。GROUP BY 不再够用--窗口函数进场，这也是面试的分水岭。',
  goal: '目标：这周决定你是「会 SQL」还是「SQL 不错」。经典题型形成肌肉记忆。',
  days: [
    {
      no: 22,
      title: '登录日志接入：窗口函数是什么',
      brief:
        '增长团队接入 30 万行登录日志，第一个需求就让你愣住：「每条登录记录旁边，带上这个用户总共登录过几次。」--行不能被压掉，还得聚合。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: 'OVER (PARTITION BY ... ORDER BY ...) 三个部分各自的作用',
          scene: '「每条登录记录旁边带上该用户的登录总次数」--既不能丢行，又要有聚合值。',
          body: '公式：聚合/排名函数 + <code>over (...)</code> = 窗口函数。<code>partition by user_id</code> 把行按用户分堆（像 group by，但只是「围出计算范围」）；<code>order by</code> 在堆内排序（排名、位移类函数必需）；括号空着 = 全表一大堆。',
          sql: `select user_id, login_at,
       count(*) over (partition by user_id) as 该用户登录总次数
from user_logins
limit 10;`,
          pitfall:
            'over() 不能省：聚合函数带 over 才是窗口函数，不带就是普通聚合（受 group by 管辖）。多写一个括号，语义两个世界。',
        },
        {
          title: '与 GROUP BY 的本质区别：<b>不压缩行数</b>',
          scene:
            '用 group by 只能拿到「每个用户登录几次」4 行；需求要的是 30 万行明细、每行带个数。',
          body: 'group by 把 N 行压成每组织一行；窗口函数 N 行进去 N 行出来，只是<b>每行旁边多了几列计算结果</b>。判断口诀：需求要「只看汇总」用 group by；要「明细和统计值同框」用窗口。以前用「group by 再 join 回去」实现的报表，全部可以一句话换成窗口。',
          sql: `-- group by：1 万行（每用户一行）
select user_id, count(*) from user_logins group by user_id;
-- 窗口：30 万行（每条记录一行，旁边带总数）
select user_id, login_at, count(*) over (partition by user_id) from user_logins;`,
          pitfall: '看到「group by 完又 join 回原表拿明细」的 SQL，一律是窗口函数的存量债。',
        },
        {
          title: '窗口函数在逻辑执行顺序中的位置（HAVING 之后、ORDER BY 之前）',
          scene: 'D6 背的九步顺序，今天要插进一个新步骤。',
          body: '窗口函数在 <b>SELECT 阶段</b>计算，位置在 HAVING 之后、DISTINCT / ORDER BY 之前。这意味着两件事：① 它看到的是 WHERE / HAVING 过滤<b>之后</b>的行（过滤条件影响了它的计算范围）；② WHERE 执行时它还不存在（下一条的坑）。',
          sql: `-- 先过滤（WHERE）再算窗口：count 数的是"过滤后"的行
select user_id, login_at,
       count(*) over (partition by user_id) as n
from user_logins
where login_at >= current_date - 30;   -- 窗口只看到最近 30 天的行`,
          pitfall:
            '想要「全量统计 + 只显示部分行」时，别在 WHERE 里过滤--先窗口再在外层过滤（子查询包一层）。',
        },
        {
          title: '因此不能写在 WHERE / GROUP BY / HAVING 里',
          scene:
            '你顺手写了 <code>where count(*) over (...) &gt; 5</code>，报错 window functions are not allowed in WHERE。',
          body: '原因就是执行顺序：WHERE 是第 3 步，窗口值第 6 步才算出来，WHERE 执行时它根本不存在。标准修法：<b>子查询里先算窗口，外层再过滤</b>。这个「包一层」的动作本周要形成肌肉记忆，天天用。',
          sql: `select *
from (
  select user_id, login_at,
         count(*) over (partition by user_id) as n
  from user_logins
) t
where t.n > 5;      -- 过滤窗口结果，必须在子查询外面`,
          pitfall:
            '同理 HAVING 里也不能用窗口函数；排序键里可以用（ORDER BY 在 SELECT 之后），但几乎没这个需求。',
        },
        {
          title: 'WINDOW w AS (...) 复用窗口定义',
          scene:
            '同一条 SQL 里三个函数要用同一个窗口，写三遍 partition by user_id order by login_at 太啰嗦。',
          body: '<code>window w as (partition by user_id order by login_at)</code> 定义一次，函数处写 <code>over w</code> 复用。改窗口定义只改一处，长的分析 SQL 里非常值得。',
          sql: `select user_id, login_at,
       row_number()     over w as rn,
       lag(login_at)    over w as 上一条,
       sum(1)           over w as 累计条数
from user_logins
window w as (partition by user_id order by login_at)
limit 10;`,
          pitfall: 'WINDOW 子句只在同一个 SELECT 里生效，CTE / 子查询里得各自定义。',
        },
      ],
      drill: [
        '跑 seed.sql「W4」段导入 user_logins（30 万行）',
        '一条 SQL 同时输出每条登录记录和该用户的登录总次数',
        '用 GROUP BY 实现「每用户登录次数」，对比两者返回行数',
        '试着在 WHERE 里用窗口函数，记下报错；再用子查询包一层解决',
        '用 <code>WINDOW</code> 子句定义一次窗口，被三个函数复用',
      ],
      drillAnswers: [
        {
          sql: `-- 跑 seed.sql 的 §D 段（页面文案有时叫「W4」段）：一条 INSERT，从 users 生成登录日志
select count(*) from user_logins;   -- ≈30 万行`,
          note: '前提是 §B 的 users 已经灌过（§D 从 users 取全部 1 万个用户）。每个用户在自己的活跃窗口内散布 10~50 次登录，这个结构是后面「连续登录」题能查出答案的关键。跑完核对行数，别重复灌。',
        },
        {
          sql: `select user_id, login_at,
       count(*) over (partition by user_id) as 该用户登录总次数
from user_logins
limit 10;`,
          note: '窗口函数 N 行进 N 行出：30 万行明细一行不少，每行旁边多了该用户的总次数。partition by 只「围出计算范围」，不压缩行。',
        },
        {
          sql: `-- GROUP BY：每用户一行
select user_id, count(*) as 次数
from user_logins
group by user_id;                                    -- ≈1 万行

-- 窗口：每条登录记录一行，旁边带总次数
select user_id, login_at,
       count(*) over (partition by user_id) as 次数
from user_logins;                                    -- ≈30 万行`,
          note: '行数差 30 倍就是两者的本质区别：GROUP BY 把行压成每组一行，窗口函数保留全部明细。要「只看汇总」用前者，要「明细和统计值同框」用后者。',
        },
        {
          sql: `select user_id, login_at
from user_logins
where count(*) over (partition by user_id) > 5;
-- ERROR: window functions are not allowed in WHERE

-- 正确姿势：子查询里先算窗口，外层再过滤
select *
from (
  select user_id, login_at,
         count(*) over (partition by user_id) as n
  from user_logins
) t
where t.n > 5;`,
          note: 'WHERE 是九步顺序的第 3 步，窗口值第 6 步（SELECT 阶段）才算出来。「子查询包一层」是本周天天要做的肌肉记忆动作。',
        },
        {
          sql: `select user_id, login_at,
       row_number()  over w as rn,
       lag(login_at) over w as 上一条,
       sum(1)        over w as 累计条数
from user_logins
window w as (partition by user_id order by login_at)
limit 10;`,
          note: '三个函数共享同一个窗口定义，改一处全部生效。注意：带了 order by 之后 sum(1) 变成「到当前行为止的累计条数」--默认框架在起作用，D25 专门拆它。',
        },
      ],
      pass: '用一句话讲清窗口函数和 GROUP BY 的区别，并解释为什么 WHERE 里用不了。',
    },
    {
      no: 23,
      title: '排行榜：排名类窗口函数',
      brief: '增长要「每个类目销量 TOP3 商品」和「消费额第二高的用户」--排名需求扎堆来了。',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: 'row_number / rank / dense_rank 在并列时的三种行为',
          scene: '排行榜出现并列：两个用户消费额一样并列第一，第三个人该排第几？三个函数三种答案。',
          body: '<code>row_number</code>：1,2,3,4--并列也硬编不重复的号，像发工牌；<code>rank</code>：1,1,3--并列同名次、<b>跳号</b>；<code>dense_rank</code>：1,1,2--并列同名次、<b>不跳号</b>。要「第几名」的语义用 rank（奥运并列就是它）；要去重取行用 row_number；要「总共有几档」用 dense_rank。',
          sql: `select user_id, sum(total_amount) as 消费额,
       row_number() over (order by sum(total_amount) desc) as rn,
       rank()       over (order by sum(total_amount) desc) as rk,
       dense_rank() over (order by sum(total_amount) desc) as drk
from orders
group by user_id
order by 消费额 desc
limit 10;   -- 找一组并列的行，对比三列`,
          pitfall:
            '「消费额第二高的用户」经典题：用 row_number 会把并列第一的第二人错排成第二；正确答案是 rank（并列第一的两个之后，下一个 rank = 3，可能无人是 2）。',
        },
        {
          title: 'ntile(n) 分桶、percent_rank / cume_dist',
          scene: '把用户按消费额均分四档做分层运营；「打败了百分之多少的人」。',
          body: '<code>ntile(4)</code> 按排序把行切成 4 个桶（余数给前面的桶），分层运营神器；<code>percent_rank</code> = (rank-1)/(总行-1)，区间 [0,1]，「排在前百分之几」；<code>cume_dist</code> 是累计比例，「我和比我强的共占多少」。',
          sql: `select user_id, 消费额,
       ntile(4) over (order by 消费额 desc) as 档位,
       round(percent_rank() over (order by 消费额 desc)::numeric, 3) as 前百分之几
from (
  select user_id, sum(total_amount) as 消费额 from orders group by 1
) t;`,
          pitfall:
            'ntile 的桶大小不严格均分（行数除不尽时靠前的桶多一个）；percent_rank 在并列时给相同值。',
        },
        {
          title: '用 row_number 做「每组取一条」的去重模板',
          scene: '登录日志有重复：同一天同一用户多条记录，分析前要先去重。',
          body: '模板三件套：<code>row_number() over (partition by 业务键 order by 时间 desc)</code>，外面 <code>where rn = 1</code>。业务键是什么（用户+日期？用户+日期+IP？）由需求定，但骨架永远不变。distinct 只能整行去重，这里要「部分列相同只留一条」。',
          sql: `-- 每个用户每天只留最后一条登录记录
select user_id, login_at
from (
  select user_id, login_at,
         row_number() over (partition by user_id, login_at::date
                            order by login_at desc) as rn
  from user_logins
) t
where rn = 1;`,
          pitfall: '「留哪一条」由 order by 决定--写忘了 order by，留哪条随缘。',
        },
        {
          title: 'Top-N per group 的标准写法',
          scene: '「每个一级类目销量 TOP3 商品」--D20 用 LATERAL 写过，今天是标准解法。',
          body: '两步走：派生表里 <code>row_number() over (partition by 组 order by 度量 desc) as rn</code>，外层 <code>where rn &lt;= N</code>。通用、不用管组数、N 想取几取几。和 LATERAL 的分工：排序列有索引且组多时 LATERAL 可能快，通用性上这个模板完胜。',
          sql: `select *
from (
  select p.name, c.name as 类目,
         sum(i.qty * i.unit_price) as 销售额,
         row_number() over (partition by c.name order by sum(i.qty * i.unit_price) desc) as rn
  from order_items i
  join products p on p.id = i.product_id
  join categories c on c.id = p.category_id
  group by p.id, p.name, c.name
) t
where rn <= 3;`,
          pitfall:
            'rn 的过滤必须在子查询外层（D22 讲过的「包一层」）；用 rank 时并列会让 TOP3 实际出 4 行--口径要说清。',
        },
      ],
      drill: [
        '同一查询里同时输出三种排名，找一组并列数据观察差异',
        '查每个一级类目销售额 TOP3 的商品',
        '用 row_number 对重复登录记录去重，每个用户每天只留一条',
        '用 ntile(4) 把用户按累计消费分成四档并统计每档人数',
        '查「消费额第二高」的用户（经典题，注意并列情况怎么处理）',
      ],
      drillAnswers: [
        {
          sql: `select user_id, sum(total_amount) as 消费额,
       row_number() over (order by sum(total_amount) desc) as rn,
       rank()       over (order by sum(total_amount) desc) as rk,
       dense_rank() over (order by sum(total_amount) desc) as drk
from orders
group by user_id
order by 消费额 desc
limit 20;

-- 本库消费额基本不并列，用一个小表把并列时的三种行为看死
select v,
       row_number() over (order by v) as rn,
       rank()       over (order by v) as rk,
       dense_rank() over (order by v) as drk
from (values (100), (100), (200)) t(v);
-- rn: 1,2,3   rk: 1,1,3   drk: 1,1,2`,
          note: '并列时：row_number 硬编不重复的号、rank 同名次后面跳号、dense_rank 同名次不跳号。「第几名」语义用 rank，去重取行用 row_number，数档位用 dense_rank。',
        },
        {
          sql: `select *
from (
  select p.name as 商品, c1.name as 一级类目,
         sum(i.qty * i.unit_price) as 销售额,
         row_number() over (partition by c1.name order by sum(i.qty * i.unit_price) desc) as rn
  from order_items i
  join products p    on p.id = i.product_id
  join categories c2 on c2.id = p.category_id      -- 商品挂在二级
  join categories c1 on c1.id = c2.parent_id       -- 自连接到一级
  group by p.id, p.name, c1.name
) t
where rn <= 3
order by 一级类目, rn;`,
          note: '商品挂在二级类目上，按一级聚合必须 categories 自连接两层。rn 的过滤必须在子查询外层（D22 讲过的「包一层」）。',
        },
        {
          sql: `select user_id, login_at
from (
  select user_id, login_at,
         row_number() over (partition by user_id, login_at::date
                            order by login_at desc) as rn
  from user_logins
) t
where rn = 1;`,
          note: '模板三件套：partition by 业务键、order by 决定留哪一条（这里留每天最后一条）、外层 rn = 1。distinct 做不了「部分列相同只留一条」。',
        },
        {
          sql: `select 档位, count(*) as 人数,
       min(消费额) as 该档最低消费额, max(消费额) as 该档最高消费额
from (
  select user_id, sum(total_amount) as 消费额,
         ntile(4) over (order by sum(total_amount) desc) as 档位
  from orders
  group by user_id
) t
group by 档位
order by 档位;`,
          note: '档位 1 是消费最高的一档。1 万用户除以 4 除不尽时靠前的桶多一行--ntile 不严格均分；带上 min/max 能看清每档的边界在哪。',
        },
        {
          sql: `select user_id, 消费额
from (
  select user_id, 消费额,
         rank() over (order by 消费额 desc) as rk
  from (select user_id, sum(total_amount) as 消费额 from orders group by 1) s
) t
where rk = 2;`,
          note: '必须用 rank 不用 row_number：两个并列第一之后名次直接跳到 3，rk = 2 可能是空集--「不存在严格第二」本身也是正确答案。本库金额来自随机数，基本没有大并列，通常能查出一行。',
        },
      ],
      pass: '不查资料手写出「每组 TOP N」模板；能说清三种排名函数在并列时分别输出什么。',
    },
    {
      no: 24,
      title: '环比与用户间隔：LAG / LEAD',
      brief:
        '「上个月比这个月少了多少？」「用户两单之间隔了几天？」增长分析师嘴里的环比、同比、下单间隔，全都建立在「拿上一行」这个动作上。',
      split: [40, 65, 15],
      learn: [
        {
          title: 'lag(col, offset, default) / lead 的三个参数',
          scene: '「月度 GMV 的环比」--每行要拿到「上一行的值」。',
          body: '<code>lag(列, 偏移量, 默认值)</code> 在窗口排序后取「往上第 offset 行」的值，offset 默认 1、默认值默认 NULL；lead 往下取。排好序的表格里「上一行 / 下一行」这个动作，SQL 里就靠它俩。',
          sql: `select 月份, gmv,
       lag(gmv) over (order by 月份) as 上月gmv,
       round(100.0 * (gmv - lag(gmv) over (order by 月份))
             / nullif(lag(gmv) over (order by 月份), 0), 1) as 环比pct
from (
  select date_trunc('month', created_at) as 月份,
         sum(total_amount) as gmv
  from orders group by 1
) t
order by 月份;`,
          pitfall:
            '第一行 lag 拿到 NULL：算环比做除法前先 nullif / coalesce 处理，否则第一行的增长率是 NULL（还好不是报错，但要知道为什么）。',
        },
        {
          title: 'first_value / last_value / nth_value',
          scene: '给每笔订单带上「该用户的首单金额」，算和首单的差额。',
          body: '窗口内取指定位置的值：<code>first_value(x)</code> 第一行、<code>nth_value(x, n)</code> 第 n 行、<code>last_value(x)</code> 最后一行。first_value 最常用：把「该组的第一条」贴到每一行上。',
          sql: `select user_id, created_at, total_amount,
       first_value(total_amount) over w as 首单金额,
       total_amount - first_value(total_amount) over w as 与首单差额
from orders
window w as (partition by user_id order by created_at);`,
          pitfall: 'last_value 有个大坑--见今天的第 4 条，它常常「返回的不是你以为的最后一行」。',
        },
        {
          title: '相邻记录差值的通用套路',
          scene: '用户两单之间隔了几天、两笔支付之间隔了多久--全是同一个模式。',
          body: '模板：<code>当前值 - lag(值) over (partition by 谁 order by 何时)</code>。时间是 timestamp，相减直接得 interval。注意 partition by 别漏--不分区的话，拿到的是「上一个<b>任何人</b>的行」，数字全错但看起来特别像对的。',
          sql: `select user_id, created_at,
       created_at - lag(created_at) over (partition by user_id order by created_at) as 距上一单
from orders;`,
          pitfall:
            '「看起来像对的」是这类错误最阴的地方：数值都是真实间隔，只是隔错了对象。多用户数据一定先 partition。',
        },
        {
          title: '为什么 last_value 常常返回「当前行」--引出明天的框架',
          scene: '你想取「该用户最后一单的金额」，结果每一行返回的都是它自己。复现一下这个怪现象。',
          body: '罪魁是<b>默认窗口框架</b>：有 ORDER BY 时，默认框架是「从组头到<b>当前行</b>为止」（RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW）。last_value 在这个范围里取最后一行--范围正好到当前行，所以永远是当前行。这不是 bug，是框架语义。怎么改框架，明天一整天讲。',
          sql: `-- 复现：last_value 每行都等于当前行
select user_id, created_at, total_amount,
       last_value(total_amount) over (partition by user_id order by created_at) as 最后一单
from orders;`,
          pitfall:
            '应急修法有两个：把框架显式撑到组尾（明天学），或者反过来用 <code>first_value + order by created_at desc</code> 倒排取第一行。',
        },
      ],
      drill: [
        '算月度 GMV 的环比增长率',
        '算每个用户相邻两次下单的间隔天数',
        '用 <code>lag(x, 12)</code> 算同比（数据不够 12 个月就造小表验证）',
        '用 first_value 给每行带上该用户的首单金额，计算与首单的差额',
        '用 last_value 取「该用户最后一单金额」，复现返回当前行的现象',
      ],
      drillAnswers: [
        {
          sql: `select 月份, gmv,
       lag(gmv) over (order by 月份) as 上月gmv,
       round(100.0 * (gmv - lag(gmv) over (order by 月份))
             / nullif(lag(gmv) over (order by 月份), 0), 1) as 环比pct
from (
  select date_trunc('month', created_at) as 月份,
         sum(total_amount) as gmv
  from orders
  group by 1
) t
order by 月份;`,
          note: '环比 = (本月 - 上月) / 上月。第一个月 lag 拿到 NULL，环比自然为空（不是报错）；nullif 防分母为 0。W4 阶段只有约 3 个月数据，正好观察首行。',
        },
        {
          sql: `select user_id, created_at,
       created_at - lag(created_at) over (partition by user_id order by created_at) as 距上一单
from orders
limit 10;

-- 只要天数的话：日期相减得整数
select user_id, created_at,
       created_at::date - (lag(created_at) over (partition by user_id order by created_at))::date as 间隔天数
from orders
limit 10;`,
          note: 'timestamp 相减直接得 interval；::date 相减得天数。partition by user_id 千万别漏--不分区拿到的是「上一个任何人的订单」，数值全是真的、对象全错了。',
        },
        {
          sql: `-- 本库 W4 阶段只有约 3 个月订单，同比先用 18 个月的小表验证写法
with 小表(月份, gmv) as (
  select date '2025-01-01' + (n || ' month')::interval, 100 + n * 7
  from generate_series(0, 17) n
)
select 月份::date, gmv,
       lag(gmv, 12) over (order by 月份) as 去年同月,
       round(100.0 * (gmv - lag(gmv, 12) over (order by 月份))
             / nullif(lag(gmv, 12) over (order by 月份), 0), 1) as 同比pct
from 小表
order by 月份;`,
          note: '同比环比是同一个 lag，只是偏移量从 1 换成 12。前 12 行「去年同月」是 NULL，属预期。第 6 周 §F 时间快进出两年数据后，同一条 SQL 换回 orders 直接可用。',
        },
        {
          sql: `select user_id, created_at, total_amount,
       first_value(total_amount) over w as 首单金额,
       total_amount - first_value(total_amount) over w as 与首单差额
from orders
window w as (partition by user_id order by created_at);`,
          note: 'first_value 把「该组的第一条」贴到每一行上。差额为负说明这个用户后面买得比首单便宜--顺手就能看出消费升降级。',
        },
        {
          sql: `select user_id, created_at, total_amount,
       last_value(total_amount) over (partition by user_id order by created_at) as 最后一单
from orders
limit 20;`,
          note: '预期现象：每一行的「最后一单」都等于它自己的金额。有 ORDER BY 时默认框架只到当前行为止，last_value 在这个范围里取最后一行，当然取到自己。这不是 bug，是框架语义，明天 D25 修。',
        },
      ],
      pass: '能解释 last_value 为什么要改窗口框架才正确。',
    },
    {
      no: 25,
      title: '移动平均与累计曲线：窗口框架',
      brief:
        '增长要「7 日滑动 GMV」「累计 GMV 曲线」。你发现同样的 <code>sum() OVER ()</code>，写不写 ORDER BY 结果完全不同。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: '默认框架：RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW',
          scene: '同一个 sum() over (...)，写不写 order by 结果天差地别--先搞清「框架」是什么。',
          body: '窗口函数的完整语法是 <code>over (partition by ... order by ... 框架)</code>。框架（frame）回答：每一行的计算范围到哪里为止。有 ORDER BY 时默认 = <b>从组头到当前行</b>（所以 sum 变成累计和）；没 ORDER BY 时默认 = <b>整组</b>（所以 sum 是组内总和）。',
          sql: `select 月份, gmv,
       sum(gmv) over (order by 月份) as 累计,      -- 到当前行为止
       sum(gmv) over ()                 as 总和    -- 整组（全表）
from (select date_trunc('month', created_at) as 月份, sum(total_amount) as gmv
      from orders group by 1) t;`,
          pitfall:
            '「不小心多写了 order by，sum 变累计」是本周最容易犯的错--写聚合窗口前先想清楚要不要框架。',
        },
        {
          title: 'ROWS（按行数）vs RANGE（按值）vs GROUPS',
          scene:
            '算 7 日移动平均写了 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW--这个 ROWS 是什么，能换成 RANGE 吗？',
          body: 'ROWS 按物理<b>行数</b>划范围（往上看 6 行）；RANGE 按<b>排序值</b>划范围（排序值和当前行相同/之前的都算，<b>并列的行一起进来</b>）；GROUPS 按「同值行组」计数。排序列没有重复值时 ROWS 和 RANGE 结果相同；一旦有并列（同一天多行），两者结果就分叉。',
          sql: `-- 造一组带重复时间戳的数据，对比两种框架
select d, v,
       sum(v) over (order by d rows   between 1 preceding and current row) as 前一行,
       sum(v) over (order by d range  between interval '1 day' preceding and current row) as 按值
from (values (timestamp '2026-01-01 10:00', 10), (timestamp '2026-01-01 12:00', 20),
             (timestamp '2026-01-02 09:00', 30), (timestamp '2026-01-03 08:00', 40)) t(d, v);`,
          pitfall:
            '排序列有重复值时 RANGE 会把「同值的所有行」拉进范围，数字悄悄变大--又一个报表口径事故源。',
        },
        {
          title: 'UNBOUNDED PRECEDING / N PRECEDING / CURRENT ROW / FOLLOWING',
          scene: '「7 日移动平均」「近 30 日累计」--把框架边界这几个词玩熟。',
          body: '框架边界四个词：<code>unbounded preceding</code> 组头、<code>N preceding</code> 往上 N 行、<code>current row</code> 当前行、<code>N following / unbounded following</code> 往下 N 行 / 组尾。between 两头都含。7 日移动平均 = <code>rows between 6 preceding and current row</code>（含当前共 7 行）。',
          sql: `select 日期, gmv,
       round(avg(gmv) over (order by 日期
             rows between 6 preceding and current row), 0) as 七日均值,
       sum(gmv)  over (order by 日期) as 累计
from (select created_at::date as 日期, sum(total_amount) as gmv
      from orders group by 1) t;`,
          pitfall: '写 6 preceding 不是 7 preceding--between 是闭区间，含当前行一共 7 行。',
        },
        {
          title: '有 ORDER BY 和没有 ORDER BY 时默认框架不同',
          scene: '昨天 D24 第 5 题的坑，今天正式收掉。',
          body: '汇总：<b>无 ORDER BY</b> -&gt; 整组；<b>有 ORDER BY</b> -&gt; 组头到当前行（RANGE 语义）。所以 last_value 想取「真正的最后一行」，必须把框架撑满：<code>rows between unbounded preceding and unbounded following</code>。',
          sql: `select user_id, created_at, total_amount,
       last_value(total_amount) over (
         partition by user_id order by created_at
         rows between unbounded preceding and unbounded following   -- 撑到组尾
       ) as 最后一单金额
from orders;`,
          pitfall:
            '另一条路：first_value + order by 倒排（desc），取「排序后的第一行」= 最后一行--不用记长框架，语义也更直白。',
        },
      ],
      drill: [
        '算 7 日移动平均 GMV（<code>ROWS BETWEEN 6 PRECEDING AND CURRENT ROW</code>）',
        '算每日累计 GMV',
        '造一组有重复排序值的数据，对比 ROWS 与 RANGE 的结果差异',
        '去掉 ORDER BY 再跑一次累计求和，解释结果为什么变了',
        '用正确的框架修正 D24 第 5 题的 last_value',
      ],
      drillAnswers: [
        {
          sql: `select 日期, gmv,
       round(avg(gmv) over (order by 日期
             rows between 6 preceding and current row), 0) as 七日均值
from (select created_at::date as 日期, sum(total_amount) as gmv
      from orders group by 1) t
order by 日期;`,
          note: 'between 是闭区间：6 preceding + 当前行 = 7 行，别写成 7 preceding。头 6 天窗口不足 7 行，是「有多少算多少」的均值，要严格 7 天得另加行数校验。',
        },
        {
          sql: `select 日期, gmv,
       sum(gmv) over (order by 日期) as 累计gmv
from (select created_at::date as 日期, sum(total_amount) as gmv
      from orders group by 1) t
order by 日期;`,
          note: '有 ORDER BY 时默认框架 = 组头到当前行，sum 自动变累计。这就是 D22 第 5 题 sum(1) 是「累计条数」的原因。',
        },
        {
          sql: `select d, v,
       sum(v) over (order by d rows  between 1 preceding and current row) as rows前一行,
       sum(v) over (order by d range between interval '1 day' preceding and current row) as range按值
from (values (timestamp '2026-01-01 00:00', 10), (timestamp '2026-01-01 00:00', 20),
             (timestamp '2026-01-02 00:00', 30), (timestamp '2026-01-03 00:00', 40)) t(d, v);
-- rows前一行: 10 / 30 / 50 / 70      range按值: 30 / 30 / 60 / 70`,
          note: '前两行 d 相同（并列）：RANGE 把同值行一起拉进范围，第一行按值算出 10+20=30、第三行算出 10+20+30=60；ROWS 只看上一行得 10 和 50。排序列有重复值时两者分叉，是报表口径事故源。细节：RANGE 的偏移对 date 列只认 interval，所以要造 timestamp 的小表。',
        },
        {
          sql: `select 日期, gmv,
       sum(gmv) over () as 全表总和
from (select created_at::date as 日期, sum(total_amount) as gmv
      from orders group by 1) t
order by 日期;`,
          note: '无 ORDER BY 时默认框架 = 整组（这里整表）：每行都贴同一个全表总和，累计语义消失。「多写 / 少写一个 order by」是窗口聚合最常见的口径事故。',
        },
        {
          sql: `select user_id, created_at, total_amount,
       last_value(total_amount) over (
         partition by user_id order by created_at
         rows between unbounded preceding and unbounded following   -- 框架撑到组尾
       ) as 最后一单金额
from orders
limit 20;`,
          note: '框架撑满组内全部行后，last_value 才取到真正的最后一行。另一条路：first_value + order by created_at desc 倒排取第一行，不用背长框架、语义更直白。',
        },
      ],
      pass: '说出默认框架是什么、在什么数据下会给出反直觉的结果。',
    },
    {
      no: 26,
      title: '「80% 的 GMV 是谁贡献的」：占比与百分位',
      brief:
        '老板问了个致命问题：「我们 80% 的 GMV 是多少头部用户贡献的？」--组内占比与百分位专场。',
      split: [35, 70, 15],
      learn: [
        {
          title: 'sum / avg / count / max 作为窗口函数使用',
          scene: '明细行旁边要同时出现「组内总和、组内均值」--普通聚合做不到同框。',
          body: '任何聚合函数加 over 都是窗口版：sum() over (partition by ...) 在每行旁边贴上组内总和。这比「先 group by 算汇总，再 join 回明细」少一步、快一截、还更可读。',
          sql: `select id, user_id, total_amount,
       sum(total_amount) over (partition by user_id) as 该用户总额,
       avg(total_amount) over (partition by user_id) as 该用户均值
from orders;`,
          pitfall: '窗口版聚合和普通聚合不是二选一：要明细带汇总用窗口，要纯汇总报表用 group by。',
        },
        {
          title: '组内占比的通用写法：x / sum(x) OVER (PARTITION BY g)',
          scene: '「每个商品销售额占其类目的比例」--分母是组内总和。',
          body: '占比 = 分子 / <code>sum(分子) over (partition by 组)</code>，一行搞定，不用子查询。要同时算「占类目%」和「占全站%」就嵌两个不同分区的 sum：partition by 类目 和 空括号（全表）。分母分区是什么，占比就是什么口径。',
          sql: `select p.name as 商品, s.销售额,
       round(100.0 * s.销售额 / sum(s.销售额) over (partition by s.类目), 1) as 占类目pct,
       round(100.0 * s.销售额 / sum(s.销售额) over (),                  1) as 占全站pct
from (
  select p.id, p.name, c.name as 类目, sum(i.qty * i.unit_price) as 销售额
  from order_items i
  join products p on p.id = i.product_id
  join categories c on c.id = p.category_id
  group by p.id, p.name, c.name
) s;`,
          pitfall:
            '占比列求和应 = 100% 是自检手段；round 后可能是 99.9 / 100.1，属于舍入误差，交付时说一句即可。',
        },
        {
          title: '明细行同时带组均值、与均值的差',
          scene: '哪些订单「明显高出该用户的平均水平」--离群排查。',
          body: '<code>x - avg(x) over (partition by 组)</code>：每行直接标出离组均值多远。加上第 1 条的组均值列，一张表看懂「这个用户的正常水位在哪、这单偏了多少」。',
          sql: `select id, user_id, total_amount,
       avg(total_amount) over (partition by user_id) as 用户均值,
       total_amount - avg(total_amount) over (partition by user_id) as 偏离均值
from orders;`,
          pitfall:
            'avg 跳过 NULL 行（D4 的分母口径问题在窗口版同样存在）--列里有 NULL 时先想清楚分母。',
        },
        {
          title: 'percentile_cont 算分组中位数',
          scene: '「每个类目的价格中位数」--中位数没有窗口函数版，语法也和别的聚合长得不一样。',
          body: '<code>percentile_cont(0.5) within group (order by 列)</code> 算任意分位数（0.5 = 中位数），配合 group by 出分组结果。它是<b>分组聚合</b>不是窗口函数，PG 也不支持给它加 over（ordered-set 聚合没有窗口版，直接报错）--想要「明细行带组内中位数」，把分组结果写成 CTE 再 join 回明细。',
          sql: `-- 每个一级类目的价格中位数（分组聚合版）
select c.name as 类目,
       percentile_cont(0.5) within group (order by p.price) as 价格中位数
from products p
join categories c on c.id = p.category_id
group by c.name;

-- 明细带组内中位数：分组结果当 CTE 再 join 回去（没有窗口版可走捷径）
with m as (
  select category_id,
         percentile_cont(0.5) within group (order by price) as 中位数
  from products
  group by 1
)
select p.name, p.price, m.中位数
from products p join m on m.category_id = p.category_id;`,
          pitfall:
            'PG 没有 median() 函数；within group 这个子句别漏--漏了语法就错。给 ordered-set 聚合加 over 也是语法错。',
        },
      ],
      drill: [
        '每个商品销售额占其所属一级类目的比例',
        '每个一级类目销售额占全站的比例（同一条 SQL 里两个占比都要有）',
        '每个用户消费额的百分位排名',
        '每个一级类目的价格中位数',
        '每笔订单金额与该用户平均客单价的差额',
      ],
      drillAnswers: [
        {
          sql: `select 商品, 类目, 销售额,
       round(100.0 * 销售额 / sum(销售额) over (partition by 类目), 1) as 占类目pct
from (
  select p.name as 商品, c1.name as 类目,
         sum(i.qty * i.unit_price) as 销售额
  from order_items i
  join products p    on p.id = i.product_id
  join categories c2 on c2.id = p.category_id      -- 二级
  join categories c1 on c1.id = c2.parent_id       -- 自连接到一级
  group by p.id, p.name, c1.name
) s
order by 类目, 销售额 desc;`,
          note: '分母 = sum(销售额) over (partition by 类目)：partition by 是谁，占比就是什么口径。自检手段：按类目把占类目pct求和应等于 100（round 后 99.9/100.1 属舍入误差）。',
        },
        {
          sql: `select 商品, 类目, 销售额,
       round(100.0 * 销售额 / sum(销售额) over (partition by 类目), 1) as 占类目pct,
       round(100.0 * 销售额 / sum(销售额) over (),                  1) as 占全站pct
from (
  select p.name as 商品, c1.name as 类目,
         sum(i.qty * i.unit_price) as 销售额
  from order_items i
  join products p    on p.id = i.product_id
  join categories c2 on c2.id = p.category_id
  join categories c1 on c1.id = c2.parent_id
  group by p.id, p.name, c1.name
) s
order by 类目, 销售额 desc;`,
          note: '两个分母两个口径：partition by 类目 vs 空括号（全表）。这就是「先 group by 算汇总再 join 回明细」的窗口一步到位版。',
        },
        {
          sql: `select user_id, 消费额,
       round(percent_rank() over (order by 消费额 desc)::numeric, 3) as 前百分之几
from (select user_id, sum(total_amount) as 消费额 from orders group by 1) t
order by 消费额 desc
limit 20;`,
          note: 'percent_rank = (rank - 1) / (总行数 - 1)，区间 [0, 1]，0 表示排第一、并列给相同值。想知道「我和比我强的共占多少」用 cume_dist。',
        },
        {
          sql: `select c1.name as 一级类目,
       percentile_cont(0.5) within group (order by p.price) as 价格中位数
from products p
join categories c2 on c2.id = p.category_id
join categories c1 on c1.id = c2.parent_id
group by c1.name
order by 一级类目;`,
          note: 'PG 没有 median()；percentile_cont(0.5) within group (order by 列) 是唯一正解，within group 子句漏了直接语法错。想给明细行带组内中位数，PG16 不支持它的窗口写法，得把分组结果当 CTE 再 join 回明细。',
        },
        {
          sql: `select id, user_id, total_amount,
       round(avg(total_amount) over (partition by user_id), 2) as 用户平均客单价,
       round(total_amount - avg(total_amount) over (partition by user_id), 2) as 偏离均值
from orders
order by user_id, 偏离均值 desc;`,
          note: '明细行同框组均值 + 偏离值，一眼看出哪单明显高于该用户的正常水位（离群排查）。注意 avg 窗口版同样跳过 NULL 行--D4 的分母口径问题跟着窗口一起继承。',
        },
      ],
      pass: '一条 SQL 输出「商品 | 销售额 | 占类目% | 占全站%」四列，两个占比列各自求和自洽。',
    },
    {
      no: 27,
      title: '增长团队的经典题库：12 道',
      brief:
        '增长甩来他们的经典题库：连续登录、次日留存、漏斗、头部贡献……这 12 道题也是互联网面试的常驻嘉宾。',
      tags: ['lab', 'hot'],
      split: [15, 90, 15],
      learn: [
        {
          title: '「差值分组法」（gaps and islands）的核心思路：连续序号 − 行号 = 常量',
          scene:
            '「连续登录 7 天的用户」是这 12 题里最绕的：日期本身不连续，SQL 怎么「识别连续」？',
          body: '套路两步：① 对每个用户的登录日期<b>去重后</b>编号：日期本身的序号（<code>login_at::date - 起始日</code> 得整数）和行号 <code>row_number()</code>；② 两者相减：<b>只要日期连续，差值恒定</b>；一断档，差值跳变。按「用户 + 差值」分组，每组就是一段连续区间，count &gt;= 7 即答案。这个手法叫 gaps and islands（找岛），连续 N 天、连续上涨、连续签到全是它。',
          sql: `with d as (
  select distinct user_id, login_at::date as d from user_logins   -- 先去重！
),
g as (
  select user_id, d,
         d - (row_number() over (partition by user_id order by d))::int as grp  -- 连续段标识
  from d
)
select user_id, min(d) as 起始, max(d) as 结束, count(*) as 天数
from g
group by user_id, grp
having count(*) >= 7;   -- 连续登录 7 天以上的用户及区间`,
          pitfall:
            '日期必须先 distinct：同一天多条记录会把 row_number 顶歪，差值失去「连续段标识」的作用。',
        },
      ],
      drillLabel: '练 · 90 min · 这 12 题要背下来',
      drill: [
        '查连续登录 7 天及以上的用户（差值分组法）',
        '把连续的登录日期区间合并成「起止区间」',
        '算次日留存率（注册次日是否登录）',
        '算 7 日留存率',
        '每个一级类目销量 TOP3 商品',
        '销售额排名，并列名次要正确',
        '算每个用户的消费额累计占比，找出贡献 80% GMV 的头部用户',
        '下单 -&gt; 支付的时间漏斗转化率',
        '找出 GMV 连续 3 天上涨的日期',
        '每个用户的第 2 笔订单',
        '算每个一级类目的销售额中位数',
        '同比环比一起输出的月度报表',
      ],
      drillAnswers: [
        {
          sql: `with d as (
  select distinct user_id, login_at::date as d from user_logins   -- 先去重！
),
g as (
  select user_id, d,
         d - (row_number() over (partition by user_id order by d))::int as grp
  from d
)
select user_id, min(d) as 起始, max(d) as 结束, count(*) as 天数
from g
group by user_id, grp
having count(*) >= 7
order by 天数 desc, user_id;`,
          note: '差值分组法（gaps and islands）：日期序号减行号，连续段差值恒定、一断档就跳变，按「用户 + 差值」分组即得连续区间。两个细节：日期必须先 distinct（同一天多条会把行号顶歪）；PG 里 date 没有减 bigint 的运算符，row_number() 要 ::int。',
        },
        {
          sql: `with d as (
  select distinct user_id, login_at::date as d from user_logins
),
g as (
  select user_id, d,
         d - (row_number() over (partition by user_id order by d))::int as grp
  from d
)
select user_id, min(d) as 起始日期, max(d) as 结束日期, count(*) as 连续天数
from g
group by user_id, grp
order by user_id, 起始日期;`,
          note: '和第 1 题同一套 CTE，去掉 having 就是全部连续区间；一个用户可以有多段。这就是「区间合并」题的标准答案。',
        },
        {
          sql: `select round(100.0 * count(distinct l.user_id) / count(distinct u.id), 1) as 次日留存率
from users u
left join user_logins l
       on l.user_id = u.id
      and l.login_at >= u.created_at::date + 1
      and l.login_at <  u.created_at::date + 2;`,
          note: '口径：注册次日当天有过登录算留存。分子分母都 distinct，防止一人次日登录多次被重复计数。本库注册散布在近一年、登录窗口集中在近 90 天，整体次日留存约 5% 属预期偏低；真实业务按注册日 cohort 逐日算，骨架不变（group by 注册日）。',
        },
        {
          sql: `select round(100.0 * count(distinct l.user_id) / count(distinct u.id), 1) as 七日留存率
from users u
left join user_logins l
       on l.user_id = u.id
      and l.login_at >= u.created_at::date + 7
      and l.login_at <  u.created_at::date + 8;`,
          note: '把窗口平移到第 7 天即可。「第 7 天当天」和「注册后 7 日内任一天」是两个口径，数字差很多，报表里必须写清是哪个（后者的区间上界放宽到 created_at + 8 天）。',
        },
        {
          sql: `select *
from (
  select p.name as 商品, c1.name as 一级类目,
         sum(i.qty) as 销量,
         row_number() over (partition by c1.name order by sum(i.qty) desc) as rn
  from order_items i
  join products p    on p.id = i.product_id
  join categories c2 on c2.id = p.category_id
  join categories c1 on c1.id = c2.parent_id
  group by p.id, p.name, c1.name
) t
where rn <= 3
order by 一级类目, rn;`,
          note: '每组 TOP N 标准模板，和 D23 第 2 题同骨架，只是度量从销售额换成销量 sum(qty)。商品挂二级、按一级聚合要 categories 自连接两层。',
        },
        {
          sql: `select user_id, sum(total_amount) as 消费额,
       rank() over (order by sum(total_amount) desc) as 名次
from orders
group by user_id
order by 名次, user_id
limit 20;`,
          note: 'rank 并列同名次、后面跳号；要「并列算并列、总数不跳」用 dense_rank，要「假装没并列」用 row_number。并列怎么算不是技术问题，是口径问题--先问清楚再选函数。',
        },
        {
          sql: `with u as (
  select user_id, sum(total_amount) as 消费额
  from orders
  group by user_id
),
r as (
  select user_id, 消费额,
         rank() over (order by 消费额 desc) as 名次,
         round(100.0 * sum(消费额) over (order by 消费额 desc)
               / nullif(sum(消费额) over (), 0), 2) as 累计占比
  from u
)
select *
from r
where 累计占比 <= 80
order by 名次;`,
          note: '累计占比 = 一个窗口到当前行（sum over (order by 消费额 desc)）除以一个整表窗口（sum over ()）。where 累计占比 <= 80 取头部用户；边界上正好压线的用户算不算进「贡献 80% 的人」，交付前说清口径。',
        },
        {
          sql: `select count(*)                                            as 下单数,
       count(*) filter (where status = 2)                  as 已支付数,
       round(100.0 * count(*) filter (where status = 2) / count(*), 1) as 支付转化率
from orders;`,
          note: '口径用 status = 2 当「已支付」（本库约 78.9%）。也可以用 paid_at is not null，但本库约 9% 的单状态是已支付却没有支付时间，两个口径差约 10 个百分点--呼应 W1：报数之前先说分母。filter (where ...) 是 PG 在一条 SQL 里算多口径计数的利器。',
        },
        {
          sql: `with d as (
  select created_at::date as 日期, sum(total_amount) as gmv
  from orders
  group by 1
),
f as (
  select 日期, gmv,
         (gmv > lag(gmv) over (order by 日期)) as 涨
  from d
),
i as (
  select 日期, gmv, 涨,
         row_number() over (order by 日期)
       - row_number() over (partition by 涨 order by 日期) as grp
  from f
)
select min(日期) as 起始, max(日期) as 结束, count(*) as 连涨天数
from i
where 涨
group by grp
having count(*) >= 3
order by 起始;`,
          note: '第 1 题的差值分组法用在布尔列上：全表行号减「按涨/不涨分区」的行号，连续为 true 的段差值恒定。第一天 lag 是 NULL 自然不参与。另一条路是 lag(gmv,1)/lag(gmv,2)/lag(gmv,3) 连比三次，但只能查定长、改天数要重写。',
        },
        {
          sql: `select id, user_id, created_at, total_amount
from (
  select id, user_id, created_at, total_amount,
         row_number() over (partition by user_id order by created_at) as rn
  from orders
) t
where rn = 2
order by created_at;`,
          note: 'row_number(partition by 用户 order by 时间) = 2，就是「第 N 笔」类题的全部。要注意同一时刻并列时谁排第二由排序键决定，要稳定就补第二排序键 id。',
        },
        {
          sql: `with s as (
  select p.id, p.name as 商品, c1.name as 一级类目,
         sum(i.qty * i.unit_price) as 销售额
  from order_items i
  join products p    on p.id = i.product_id
  join categories c2 on c2.id = p.category_id
  join categories c1 on c1.id = c2.parent_id
  group by p.id, p.name, c1.name
)
select 一级类目,
       percentile_cont(0.5) within group (order by 销售额) as 销售额中位数
from s
group by 一级类目
order by 一级类目;`,
          note: 'D26 中位数的应用题：先在 CTE 里聚合出商品级销售额，再对它取 percentile_cont(0.5)。中位数对离群商品远比 avg 稳，类目体量对比常用它。',
        },
        {
          sql: `select 月份, gmv,
       lag(gmv)     over (order by 月份) as 上月,
       round(100.0 * (gmv - lag(gmv) over (order by 月份))
             / nullif(lag(gmv) over (order by 月份), 0), 1) as 环比pct,
       lag(gmv, 12) over (order by 月份) as 去年同月,
       round(100.0 * (gmv - lag(gmv, 12) over (order by 月份))
             / nullif(lag(gmv, 12) over (order by 月份), 0), 1) as 同比pct
from (
  select date_trunc('month', created_at) as 月份,
         sum(total_amount) as gmv
  from orders
  group by 1
) t
order by 月份;`,
          note: '环比 lag(gmv, 1)、同比 lag(gmv, 12)：同一个函数换偏移量而已。W4 阶段只有约 3 个月数据，同比列全 NULL 是预期现象；第 6 周 §F 时间快进后同一条 SQL 自动有值。',
        },
      ],
      pass: '12 题全部跑通；第 1、3、5 题能闭卷重写。',
    },
    {
      no: 28,
      title: '入职满月大测',
      brief: '入职满月（第 28 天）。一次 90 分钟闭卷大测，检验前四周的全部家当。',
      tags: ['test'],
      split: [0, 90, 30],
      learnLabel: '规则',
      drillLabel: '10 题构成 · 120 min',
      learn: [
        '闭卷、限时 90 分钟、不许查文档',
        '正确 &lt; 7 题 -&gt; 用第 5 周的复盘时段补 W3–W4，<b>不要硬推进度</b>',
      ],
      drill: [
        '3 道窗口函数题（含 1 道连续区间）',
        '2 道递归 / LATERAL 题',
        '5 道多表聚合报表题',
        '交卷后逐题写错因，更新 mistakes.md',
        '重绘一张前四周的知识地图',
      ],
      drillAnswers: [
        {
          note: '出题范围对准 D22–D25：每组 TOP N、三种排名在并列时的行为、lag 差值与环比、窗口框架（移动平均 / 累计）。连续区间题必出一道，闭卷重写「distinct 日期 -> 日期序号减行号 -> 按差值分组」三步骨架。',
        },
        {
          note: '递归 / LATERAL 出 W3 的题：generate_series 补零日历、递归 CTE 展开层级或连续日期、LATERAL 每组取 N 条。判分标准不只是结果对，还要能讲清「这题为什么不用窗口函数的写法」。',
        },
        {
          note: '报表题考「口径先行」：写 SQL 之前先写下分母是谁、NULL 算不算、缺日补不补 0。占比用 sum(x) over (partition by ...)，中位数用 percentile_cont，缺日用 generate_series 左连接补零--每一条都对应本周做过的原题。',
        },
        {
          note: '错因分三类统计：没懂概念（回当天「学」栏重看并口述一遍）、记不住语法（连续 3 天每天默写一次）、看错题意（读题先圈名词和限定词）。更新 mistakes.md，第 5 周的复盘时段从它开始。',
        },
        {
          note: '按「一张表 -> 多张表 -> 行变成组 -> 行带上窗口」四层画地图：W1 单表、W2 join、W3 CTE/LATERAL、W4 窗口各挂一层。画不出连接线的地方就是缺口，优先补。',
        },
      ],
      pass: '10 题正确 ≥ 7 题。',
    },
  ],
};
