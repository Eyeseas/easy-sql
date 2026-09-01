import type { Day, Week } from '../types/curriculum';
import { dayMinutes } from '../types/curriculum';
import { week1 } from './weeks/week1';
import { week2 } from './weeks/week2';
import { week3 } from './weeks/week3';
import { week4 } from './weeks/week4';
import { week5 } from './weeks/week5';
import { week6 } from './weeks/week6';
import { week7 } from './weeks/week7';
import { week8 } from './weeks/week8';

export const curriculum: readonly Week[] = [week1, week2, week3, week4, week5, week6, week7, week8];

export const allDays: readonly Day[] = curriculum.flatMap((w) => w.days);

/** 页面顶部统计条的数字全部从数据推导，不写死 */
export const stats = {
  weeks: curriculum.length,
  days: allDays.length,
  hours: Math.round(allDays.reduce((sum, d) => sum + dayMinutes(d), 0) / 60),
  drills: allDays.reduce((sum, d) => sum + d.drill.length, 0),
  learnPoints: allDays.reduce((sum, d) => sum + d.learn.length, 0),
} as const;

/** 按天号取当天数据，API 路由用 */
export function findDay(no: number): Day | undefined {
  return allDays.find((d) => d.no === no);
}

export function weekOfDay(no: number): Week | undefined {
  return curriculum.find((w) => w.days.some((d) => d.no === no));
}

/**
 * 截至某天（不含当天）已学内容的概览，注入 #gen-context 给出题模型当「不超纲」
 * 边界：整周学完的只给周短名，进行中的一周列出已过各天的标题（天标题本身携带
 * 主题信息）。只给周短名 + 天标题，不带正文，控制页面体积。
 */
export function coveredForDay(no: number): string {
  const parts: string[] = [];
  for (const w of curriculum) {
    const past = w.days.filter((d) => d.no < no);
    if (past.length === 0) continue;
    if (past.length === w.days.length) {
      parts.push(`W${w.no} ${w.short}`);
    } else {
      parts.push(
        `W${w.no} ${w.short}（本周已学：${past.map((d) => `D${d.no}「${d.title}」`).join('，')}）`,
      );
    }
  }
  return parts.join('；');
}
