/**
 * 学习计时器：按当天的 [学, 练, 盘] 分钟配比依次计时。
 *
 * 计时靠时间戳差值算，不靠 setInterval 累加 —— 后台标签页的定时器会被浏览器
 * 节流到几秒一次，累加法必然越走越慢。这里 interval 只负责刷新界面，
 * 真正的剩余时间永远是 `阶段总长 - (已累计 + (now - 本次开始))`。
 */
import { readJSON, writeJSON, remove } from './storage';
import { markDay } from './progress';
import { loadDayMeta, type DayMeta } from './dayMeta';

const KEY = 'sql8w.timer.v1';
const TICK_MS = 250;

const PHASES = [
  { label: '学', full: '学概念' },
  { label: '练', full: '动手写' },
  { label: '盘', full: '复盘' },
] as const;

interface TimerState {
  dayNo: number;
  /** 0 | 1 | 2 */
  phase: number;
  /** 当前阶段此前已累计的毫秒（暂停时结算进来） */
  elapsedMs: number;
  /** 正在跑时为本次开始的时间戳；暂停时为 null */
  startedAt: number | null;
}

let days = new Map<number, DayMeta>();
let state: TimerState | null = null;
let ticker: number | null = null;
let audioCtx: AudioContext | null = null;
const originalTitle = typeof document === 'undefined' ? '' : document.title;

/* ---------- 基础计算 ---------- */

function phaseMs(day: DayMeta, phase: number): number {
  return (day.split[phase] ?? 0) * 60_000;
}

function consumedMs(s: TimerState): number {
  return s.elapsedMs + (s.startedAt === null ? 0 : Date.now() - s.startedAt);
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * 把「关掉页面这段时间」补算回去：逐个阶段扣掉已消耗的时间。
 * 返回 null 表示三个阶段都已跑完。
 */
function rollForward(s: TimerState, day: DayMeta): TimerState | null {
  let cur = { ...s };
  for (;;) {
    const limit = phaseMs(day, cur.phase);
    const used = consumedMs(cur);
    if (used < limit) return cur;
    const overflow = used - limit;
    if (cur.phase >= PHASES.length - 1) return null;
    cur = {
      ...cur,
      phase: cur.phase + 1,
      elapsedMs: overflow,
      startedAt: cur.startedAt === null ? null : Date.now(),
    };
  }
}

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
  if (!bar) return;

  if (state === null) {
    bar.hidden = true;
    document.title = originalTitle;
    document.querySelectorAll('[data-timer-start]').forEach((b) => b.classList.remove('is-active'));
    return;
  }

  const day = days.get(state.dayNo);
  if (!day) return;

  bar.hidden = false;
  const phase = PHASES[state.phase] ?? PHASES[0];
  const remain = phaseMs(day, state.phase) - consumedMs(state);
  const running = state.startedAt !== null;

  const dayEl = el('data-timer-day');
  if (dayEl) dayEl.textContent = `D${String(day.no).padStart(2, '0')} · ${day.title}`;

  const phaseEl = el('data-timer-phase');
  if (phaseEl) phaseEl.textContent = `${phase.label} · ${phase.full}`;

  const remainEl = el('data-timer-remain');
  if (remainEl) remainEl.textContent = formatMs(remain);

  const toggle = el<HTMLButtonElement>('data-timer-action="toggle"');
  if (toggle) toggle.textContent = running ? '暂停' : '继续';

  // 三段进度条：已完成的段填满，当前段按比例填
  document.querySelectorAll<HTMLElement>('[data-timer-seg]').forEach((seg) => {
    const idx = Number(seg.dataset.timerSeg);
    const total = phaseMs(day, idx);
    const ratio =
      idx < (state?.phase ?? 0)
        ? 1
        : idx > (state?.phase ?? 0)
          ? 0
          : total === 0
            ? 1
            : Math.min(1, consumedMs(state as TimerState) / total);
    seg.style.setProperty('--seg-fill', `${ratio * 100}%`);
    seg.classList.toggle('is-current', idx === state?.phase);
    seg.style.flexGrow = String(Math.max(1, day.split[idx] ?? 1));
  });

  document.title = running
    ? `${formatMs(remain)} ${phase.label} · ${originalTitle}`
    : originalTitle;

  document.querySelectorAll<HTMLElement>('[data-timer-start]').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.timerStart) === state?.dayNo);
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

  el('data-timer-action="toggle"')?.addEventListener('click', toggle);
  el('data-timer-action="skip"')?.addEventListener('click', skip);
  el('data-timer-action="stop"')?.addEventListener('click', stop);

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
