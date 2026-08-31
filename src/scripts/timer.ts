/**
 * 学习计时器：按当天的 [学, 练, 盘] 分钟配比依次计时。
 *
 * 计时靠时间戳差值算，不靠 setInterval 累加 -- 后台标签页的定时器会被浏览器
 * 节流到几秒一次，累加法必然越走越慢。这里 interval 只负责刷新界面，
 * 真正的剩余时间永远是 `阶段总长 - (已累计 + (now - 本次开始))`。
 *
 * 纯核心（阶段时长 / 已耗结算 / 格式化 / 跨段结转）抽在 ./timerCore，
 * 有 node:test 覆盖；本文件只负责 DOM 渲染、持久化与提示副作用。
 */
import { readJSON, writeJSON, remove } from './storage';
import { markDay } from './progress';
import { loadDayMeta, type DayMeta } from './dayMeta';
import { PHASES } from '../types/curriculum';
import { phaseMs, consumedMs, formatMs, rollForward, type TimerState } from './timerCore';

const KEY = 'sql8w.timer.v1';
const TICK_MS = 250;

let days = new Map<number, DayMeta>();
let state: TimerState | null = null;
let ticker: number | null = null;
let audioCtx: AudioContext | null = null;
const originalTitle = typeof document === 'undefined' ? '' : document.title;

/* ---------- 提示 ---------- */

function chime(): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    [0, 0.18].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.4);
    });
  } catch {
    /* 浏览器不给放声音就算了，不影响计时 */
  }
}

function notify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: 'sql8w-timer' });
  } catch {
    /* 忽略 */
  }
}

/* ---------- 渲染 ---------- */

function el<T extends HTMLElement = HTMLElement>(attr: string): T | null {
  return document.querySelector<T>(`[${attr}]`);
}

function render(): void {
  const bar = el('data-timer-bar');
  const holders = document.querySelectorAll<HTMLElement>('[data-timer-holder]');
  const idles = document.querySelectorAll<HTMLElement>('[data-timer-idle]');

  if (state === null) {
    if (bar) bar.hidden = true;
    holders.forEach((h) => (h.hidden = true));
    idles.forEach((idle) => (idle.hidden = false));
    document.title = originalTitle;
    document.querySelectorAll('[data-timer-start]').forEach((b) => b.classList.remove('is-active'));
    return;
  }

  const s = state;
  idles.forEach((idle) => {
    idle.hidden = Number(idle.dataset.timerIdle) === s.dayNo;
  });

  const day = days.get(s.dayNo);
  if (!day) return;

  // 呈现位认领：本页有该学习日的呈现位就就地显示，兜底横条只在无人认领时出场
  // （总览页与他人周页恒走横条）
  let claimed = false;
  holders.forEach((h) => {
    const owns = Number(h.dataset.timerHolder) === s.dayNo;
    h.hidden = !owns;
    if (owns) claimed = true;
  });
  if (bar) bar.hidden = claimed;

  const phase = PHASES[s.phase] ?? PHASES[0];
  const remain = phaseMs(day, s.phase) - consumedMs(s);
  const running = s.startedAt !== null;

  // 三个呈现位（卡片内/右栏/兜底横条）共用同一套 data-*：所有拷贝一起刷，永远同一事实
  const dayLabel = `D${String(day.no).padStart(2, '0')} · ${day.title}`;
  document.querySelectorAll('[data-timer-day]').forEach((e) => (e.textContent = dayLabel));
  document
    .querySelectorAll('[data-timer-phase]')
    .forEach((e) => (e.textContent = `${phase.label} · ${phase.full}`));
  document
    .querySelectorAll('[data-timer-remain]')
    .forEach((e) => (e.textContent = formatMs(remain)));
  document.querySelectorAll<HTMLButtonElement>('[data-timer-action="toggle"]').forEach((b) => {
    b.textContent = running ? '暂停' : '继续';
  });

  // 三段进度条：已完成的段填满，当前段按比例填
  document.querySelectorAll<HTMLElement>('[data-timer-seg]').forEach((seg) => {
    const idx = Number(seg.dataset.timerSeg);
    const total = phaseMs(day, idx);
    const ratio =
      idx < s.phase ? 1 : idx > s.phase ? 0 : total === 0 ? 1 : Math.min(1, consumedMs(s) / total);
    seg.style.setProperty('--seg-fill', `${ratio * 100}%`);
    seg.classList.toggle('is-current', idx === s.phase);
    seg.style.flexGrow = String(Math.max(1, day.split[idx] ?? 1));
  });

  document.title = running
    ? `${formatMs(remain)} ${phase.label} · ${originalTitle}`
    : originalTitle;

  document.querySelectorAll<HTMLElement>('[data-timer-start]').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.timerStart) === s.dayNo);
  });
}

/* ---------- 驱动 ---------- */

function persist(): void {
  if (state === null) remove(KEY);
  else writeJSON(KEY, state);
}

function stopTicker(): void {
  if (ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
}

function startTicker(): void {
  stopTicker();
  ticker = window.setInterval(tick, TICK_MS);
}

function tick(): void {
  if (state === null || state.startedAt === null) return;
  const day = days.get(state.dayNo);
  if (!day) return;

  if (consumedMs(state) >= phaseMs(day, state.phase)) {
    const wasLast = state.phase >= PHASES.length - 1;
    const next = rollForward(state, day);
    chime();
    if (next === null) {
      notify('今天的 2 小时跑完了', `D${day.no} ${day.title} —— 记得对照过关标准自查`);
      finish(day.no);
      return;
    }
    state = next;
    const label = PHASES[state.phase]?.full ?? '';
    if (!wasLast) notify('进入下一阶段', `${label} · ${day.split[state.phase] ?? 0} 分钟`);
    persist();
  }
  render();
}

function finish(dayNo: number): void {
  state = null;
  stopTicker();
  persist();
  render();
  const bar = el('data-timer-bar');
  bar?.classList.remove('is-finished');
  // 让用户自己决定是否算完成，不偷偷替他勾
  const prompt = el('data-timer-finished');
  if (prompt) {
    prompt.hidden = false;
    prompt.dataset.timerFinishedDay = String(dayNo);
  }
}

function start(dayNo: number): void {
  const day = days.get(dayNo);
  if (!day) return;
  state = { dayNo, phase: 0, elapsedMs: 0, startedAt: Date.now() };
  persist();
  startTicker();
  render();

  // 首次启动时顺手要一下通知权限（必须在用户手势里）
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    /* 忽略 */
  }
  // 预热音频上下文，否则第一次提示音会被自动播放策略拦掉
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
  } catch {
    /* 忽略 */
  }
}

function toggle(): void {
  if (state === null) return;
  if (state.startedAt === null) {
    state.startedAt = Date.now();
    startTicker();
  } else {
    state.elapsedMs = consumedMs(state);
    state.startedAt = null;
    stopTicker();
  }
  persist();
  render();
}

function skip(): void {
  if (state === null) return;
  const day = days.get(state.dayNo);
  if (!day) return;
  if (state.phase >= PHASES.length - 1) {
    finish(day.no);
    return;
  }
  state = {
    ...state,
    phase: state.phase + 1,
    elapsedMs: 0,
    startedAt: state.startedAt === null ? null : Date.now(),
  };
  persist();
  render();
}

function stop(): void {
  state = null;
  stopTicker();
  persist();
  render();
}

/* ---------- 入口 ---------- */

export function initTimer(): void {
  const parsed = loadDayMeta();
  if (parsed.length === 0) return;
  days = new Map(parsed.map((d) => [d.no, d]));

  // 恢复上次未跑完的计时
  const saved = readJSON<TimerState | null>(KEY, null);
  if (saved && days.has(saved.dayNo)) {
    const day = days.get(saved.dayNo);
    const rolled = day ? rollForward(saved, day) : null;
    if (rolled === null) {
      remove(KEY);
    } else {
      state = rolled;
      persist();
      if (state.startedAt !== null) startTicker();
    }
  }

  document.querySelectorAll<HTMLButtonElement>('[data-timer-start]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const no = Number(btn.dataset.timerStart);
      if (state !== null && state.dayNo !== no) {
        if (!window.confirm(`当前正在计时 D${state.dayNo}，要切换到 D${no} 吗？`)) return;
      }
      start(no);
    });
  });

  // 三个呈现位各有一份控制键，全部绑定（静态渲染，无动态插入）
  document
    .querySelectorAll<HTMLButtonElement>('[data-timer-action="toggle"]')
    .forEach((b) => b.addEventListener('click', toggle));
  document
    .querySelectorAll<HTMLButtonElement>('[data-timer-action="skip"]')
    .forEach((b) => b.addEventListener('click', skip));
  document
    .querySelectorAll<HTMLButtonElement>('[data-timer-action="stop"]')
    .forEach((b) => b.addEventListener('click', stop));

  const finished = el('data-timer-finished');
  finished?.querySelector('[data-action="mark-done"]')?.addEventListener('click', () => {
    const no = Number(finished.dataset.timerFinishedDay);
    if (Number.isFinite(no)) markDay(no, true);
    finished.hidden = true;
  });
  finished?.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
    finished.hidden = true;
  });

  // 从后台切回来时立刻校正一次，不等下一个 tick
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tick();
      render();
    }
  });

  render();
}
