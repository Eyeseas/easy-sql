import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  phaseMs,
  consumedMs,
  formatMs,
  rollForward,
  type TimerState,
} from '../src/scripts/timerCore.ts';
import type { DayMeta } from '../src/scripts/dayMeta.ts';

const MIN = 60_000;
/** 各段 1 分钟的短配比，便于构造跨段结转 */
const tiny: DayMeta = { no: 1, title: '短配比', split: [1, 1, 1], week: 1 };
/** 常规配比（学 45 / 练 60 / 盘 15） */
const day: DayMeta = { no: 22, title: '常规配比', split: [45, 60, 15], week: 4 };

function running(phase: number, elapsedMs: number, startedAt: number): TimerState {
  return { dayNo: tiny.no, phase, elapsedMs, startedAt };
}

test('phaseMs 阶段时长取自当天 split（分钟 -> 毫秒）', () => {
  assert.equal(phaseMs(day, 0), 45 * MIN);
  assert.equal(phaseMs(day, 1), 60 * MIN);
  assert.equal(phaseMs(day, 2), 15 * MIN);
  assert.equal(phaseMs(day, 7), 0); // 越界按下限 0 算
});

test('formatMs 分秒补零、秒向上取整、负数归零', () => {
  assert.equal(formatMs(0), '00:00');
  assert.equal(formatMs(1), '00:01');
  assert.equal(formatMs(59_000), '00:59');
  assert.equal(formatMs(59_001), '01:00'); // 59.001s 向上取整到 60s
  assert.equal(formatMs(60_000), '01:00');
  assert.equal(formatMs(3_725_000), '62:05'); // 不折算小时，分钟位可以超过 59
  assert.equal(formatMs(-5_000), '00:00');
});

test('consumedMs 暂停时只算累计，运行中加上时间戳差值', () => {
  const paused: TimerState = { dayNo: 1, phase: 0, elapsedMs: 90_000, startedAt: null };
  assert.equal(consumedMs(paused, 999_999), 90_000); // 暂停期间时间流逝不再累计

  const runningState: TimerState = { dayNo: 1, phase: 0, elapsedMs: 1_000, startedAt: 5_000 };
  assert.equal(consumedMs(runningState, 8_000), 4_000); // 1_000 + (8_000 - 5_000)
});

test('rollForward 单段溢出：结转到下一段，溢出量成为新段的已累计', () => {
  // tiny 各段 1 分钟；第 0 段开始 90 秒后 -> 落在第 1 段已走 30 秒
  const next = rollForward(running(0, 0, 0), tiny, 90_000);
  assert.ok(next);
  assert.equal(next.phase, 1);
  assert.equal(next.elapsedMs, 30_000);
  assert.equal(next.startedAt, 90_000);
  // 结转前后「已消耗」连续：90s = 第 0 段吃满 60s + 第 1 段 30s
  assert.equal(consumedMs(next, 90_000), 30_000);
});

test('rollForward 连跨两段：一次补齐到第 2 段', () => {
  // 150 秒 = 60 + 60 + 30 -> 第 2 段已走 30 秒
  const next = rollForward(running(0, 0, 0), tiny, 150_000);
  assert.ok(next);
  assert.equal(next.phase, 2);
  assert.equal(next.elapsedMs, 30_000);
});

test('rollForward 暂停态结转：保持暂停（startedAt 仍为 null）', () => {
  const paused: TimerState = { dayNo: 1, phase: 0, elapsedMs: 75_000, startedAt: null };
  const next = rollForward(paused, tiny, 123_456);
  assert.ok(next);
  assert.equal(next.phase, 1);
  assert.equal(next.elapsedMs, 15_000);
  assert.equal(next.startedAt, null);
});

test('rollForward 三段全跑完返回 null（含恰好踩线的边界）', () => {
  assert.equal(rollForward(running(0, 0, 0), tiny, 180_000), null);
  // 末段暂停着但已耗满：同样算跑完
  const donePaused: TimerState = { dayNo: 1, phase: 2, elapsedMs: 60_000, startedAt: null };
  assert.equal(rollForward(donePaused, tiny, 123_456), null);
});

test('rollForward 差 1ms 没跑完：仍停在末段', () => {
  const almost = rollForward(running(0, 0, 0), tiny, 179_999);
  assert.ok(almost);
  assert.equal(almost.phase, 2);
  assert.equal(almost.elapsedMs, 59_999);
});

test('rollForward 未到期：原样返回同一状态', () => {
  const s = running(1, 10_000, 100_000);
  const next = rollForward(s, tiny, 120_000); // 已耗 30s < 60s
  assert.deepEqual(next, s);
});
