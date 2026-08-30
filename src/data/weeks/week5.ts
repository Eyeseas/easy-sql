import type { Week } from '../../types/curriculum';

export const week5: Week = {
  no: 5,
  title: '公司立规矩：建模、约束与事务',
  short: '建模与事务',
  story:
    '技术债集中爆发：脏数据、重复注册、改价没记录、并发下单差点把库存扣成负数。公司招了后端，你们决定把库重新立规矩，支付模块（payments 表）也在这周上线--你从「查数据的人」变成「能设计表的人」。',
  goal: '目标：从「查数据的人」变成「能设计表的人」。事务与隔离级别是八股必考区。',
  days: [
    {
      no: 29,
      title: '技术债清点：DDL 重整与列类型',
      brief:
        '复盘一个月攒下的债：status 靠裸字符串、有人问你金额能不能用 float、id 会不会溢出。今天重整 DDL，把类型的坑一次踩明白。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: 'CREATE / ALTER / DROP TABLE；大表 ALTER 加列什么时候会长时间锁表',
          scene: '线上 250 万行的 order_items 要加一列，操作不当全站写入卡死。',
          body: '关键在「要不要重写整张表」：加列带 DEFAULT（PG 11+）只改元数据，<b>秒回</b>；varchar(20) 放宽到 varchar(50) 不重写，很快；收窄长度或跨类型转换（varchar 改 int）要<b>全表重写</b>，期间持锁。动手前先在测试库跑一遍看耗时。',
          sql: `alter table order_items add column note text default '';          -- 秒回
alter table order_items alter column note type varchar(50);    -- 不重写，快
alter table order_items alter column note type integer;        -- 全表重写，锁到跑完`,
          pitfall:
            '「加列带默认值会锁表」是 PG 10 及更早的老黄历；但「改类型」的雷是真的--生产 DDL 前必须测耗时。',
        },
        {
          title: '主键选型：bigserial vs GENERATED ALWAYS AS IDENTITY vs uuid',
          scene: '新建 payments 表：主键用自增还是 uuid？这不是口味题。',
          body: '<code>bigserial</code> 是老语法（本质是个宏：建序列 + 默认值）；<code>identity</code> 是 SQL 标准（PG 10+），语义更严--<code>always</code> 版阻止手动插 id，细节不受干扰；<code>uuid</code> 全局唯一，多库合并、分布式生成不冲突。练习库 orders 用的 uuid（导出文件就是无序编号），payments 可以用 identity。',
          sql: `create table payments (
  id bigint generated always as identity primary key,
  ...
);`,
          pitfall:
            'serial 不是一种「类型」--面试官爱问这个。新项目默认 identity，需要跨系统唯一才上 uuid。',
        },
        {
          title: 'uuid 主键的两个代价：索引膨胀与随机写放大',
          scene: '后端说 uuid 好看又安全，全表都上--先看账单。',
          body: '① <b>索引膨胀</b>：uuid 是 16 字节，bigint 是 8 字节，索引天然大一倍；② <b>随机写放大</b>：uuid 无序，新行落在 B+ 树随机位置，频繁页分裂、缓存局部性差。写入量大的表，uuid 索引的插入明显慢。缓解：uuidv7（时间前缀、单调递增）。',
          pitfall: '面试答「uuid 有什么问题」只说「占空间」不够--写放大和页分裂才是核心。',
        },
        {
          title: '金额为什么必须 numeric；timestamptz 存的到底是什么；text vs varchar(n)',
          scene: '三个最高频的类型问题一次结清。',
          body: '① 金额：<code>numeric</code> 是精确十进制，float 是二进制近似（0.1 存不准）；② <code>timestamptz</code> 磁盘上存的是 <b>UTC 时刻</b>（自 2000-01-01 的微秒数），时区只是显示层的换算；③ PG 的 <code>text</code> 无长度上限，<code>varchar(n)</code> 有硬上限（超长报错不截断）--真要限制长度，text + check(length(x) &lt;= n) 更灵活。',
          sql: `select 0.1::float8 + 0.2::float8,      -- 0.30000000000000004
       0.1::numeric + 0.2::numeric;      -- 0.3

show timezone;      -- 只影响显示，不影响存储
select now() at time zone 'Asia/Shanghai';`,
          pitfall:
            '「timestamptz 存的是带时区的时间」是常见错答--存的是 UTC 时刻，时区是会话显示参数。',
        },
        {
          title: 'jsonb / enum / 数组类型各自适用场景；生成列',
          scene: '商品的扩展属性老变、状态值固定、标签一对多但懒得建表--三种「不走寻常路」的类型。',
          body: '<code>jsonb</code>：半结构化数据（扩展属性、接口报文），可 GIN 索引查询；<code>enum</code>：值集固定不变的状态（可读性好），加值要 ALTER 类型；数组：一对多的轻量场景（标签、权限位）。生成列 <code>generated always as (表达式) stored</code>：写入时自动算好存盘，读取零成本。',
          sql: `create table order_items (
  ...,
  line_total numeric generated always as (qty * unit_price) stored
);
insert into order_items(order_id, product_id, qty, unit_price)
values (1, 1, 3, 9.90);   -- line_total 自动 = 29.70`,
          pitfall:
            'enum 加值容易删值难（删要重排）；值集将来会变就用 text + check。jsonb 滥用会把「无 schema 的灵活」变成「无 schema 的泥潭」。',
        },
      ],
      drill: [
        '跑 <code>select 0.1::float8 + 0.2::float8</code> 与 numeric 版对比，记下结果',
        '用 IDENTITY 重建一张表，对比 serial 的差异',
        '给 order_items 加生成列 <code>line_total = qty * unit_price</code>',
        '在 12 万行的 order_items 上加一个带 DEFAULT 的列，记录耗时；再把一列 varchar(20) 改成 varchar(50)、改成 int，对比两次耗时',
        '用 <code>pg_dump -s</code> 导出整库结构存档',
      ],
      drillAnswers: [
        {
          sql: `select 0.1::float8 + 0.2::float8 as float版,    -- 0.30000000000000004
       0.1::numeric + 0.2::numeric as numeric版;  -- 0.3`,
          note: 'float 是二进制近似：0.1 在磁盘上就不是 0.1，误差随累加放大，对账永远差几分钱；numeric 是十进制精确存储。钱的类型只有 numeric 一个答案。',
        },
        {
          sql: `create table demo_serial (id bigserial primary key, val text);
create table demo_identity (id bigint generated always as identity primary key, val text);

insert into demo_serial(val) values ('a');
insert into demo_identity(val) values ('a');   -- 日常用法没区别

insert into demo_serial(id, val) values (100, '手动插');    -- serial 不拦
insert into demo_identity(id, val) values (100, '手动插');
-- ERROR: cannot insert a non-DEFAULT value into column "id" ...
-- 除非显式写 overriding system value

drop table demo_serial, demo_identity;   -- 练习完清理`,
          note: '\\d 两张表长得一样（都是序列供默认值）；差异在语义：identity 是 SQL 标准，always 版拦手动插 id，serial 只是「建序列 + 设默认值」的旧语法宏。',
        },
        {
          sql: `-- 加生成列：存量行会现场算好，12 万行要几秒（这是会重写表的操作）
alter table order_items
  add column line_total numeric generated always as (qty * unit_price) stored;

select order_id, qty, unit_price, line_total
from order_items
limit 5;

-- 顺手对账：明细合计应等于 total_amount，对不上的 ≈100 单正是埋的负金额脏数据
select count(*) as 对不上的订单数
from orders o
join (select order_id, sum(line_total) as s
      from order_items group by order_id) t on t.order_id = o.id
where o.total_amount <> t.s;`,
          note: '生成列写入时算好存盘、读取零成本；表达式必须是 immutable（乘法没问题）。对比「每次查询现算 sum」：典型的用写成本换读成本。',
        },
        {
          sql: `\\timing on

-- ① 加带 DEFAULT 的列：PG 11+ 只改元数据，毫秒级返回
alter table order_items add column memo varchar(20) default '';

-- ② varchar(20) 放宽到 varchar(50)：不重写表，毫秒级
alter table order_items alter column memo type varchar(50);

-- ③ 改成 int：全表重写 + 逐行转换，肉眼可见地慢
update order_items set memo = '0';   -- 空串转不了 int，先换成数字文本
alter table order_items alter column memo type integer using memo::integer;

alter table order_items drop column memo;   -- 还原`,
          note: '①② 是元数据操作所以秒回，③ 要重写 12 万行且期间持锁--§F 冲到 250 万行后同样操作就是分钟级锁。生产 DDL 前先在测试库测耗时，测的就是这个差距。',
        },
        {
          sql: `docker exec pg16 pg_dump -U postgres -s shop > shop_schema.sql
-- 本机装了客户端的话也可以：
pg_dump -h localhost -U postgres -s shop > shop_schema.sql`,
          note: '-s 只导结构不含数据。这份存档是今天 DDL 重整的「验收快照」：之后每次改表重新导一份，diff 一眼看出改了什么。',
        },
      ],
      pass: '能说出 uuid 做主键的两个具体代价、金额不能用 float 的原因、timestamptz 磁盘上存的是什么。',
    },
    {
      no: 30,
      title: '支付模块上线：把正确性交给数据库',
      brief:
        '支付模块今天上线，payments 表由你来建。后端说：「别靠应用代码保证正确，数据库要能挡住脏数据。」',
      tags: ['hot'],
      split: [40, 65, 15],
      learn: [
        {
          title: '五种约束：PK / FK / UNIQUE / CHECK / NOT NULL',
          scene: '后端说「数据库要能挡脏数据」--挡脏数据的就是这五个门卫。',
          body: '各管一件事：PK = 唯一 + 非空（行的身份证）；FK = 引用必须存在（明细指向的订单必须是真订单）；UNIQUE = 列组合不重复；CHECK = 自定义规则（金额 &gt; 0）；NOT NULL = 必填。约束在<b>写入时</b>检查，违反即整条语句失败--脏数据根本进不了库。',
          sql: `create table payments (
  id      bigint generated always as identity primary key,
  order_id uuid not null references orders(id),
  method  text not null,
  amount  numeric(10,2) not null check (amount > 0),
  status  text not null,
  paid_at timestamp,
  unique (order_id, method)          -- 同一订单同渠道只有一笔
);`,
          pitfall:
            '约束挡的是「结构性错误」；「业务逻辑错」（把 100 元记成 1000 元）永远要靠流程和评审。',
        },
        {
          title: '外键的级联动作：CASCADE / SET NULL / RESTRICT',
          scene: '删一个用户，他的订单、明细怎么办？建表时就要回答。',
          body: '<code>on delete cascade</code>：连带删光子行；<code>set null</code>：子行保留、外键置空（列必须可空）；<code>restrict</code>（默认）：有子行就拒绝删父行。选哪个是业务决策：审计要求高的库默认 restrict，别让一次 delete 引发雪崩。',
          sql: `-- 实验：删用户，订单连带消失
alter table orders
  drop constraint orders_user_id_fkey,
  add constraint orders_user_id_fkey
    foreign key (user_id) references users(id) on delete cascade;

delete from users where id = '...';   -- orders 里他的订单同时没了`,
          pitfall:
            'cascade 链会一路传导（订单没了 -&gt; 明细也没了）且<b>静默</b>发生；生产上删数据前先数一下子行有多少。',
        },
        {
          title: '唯一约束 vs 唯一索引的关系',
          scene: '面试题：唯一约束和唯一索引是不是一回事？',
          body: '在 PG 里功能等价：建唯一约束时 PG 自动建一个唯一索引来实现它。区别在意图层：约束是<b>声明</b>（表达业务规则），索引是实现（顺带加速）。写 DDL 用约束语义更清晰；已存在的唯一索引也被视作可用的冲突目标（on conflict 能用）。另外 PG 默认<b>多个 NULL 不算重复</b>。',
          sql: `-- 两种写法效果等价
alter table users add constraint uq_email unique (email);
create unique index idx_email on users (email);

select count(*) from (values (null),(null)) t(x);   -- 两个 null 并存
-- unique 列同理：多个 NULL 行可以共存（PG 15+ 可用 nulls not distinct 改变）`,
          pitfall: '「唯一列可以有多个 NULL」常被当成 bug 上报--其实是 SQL 标准语义。',
        },
        {
          title: '「生产环境该不该用外键」的正反理由',
          scene: '技术评审会上最热闹的一题：后端嫌外键碍事，DBA 嫌没有外键心慌。',
          body: '支持：数据库兜底正确性（应用有 bug 也挡得住）、自带文档作用、防止孤儿数据。反对：每次写入多一次引用检查（高频写场景有感）、锁竞争、<b>分库分表后外键根本没法跨库</b>。成熟观点不是站队，是分场景：单库中小规模用；超大规模 / 分库分表靠应用保证 + 定期跑一致性校验脚本。',
          pitfall: '面试回答这题要给出「在什么规模、什么前提下我会改变结论」--只喊口号不得分。',
        },
      ],
      drill: [
        '跑 seed.sql「W5」段灌入支付流水；按页面底部结构建 payments，PK / FK / NOT NULL 一次到位',
        '给前几周建的 7 张表补齐全部 PK 和 FK（还债日）',
        '加 <code>CHECK (amount &gt; 0)</code>，插一条负数验证报错',
        '用唯一约束防止「同一用户同一秒重复下单」',
        '做 <code>ON DELETE CASCADE</code> 实验：删一个用户，看订单是否连带消失',
        '写下「生产用外键」的支持理由 3 条、反对理由 3 条',
      ],
      drillAnswers: [
        {
          sql: `create table payments (
  id        bigint generated always as identity primary key,
  order_id  uuid not null references orders(id),
  method    int not null,               -- 1~4：支付渠道
  amount    numeric(10,2) not null,
  status    int not null default 1,
  paid_at   timestamp,
  unique (order_id, method)             -- 同一订单同渠道只有一笔：幂等的地基
);

-- 然后跑 seed.sql 的 §E 段（一条 insert ... select）
select count(*) from payments;   -- ≈4 万：每个已支付订单一条`,
          note: '约束一次到位：PK、FK、NOT NULL、unique。check 留到第 3 题单独加--seed 埋的负金额订单会留下负流水，先过不了 check，得先把表建起来灌数。',
        },
        {
          sql: `-- PK 建表时基本都有（\\d 检查），缺的补：alter table 表名 add primary key (id);
-- 这题的主菜是补外键：
alter table orders      add constraint orders_user_id_fkey
  foreign key (user_id) references users(id);
alter table products    add constraint products_category_id_fkey
  foreign key (category_id) references categories(id);
alter table categories  add constraint categories_parent_id_fkey
  foreign key (parent_id) references categories(id);
alter table order_items add constraint order_items_order_id_fkey
  foreign key (order_id) references orders(id);
alter table order_items add constraint order_items_product_id_fkey
  foreign key (product_id) references products(id);
alter table user_logins add constraint user_logins_user_id_fkey
  foreign key (user_id) references users(id);

-- 验收：列出全库外键
select conrelid::regclass as 子表, pg_get_constraintdef(oid) as 定义
from pg_constraint
where contype = 'f'
order by 1;`,
          note: '加外键会扫一遍子表验证存量（order_items 12 万行，秒级）。加完之后每次写子表都多一次父表引用检查--这就是第 6 题「反方理由」的现场。',
        },
        {
          sql: `-- 约束对存量数据同样校验：负金额订单留下的负流水先清掉
delete from payments where amount < 0;

alter table payments
  add constraint chk_payments_amount_positive check (amount > 0);

-- 验证：插一条负数
insert into payments(order_id, method, amount, status, paid_at)
values ((select id from orders where status = 2 limit 1), 1, -9.90, 1, now());
-- ERROR: new row for relation "payments" violates check constraint
--        "chk_payments_amount_positive"`,
          note: 'check 在写入时拦截、整条语句失败；「先有脏数据后加约束」必须先清存量--约束是入库的最后一道门，不是洗数据工具。',
        },
        {
          sql: `-- 「同一用户同一秒」是表达式，约束语法写不了，只能用表达式唯一索引
create unique index uq_orders_user_second
  on orders (user_id, date_trunc('second', created_at));

-- 验证：原样复制一笔订单（同用户同时间戳）
insert into orders(user_id, status, total_amount, created_at)
select user_id, 1, 99.00, created_at
from orders
limit 1;
-- ERROR: duplicate key value violates unique constraint "uq_orders_user_second"`,
          note: '这是 learn「唯一约束 vs 唯一索引」的落地：约束语法不支持表达式，唯一索引可以；反过来 PG 的唯一约束本来就是靠自动建唯一索引实现的。另外 PG 默认多个 NULL 不算重复。',
        },
        {
          sql: `begin;

create temp table victim as
select user_id from orders group by 1 order by count(*) limit 1;

-- 外键改成级联（order_items 不改的话 delete 会被它挡住--那就是 RESTRICT 的现场）
alter table orders
  drop constraint orders_user_id_fkey,
  add constraint orders_user_id_fkey
    foreign key (user_id) references users(id) on delete cascade;
alter table order_items
  drop constraint order_items_order_id_fkey,
  add constraint order_items_order_id_fkey
    foreign key (order_id) references orders(id) on delete cascade;

delete from users where id = (select user_id from victim);

select count(*) as 该用户剩余订单数
from orders
where user_id = (select user_id from victim);   -- 0：订单连带没了

rollback;   -- 实验整体撤销，库不留痕`,
          note: '级联会静默传导：用户没了、订单没了、明细也没了。整个实验包在事务里 rollback--PG 连 DDL 都是事务性的（D33 正式讲）。生产删父行前先数一下子行有多少。',
        },
        {
          note: '支持：① 数据库兜底正确性，应用有 bug 也挡得住孤儿数据；② 自带文档作用，\\d 就能看到表间关系；③ 优化器可借外键信息做 join 消除等优化。反对：① 写子表多一次引用检查，高频写场景有感；② 引入额外的锁竞争；③ 分库分表后外键无法跨库，形同虚设。结论模板：单库中小规模我默认用；到分库分表或极高写入量时，改为应用层保证 + 定期一致性校验脚本。',
        },
      ],
      pass: '能给出你自己的外键取舍结论，并说明在什么规模下会改变结论。',
    },
    {
      no: 31,
      title: '后端提议做宽表：范式与反范式',
      brief: '后端提议把用户名、商品名直接冗余进订单表「查得快」。你想起了范式，决定跟他掰扯清楚。',
      tags: ['hot'],
      split: [45, 55, 20],
      learn: [
        {
          title: '函数依赖与候选键的概念',
          scene: '掰扯范式之前，先学会说「谁决定谁」。',
          body: '函数依赖：知道 A 就能唯一确定 B，记作 A -&gt; B（user_id -&gt; 用户名）。候选键：能唯一确定<b>整行</b>的最小列集（orders 的 id；user_id + created_at 若唯一也是候选键）。范式理论的全部推导都建立在这两个概念上，不难，难的是把业务里「谁决定谁」说准。',
          sql: `-- 检验 user_id -> city 是否成立：一个用户出现两个城市就是反例
select user_id, count(distinct city) as cities
from (select o.user_id, u.city from orders o join users u on u.id = o.user_id) t
group by user_id
having count(distinct city) > 1;`,
          pitfall:
            '函数依赖是<b>业务事实</b>不是 SQL 特性--它由「一个用户只有一个城市」这类现实规则决定，表设计只能遵守或违反它。',
        },
        {
          title: '1NF -&gt; 2NF -&gt; 3NF -&gt; BCNF 各自消除什么问题',
          scene: '面试让你「讲讲三范式」--拿订单表一步步拆，比背定义有力得多。',
          body: '① 1NF：字段原子化--别在一个列里塞「红色,XL」；② 2NF：消除<b>部分依赖</b>--非键列不能只依赖复合键的一部分（明细表里放商品名，商品名只依赖 product_id，不依赖整个 (order_id, product_id)）；③ 3NF：消除<b>传递依赖</b>--键 -&gt; A -&gt; B 的 B 不该存（存了 category_id 就别存 category 名）；④ BCNF：所有决定因素都得是候选键，是 3NF 的收紧版。',
          sql: `-- 反例：一张「订单宽表」
-- orders_wide(order_id, product_id, 商品名, 类目名, 用户名, 城市, ...)
-- 2NF 违例：商品名只依赖 product_id
-- 3NF 违例：类目名依赖 类目id（不在键里）、城市依赖 user_id
-- 拆法：order_items 只留 (order_id, product_id, qty, unit_price)`,
          pitfall:
            '讲范式别背「确保数据一致性」这种空话--每级都配一个「会出什么异常」的例子：改商品名要改一万行、插入没有订单的新商品没地方放。',
        },
        {
          title: '反范式的三种常见形态：冗余字段、预聚合列、宽表',
          scene: '范式全守住了，报表要连七张表才出数--该反范式出场了。',
          body: '三种形态按激进程度排：① 冗余字段（订单里存下单时的用户名）；② 预聚合列（orders 上加 item_count，免得每次 count 明细）；③ 宽表（为报表单独建一张大宽表，ETL 定期刷新）。共同点：<b>用一致性维护成本换读取性能</b>。',
          sql: `-- ② 预聚合列的读取收益
select id, item_count from orders;              -- 免 join 明细
-- 维护成本：每次增删明细都要同步（见下一条）`,
          pitfall: '反范式不是「更先进」，是拿写复杂度换读性能的交易--读得少的表做反范式是纯亏本。',
        },
        {
          title: '反范式带来的一致性维护成本',
          scene: '后端问：那冗余的用户名，用户改名了怎么办？--问到点子上了。',
          body: '冗余数据会<b>漂移</b>。两种处理：① 当<b>快照</b>（订单存的是下单当时的名字，故意不同步--历史就该是历史）；② 当<b>缓存</b>（要的就是当前值，必须同步：触发器 / 应用双写 / 定时校验，三选一）。冗余前先回答是哪种。<code>order_items.unit_price</code> 为什么冗余得理直气壮？因为它是<b>价格快照</b>：商品后来改价，当时的成交价不该变。',
          sql: `-- 定时校验（兜底方案）：找出漂移的冗余行
select o.id
from orders_wide o
join users u on u.id = o.user_id
where o.用户名 <> u.name;   -- 有结果就该同步了`,
          pitfall: '说不清「快照还是缓存」的冗余列，上线半年后没人敢动它--这是最贵的技术债。',
        },
      ],
      drill: [
        '拿一张「订单宽表」（含用户名、商品名、类目名）逐步拆到 3NF，写出每一步消除了什么异常',
        '论证 <code>order_items.unit_price</code> 的冗余是合理的（价格快照语义）',
        '给 orders 加冗余列 <code>item_count</code>，写出保持它同步的两种方案',
        '举一个你认为必须反范式的实际场景并说明理由',
        '画出练习库的完整 ER 图',
      ],
      drillAnswers: [
        {
          note: '四步走：① 1NF--每列原子化（「红色,XL」塞一列的要拆），宽表本身已满足；② 2NF--商品名、类目名只依赖复合键 (order_id, product_id) 中的 product_id，是部分依赖，拆出 products：消除「改商品名要改一万行」「没有订单的新商品没地方插」两类异常；③ 3NF--用户名、城市传递依赖 user_id（键 到 user_id 再到 城市），类目名传递依赖 category_id，拆出 users 和 categories：消除「删掉最后一单连用户信息都没了」的删除异常；④ 终点就是练习库现状：orders / users / products / categories / order_items(order_id, product_id, qty, unit_price)。讲每级都配一个具体异常例子，别背「保证一致性」的空话。',
        },
        {
          note: '它是价格快照不是缓存：商品改价后，历史订单的成交价不该跟着变；若只存 product_id、查询时 join products.price 拿现价，一次改价等于改写全部历史账本。判断冗余是否合理就问一句「快照还是缓存」--快照不需要同步，缓存必须同步（触发器 / 应用双写 / 定时校验三选一）。seed 给 unit_price 加 0.9~1.1 的抖动就是在模拟「当时成交价不等于现价」。',
        },
        {
          sql: `-- 加列并回填存量
alter table orders add column item_count int;
update orders o
set item_count = s.c
from (select order_id, count(*) as c from order_items group by 1) s
where s.order_id = o.id;

-- 方案一：触发器强同步
create or replace function sync_item_count() returns trigger as $$
declare
  oid uuid := coalesce(new.order_id, old.order_id);
begin
  update orders o
  set item_count = (select count(*) from order_items i where i.order_id = oid)
  where o.id = oid;
  return null;
end $$ language plpgsql;

create trigger trg_sync_item_count
after insert or update or delete on order_items
for each row execute function sync_item_count();

-- 验证方案一：插一条明细，对应订单的 item_count 立刻 +1
insert into order_items(order_id, product_id, qty, unit_price)
values ((select id from orders order by created_at limit 1),
        (select id from products limit 1), 1, 1.00);
select id, item_count from orders order by created_at limit 1;
delete from order_items                    -- 清理，顺便验证 delete 也触发同步
where order_id = (select id from orders order by created_at limit 1)
  and qty = 1 and unit_price = 1.00;

-- 方案二：不做实时同步，定时重算（只更新有差异的行）
update orders o
set item_count = s.c
from (select order_id, count(*) as c from order_items group by 1) s
where s.order_id = o.id
  and o.item_count is distinct from s.c;`,
          note: '触发器 = 强一致、但每次写明细都多一次 update orders；定时重算 = 便宜、有数据过期窗口。选哪个取决于读端能否容忍短暂不准--item_count 是当缓存用的冗余，所以必须有同步方案。',
        },
        {
          note: '例子：首页商品卡片的销量与好评率。特征：读 QPS 极高（每次打开首页都查）、实时聚合要扫全量明细、容忍分钟级延迟--在 products 上冗余 sales_count / good_rate，由异步任务定时刷新。判断三问：读得够多吗？现算够贵吗？能容忍旧数据吗？三个都答「是」才反范式，否则是白付维护成本。',
        },
        {
          sql: `-- 用外键清单当画图的底稿
select conrelid::regclass as 子表,
       confrelid::regclass as 父表,
       pg_get_constraintdef(oid) as 定义
from pg_constraint
where contype = 'f'
order by 1;`,
          note: '关系清单：users 1-n orders、orders 1-n order_items、products 1-n order_items、categories 1-n products、categories 1-n categories（parent_id 自引用）、orders 1-n payments（unique 限制同渠道一笔）、users 1-n user_logins。工具用 dbdiagram.io 或 mermaid 的 erDiagram 都行，画完对照上面的外键清单核对。',
        },
      ],
      pass: '能用订单表这一个例子，从头讲完 1NF 到 3NF 的演进。',
    },
    {
      no: 32,
      title: '支付回调重试：增删改与 UPSERT',
      brief:
        '支付网关的回调会重试：同一笔支付可能回调多次。后端问你：「怎么保证不重复入账？」--幂等写入专场。',
      split: [35, 70, 15],
      learn: [
        {
          title: '多行 INSERT、INSERT ... SELECT',
          scene: '再也不用一行一条地插了。',
          body: '<code>values (...), (...), ...</code> 一条语句插多行（减少往返，比循环单插快一个量级）；<code>insert into t select ...</code> 从查询结果直接灌数--你已经在 seed.sql 里见过它几百次了。',
          sql: `insert into payments(order_id, method, amount, status, paid_at)
values ('...', 'alipay', 99.00, 'paid', now()),
       ('...', 'wechat', 59.00, 'paid', now());

insert into payments(order_id, method, amount)
select id, 'free', 0 from orders where status = 3;   -- 从查询灌`,
          pitfall: '单条多行插入是<b>一个语句</b>：任何一行违反约束，整条全部失败（原子性）。',
        },
        {
          title: 'ON CONFLICT DO NOTHING / DO UPDATE（PG 的 upsert）',
          scene: '同一笔回调来三次，账只能入一次--幂等的核心武器。',
          body: '语法 = 冲突目标 + 动作：<code>on conflict (唯一键列)</code>，撞上唯一约束时执行 DO NOTHING（跳过）或 DO UPDATE（改为更新）。DO UPDATE 里用 <code>excluded.列</code> 引用「这次想插进去的那行」。',
          sql: `insert into payments(order_id, method, amount, status, paid_at)
values ('...', 'alipay', 99.00, 'paid', now())
on conflict (order_id, method)          -- 撞唯一约束
do update set status = 'paid',
             paid_at = excluded.paid_at;  -- 用新值更新
-- 重复执行 N 次，payments 里永远只有这一行 = 幂等`,
          pitfall:
            '前提是先有唯一约束--没有唯一键，on conflict 不知道「冲突」看哪里。excluded 别名是固定写法，不是表名。',
        },
        {
          title: 'RETURNING 拿回写入结果',
          scene: '插完订单要用它的自增 id 建明细--以前的写法是再查一遍？',
          body: '<code>insert / update / delete ... returning *</code> 把受影响的行直接返回，一步拿回自增 id、默认值、生成列。应用层省一次往返，还避免「插完再按条件查」的竞态。',
          sql: `insert into orders(user_id, status, total_amount, created_at)
values ('...', 1, 128.00, now())
returning id, created_at;   -- 直接拿到生成的 uuid 和默认值

delete from payments where status = 'failed'
returning id;               -- 删了哪些，当场对账`,
          pitfall:
            'returning 返回的是<b>本次语句影响</b>的行；0 行返回就是没删没改，应用层别当成功处理。',
        },
        {
          title: 'UPDATE ... FROM 与 DELETE ... USING 关联改删',
          scene: '「把某类目下所有商品调价 10%」--更新条件在另一张表里。',
          body: 'PG 方言两件套：<code>update t set ... from 参照表 where 关联条件</code>；<code>delete from t using 参照表 where 关联条件</code>。等价于「join 着改 / 删」，比「先查 id 再 in (...)」少一步。',
          sql: `update products p
set price = round(p.price * 1.1, 2)
from categories c
where c.id = p.category_id
  and c.name = '手机';

delete from order_items i
using orders o
where i.order_id = o.id
  and o.status is null;   -- 脏订单的明细清掉`,
          pitfall:
            'update ... from 里若 join 出多行，结果是「随机一行生效」--关联键不唯一时会悄悄错；先确保一对一。',
        },
        {
          title: 'COPY 批量导入的性能优势',
          scene: '要灌 10 万行 CSV，insert 跑了一分钟。',
          body: '<code>copy 表 from ... csv</code> 绕过 SQL 解析层，按二进制/文本协议直灌，大批量导入快一个数量级。psql 里用 <code>\\copy</code>（读客户端本地文件）；SQL 的 COPY 读服务端文件（要权限）。',
          sql: `-- psql 客户端：导入本地 CSV
\\copy products(id, name, price) from 'products.csv' with csv header

-- 先建表结构，copy 只管数据
copy products(id, name, price) from '/tmp/products.csv' with csv header;`,
          pitfall:
            'copy 不走 on conflict / returning；要幂等或拿回结果还得 insert。它是纯粹的「快」。',
        },
      ],
      drill: [
        '写一条 upsert：商品存在则更新库存，不存在则插入',
        '用唯一键 + <code>ON CONFLICT DO NOTHING</code> 实现支付回调的幂等入账，重复执行验证结果不变',
        '插入订单并用 RETURNING 拿回自增 id',
        '用 <code>UPDATE ... FROM</code> 把某类目下所有商品调价 10%',
        '用 COPY 导入 10 万行 CSV，与逐条 INSERT 对比耗时',
      ],
      drillAnswers: [
        {
          sql: `-- on conflict 的前提：唯一约束先到位（商品名当前无重复）
alter table products add constraint uq_products_name unique (name);

insert into products(name, category_id, price, stock)
values ('新品手机', null, 1999.00, 10)
on conflict (name) do update
set stock = products.stock + excluded.stock;   -- 撞了就改成累加库存

-- 同一条再跑一遍：不新增行，库存再 +10
select name, price, stock from products where name = '新品手机';`,
          note: 'excluded 指这次想插进去的那行（不是表名）；连跑 N 次 = 1 次插入 + N-1 次更新，行数不涨。没有唯一约束时 on conflict 无从判断「冲突」，会直接报错。',
        },
        {
          sql: `-- 前提：payments 的 unique(order_id, method)（建表时已加）
-- 取一笔已存在的流水，模拟网关对同一笔回调的重试
with p as (
  select order_id, method, amount, status, paid_at
  from payments
  limit 1
)
insert into payments(order_id, method, amount, status, paid_at)
select order_id, method, amount, status, paid_at from p
on conflict (order_id, method) do nothing;

select count(*) from payments;   -- 连跑几次，数字都不变`,
          note: '把 on conflict do nothing 去掉再跑：每执行一次多一行--这就是「回调重试导致重复入账」。幂等 = 唯一键 + upsert 两件套：唯一键定义什么叫重复，on conflict 决定重复来了怎么办。',
        },
        {
          sql: `insert into orders(user_id, status, total_amount, created_at)
values ((select id from users limit 1), 1, 128.00, now())
returning id, created_at;   -- 生成的 uuid 当场拿回

-- 实战形态：data-modifying CTE，插订单拿 id 直接建明细，一条语句完成
with new_order as (
  insert into orders(user_id, status, total_amount, created_at)
  values ((select id from users limit 1), 1, 128.00, now())
  returning id
)
insert into order_items(order_id, product_id, qty, unit_price)
select id, (select id from products limit 1), 2, 64.00
from new_order
returning order_id, qty, unit_price;`,
          note: 'returning 省掉「插完再按条件查」的一次往返，也避免那个查询的竞态；返回 0 行 = 语句没影响任何行，应用层别当成功处理。测试数据可随后 delete 清理。',
        },
        {
          sql: `-- 先看这次会动多少行
select count(*) from products p
join categories c on c.id = p.category_id
where c.name = '子分类1';

update products p
set price = round(p.price * 1.1, 2)
from categories c
where c.id = p.category_id
  and c.name = '子分类1';

-- 后悔药：把 1.1 换成 / 1.1 再跑一遍（近似还原）`,
          note: 'update ... from 等价于「join 着改」；from 侧关联键不唯一时只有随机一行生效，动手前先确认一对一（这里商品对一个类目，安全）。',
        },
        {
          sql: `-- ① 造一份 10 万行 CSV（写到客户端本地文件）
\\copy (select g, '测试商品' || g, round((10 + random() * 990)::numeric, 2)
       from generate_series(1, 100000) g) to '/tmp/demo.csv' with csv

create table import_demo (id int, name text, price numeric);

-- ② COPY 导入，记下 \\timing 给出的耗时
\\timing on
\\copy import_demo from '/tmp/demo.csv' with csv
-- 典型耗时：几十到几百毫秒

-- ③ 逐条 INSERT 对比：先生成 10 万条 insert 语句，再整文件执行
truncate import_demo;
\\copy (select 'insert into import_demo values (' || g || ', '
             || quote_literal('测试商品' || g) || ', '
             || round((10 + random() * 990)::numeric, 2) || ');'
       from generate_series(1, 100000) g) to '/tmp/demo_inserts.sql'
\\i /tmp/demo_inserts.sql
-- 典型耗时：几十秒起步（每条语句自动提交一个事务 + 一次完整解析）

drop table import_demo;`,
          note: 'COPY 走专用协议绕过 SQL 解析器，快一个数量级；代价是不支持 on conflict / returning，纯粹的快。\\copy 是 psql 读客户端文件的版本，服务端 copy 读服务端文件、要权限。',
        },
      ],
      pass: '写出一条真正幂等的 upsert（重复执行结果不变）。',
    },
    {
      no: 33,
      title: '扣了款订单却没建成功：事务与 ACID',
      brief:
        '线上事故复盘：扣款成功、订单却没创建。你意识到「两条写入要么都成、要么都不成」需要事务。',
      tags: ['hot'],
      split: [45, 60, 15],
      learn: [
        {
          title: 'A 由回滚日志、C 由约束、I 由锁与 MVCC、D 由 WAL 保证',
          scene: '扣款成功订单没建--两条写入必须同生共死，这就是事务存在的意义。',
          body: '教科书答案：<b>A</b>（原子）靠回滚日志、<b>C</b>（一致）靠约束、<b>I</b>（隔离）靠锁 + MVCC、<b>D</b>（持久）靠 WAL 预写日志。PG 特殊点要能接得住追问：PG <b>没有 undo log</b>，A 靠 MVCC--回滚时新写的行版本直接标记作废（死元组），vacuum 收尾。答「PG 用 undo 保证原子性」是把 MySQL 的答案串了台。',
          sql: `begin;
update products set stock = stock - 1 where id = 1;
insert into orders(user_id, status, total_amount, created_at)
values ('...', 1, 99.00, now());
-- 中间任何一步失败：
rollback;   -- 库存和白下的单一起消失
commit;     -- 或者一起落盘`,
          pitfall:
            'ACID 每个字母「由什么机制保证」是高频面试题；PG 版答案和通用版答案的差异是加分位。',
        },
        {
          title: 'BEGIN / COMMIT / ROLLBACK / SAVEPOINT',
          scene: '事务里的「存档点」：一批操作里有一部分失败了，只想重做那一部分。',
          body: '<code>begin</code> 开事务、<code>commit</code> 落盘、<code>rollback</code> 全撤销；<code>savepoint 名字</code> 在事务里打存档点，<code>rollback to savepoint 名字</code> 只回滚到存档点、事务继续。适合「批量处理里单条失败跳过继续」的场景。',
          sql: `begin;
savepoint sp1;
insert into payments(order_id, method, amount) values ('...', 'x', -1);
-- 违反 check 报错，事务进入 aborted 状态
rollback to savepoint sp1;   -- 只回滚这条，事务继续
insert into payments(order_id, method, amount) values ('...', 'alipay', 99);
commit;`,
          pitfall:
            '语句报错后事务进入 aborted 状态，<b>必须</b> rollback（或 to savepoint）才能继续执行后续语句--不回滚就接着写会一路报错。',
        },
        {
          title: 'psql 的自动提交行为',
          scene: '你没写 begin，为什么每条语句也「像个事务」？',
          body: 'psql 里不显式写 begin，每条语句被自动包一层单语句事务、立即提交。反过来，<b>显式事务里的 DDL 也能回滚</b>--PG 的 DDL 是事务性的，建表、加列、建索引都能 rollback；MySQL 的 DDL 会隐式提交、不可回滚。',
          sql: `begin;
create table t_test (id int);
rollback;
-- t_test 不存在了：DDL 也被回滚（PG 特性，MySQL 不行）`,
          pitfall: '「DDL 不能回滚」是 MySQL 的规矩，当通用结论背会在 PG 面试里翻车。',
        },
        {
          title: '长事务的危害：阻塞 vacuum、表膨胀、锁等待',
          scene: '周五下午全站变慢，查出来是一个开了两小时没提交的报表查询。',
          body: '长事务三宗罪：① 它的快照让 vacuum 不敢清理之后产生的死元组 -&gt; <b>表膨胀</b>；② 事务 ID 有回卷风险，老事务拖住全局；③ 持有的锁一直不放，别人排队。排查入口：<code>pg_stat_activity</code> 看 <code>xact_start</code> 最老的几个。',
          sql: `select pid, state, xact_start, now() - xact_start as 事务年龄,
       left(query, 60) as query
from pg_stat_activity
where xact_start is not null
order by xact_start
limit 5;

-- select pg_terminate_backend(pid);   -- 处决最老的那个`,
          pitfall:
            '「开了忘提交」的最大来源是应用连接池--不是有人真的在跑两小时，是一个连接借出去没还干净。',
        },
      ],
      drill: [
        '手写一个下单事务（建订单 + 扣库存），中途故意报错验证全部回滚',
        '用 SAVEPOINT 实现部分回滚',
        '开一个 5 分钟不提交的事务，在另一窗口查 <code>pg_stat_activity</code> 观察状态',
        '验证未提交的修改在另一个会话中不可见',
        '写下长事务的三个具体危害',
      ],
      drillAnswers: [
        {
          sql: `begin;

select stock as 原库存 from products where name = '商品1';   -- 记下这个数

update products set stock = stock - 1 where name = '商品1';  -- 扣库存

insert into orders(user_id, status, total_amount, created_at)
values ((select id from users limit 1), 1, 99.00, now())
returning id;                                               -- 建订单

-- 故意失败：非空约束
insert into orders(user_id, status, total_amount, created_at)
values (null, 1, 1.00, now());
-- ERROR: null value in column "user_id" of relation "orders"
--        violates not-null constraint

-- 报错后事务进入 aborted 状态：再执行任何语句都报错，必须先 rollback
rollback;

select stock from products where name = '商品1';   -- 库存回来了：扣减和新订单一起消失`,
          note: '第二条 insert 失败，但第一条 update 也一并回滚--原子性。「扣款成功订单没建」的解法就是：把同生共死的写入放进同一个事务。',
        },
        {
          sql: `begin;

savepoint sp1;
insert into payments(order_id, method, amount, status, paid_at)
values ((select id from orders where status = 2 limit 1), 1, -1.00, 1, now());
-- ERROR: check 约束拦下（前提：D30 已加 amount > 0）

rollback to savepoint sp1;   -- 只撤销这一条，事务继续

insert into payments(order_id, method, amount, status, paid_at)
values ((select id from orders where status = 2 limit 1), 1, 99.00, 1, now());

commit;   -- 想保持库干净，把最后的 commit 换成 rollback 也不影响演示`,
          note: '存档点的用途：批量处理里单条失败跳过继续，不用整批重来。注意报错后若不 rollback to savepoint，事务卡在 aborted 状态什么都做不了。',
        },
        {
          sql: `-- 窗口A：开一个不提交的事务（改一行才会真正持有锁和事务 id）
begin;
update products set stock = stock where name = '商品1';
-- 停在这别动（也可以改成 select pg_sleep(300);）

-- 窗口B：观察 A 的状态
select pid, state, xact_start, now() - xact_start as 事务年龄,
       left(query, 60) as query
from pg_stat_activity
where xact_start is not null
order by xact_start;
-- 预期：窗口A 的 state = idle in transaction，事务年龄持续增长

-- 练习完回窗口A commit 或 rollback 释放；看不惯可以直接杀：
-- select pg_terminate_backend(pid);`,
          note: 'idle in transaction 就是「开了没提交」的标志状态；它拖住 vacuum 和全局 xmin--「周五全站变慢」的元凶长这样。这就是 learn 长事务排查入口那条查询的实战版。',
        },
        {
          sql: `-- 基线：把演示行固定成已知值
update products set stock = 100 where name = '商品1';

-- 窗口A
begin;
update products set stock = 999 where name = '商品1';
-- 停在这，别提交

-- 窗口B
select stock from products where name = '商品1';   -- 100：不是 999

-- 回窗口A执行 commit; 窗口B 再查：
select stock from products where name = '商品1';   -- 999：提交后才可见

update products set stock = 100 where name = '商品1';   -- 还原`,
          note: 'B 读到的是已提交的旧版本--MVCC 的可见性规则。这也解释了 PG 为什么根本不存在脏读（D34 正式展开）。',
        },
        {
          note: '① 拖住 vacuum：老事务的快照让它之后产生的死元组不敢清理，表持续膨胀；② 锁不放：持有的行锁 / 表锁让后续写入排队，锁等待时间 = 事务长度；③ 事务 ID 回卷风险：最老的事务卡住全局，txid 无法推进，PG 被迫紧急处理。排查入口都是 pg_stat_activity 按 xact_start 排序看最老的几个。',
        },
      ],
      pass: '能说出 ACID 每个字母分别由数据库的什么机制保证。',
    },
    {
      no: 34,
      title: '并发下的怪事：隔离级别与 MVCC',
      brief: '两个运营同时改一条库存，后提交的把先提交的覆盖了。你复现并搞懂了并发异常的全家桶。',
      tags: ['hot'],
      split: [50, 55, 15],
      learn: [
        {
          title: '四种异常：脏读、不可重复读、幻读、丢失更新',
          scene: '两个会话同时操作一份数据，能出什么幺蛾子？全家桶一共四种。',
          body: '① <b>脏读</b>：读到别人<b>还没提交</b>的修改（他一回滚，你读的就是从没存在过的数据）；② <b>不可重复读</b>：同一事务里两次读同一<b>行</b>，值变了（别人提交了 update）；③ <b>幻读</b>：两次执行同一<b>条件查询</b>，行集变了（别人提交了 insert/delete）；④ <b>丢失更新</b>：两个事务都「读-改-写」同一行，后提交的覆盖先提交的。',
          sql: `-- 丢失更新现场（两个窗口都执行）：
-- 窗口A                          -- 窗口B
begin;                            begin;
select stock from products
  where id = 1;      -- 100
                                  select stock from products where id = 1;  -- 100
update products set stock = 99
  where id = 1;
commit;                           update products set stock = 0 where id = 1;
                                  commit;   -- A 的 99 被 B 的 0 覆盖`,
          pitfall:
            '脏读和不可重复读的区别就一个字：「没提交的」和「提交了的」。幻读盯的是行<b>集</b>不是单行值。',
        },
        {
          title: '四个隔离级别各自防住哪些异常',
          scene: '隔离级别就是「愿意容忍哪种怪事」的档位旋钮。',
          body: '从松到紧：读未提交（啥都不防）/ 读已提交（防脏读）/ 可重复读（再防不可重复读和丢失更新）/ 串行化（全防，并发最低）。档位越紧，并发性能越差--隔离级别本质是正确性和并发度的交易。',
          sql: `show transaction_isolation;    -- PG 默认 read committed
set transaction isolation level repeatable read;   -- 当前事务用 RR
set default_transaction_isolation = 'repeatable read';  -- 会话级默认`,
          pitfall: '矩阵别死背：先记住四种异常是什么，级别能防谁自然推导出来。',
        },
        {
          title: 'PG 实际只实现三级（读未提交等价于读已提交）',
          scene: '你在 PG 里设 read uncommitted，结果脏读复现不了。',
          body: 'PG 的 MVCC 架构下<b>不存在脏读</b>：未提交的行版本对别人天然不可见，读未提交这个档位在 PG 里被静默升级成读已提交。所以「PG 支持四种隔离级别」的说法不严谨--能设四个名字，行为只有三档。',
          sql: `set transaction isolation level read uncommitted;
show transaction isolation;   -- 显示 read uncommitted
-- 但脏读照样发生不了：MVCC 保证了未提交不可见`,
          pitfall: '面试说「PG 支持脏读」直接露馅；标准矩阵是理论，PG 的实现是现实，两边都要会讲。',
        },
        {
          title: 'MVCC 原理：xmin / xmax 与快照可见性',
          scene: '为什么 PG 读不加锁也不脏读？答案写在每一行里。',
          body: '每行藏着两个系统列：<code>xmin</code>（创建它的事务 id）、<code>xmax</code>（删除/更新它的事务 id）。修改<b>不改原行</b>，而是插入新版本。读时拿一个「快照」（记着哪些事务已提交），按规则判断每个版本可见：xmin 已提交且在快照内、且 xmax 未提交或不存在 -&gt; 可见。读不阻塞写、写不阻塞读，就是这么来的。',
          sql: `select xmin, xmax, id, stock from products where id = 1;
-- update 后再看：旧行 xmax 被填上，新行是新的 xmin
-- pg 把旧版本留给并发读者，稍后 vacuum 清理`,
          pitfall:
            'MVCC 的账单是<b>死元组</b>：更新越多、垃圾越多，vacuum 是系统的清道夫（W5 D33 长事务拖累的就是它）。',
        },
        {
          title: 'PG 的 REPEATABLE READ 已能防幻读，与 MySQL 的差异',
          scene: '面试最爱：「PG 和 MySQL 的可重复读有什么区别？」',
          body: 'PG 的 RR 靠<b>快照</b>：整个事务用同一份快照，别人提交的插入和删除都不可见，幻读天然不存在。MySQL InnoDB 的 RR 靠<b>锁</b>（间隙锁挡住区间内的插入）防幻读，但两个事务都「读-改-写」同一行时仍可能互相覆盖，要靠 CAS 式更新防丢失。同名 RR，两套世界。',
          sql: `-- PG RR 下复现不了幻读：
-- 窗口A（RR）                     -- 窗口B
begin isolation level repeatable read;
select count(*) from t;  -- 10
                                  insert into t values (...); commit;
select count(*) from t;  -- 还是 10：快照没变，看不见 B 的插入`,
          pitfall:
            '标准矩阵说「RR 防不了幻读」--PG 是例外。答这题的正确姿势：「标准这么说，但 PG 的实现是快照隔离，实际防住了」。',
        },
      ],
      drillLabel: '练 · 55 min · 开两个 psql 窗口逐个复现',
      drill: [
        '读已提交下复现不可重复读',
        '切到 REPEATABLE READ，验证不可重复读消失',
        '在 RR 下尝试复现幻读，记录 PG 的实际表现',
        '复现丢失更新，再用 <code>SELECT FOR UPDATE</code> 消除它',
        'SERIALIZABLE 下制造串行化冲突，记录报错信息',
      ],
      drillAnswers: [
        {
          sql: `-- 基线
update products set price = 100 where name = '商品1';

-- 窗口A                                        -- 窗口B
begin;
select price from products
where name = '商品1';   -- 100.00
                                              update products set price = 110
                                              where name = '商品1';
                                              commit;
select price from products
where name = '商品1';   -- 110.00：同一事务两次读，值变了
rollback;

update products set price = 100 where name = '商品1';   -- 还原`,
          note: 'PG 默认就是 read committed：每条语句拿一份新快照，B 提交后 A 的第二次读立刻看到新值--不可重复读复现。',
        },
        {
          sql: `-- 基线
update products set price = 100 where name = '商品1';

-- 窗口A
begin isolation level repeatable read;
select price from products where name = '商品1';   -- 100.00

-- 窗口B
update products set price = 110 where name = '商品1';
commit;

-- 窗口A 再读
select price from products where name = '商品1';   -- 还是 100.00：快照没变
commit;   -- A 提交之后再读才是 110

update products set price = 100 where name = '商品1';   -- 还原`,
          note: 'RR 在事务第一条语句执行时定下快照，此后别人提交的修改一律不可见--不可重复读消失。代价：RR 下并发改同一行，后到者在 update 处直接报 could not serialize access due to concurrent update。',
        },
        {
          sql: `-- 窗口A
begin isolation level repeatable read;
select count(*) as 大额待支付单
from orders
where status = 1 and total_amount > 1500;   -- 记下这个数

-- 窗口B
insert into orders(user_id, status, total_amount, created_at)
values ((select id from users limit 1), 1, 1999.00, now())
returning id;   -- 记下 id，结束后删掉这行
commit;

-- 窗口A 再数
select count(*) as 大额待支付单
from orders
where status = 1 and total_amount > 1500;   -- 还是第一次的数
commit;

-- 窗口B 清理
delete from orders where id = '<刚才 returning 返回的 id>';`,
          note: '复现不了：两次 count 完全一致。标准矩阵说 RR 防不住幻读，PG 是例外--它的 RR 是快照隔离，幻读天然不存在。面试答法：先说标准怎么说，再补「PG 的实现实际防住了」。',
        },
        {
          sql: `-- 基线
update products set stock = 100 where name = '商品1';

-- ① 复现丢失更新（两窗口交错执行）
-- 窗口A                                        -- 窗口B
begin;
select stock from products
where name = '商品1';   -- 100
                                              begin;
                                              select stock from products
                                              where name = '商品1';   -- 100
update products set stock = 99
where name = '商品1';
commit;
                                              update products set stock = 99
                                              where name = '商品1';   -- 基于 B 读到的 100
                                              commit;
-- 结果 stock = 99：扣了两次却只少 1，A 的写入被 B 覆盖

-- ② FOR UPDATE 消除
update products set stock = 100 where name = '商品1';
-- 窗口A                                        -- 窗口B
begin;
select stock from products
where name = '商品1'
for update;   -- 100，行锁到手
                                              begin;
                                              select stock from products
                                              where name = '商品1' for update;
                                              -- B 卡住：等 A 释放锁
update products set stock = stock - 1
where name = '商品1';
commit;   -- A 提交，B 立刻恢复
                                              -- B 这次读到的是 99
                                              update products set stock = stock - 1
                                              where name = '商品1';
                                              commit;
-- 结果 stock = 98：两次扣减都生效`,
          note: 'for update 的价值不只是锁：后到者恢复执行时读到的是已提交的最新值，再基于它动手。防丢失更新还有个免显式锁的写法：单语句 CAS 式 update，set stock = stock - 1 配 where stock 大于等于 1。',
        },
        {
          sql: `-- 基线
update products set stock = 100 where name = '商品1';

-- 窗口A                                        -- 窗口B
begin isolation level serializable;
select stock from products
where name = '商品1';   -- 100
                                              begin isolation level serializable;
                                              select stock from products
                                              where name = '商品1';   -- 100
update products set stock = stock - 1
where name = '商品1';
                                              update products set stock = stock - 1
                                              where name = '商品1';
                                              -- B 在这条语句上排队等 A 的行锁
commit;
                                              -- A 一提交，B 的 update 立刻报错：
                                              -- ERROR: could not serialize access
                                              -- due to concurrent update
                                              rollback;   -- 只能回滚后重试

update products set stock = 100 where name = '商品1';   -- 还原`,
          note: 'SQLSTATE 都是 40001（冲突是谓词级时，也可能拖到 commit 才报 read/write dependencies 版本）。串行化靠 SSI 主动杀掉「可能不可串行化」的事务换正确性--被杀方必须重试，这是正确性和并发度的交易。',
        },
      ],
      pass: '产出一张自己实测的「隔离级别 × 异常」表格，能对照讲。',
    },
    {
      no: 35,
      title: '秒杀预演：锁与死锁 + 周复盘',
      brief:
        '大促前的秒杀预演：多人同时抢最后一件库存。你需要 SELECT FOR UPDATE、SKIP LOCKED 这些真家伙。',
      tags: ['hot'],
      split: [40, 50, 30],
      learn: [
        {
          title: '行锁与表锁的模式与兼容矩阵',
          scene: '锁不是一把锁：行锁表锁、几种模式、谁跟谁犯冲，得有张地图。',
          body: 'PG 的行锁只在 UPDATE / DELETE / SELECT FOR UPDATE 时出现，<b>不阻塞读</b>（读走 MVCC，根本不碰锁）。表锁大多是 DDL（alter / drop）自动加的，跟一切犯冲。日常关心的其实就一个矩阵：<b>两个写操作争同一行 -&gt; 后到的等；写操作和 DDL 争同一张表 -&gt; 全队等</b>。',
          sql: `-- pg_locks 是锁的总账本（含表锁、事务锁、咨询锁等）
select locktype, relation::regclass, mode, granted
from pg_locks
where relation is not null;`,
          pitfall:
            'PG 的行锁信息在内存里、不落盘，崩溃恢复不需要修补行锁--跟「锁存在数据页里」的数据库不同，冷知识但面试官爱听。',
        },
        {
          title: 'FOR UPDATE / FOR SHARE / NOWAIT / SKIP LOCKED',
          scene: '秒杀预演的核心武器，四个修饰词各有分工。',
          body: '<code>select ... for update</code>：选中的行加行锁，别的事务想改会等，锁持续到事务结束；<code>for share</code>：共享锁（只挡写不挡读）；<code>nowait</code>：拿不到锁立即报错而不是排队；<code>skip locked</code>：<b>跳过被锁的行</b>只处理没锁的--多消费者任务队列的完美原语。',
          sql: `-- 任务队列：多 worker 并发取任务不撞车
begin;
select id from tasks
where status = 'pending'
order by id
limit 10
for update skip locked;     -- 被别的 worker 锁着的直接跳过
update tasks set status = 'running' where id in (...);
commit;`,
          pitfall:
            'for update 必须在<b>事务里</b>才有意义--没有事务，语句结束锁就释放了，等于没锁。',
        },
        {
          title: '死锁的成因与 PG 的自动检测',
          scene: '两个事务互相等待：A 锁了 1 号行等 2 号，B 锁了 2 号行等 1 号。',
          body: 'PG 的等待图里出现<b>环</b>，死锁检测器（默认每 1s 醒一次）发现后杀掉其中一个事务、报 deadlock detected。被杀的收到错误，另一个正常提交。预防三板斧：① 多行操作<b>按相同顺序</b>（比如都按 id 升序）；② 缩短事务（锁持有时间 = 事务长度）；③ 一次锁齐所需行，别分批加锁。',
          sql: `-- 复现模板（两个窗口交错执行）：
-- 窗口A                    -- 窗口B
begin;                      begin;
select * from p where id=1 for update;
                            select * from p where id=2 for update;
select * from p where id=2 for update;  -- 等待 B
                            select * from p where id=1 for update;
                            -- B 先拿到锁，A 被杀：deadlock detected`,
          pitfall:
            '死锁没有「报错给双方」：一个失败一个成功。应用必须把被杀的事务<b>重试</b>，否则等于丢了一次更新。',
        },
        {
          title: 'pg_locks 与 pg_blocking_pids() 排查阻塞',
          scene: '生产上一条 UPDATE 卡了 10 分钟--它在等谁？',
          body: '一行 SQL 找出阻塞链：<code>pg_blocking_pids(pid)</code> 返回「正在阻塞我」的连接。配上 pg_stat_activity 的 query 字段，谁堵谁、堵在哪条语句，一目了然。这是线上「全站突然卡住」的第一反应动作。',
          sql: `select pid,
       pg_blocking_pids(pid) as 被谁阻塞,
       wait_event_type, wait_event,
       state,
       now() - query_start as 已运行,
       left(query, 60) as query
from pg_stat_activity
where state <> 'idle'
order by query_start;`,
          pitfall: '先处理「被谁阻塞」非空且最老的那个连接（看是不是忘提交的事务），再考虑杀谁。',
        },
      ],
      drill: [
        '两个会话对同一行 <code>FOR UPDATE</code>，观察阻塞',
        '用 <code>SKIP LOCKED</code> 实现一个多消费者任务队列',
        '故意制造死锁，读 PG 报出的死锁日志',
        '查 <code>pg_locks</code> 找出阻塞链条',
        '用 <code>NOWAIT</code> 实现快速失败而不是排队',
      ],
      drillAnswers: [
        {
          sql: `-- 基线
update products set stock = 100 where name = '商品1';

-- 窗口A                          -- 窗口B
begin;
select stock from products
where name = '商品1'
for update;   -- 100，行锁到手
                                  begin;
                                  select stock from products
                                  where name = '商品1' for update;
                                  -- 卡住：等 A 释放行锁
update products set stock = stock - 1
where name = '商品1';
commit;                           -- A 提交的瞬间 B 恢复，读到 99
                                  commit;

-- B 卡住期间开第三个窗口验证：普通 select 完全不受影响
select stock from products where name = '商品1';`,
          note: 'B 等的是行锁；配合第 4 题的 pg_blocking_pids 能直接看到「B 被 A 阻塞」。同时注意普通读不受阻--PG 读走 MVCC 根本不碰锁。',
        },
        {
          sql: `-- 准备（任一窗口执行一次）
create table if not exists tasks (
  id      bigint generated always as identity primary key,
  status  text not null default 'pending',
  payload text
);
truncate tasks;
insert into tasks(payload)
select '任务' || g from generate_series(1, 20) g;

-- 窗口A 和 窗口B 同时执行同一段：
begin;
select id from tasks
where status = 'pending'
order by id
limit 10
for update skip locked;
-- A 拿到 id 1~10；B 同一时刻执行，跳过被 A 锁住的行，直接拿到 11~20
update tasks set status = 'running'
where id in (/* 本窗口刚查到的 id */);
commit;

-- 应用里更常用的单语句版：取任务和改状态一条完成
begin;
with picked as (
  select id from tasks
  where status = 'pending'
  order by id
  limit 10
  for update skip locked
)
update tasks t
set status = 'running'
from picked
where t.id = picked.id
returning t.id;
commit;

-- 练习完还原
drop table tasks;`,
          note: '对比实验：把 skip locked 去掉重跑，B 会整个卡住等 A 提交，队列并行度归零。skip locked 是多消费者任务队列的原语：锁着的让给别人，只拿没人碰的。',
        },
        {
          sql: `-- 基线
update products set stock = 100 where name = '商品1';
update products set stock = 200 where name = '商品2';

-- 窗口A                          -- 窗口B
begin;
update products set stock = stock - 1
where name = '商品1';   -- A 锁住商品1
                                  begin;
                                  update products set stock = stock - 1
                                  where name = '商品2';   -- B 锁住商品2
update products set stock = stock - 1
where name = '商品2';   -- A 等 B 放商品2
                                  update products set stock = stock - 1
                                  where name = '商品1';   -- B 等 A：等待环出现
                                  -- 约 1 秒后其中一方被杀：
                                  -- ERROR:  deadlock detected
                                  -- DETAIL: Process 123 waits for ShareLock on
                                  --         transaction 456, blocked by ...

-- 幸存的一方正常 commit；被杀的一方 rollback 后重试
rollback;`,
          note: '死锁检测器每 deadlock_timeout（默认 1s）醒一次找等待环，报错只出现在被杀的一方。避免三板斧：多行操作按固定顺序（两边都先商品1后商品2就死不了）、缩短事务、一次锁齐别分批。',
        },
        {
          sql: `-- 先复现第 1 题的「B 卡在 for update」，然后在第三个窗口执行：
select pid,
       pg_blocking_pids(pid) as 被谁阻塞,
       wait_event_type, wait_event,
       state,
       now() - query_start as 已运行,
       left(query, 60) as query
from pg_stat_activity
where state <> 'idle'
order by query_start;

-- 想看锁本身的明细
select locktype, relation::regclass as 表, mode, granted, pid
from pg_locks
where relation is not null
order by granted;   -- granted 为 false 的就是正在排队的锁`,
          note: 'B 那一行的「被谁阻塞」就是 A 的 pid--阻塞链一眼看清。线上「全站突然卡住」的第一反应动作就是这条查询：先看最老的、被阻塞非空的连接是不是忘提交的事务，再决定杀谁。',
        },
        {
          sql: `-- 窗口A                          -- 窗口B
begin;
select stock from products
where name = '商品1'
for update;   -- 锁到手
                                  begin;
                                  select stock from products
                                  where name = '商品1'
                                  for update nowait;
                                  -- 不排队，立刻失败：
                                  -- ERROR: could not obtain lock on row
                                  --        in relation "products"
                                  commit;   -- 转身干别的（或返回「稍后重试」）
commit;`,
          note: 'nowait 把干等变成快速失败：秒杀场景宁可放弃这一次也不挂住连接，配合应用层重试 / 降级使用。和 skip locked 的区别：nowait 是一行都拿不到就报错，skip locked 是拿不到的跳过、拿剩下的。',
        },
      ],
      pass: '能画出死锁那两个事务的时序图，并说出三种避免死锁的做法。',
    },
  ],
};
