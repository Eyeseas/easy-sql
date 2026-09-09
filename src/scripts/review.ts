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
  applyVerdict,
  dueItems,
  normalizeLog,
  verdictOn,
  type ReviewItem,
  type ReviewLog,
  type ReviewSource,
  type ReviewVerdict,
} from './reviewCore';
import { highlightSql } from '../utils/highlightSql';

const KEY = 'sql8w.review.v1';

const VERDICT_SAID: Record<ReviewVerdict, string> = {
  known: '已标记得',
  forgot: '已标忘了',
};

function loadLog(): ReviewLog {
  return normalizeLog(readJSON<unknown>(KEY, null));
}

/** 天页注入的复盘素材索引；不是天页就没有 */
function loadSource(): ReviewSource {
  const el = document.getElementById('review-source');
  if (!el?.textContent) return {};
  try {
    const parsed = JSON.parse(el.textContent) as ReviewSource;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 到期错题项的标记：与 TodayReview.astro 渲染固定格时保持一致 */
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
      <span class="rv-origin is-due">错题</span>
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

  // 固定格已经占了的不重复出；到期的错题补在后面
  const fixed = [...list.querySelectorAll<HTMLElement>('[data-review-item]')];
  const shown = new Set(fixed.map((li) => li.dataset.reviewItem ?? ''));
  for (const item of dueItems(dayNo, log, loadSource(), shown)) {
    const li = document.createElement('li');
    li.dataset.reviewItem = item.id;
    li.innerHTML = itemHtml(item);
    list.append(li);
  }

  // 有到期错题时，固定格为空的天（如 D01）也要把整块露出来
  if (list.children.length > 0) section.hidden = false;

  for (const li of list.querySelectorAll<HTMLElement>('[data-review-item]')) {
    const id = li.dataset.reviewItem;
    if (!id) continue;
    paint(li, verdictOn(log, id, dayNo));

    for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-verdict]')) {
      btn.addEventListener('click', () => {
        const verdict = btn.dataset.verdict === 'forgot' ? 'forgot' : 'known';
        log = applyVerdict(log, id, dayNo, verdict);
        writeJSON(KEY, log);
        paint(li, verdict);
      });
    }
  }
}
