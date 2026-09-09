/**
 * 「今日复盘」的客户端接线：把「记得 / 忘了」记进浏览器，并把今天到期的错题
 * 补进列表。调度与判定逻辑全在 reviewCore（纯函数），这里只负责读写与接线，
 * 沿用 progress / timer 的分法。
 *
 * 存不上（隐私模式、禁用站点数据、配额满）就退化成「这次没记住」：页面照常
 * 能用，见 storage 的立场。
 */
import { readJSON, writeJSON } from './storage';
import {
  ACTION_LABEL,
  EMPTY_LOG,
  applyVerdict,
  dueItems,
  fillItem,
  mistakeBook,
  mistakesMarkdown,
  normalizeLog,
  pastOnly,
  removeItem,
  verdictOn,
  type MistakeEntry,
  type ReviewItem,
  type ReviewLog,
  type ReviewSource,
  type ReviewVerdict,
} from './reviewCore';
import type { RecallPoint } from './llm';
import { highlightSql } from '../utils/highlightSql';
import { stripTags } from '../utils/promptText';

const KEY = 'sql8w.review.v1';

const VERDICT_SAID: Record<ReviewVerdict, string> = {
  known: '已标记得',
  forgot: '已标忘了',
};

function loadLog(): ReviewLog {
  return normalizeLog(readJSON<unknown>(KEY, null));
}

/**
 * 复盘素材索引：全站共用的一份静态 JSON，浏览器缓存一次，56 个天页不再各带一份。
 * 拉不到就当空的——固定三格是服务端渲染的，不依赖它，页面照常能用。
 */
async function loadSource(dayNo: number): Promise<ReviewSource> {
  try {
    const res = await fetch('/review-source.json');
    if (!res.ok) return {};
    const parsed = (await res.json()) as ReviewSource;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return pastOnly(parsed, dayNo);
  } catch {
    return {};
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 出现理由的徽标：固定格由 Astro 渲染，这里只管客户端补上的补漏与错题 */
function originBadge(origin: ReviewItem['origin']): string {
  if (origin === 'fill') return '<span class="rv-origin is-fill">补漏</span>';
  if (origin === 'due') return '<span class="rv-origin is-due">错题</span>';
  return `<span class="rv-origin">D+${origin}</span>`;
}

/** 客户端补上的复盘项：与 TodayReview.astro 渲染固定格时保持一致 */
function itemHtml(item: ReviewItem): string {
  const dd = String(item.fromDay).padStart(2, '0');
  const label = item.action === 'explain' ? '易错点' : '参考答案';
  const fold = item.answer
    ? `<details class="fold fold-label ans-fold"><summary>${label}</summary>${
        item.answer.note ? `<p class="ans-note">${escapeHtml(item.answer.note)}</p>` : ''
      }${
        item.answer.sql
          ? `<pre class="ans-sql sql-code">${highlightSql(item.answer.sql)}</pre>`
          : ''
      }</details>`
    : '';

  return `
    <div class="rv-meta">
      ${originBadge(item.origin)}
      <span class="rv-act">${ACTION_LABEL[item.action]}</span>
      <a class="rv-from" href="/day/${item.fromDay}">D${dd} ${escapeHtml(item.fromTitle)}</a>
    </div>
    <div class="rv-prompt">${item.prompt}</div>
    ${fold}
    <div class="rv-judge">
      <button class="btn" data-verdict="known" type="button">记得</button>
      <button class="btn" data-verdict="forgot" type="button">忘了</button>
      <span class="rv-said"></span>
    </div>`;
}

/** 错题本一条的状态：已掌握，还是下次什么时候来 */
function stateText(e: MistakeEntry): string {
  return e.graduated ? '已掌握' : `下次 D${String(e.dueOn).padStart(2, '0')}`;
}

/** 错题本正文：按来源学习日分节 */
function bookHtml(entries: readonly MistakeEntry[]): string {
  const byDay = new Map<number, MistakeEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.material.fromDay) ?? [];
    list.push(e);
    byDay.set(e.material.fromDay, list);
  }

  return [...byDay]
    .map(([fromDay, list]) => {
      const dd = String(fromDay).padStart(2, '0');
      const head = escapeHtml(list[0]?.material.fromTitle ?? '');
      const rows = list
        .map(
          (e) => `
        <div class="rv-entry${e.graduated ? ' is-graduated' : ''}">
          <span class="rv-act">${ACTION_LABEL[e.material.action]}</span>
          <span class="rv-text">${e.material.prompt}</span>
          <span class="rv-state">忘过 ${e.forgot} 次 · ${stateText(e)}</span>
          <button
            class="rv-drop"
            type="button"
            title="从错题本移除"
            data-book-drop="${escapeHtml(e.material.id)}"
          >✕</button>
        </div>`,
        )
        .join('');
      return `<section class="rv-day"><h4>D${dd} ${head}</h4>${rows}</section>`;
    })
    .join('');
}

/**
 * 把今天实际列出的复盘项写回 #recall-points，供随堂默写当「要一起考的旧知识点」。
 * 服务端注入的那份只含三个固定格；补漏与到期错题依赖浏览器里的复盘记录，只能
 * 在这里补齐。generator 在此之后才读它（见 main.ts 的启动顺序）。
 */
function syncRecallPoints(items: readonly HTMLElement[], source: ReviewSource): void {
  const el = document.getElementById('recall-points');
  if (!el) return;

  const points: RecallPoint[] = [];
  for (const li of items) {
    const material = source[li.dataset.reviewItem ?? ''];
    if (!material) continue;
    points.push({
      no: material.fromDay,
      title: material.fromTitle,
      point: stripTags(material.prompt),
    });
  }
  if (points.length > 0) el.textContent = JSON.stringify(points);
}

/** 把某一条已有的判定画到界面上 */
function paint(li: HTMLElement, verdict: ReviewVerdict | null): void {
  li.classList.toggle('is-judged', verdict !== null);
  for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-verdict]')) {
    btn.classList.toggle('is-on', btn.dataset.verdict === verdict);
  }
  const said = li.querySelector<HTMLElement>('.rv-said');
  if (said) said.textContent = verdict ? VERDICT_SAID[verdict] : '';
}

export function initReview(): void {
  const section = document.querySelector<HTMLElement>('[data-review-day]');
  const list = section?.querySelector<HTMLElement>('[data-review-list]');
  if (!section || !list) return;

  const dayNo = Number(section.dataset.reviewDay);
  if (!Number.isFinite(dayNo)) return;

  let log = loadLog();
  let source: ReviewSource = {};

  // 固定格已经占了的不重复出。补漏格接在三个固定格之后，到期的错题再往后排
  const shown = new Set(
    [...list.querySelectorAll<HTMLElement>('[data-review-item]')].map(
      (li) => li.dataset.reviewItem ?? '',
    ),
  );

  /** 客户端补一条：补漏与到期错题都走这里，清空记录时要能整条撤走 */
  function append(item: ReviewItem): void {
    if (!list) return;
    const li = document.createElement('li');
    li.dataset.reviewItem = item.id;
    li.dataset.reviewDue = '';
    li.innerHTML = itemHtml(item);
    list.append(li);
    shown.add(item.id);
    wireItem(li);
  }

  /** 把一条复盘项的两个判定按钮接起来，并画上它已有的判定 */
  function wireItem(li: HTMLElement): void {
    const id = li.dataset.reviewItem;
    if (!id) return;
    paint(li, verdictOn(log, id, dayNo));

    for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-verdict]')) {
      btn.addEventListener('click', () => {
        const verdict = btn.dataset.verdict === 'forgot' ? 'forgot' : 'known';
        log = applyVerdict(log, id, dayNo, verdict);
        writeJSON(KEY, log);
        paint(li, verdict);
        renderBook();
      });
    }
  }

  // 服务端渲染的固定格先接起来，不等网络
  for (const li of list.querySelectorAll<HTMLElement>('[data-review-item]')) wireItem(li);

  /* ---------- 错题本 ---------- */

  const book = section.querySelector<HTMLElement>('[data-review-book]');
  const bookList = section.querySelector<HTMLElement>('[data-review-book-list]');
  const bookCount = section.querySelector<HTMLElement>('[data-review-book-count]');
  const status = section.querySelector<HTMLElement>('[data-review-book-status]');

  /** 记录变了就重画一遍：条数、分节正文、逐条移除按钮 */
  function renderBook(): void {
    if (!book || !bookList) return;
    const entries = mistakeBook(log, source);

    book.hidden = entries.length === 0;
    if (bookCount) bookCount.textContent = entries.length > 0 ? `${entries.length} 条` : '';
    bookList.innerHTML = bookHtml(entries);

    for (const btn of bookList.querySelectorAll<HTMLButtonElement>('[data-book-drop]')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.bookDrop;
        if (!id) return;
        log = removeItem(log, id);
        writeJSON(KEY, log);
        if (status) status.textContent = '已移除 1 条';
        renderBook();
        // 已经排在今天列表里的那一条也一并撤走，免得移除了还留在眼前
        section?.querySelector(`[data-review-item="${id}"][data-review-due]`)?.remove();
      });
    }

    reveal();
  }

  /** 有内容才露出整块：固定格、到期错题、错题本，三者都空就继续藏着 */
  function reveal(): void {
    if (!section || !list) return;
    section.hidden = list.children.length === 0 && (book?.hidden ?? true);
  }

  section
    .querySelector<HTMLButtonElement>('[data-review-book-copy]')
    ?.addEventListener('click', () => {
      void navigator.clipboard?.writeText(mistakesMarkdown(mistakeBook(log, source)));
      if (status) status.textContent = '已复制，贴进 mistakes.md 即可';
    });

  section
    .querySelector<HTMLButtonElement>('[data-review-book-clear]')
    ?.addEventListener('click', () => {
      if (!window.confirm('清空错题本与全部复盘记录？此操作不可撤销（不影响 56 天完成进度）。'))
        return;
      log = EMPTY_LOG;
      writeJSON(KEY, log);
      for (const li of list.querySelectorAll('[data-review-due]')) li.remove();
      for (const li of list.querySelectorAll<HTMLElement>('[data-review-item]')) paint(li, null);
      if (status) status.textContent = '已清空';
      renderBook();
    });

  // 素材索引拉回来之后才能算补漏与到期错题，以及画错题本
  void loadSource(dayNo).then((loaded) => {
    source = loaded;

    const fill = fillItem(log, source, shown);
    if (fill) append(fill);
    for (const item of dueItems(dayNo, log, source, shown)) append(item);

    // 随堂默写要考的旧知识点跟着一起更新：补漏与到期错题都是客户端才算得出来
    // 的，服务端注入的那份只有三个固定格（无 JS 时的兜底）
    syncRecallPoints([...list.querySelectorAll<HTMLElement>('[data-review-item]')], source);

    renderBook();
  });
}
