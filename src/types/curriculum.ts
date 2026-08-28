/** 课程内容的类型定义。改内容 = 改 data/ 下的对象，结构由这里保证。 */

/** 日程标签。hot=面试高频，lab=实战，test=测评 */
export type Tag = 'hot' | 'lab' | 'test';

export const TAG_LABEL: Record<Tag, string> = {
  hot: '高频',
  lab: '实战',
  test: '测评',
};

/** [学, 练, 盘] 三段分钟数，合计应为 120 */
export type TimeSplit = readonly [learn: number, drill: number, review: number];

/** 三个阶段的元信息，计时器和 DayCard 共用 */
export const PHASES = [
  { key: 'learn', label: '学', full: '学概念' },
  { key: 'drill', label: '练', full: '动手写' },
  { key: 'review', label: '盘', full: '复盘' },
] as const;

export type PhaseKey = (typeof PHASES)[number]['key'];

/** 「练」栏的参考答案：可直接运行的 SQL（或命令）+ 一句话要点 */
export interface DrillAnswer {
  /** 可直接在 PostgreSQL 16 上运行的参考 SQL / psql 命令；纯解释题可省略 */
  sql?: string;
  /** 一句话点破要点 / 预期结果 */
  note?: string;
}

export interface Day {
  /** 1–56，全局连续 */
  no: number;
  title: string;
  /** 业务剧情一句话：今天公司里发生了什么 / 谁提了什么需求。允许内联 <code> / <b> */
  brief?: string;
  tags?: readonly Tag[];
  split: TimeSplit;
  /** 「学」栏要点。允许内联 <code> / <b> */
  learn: readonly string[];
  /** 「练」栏编号任务。允许内联 <code> / <b> */
  drill: readonly string[];
  /** 与 drill 按下标对应的参考答案，日页折叠展示。没有答案的题留 undefined */
  drillAnswers?: readonly (DrillAnswer | undefined)[];
  /** 当天过关标准，一句话 */
  pass: string;
  /** 覆盖「学 / 练」两栏的标题，用于测评日（如「规则」「测评 + 归因」） */
  learnLabel?: string;
  drillLabel?: string;
}

export interface Week {
  /** 1–8 */
  no: number;
  title: string;
  /** 本周目标，显示在周标题下 */
  goal: string;
  /** 本周剧情：公司发展到哪个阶段、发生了什么 */
  story?: string;
  /** 侧栏用的短名 */
  short: string;
  days: readonly Day[];
}

/** 单日总时长（分钟） */
export function dayMinutes(day: Day): number {
  return day.split[0] + day.split[1] + day.split[2];
}
