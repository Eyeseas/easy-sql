/**
 * LLM 出题的客户端：浏览器经 /api/llm 代理调配置好的端点，结果按天缓存在本地。
 *
 * 两种题共用这一套渲染、缓存与失败处理，只有提示词和入口不同：
 *   补充练习  当天知识点之外再加几道新题
 *   随堂默写  当天知识点与「今日复盘」里的旧知识点混在同一道题里（见 reviewCore）
 */
import { readJSON, writeJSON } from './storage';
import {
  generateExercises,
  generateRecall,
  isConfigured,
  type Exercise,
  type GenContextDay,
  type RecallPoint,
} from './llm';
import { openLlmSettings } from './llmSettings';
import { highlightSql } from '../utils/highlightSql';

type Cache = Record<string, Exercise[]>;

/** 一种题的接线：DOM 上的几个挂点、缓存、标题、怎么生成 */
interface GenMode {
  /** 入口按钮的 data 属性名（值为学习日号），以及它在 dataset 上的键 */
  btnAttr: string;
  datasetKey: string;
  /** 结果容器与状态位的 data 属性名 */
  hostAttr: string;
  statusAttr: string;
  /** 结果里「复制 / 清空」两个按钮的属性前缀 */
  footNs: string;
  storageKey: string;
  /** 导出 markdown 的标题 */
  heading: string;
  run: (
    day: GenContextDay,
    prior: readonly string[],
    onProgress: (chars: number) => void,
  ) => Promise<Exercise[]>;
}

/** 每次生成几道 */
const COUNT = 3;

/** 出题上下文由页面注入（周页带当周 7 天，天页带当天），浏览器不打包全量课程数据 */
function loadGenContext(): Map<number, GenContextDay> {
  const el = document.getElementById('gen-context');
  if (!el?.textContent) return new Map();
  try {
    const parsed = JSON.parse(el.textContent) as GenContextDay[];
    return new Map(parsed.map((d) => [d.no, d]));
  } catch {
    return new Map();
  }
}

/** 天页注入的「今天该一起考的旧知识点」，由今日复盘的那几格推出来 */
function loadRecallPoints(): RecallPoint[] {
  const el = document.getElementById('recall-points');
  if (!el?.textContent) return [];
  try {
    const parsed = JSON.parse(el.textContent) as RecallPoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadCache(key: string): Cache {
  return readJSON<Cache>(key, {});
}

function saveFor(key: string, dayNo: number, list: Exercise[]): void {
  const cache = loadCache(key);
  cache[String(dayNo)] = list;
  writeJSON(key, cache);
}

function clearFor(key: string, dayNo: number): void {
  const cache = loadCache(key);
  delete cache[String(dayNo)];
  writeJSON(key, cache);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toMarkdown(mode: GenMode, dayNo: number, list: Exercise[]): string {
  const head = `# D${String(dayNo).padStart(2, '0')} ${mode.heading}\n\n`;
  return (
    head +
    list
      .map(
        (e, i) =>
          `## ${i + 1}. ${e.task}\n\n**提示**：${e.hint}\n\n**参考答案**\n\n\`\`\`sql\n${e.referenceSql}\n\`\`\`\n\n**自查点**：${e.checkpoint}\n`,
      )
      .join('\n')
  );
}

function renderList(mode: GenMode, host: HTMLElement, dayNo: number, list: Exercise[]): void {
  if (list.length === 0) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <ol class="gen-list">
      ${list
        .map(
          (e) => `
        <li>
          <div class="gen-task">${escapeHtml(e.task)}</div>
          <details class="fold fold-label gen-fold"><summary>提示</summary><p>${escapeHtml(e.hint)}</p></details>
          <details class="fold fold-label gen-fold"><summary>参考答案</summary><pre class="sql-code">${highlightSql(e.referenceSql)}</pre></details>
          <div class="gen-check"><b>自查</b>${escapeHtml(e.checkpoint)}</div>
        </li>`,
        )
        .join('')}
    </ol>
    <div class="gen-foot">
      <button class="btn" data-${mode.footNs}-copy="${dayNo}">复制为 Markdown</button>
      <button class="btn" data-${mode.footNs}-clear="${dayNo}">清空</button>
    </div>`;

  host.querySelector(`[data-${mode.footNs}-copy="${dayNo}"]`)?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(toMarkdown(mode, dayNo, list));
  });
  host.querySelector(`[data-${mode.footNs}-clear="${dayNo}"]`)?.addEventListener('click', () => {
    clearFor(mode.storageKey, dayNo);
    host.innerHTML = '';
  });
}

/** 把一种题的按钮接起来：读缓存先渲染，点一下再生成 */
function wire(mode: GenMode, context: Map<number, GenContextDay>): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(`[${mode.btnAttr}]`)];
  if (buttons.length === 0) return;

  const cache = loadCache(mode.storageKey);

  for (const btn of buttons) {
    const dayNo = Number(btn.dataset[mode.datasetKey]);
    const host = document.querySelector<HTMLElement>(`[${mode.hostAttr}="${dayNo}"]`);
    const status = document.querySelector<HTMLElement>(`[${mode.statusAttr}="${dayNo}"]`);
    if (!host) continue;

    const cached = cache[String(dayNo)];
    if (cached && cached.length > 0) renderList(mode, host, dayNo, cached);

    btn.addEventListener('click', async () => {
      const day = context.get(dayNo);
      if (!day) {
        if (status) status.textContent = '这个页面没有出题上下文';
        return;
      }
      if (!isConfigured()) {
        if (status) {
          status.textContent = '先配置出题端点';
          status.classList.add('is-error');
        }
        openLlmSettings('填上端点地址、模型和 API key 后保存');
        return;
      }

      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = '生成中…';
      if (status) {
        status.textContent = '';
        status.classList.remove('is-error');
      }

      try {
        // 把上一批生成过的题目传回去，避免重新生成时模型又出一遍同样的题
        const prior = loadCache(mode.storageKey)[String(dayNo)] ?? [];
        const exercises = await mode.run(
          day,
          prior.map((e) => e.task),
          (chars) => {
            if (status) status.textContent = `生成中… 已收到 ${chars} 字`;
          },
        );
        saveFor(mode.storageKey, dayNo, exercises);
        renderList(mode, host, dayNo, exercises);
        if (status) status.textContent = '';
      } catch (err) {
        if (status) {
          status.textContent = err instanceof Error ? err.message : '生成失败';
          status.classList.add('is-error');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }
}

export function initGenerator(): void {
  const context = loadGenContext();
  if (context.size === 0) return;

  wire(
    {
      btnAttr: 'data-generate',
      datasetKey: 'generate',
      hostAttr: 'data-exercises',
      statusAttr: 'data-gen-status',
      footNs: 'gen',
      storageKey: 'sql8w.exercises.v1',
      heading: '补充练习',
      run: (day, prior, onProgress) => generateExercises(day, COUNT, prior, onProgress),
    },
    context,
  );

  // 随堂默写只在有复盘项的天出现（按钮由 DayFocus 按同一条件渲染）。
  // 要考的旧知识点在点下按钮那一刻才读：review.ts 会先把补漏与到期错题补进去，
  // 而那要等素材索引拉回来，比启动时晚。
  if (loadRecallPoints().length === 0) return;

  wire(
    {
      btnAttr: 'data-recall',
      datasetKey: 'recall',
      hostAttr: 'data-recall-list',
      statusAttr: 'data-recall-status',
      footNs: 'recall',
      storageKey: 'sql8w.recall.v1',
      heading: '随堂默写',
      run: (day, prior, onProgress) =>
        generateRecall(day, loadRecallPoints(), COUNT, prior, onProgress),
    },
    context,
  );
}
