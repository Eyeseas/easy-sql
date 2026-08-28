import { readJSON, writeJSON } from './storage';
import { loadDayMeta, type DayMeta } from './dayMeta';

const KEY = 'sql8w.progress.v1';

export interface ProgressFile {
  version: 1;
  exportedAt: string;
  days: number[];
}

/** 全部 56 天的元数据与完成集合。计数不再依赖当前页面渲染了哪些天。 */
let meta: DayMeta[] = [];
let done = new Set<number>();
let boxes: HTMLInputElement[] = [];

function save(): void {
  writeJSON(
    KEY,
    [...done].sort((a, b) => a - b),
  );
}

/** 勾选状态变化时广播，计时器完成当天后也靠它触发 UI 同步 */
export const PROGRESS_EVENT = 'sql8w:progress';

export function markDay(no: number, isDone: boolean): void {
  if (isDone) done.add(no);
  else done.delete(no);
  save();
  render();
}

function render(): void {
  const total = meta.length;
  const perWeek = new Map<number, { done: number; total: number }>();
  let doneCount = 0;

  for (const d of meta) {
    const c = perWeek.get(d.week) ?? { done: 0, total: 0 };
    c.total += 1;
    if (done.has(d.no)) {
      c.done += 1;
      doneCount += 1;
    }
    perWeek.set(d.week, c);
  }

  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const fill = document.querySelector<HTMLElement>('[data-progress-fill]');
  const label = document.querySelector<HTMLElement>('[data-progress-label]');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${doneCount} / ${total} 天 · ${pct}%`;

  for (const [w, c] of perWeek) {
    // 同一页可能有多处周计数（侧栏、首页概览卡片），全部更新
    document
      .querySelectorAll<HTMLElement>(`[data-rail-count="${w}"]`)
      .forEach((el) => (el.textContent = `${c.done}/${c.total}`));
    document
      .querySelectorAll<HTMLElement>(`[data-week-count="${w}"]`)
      .forEach((el) => (el.textContent = `${c.done} / ${c.total} 天`));
  }

  // 当前页面恰好渲染了的天，同步勾选与划线状态
  for (const box of boxes) {
    const on = done.has(Number(box.dataset.day));
    box.checked = on;
    box.closest('.day')?.classList.toggle('is-done', on);
  }

  document.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { done: doneCount, total } }));
}

export function initProgress(): void {
  meta = loadDayMeta();
  if (meta.length === 0) return;

  const stored = readJSON<number[]>(KEY, []);
  done = new Set(Array.isArray(stored) ? stored.filter((n) => typeof n === 'number') : []);
  boxes = [...document.querySelectorAll<HTMLInputElement>('input[data-day]')];

  for (const box of boxes) {
    box.addEventListener('change', () => {
      const no = Number(box.dataset.day);
      if (box.checked) done.add(no);
      else done.delete(no);
      save();
      render();
    });
  }
  render();

  document.querySelector('[data-action="reset-progress"]')?.addEventListener('click', () => {
    if (!window.confirm('清空全部 56 天的完成记录？此操作不可撤销。')) return;
    done = new Set();
    save();
    render();
  });

  document.querySelector('[data-action="export-progress"]')?.addEventListener('click', () => {
    const payload: ProgressFile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      days: [...done].sort((a, b) => a - b),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sql8w-progress-${payload.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importInput = document.querySelector<HTMLInputElement>('[data-action="import-progress"]');
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ProgressFile;
      if (!Array.isArray(parsed.days)) throw new Error('缺少 days 字段');
      done = new Set(parsed.days);
      save();
      render();
    } catch (err) {
      window.alert(`导入失败：${err instanceof Error ? err.message : '文件格式不对'}`);
    } finally {
      importInput.value = '';
    }
  });
}
