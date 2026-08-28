/** 底部「高频考点自测清单」。ref 指向对应的天号，第 8 周答不上来就回炉。 */

export interface SelfTestItem {
  q: string;
  ref: string;
}

export interface SelfTestGroup {
  title: string;
  items: readonly SelfTestItem[];
}

export const selfTest: readonly SelfTestGroup[] = [
  {
    title: '查询与语义',
    items: [
      { q: 'SQL 的逻辑执行顺序是什么？', ref: 'D06' },
      { q: 'count(*)、count(col)、count(distinct col) 有什么区别？', ref: 'D04' },
      { q: 'LEFT JOIN 的过滤条件写在 ON 和 WHERE 里有何不同？', ref: 'D10' },
      { q: 'NOT IN 遇到 NULL 会发生什么？为什么用 NOT EXISTS？', ref: 'D17' },
      { q: 'UNION 和 UNION ALL 哪个快，为什么？', ref: 'D12' },
      { q: 'ROW_NUMBER、RANK、DENSE_RANK 并列时分别怎么排？', ref: 'D23' },
      { q: '怎么查「连续登录 7 天」的用户？', ref: 'D27' },
      { q: '每个分类销量前 3 的商品，三种写法各是什么？', ref: 'D20 / D23' },
    ],
  },
  {
    title: '性能与索引',
    items: [
      { q: '索引为什么快？B+ 树相比其他结构好在哪？', ref: 'D36' },
      { q: '复合索引的最左前缀是什么意思？列顺序怎么定？', ref: 'D38' },
      { q: '哪些写法会让索引失效？各举一例。', ref: 'D41' },
      { q: 'EXPLAIN 里 rows 估算和 actual rows 差很多说明什么？', ref: 'D39' },
      { q: 'Nested Loop、Hash Join、Merge Join 各自何时更优？', ref: 'D40' },
      { q: 'OFFSET 深分页为什么慢？怎么改？', ref: 'D44' },
      { q: '一张亿级表要加索引，怎么做才不影响线上？', ref: 'D45' },
      { q: '你优化过最慢的一条 SQL 是什么？说说过程。', ref: 'D42 / D49' },
    ],
  },
  {
    title: '事务与设计',
    items: [
      { q: 'ACID 四个特性分别由什么机制保证？', ref: 'D33' },
      { q: '脏读、不可重复读、幻读的区别？各由哪个隔离级别解决？', ref: 'D34' },
      { q: 'MVCC 是怎么实现「读不阻塞写」的？', ref: 'D34' },
      { q: '死锁是怎么产生的？怎么排查和避免？', ref: 'D35' },
      { q: '三大范式是什么？什么时候你会故意反范式？', ref: 'D31' },
      { q: '生产环境该不该用外键？说说你的取舍。', ref: 'D30' },
      { q: '扣库存怎么防超卖？乐观锁和悲观锁怎么选？', ref: 'D48' },
      { q: '设计一个点赞功能的表，说说索引和扩展性。', ref: 'D52' },
    ],
  },
];
