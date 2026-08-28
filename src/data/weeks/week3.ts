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
        '自关联表：<code>parent_id</code> 指回本表',
        '自连接：同一张表起两个别名连自己',
        '类目树的三种基本查询：全表平铺 / 按一级分组 / 查某类目的直接孩子',
        '「按一级类目汇总」的连接链要跳两层（明细 -&gt; 商品 -&gt; 二级 -&gt; 一级）',
      ],
      drill: [
        '跑 seed.sql「W3」段：建 categories 并回填 products.category_id',
        '自连接输出「一级类目名 | 二级类目名」全表',
        '按一级类目统计 GMV（order_items -&gt; products -&gt; categories 连两次）',
        '给定一个二级类目，查出它的父类目',
        '想想：为什么 products 不直接冗余一级类目 id？写两句利弊进 notes.md',
      ],
      pass: '按一级类目的 GMV 报表跑通，连接链能画出来。',
    },
    {
      no: 16,
      title: '「花得比平均多的用户」：子查询三个位置',
      brief: '老板：「找出消费高于平均水平的那批人，我给他们发券。」平均值本身就要一条查询来算--你第一次需要查询里套查询。',
      split: [40, 65, 15],
      learn: [
        '标量子查询（SELECT 里）：必须只返回一行一列',
        '派生表（FROM 里）：必须起别名',
        '条件子查询（WHERE 里）：单值与多值',
        '相关子查询：什么时候会被执行 N 次',
      ],
      drill: [
        '用标量子查询输出「每个用户消费额 − 全站平均消费额」',
        '用派生表先按用户聚合订单数，再连接 users 输出',
        '用 <code>WHERE id IN (子查询)</code> 查有过已支付记录的订单',
        '写一个返回多行的标量子查询，记录报错信息',
        '同一需求分别用派生表和 CTE 写，对比可读性',
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
        '相关子查询 vs 非相关子查询的执行方式',
        '<code>EXISTS</code> 的短路特性：找到一行就返回',
        '<b><code>NOT IN</code> + NULL = 空集</b>的完整推导',
        '<code>NOT EXISTS</code> 与 <code>LEFT JOIN ... IS NULL</code> 两种反连接写法',
      ],
      drill: [
        '用 IN、EXISTS、JOIN 三种写法查「下过单的用户」，对比 EXPLAIN',
        '在子查询列里制造 NULL，复现 <code>NOT IN</code> 返回空集',
        '把第 2 题改成 <code>NOT EXISTS</code>，验证结果正确',
        '再用 <code>LEFT JOIN ... WHERE b.id IS NULL</code> 写第三遍',
        '在 12 万行明细上跑三种反连接写法，做一张耗时对比表',
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
        '<code>WITH RECURSIVE</code> 的三段结构：初始项 + <code>UNION ALL</code> + 递归项',
        '递归的终止条件与执行过程',
        '防死循环：记录已访问路径',
        '累积深度与路径拼接的技巧',
      ],
      drill: [
        '查每个分类的完整路径（如「电子 &gt; 手机 &gt; 配件」）',
        '给定「电子」，查它的全部子孙分类及其销售汇总',
        '用递归 CTE 生成 2026 全年日期序列（不用 generate_series）',
        '算出每个分类所在的层级深度',
        '自建 employees 表做组织架构下钻，输出每人的汇报链',
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
        '<code>WITH</code> 基本语法与多级 CTE',
        'PG 12 起 CTE 默认可内联，之前版本是优化栅栏',
        '<code>MATERIALIZED</code> / <code>NOT MATERIALIZED</code> 的显式控制',
        '澄清误区：CTE 本身不是性能优化手段',
        '复杂需求五步法：定粒度 -&gt; 找主表 -&gt; 逐步补维度 -&gt; 定过滤位置 -&gt; 最后聚合排序',
      ],
      drill: [
        '把 D13 里最复杂的一题用 CTE 重写，对比可读性',
        '写一个三级 CTE：清洗 -&gt; 聚合 -&gt; 排名',
        '同一查询加与不加 <code>MATERIALIZED</code>，对比执行计划差异',
        '「近 3 个月每月新客 GMV 与老客 GMV」：先写五步拆解，再写 SQL',
        '写一个被引用两次的 CTE，观察是否被计算两次',
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
        'LATERAL 让右侧子查询能引用左侧的列',
        '<code>LEFT JOIN LATERAL (...) ON true</code> 的固定写法',
        'Top-N per group 的三种解法对比',
        'LATERAL 与相关子查询的关系',
      ],
      drill: [
        '用 LATERAL 查每个用户最近 3 笔订单',
        '用 LATERAL 查每个一级类目销量前 3 的商品',
        '用 <code>ROW_NUMBER</code> 把第 2 题再写一遍（预习下周窗口函数语法）',
        '用 <code>DISTINCT ON</code> 写 N=1 的版本',
        '三种写法都跑 <code>EXPLAIN ANALYZE</code>，记录耗时做成对比表',
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
      pass: '6 题中至少 4 题手写版本能直接跑通。',
    },
  ],
};
