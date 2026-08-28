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
