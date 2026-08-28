/** 精简/详细视图切换 + 侧栏页内锚点高亮（周入口高亮已改为服务端按路由渲染）。 */
import { readString, writeString } from './storage';

const VIEW_KEY = 'sql8w.view.v1';

export function initView(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-action="toggle-view"]');

  function apply(compact: boolean): void {
    document.body.classList.toggle('is-compact', compact);
    if (btn) btn.textContent = compact ? '详细视图' : '精简视图';
  }

  apply(readString(VIEW_KEY) === 'compact');

  btn?.addEventListener('click', () => {
    const next = !document.body.classList.contains('is-compact');
    apply(next);
    writeString(VIEW_KEY, next ? 'compact' : 'full');
  });
}

export function initScrollSpy(): void {
  // 周入口现在是真实路由（/week/n），服务端渲染时已高亮；
  // 这里只处理页内锚点（首页侧栏的 § 区块链接）。
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[href^="#"]')];
  if (links.length === 0 || !('IntersectionObserver' in window)) return;

  const sections = links.map((a) => document.querySelector(a.getAttribute('href') ?? ''));

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = sections.indexOf(entry.target);
        links.forEach((a, j) => a.classList.toggle('is-on', j === i));
      }
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
  );

  for (const s of sections) if (s) io.observe(s);
}
