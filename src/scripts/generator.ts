/** 「AI 补充练习」客户端：浏览器直连配置的 LLM 端点出题，结果按天缓存在本地。 */
import { readJSON, writeJSON } from './storage';
import { generateExercises, isConfigured, type Exercise, type GenContextDay } from './llm';
import { openLlmSettings } from './llmSettings';
import { highlightSql } from '../utils/highlightSql';

const KEY = 'sql8w.exercises.v1';

type Cache = Record<string, Exercise[]>;

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

function loadCache(): Cache {
  return readJSON<Cache>(KEY, {});
}

function saveFor(dayNo: number, list: Exercise[]): void {
  const cache = loadCache();
  cache[String(dayNo)] = list;
  writeJSON(KEY, cache);
}

function clearFor(dayNo: number): void {
  const cache = loadCache();
  delete cache[String(dayNo)];
  writeJSON(KEY, cache);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toMarkdown(dayNo: number, list: Exercise[]): string {
  const head = `# D${String(dayNo).padStart(2, '0')} 补充练习\n\n`;
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

function renderList(host: HTMLElement, dayNo: number, list: Exercise[]): void {
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
          <details class="gen-fold"><summary>提示</summary><p>${escapeHtml(e.hint)}</p></details>
          <details class="gen-fold"><summary>参考答案</summary><pre class="sql-code">${highlightSql(e.referenceSql)}</pre></details>
          <div class="gen-check"><b>自查</b>${escapeHtml(e.checkpoint)}</div>
        </li>`,
        )
        .join('')}
    </ol>
    <div class="gen-foot">
      <button class="btn" data-gen-copy="${dayNo}">复制为 Markdown</button>
      <button class="btn" data-gen-clear="${dayNo}">清空</button>
    </div>`;

  host.querySelector(`[data-gen-copy="${dayNo}"]`)?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(toMarkdown(dayNo, list));
  });
  host.querySelector(`[data-gen-clear="${dayNo}"]`)?.addEventListener('click', () => {
    clearFor(dayNo);
    host.innerHTML = '';
  });
}

export function initGenerator(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-generate]')];
  if (buttons.length === 0) return;

  const context = loadGenContext();
  const cache = loadCache();

  for (const btn of buttons) {
    const dayNo = Number(btn.dataset.generate);
    const host = document.querySelector<HTMLElement>(`[data-exercises="${dayNo}"]`);
    const status = document.querySelector<HTMLElement>(`[data-gen-status="${dayNo}"]`);
    if (!host) continue;

    const cached = cache[String(dayNo)];
    if (cached && cached.length > 0) renderList(host, dayNo, cached);

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
        const prior = cache[String(dayNo)] ?? [];
        const exercises = await generateExercises(day, 3, prior.map((e) => e.task), (chars) => {
          if (status) status.textContent = `生成中… 已收到 ${chars} 字`;
        });
        saveFor(dayNo, exercises);
        renderList(host, dayNo, exercises);
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
