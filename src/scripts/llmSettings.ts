/** 「出题设置」弹窗的开关与读写。generator 在未配置时也会唤起它。 */
import { loadConfig, saveConfig, clearConfig, type LlmEndpointType } from './llm';

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-llm-dialog]');
}

function status(msg: string, isError = false): void {
  const el = document.querySelector<HTMLElement>('[data-llm-status]');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
}

export function openLlmSettings(msg?: string): void {
  const dlg = dialog();
  if (!dlg) return;

  const cfg = loadConfig();
  const set = (name: string, v: string) => {
    const field = dlg.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-llm-field="${name}"]`);
    if (field) field.value = v;
  };
  set('type', cfg.type);
  set('baseUrl', cfg.baseUrl);
  set('model', cfg.model);
  set('apiKey', cfg.apiKey);

  status(msg ?? `当前：${cfg.model} @ ${cfg.baseUrl}${cfg.apiKey ? '' : '（缺 key）'}`, !cfg.apiKey);
  dlg.hidden = false;
}

function close(): void {
  const dlg = dialog();
  if (dlg) dlg.hidden = true;
}

export function initLlmSettings(): void {
  const dlg = dialog();
  if (!dlg) return;

  document.querySelectorAll('[data-action="llm-settings"]').forEach((btn) => {
    btn.addEventListener('click', () => openLlmSettings());
  });

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });

  dlg.querySelector('[data-action="llm-close"]')?.addEventListener('click', close);

  dlg.querySelector('[data-action="llm-clear"]')?.addEventListener('click', () => {
    clearConfig();
    openLlmSettings('已清空，回到 .env 构建时默认值');
  });

  dlg.querySelector('[data-action="llm-save"]')?.addEventListener('click', () => {
    const get = (name: string) =>
      dlg.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-llm-field="${name}"]`)?.value.trim() ?? '';

    const cfg = {
      type: (get('type') === 'openai' ? 'openai' : 'anthropic') as LlmEndpointType,
      baseUrl: get('baseUrl'),
      model: get('model'),
      apiKey: get('apiKey'),
    };

    if (!cfg.baseUrl || !cfg.model) {
      status('端点地址和模型不能为空', true);
      return;
    }

    saveConfig(cfg);
    openLlmSettings(`已保存：${cfg.model} @ ${cfg.baseUrl}${cfg.apiKey ? '' : '（缺 key）'}`);
  });
}
