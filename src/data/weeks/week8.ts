import type { Week } from '../../types/curriculum';

export const week8: Week = {
  no: 8,
  title: '把故事讲出去：面试冲刺',
  short: '面试冲刺',
  story:
    '八周（剧里是两年）的历练结束。你决定去更大的平台看看--手里这个从 0 长到百万订单、扛过大促的库，就是你最硬的项目经历。这一周不学新东西：把会的讲清楚，把手速练回来。',
  goal: '目标：不学新东西，只做两件事--把会的说清楚，把手速练回来。',
  days: [
    {
      no: 50,
      title: '八股 ①：索引与执行计划 20 问',
      brief: '第一步：把这八周踩过的性能知识点，变成能脱口而出的 60–90 秒口述。',
      split: [20, 60, 40],
      learn: ['口述答案的结构：结论先行 -&gt; 原因 -&gt; 举例 -&gt; 边界', '每题控制在 60–90 秒'],
      drillLabel: '练 · 100 min',
      drill: [
        '把页面底部「性能与索引」8 问 + 自己补 12 问，写成 20 题',
        '每题写一份 60–90 秒的口述稿',
        '录音，回放，标出讲得别扭的地方（那就是没想清楚的地方）',
        '重讲一遍被标记的题',
        '挑 3 题预设追问（「那如果数据量再大 10 倍呢？」）并准备答案',
      ],
      drillAnswers: [
        {
          note: '页面 8 问之外，自补 12 问按三类分：① 原理（B-tree 为什么快、PG 的索引与堆是什么关系）；② 失效场景（列上套函数、前导 % 模糊、<>、类型不匹配）；③ 实战（EXPLAIN 怎么读、cost 估算和 actual 偏差说明统计信息过期、三种 join 算法的选择依据、索引的写放大代价）。每题先写一句话答案钉住结论，口述稿再扩。',
        },
        {
          note: '60–90 秒 ≈ 200–280 字，四段结构：结论先行（一句话）→ 原因（为什么成立）→ 例子（必须用自己在 100 万行 orders 上跑出的真实数字）→ 边界（什么时候不成立）。「大概几秒」这种模糊话一追问就穿帮。',
        },
        {
          note: '回放三查：① 嗯啊超过 3 秒的卡壳处 = 那里没想清楚，标时间戳；② 口头禅（「然后」「就是说」）出现的频次；③ 超过 90 秒的题 = 该砍例子了。',
        },
        {
          note: '只重讲被标记的题：脱稿、计时、一次讲到位。隔天再抽查一遍讲过的题——隔天还能流畅讲出来，才算真的会了。',
        },
        {
          note: '追问答题模板：先说「结论会不会变」，再说「哪个假设失效了」，最后给替代方案。三个固定方向：数据量大 10 倍、写多读少还建吗、为什么不用别的方案。挑的 3 题选自己最没底的，别挑最顺的。',
        },
      ],
      pass: '20 题都能脱稿讲完，其中 5 题能应对一轮追问。',
    },
    {
      no: 51,
      title: '八股 ②：事务、隔离级别、锁、MVCC 20 问',
      brief:
        '接着攻克面试最容易讲糊的一片区。好消息：你 W5 用两个 psql 窗口真刀真枪复现过每一种异常。',
      split: [20, 60, 40],
      learn: ['重点攻克两个最容易讲糊的题：「幻读到底是什么」「PG 和 MySQL 在 RR 下的差别」'],
      drillLabel: '练 · 100 min',
      drill: [
        '整理 20 题并写口述稿',
        '用 D34 实测出的表格作为讲述时的证据',
        '录音回放并修正',
        '练习画图讲解 MVCC 的可见性判断',
        '准备「你遇到过死锁吗」这类经历题的答案（用 D35 的实验当素材）',
      ],
      drillAnswers: [
        {
          note: '题单方向：ACID 各自靠什么实现（原子性靠 WAL、隔离靠 MVCC+锁）；四个隔离级别 × 三种异常的矩阵；脏读 / 不可重复读 / 幻读各是什么（幻读强调「查询结果的集合变了」）；PG 默认 RC；PG 的 RR 靠快照、MySQL 的 RR 靠间隙锁；MVCC 的 xmin/xmax 与死元组回收；死锁四条件；乐观锁 vs 悲观锁。「幻读」和「两库 RR 差异」这两题单独各写一版 90 秒稿。',
        },
        {
          note: '讲述句式：「这个我在两个 psql 窗口里真实复现过：窗口 A 先执行……，窗口 B 再执行……，实际结果是……」。实测表格是证据不是背诵，面试官一听就知道你动手做过，比背八股高一档。',
        },
        {
          note: '回放标准同 D50，这区额外重点查「幻读」的解释有没有绕圈子--绕就是定义没钉死，回去用一句话定义（「同一查询在事务内两次执行，结果的行集变了」）重写再录。',
        },
        {
          note: '一张图画三层：① 表里同一行的多个版本（每版标 xmin/xmax）；② 事务快照（记下哪些事务对我可见）；③ 可见性判断流程（先看 xmin 是否在快照内，再看 xmax 是谁删的）。练到 2 分钟内边画边讲完，笔不停。',
        },
        {
          note: '经历题用 STAR 四句：情境（业务场景一句话）、任务（要排查什么）、动作（怎么用两个窗口复现、怎么定位到锁顺序）、结果（怎么防：统一加锁顺序 / 缩短事务）。如实说这是实验复现，会做实验本身就是加分项。',
        },
      ],
      pass: '能边画图边讲 MVCC；能说清 PG 与 MySQL 在可重复读上的差异。',
    },
    {
      no: 52,
      title: '设计题专项',
      brief: '面试官最爱出「你来设计一个 X」。你不是背模板的人--你是真的从 0 设计过一套库的人。',
      tags: ['hot'],
      split: [20, 85, 15],
      learn: [
        {
          title:
            '设计题答题模板：<b>需求澄清 -&gt; 实体与关系 -&gt; 建表 DDL -&gt; 索引 -&gt; 典型查询 -&gt; 扩展性风险</b>',
          scene:
            '面试官最爱出「你来设计一个 X」：点赞、私信、评论树……你不是背模板的人，但结构能让思路不漏项。',
          body: '六步走：① <b>需求澄清</b>：主动问「数据量级？读写比例？」--多数人上来就写表，这一问就是加分；② <b>实体与关系</b>：画出有哪些对象、几对几；③ <b>建表 DDL</b>：主键、类型、约束（W5 的功夫）；④ <b>索引</b>：对着典型查询建，说出理由（W6 的功夫）；⑤ <b>典型查询</b>：给三个高频查询的 SQL；⑥ <b>扩展性风险</b>：数据量再大 10 倍会先崩哪里。每一步都是这八周练过的东西，拼起来而已。',
          sql: `-- 模板示例：点赞系统
create table likes (
  user_id    uuid not null,
  target_type text not null,      -- post / comment
  target_id   uuid not null,
  created_at  timestamp not null default now(),
  primary key (user_id, target_type, target_id)  -- 天然幂等
);
-- 典型查询：① 某内容的点赞数 ② 用户是否点过 ③ 我点赞过的列表
-- 扩展性：热点行的计数竞争 -> 计数表 / 缓存（W7 D48 的思路）`,
          pitfall: '写完 DDL 就停 = 只完成了三分之一；索引、典型查询、扩展性风险各占一分。',
        },
        '一定要主动问「数据量级」和「读写比例」再动手',
      ],
      drillLabel: '练 · 85 min · 每题 17 分钟',
      drill: [
        '设计点赞系统（注意热点行与计数）',
        '设计订单表与状态流转（状态机怎么存）',
        '设计私信/消息表（会话维度还是消息维度）',
        '设计标签系统（多对多，以及按标签筛选的索引）',
        '设计评论树（邻接表 / 路径枚举 / 闭包表三选一并说明理由）',
      ],
      drillAnswers: [
        {
          note: '要点：复合主键 (user_id, target_type, target_id) 天然幂等，重复点赞插不进去，不用先查再插；点赞数单独做计数表或缓存，别每次实时 count；三个典型查询：某内容的点赞数、我点过没有（主键直接命中）、我点赞过的列表（按 user_id 开头的索引，需要和主键顺序权衡）；扩展性风险：热点内容的计数行竞争 -> 计数分桶 / 走缓存（D48 的思路）。DDL 参考上方学栏示例。',
        },
        {
          sql: `-- 状态机怎么存：status + CHECK 锁住合法值；流转安全靠「带旧状态的 UPDATE」
create table orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  status       smallint not null check (status in (1, 2, 3)),   -- 1待支付 2已支付 3已取消
  total_amount numeric(10,2) not null check (total_amount >= 0),
  created_at   timestamp not null,
  paid_at      timestamp,
  constraint paid_only_when_paid check (status <> 2 or paid_at is not null)
);

-- 状态流转用 CAS 写法：WHERE 带上旧状态，改不到就是已被别人改过（:id 为参数占位）
update orders set status = 2, paid_at = now()
where id = :id and status = 1;   -- 影响行数 = 0 说明这单已不在「待支付」态`,
          note: 'CHECK 约束把非法状态挡在写入前（W5 的功夫）；流转的并发安全靠一个 WHERE 同时完成校验与加锁。再配一张流转审计表（谁、何时、从什么状态改成什么状态），面试时点出「状态机 + 审计」就是做过的人。',
        },
        {
          note: '双表设计：conversations（双方 user_id、最后一条消息冗余）+ messages（conversation_id、sender_id、内容、created_at）。只留消息表也能查出会话（按双方聚合），但「会话列表」是高频查询，冗余一张会话表换读取性能--能说出这个取舍就是加分。messages 索引 (conversation_id, id desc) 支持倒序翻页；超大会话分页用游标（where id < ?）不用 offset。',
        },
        {
          note: '中间表 (target_id, tag_id) 复合主键防重复打标；两个方向各要一条索引：按内容查它的标签走 (target_id, tag_id)（主键即覆盖），按标签筛内容走 (tag_id, target_id)。「同时含 A 和 B 标签」用 intersect 或 group by + having count(distinct tag_id)。风险：热门标签的筛选结果集倾斜，量大时配物化计数。',
        },
        {
          note: '三方案各一句话：邻接表（parent_id）写入最简单、查整棵子树要递归 CTE；路径枚举（path 列）一条前缀 like 查子树，但移动节点要重写整棵子树的 path；闭包表（ancestor, descendant, depth）任意层级查询全能，代价是写入行数按子树膨胀。两级评论选邻接表最省；无限层级且高频查子树才上闭包表--选哪个不扣分，说得出理由才得分。',
        },
      ],
      pass: '5 题都给出了 DDL + 索引 + 3 个典型查询 + 1 个扩展性风险。',
    },
    {
      no: 53,
      title: '限时手写 ①：窗口函数专场',
      brief: '手速是练回来的。纸上、限时、闭卷--还原白板面试的压迫感。',
      tags: ['test'],
      split: [0, 70, 50],
      learnLabel: '规则',
      drillLabel: '练 · 120 min',
      learn: ['纸上手写，不许运行、不许查资料，60 分钟 8 题'],
      drill: [
        '60 分钟闭卷手写 8 题（从 D27 的题型里随机抽）',
        '上机逐题验证，记录一次通过率',
        '错题当场重写到正确为止',
        '把错因归类：语法记错 / 框架用错 / 思路偏了',
        '更新 mistakes.md',
      ],
      drillAnswers: [
        {
          sql: `-- D27 的题型基本落在四个家族，闭卷时先认题型再套框架：
-- ① 分组内编号（每组 TOP N / 第 N 个）② 连续区间（差值分组法）
-- ③ 累计（sum over）④ 偏移（lag/lead，如环比、连续 3 天上涨）

-- ① 每个用户消费额前 3 的订单
select id, user_id, total_amount
from (select id, user_id, total_amount,
             row_number() over (partition by user_id order by total_amount desc) as rn
      from orders) t
where rn <= 3;

-- ② 连续登录 7 天及以上的用户（日期 - 编号，连续的日子里这个差值不变）
select user_id
from (select user_id,
             login_at::date - (row_number() over (partition by user_id order by login_at::date))::int as grp
      from (select distinct user_id, login_at::date from user_logins) t) g
group by user_id, grp
having count(*) >= 7;

-- ③ 贡献 80% GMV 的头部用户（累计占比）
with u as (select user_id, sum(total_amount) as gmv from orders where status = 2 group by 1)
select user_id, gmv
from (select user_id, gmv,
             sum(gmv) over (order by gmv desc) * 100.0 / sum(gmv) over () as 累计占比
      from u) t
where 累计占比 <= 80;

-- ④ 每个用户的第 2 笔订单
select id, user_id, created_at
from (select id, user_id, created_at,
             row_number() over (partition by user_id order by created_at) as rn
      from orders) t
where rn = 2;`,
          note: '先判断题型属于哪个家族，SQL 就是框架默写--这是限时手写的全部秘密。口述模板：子查询排好编号 / 算好累计，外层再筛。',
        },
        {
          note: '「一次通过」的标准从严：上机不做任何修改、直接跑出正确结果才算。行数对不上就是没通过，别用「只是少写了个 distinct」自我安慰。',
        },
        {
          note: '重写时先默写考试时的原始答案，再并排写正确版--两版的差异在哪一步，那一步就是下次的检查点。',
        },
        {
          note: '三类错因三种处方：语法记错（rank 三兄弟的差别之类）-> 连续 3 天每天默写一次；框架用错（忘了默认框架是 RANGE）-> 回 D23–D25 学栏重看并口述一遍；思路偏了 -> 练五步拆解，先把需求写成人话再翻译成 SQL。',
        },
        {
          note: 'mistakes.md 每题记三样：题型名、错因归类、触发词（看到哪几个词就该想起哪个框架：「连续」「前 N」「第 2 笔」「环比」「累计占比」）。触发词是这个文件最值钱的部分。',
        },
      ],
      pass: '8 题一次通过 ≥ 6 题。',
    },
    {
      no: 54,
      title: '限时手写 ②：多表连接与子查询专场',
      brief: '第二场手写专项：多表、子查询、集合运算。',
      tags: ['test'],
      split: [0, 70, 50],
      learnLabel: '规则',
      drillLabel: '练 · 120 min',
      learn: ['同样 60 分钟 8 题，闭卷手写'],
      drill: [
        '60 分钟闭卷手写 8 题（多表 + 子查询 + 集合运算）',
        '上机验证并订正',
        '把 D53 和今天的错题合并成一张<b>「临场易错清单」</b>',
        '清单控制在一页纸内，面试前 10 分钟只看它',
        '对着清单再默写一遍最容易错的 3 条',
      ],
      drillAnswers: [
        {
          sql: `-- 三大家族题型示例：
-- ① 多表聚合报表（先画连接链，再写 FROM）
-- ② 反连接 / 半连接（EXISTS、LEFT JOIN ... IS NULL、IN 三写法）
-- ③ 集合运算（UNION / UNION ALL / EXCEPT / INTERSECT）

-- ① 按一级类目统计 GMV（明细 -> 商品 -> 二级类目 -> 一级类目连三级）
select top.name as 一级类目,
       sum(oi.qty * oi.unit_price) as gmv
from order_items oi
join products p on p.id = oi.product_id
join categories c on c.id = p.category_id
join categories top on top.id = coalesce(c.parent_id, c.id)
group by 1
order by gmv desc;

-- ② 从未下过单的用户（两种等价写法；NOT IN 遇 user_id 为 NULL 会整题翻车）
select u.id from users u
where not exists (select 1 from orders o where o.user_id = u.id);

select u.id from users u
left join orders o on o.user_id = u.id
where o.id is null;

-- ③ 集合运算：近 30 天下过单、却从未登录过的用户
select distinct user_id from orders
where created_at >= current_date - 30
except
select user_id from user_logins
where login_at >= current_date - 30;`,
          note: '多表题第一步永远是画连接链（哪几张表、按什么键、几对几）；集合运算题先确认两边的输出列同型。反连接三写法的口径差异要能口述：NOT IN 怕 NULL，另两个不怕。',
        },
        {
          note: '验证顺序：先用宽松条件 count 核对量级（多表连接少一条 join 条件行数会暴涨，量级立刻暴露），再抽查具体行；集合运算题把两半分别跑一遍，确认差集真的该差。',
        },
        {
          note: '清单条目四件套：场景 -> 错误写法 -> 正确写法 -> 触发词。只收 D53 和今天两场里真错过的题，不收「可能会错」的--那是知识大全，不是易错清单。',
        },
        {
          note: '一页纸 = 最多 15 条。超过就先砍只错过一次的：清单越长，面试前 10 分钟越看不完，等于没有。',
        },
        {
          note: '默写标准是白板级别：不运行、不看任何提示直接写对。最该进前三的候选：NOT IN 遇 NULL、left join 后 count 错列（该 count 右表主键）、窗口函数结果做筛选必须包子查询。',
        },
      ],
      pass: '8 题一次通过 ≥ 6 题；易错清单成稿。',
    },
    {
      no: 55,
      title: '简历表达：把两年经历讲成项目',
      brief: '把「入职创业公司，从 0 建库到扛住大促」写成简历亮点--每个数字都经得起追问。',
      split: [20, 70, 30],
      learn: [
        '简历写法：动词 + 做了什么 + <b>量化结果</b>',
        '每一句都必须经得起「具体怎么做的」这一问',
      ],
      drillLabel: '练 · 100 min',
      drill: [
        '写第一条简历亮点：数据建模相关（用 D31 的 ER 图和 D30 的约束设计当素材）',
        '写第二条：查询优化相关，必须带数字（从 X 秒到 Y 毫秒）',
        '为每条准备 3 层追问的答案',
        '练 3 分钟项目自述，录像回看',
        '删掉自述里所有讲不清的词',
      ],
      drillAnswers: [
        {
          note: '句式模板：「主导设计 __（X 张核心表）的数据模型，通过 __（约束设计 / 价格快照 / 类目层级），实现 __（量化结果：脏数据率从 X% 降到 Y% / 口径统一后报表争议清零）」。素材用 D30 的约束清单和 D31 的 ER 图--每个字段的类型和可空性都是你亲手定的，追问到任何一层都有话接。',
        },
        {
          note: '句式模板：「将 __（高频报表查询）从 X 秒优化到 Y 毫秒：用 EXPLAIN ANALYZE 定位到 __（全表扫描 / 错误 join 算法），手段是 __（补索引 / 改写掉列上的函数 / 物化视图），并用前后执行计划对比验证」。数字必须是自己 explain analyze 里真实见过的，编的数字被追问一句「cost 从多少降到多少」就穿帮。',
        },
        {
          note: '三层追问结构：① 怎么发现的（现象：老板喊慢 / 报表超时）；② 具体怎么做的（工具 + 步骤，能到命令级）；③ 为什么选这个方案、对比过什么替代方案（为什么不是加缓存 / 为什么不是另一个索引顺序）。每层备 30 秒版本，第三层是拉开差距的地方。',
        },
        {
          note: '3 分钟自述结构：一句话背景（从 0 建库）-> 一个爆发点（涨到百万行后报表变慢）-> 三个动作（建模 / 优化 / 扛大促）-> 结果数字收尾。录像回看三查：卡壳处、没解释的术语（听的人懂吗）、是否超时（超 3 分半必删）。',
        },
        {
          note: '自查法：对每个形容词追问「具体是多少？」答不上来就删。删掉「海量数据」「高性能」「复杂业务」，换成「100 万订单」「从 2.1 秒到 45 毫秒」「状态机约束」--名词和数字不需要解释，形容词才需要。',
        },
      ],
      pass: '两条简历亮点各能撑住三轮追问；3 分钟自述一气呵成。',
    },
    {
      no: 56,
      title: '全真模拟面试 + 知识地图',
      brief: '最后一天。一场 45 分钟的全真模拟，一张闭卷知识地图，为这八周画上句号。',
      tags: ['test'],
      split: [0, 60, 60],
      learnLabel: '安排',
      drillLabel: '练 · 120 min',
      learn: ['找人做 45 分钟模拟面试；没有人就自问自答并录像', '题目从底部 24 题自测清单里随机抽'],
      drill: [
        '45 分钟模拟面试（10 分钟自我介绍 + 20 分钟八股 + 15 分钟手写）',
        '回看录像，标出卡壳的每一处',
        '闭卷画一张完整的 SQL 知识地图',
        '画不出来的分支就是接下来 30 天的维护重点，列成清单',
        '制定后续 30 天维护计划：每天 20 分钟，只做错题重刷 + 一道新题',
      ],
      drillAnswers: [
        {
          note: '时间分配照做并卡表：自我介绍 10 分钟（D55 的 3 分钟版扩讲）、八股 20 分钟（从 D50/D51 的 40 问里随机抽 4-5 题）、手写 15 分钟（1-2 题，边写边讲）。评分自检三问：每题是否在 60-90 秒内收口？手写时有没有沉默超过 10 秒（正确的做法是边写边说思路）？有没有主动反问澄清需求（模拟设计题时尤其要练）？',
        },
        {
          note: '逐处卡壳归因三类：知识缺（回题单补）、表达缺（口述稿没写熟，重写再录）、紧张（多来几轮就脱敏）。每处写一句具体动作，如「窗口框架那题重画图」，别写「下次注意」。',
        },
        {
          note: '地图骨架照八周主线：单表查询 -> NULL 三值逻辑 -> 聚合分组 -> 多表连接 -> 子查询与 CTE -> 窗口函数 -> 索引与执行计划 -> 事务与 MVCC -> 建模与设计，九个一级分支；每个一级分支下再展开二级（如「窗口」下挂：排名三兄弟 / 偏移 / 累计 / 框架 / 连续区间）。',
        },
        {
          note: '画不出来的分支 = 见过但没内化。按「面试出现频率 x 自己薄弱程度」排成清单，前 3 项就是接下来 30 天前三周的主攻目标--这张清单比模拟面试的分数更值钱。',
        },
        {
          note: '20 分钟拆两半：10 分钟错题重刷（从 mistakes.md 随机抽，写不出来才算没刷过）+ 10 分钟一道新题。写进日历、设上每日提醒--没进日历的计划等于没有计划。',
        },
      ],
      pass: '知识地图覆盖八周全部主题；维护清单已写进日历。',
    },
  ],
};
