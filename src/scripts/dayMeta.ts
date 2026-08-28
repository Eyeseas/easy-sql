/** 解析页面里 #day-meta 的 JSON（由 Layout 注入，全站都有），progress 和 timer 共用。 */
export interface DayMeta {
  no: number;
  title: string;
  split: [number, number, number];
  /** 所属周号，进度侧栏的周计数用 */
  week: number;
}

export function loadDayMeta(): DayMeta[] {
  const el = document.getElementById('day-meta');
  if (!el?.textContent) return [];
  try {
    const parsed = JSON.parse(el.textContent) as DayMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
