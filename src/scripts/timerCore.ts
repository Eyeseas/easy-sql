/**
 * 计时会话的纯核心：阶段时长、已耗结算、剩余格式化、跨段结转。
 *
 * 无 DOM、无副作用 -- 当前时刻通过参数注入（默认取 Date.now()），所以
 * tests/timerCore.test.ts 可以用 node:test 直接跑。渲染 / 持久化 / 提示音
 * 等副作用都留在 scripts/timer.ts，那边只管「何时」调用这里。
 *
 * 刻意不 import 任何运行时模块（DayMeta 是 type-only import，会被整体擦除）：
 * 这份状态机保持零依赖，行为变更只需要在这一处和测试里对齐。
 */
import type { DayMeta } from './dayMeta';

/** 进行中的计时会话在 localStorage 里的形状（storage key 见 timer.ts） */
export interface TimerState {
  dayNo: number;
  /** 0 | 1 | 2 */
  phase: number;
  /** 当前阶段此前已累计的毫秒（暂停时结算进来） */
  elapsedMs: number;
  /** 正在跑时为本次开始的时间戳；暂停时为 null */
  startedAt: number | null;
}

/** 某个阶段的总时长（毫秒），取自当天 split 的分钟数 */
export function phaseMs(day: DayMeta, phase: number): number {
  return (day.split[phase] ?? 0) * 60_000;
}

/** 已消耗的毫秒：此前累计 + 运行中距本次开始的差值；暂停时只有累计部分 */
export function consumedMs(s: TimerState, now: number = Date.now()): number {
  return s.elapsedMs + (s.startedAt === null ? 0 : now - s.startedAt);
}

/** 剩余时间格式化为 mm:ss（秒向上取整，负数按 0 算） */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * 把「关掉页面 / 后台标签页这段时间」补算回去：逐个阶段扣掉已消耗的时间。
 * 返回 null 表示三个阶段都已跑完。
 */
export function rollForward(s: TimerState, day: DayMeta, now: number = Date.now()): TimerState | null {
  let cur = { ...s };
  for (;;) {
    const limit = phaseMs(day, cur.phase);
    const used = consumedMs(cur, now);
    if (used < limit) return cur;
    const overflow = used - limit;
    if (cur.phase >= day.split.length - 1) return null;
    cur = {
      ...cur,
      phase: cur.phase + 1,
      elapsedMs: overflow,
      startedAt: cur.startedAt === null ? null : now,
    };
  }
}
