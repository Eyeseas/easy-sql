/** 「AI 设置」弹窗的开关与读写（出题与答疑共用）。generator 与答疑面板在未配置时也会唤起它。 */
import { loadConfig, saveConfig, clearConfig } from './llm';
import {
  DEFAULT_REASONING,
  availableReasoningLevels,
  knownReasoningCapability,
  normalizeReasoning,
  type LlmEndpointType,
  type ReasoningLevel,
} from '../shared/llmConfig';

const REASONING_LABELS: Record<ReasoningLevel, string> = {
  'provider-default': '模型默认',
  none: '不推理',
  minimal: '最少',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
};

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-llm-dialog]');
}

function status(msg: string, isError = false): void {
  const el = document.querySelector<HTMLElement>('[data-llm-status]');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
}

function field(dlg: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement | null {
  return dlg.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-llm-field="${name}"]`);
}

function endpointType(value: string): LlmEndpointType {
  return value === 'openai' || value === 'codex' ? value : 'anthropic';
}

/** Refresh available efforts and return whether an incompatible selection was reset. */
function syncReasoningOptions(
  dlg: HTMLElement,
  announceReset: boolean,
  desiredReasoning?: ReasoningLevel,
): boolean {
  const type = endpointType(field(dlg, 'type')?.value ?? '');
  const model = field(dlg, 'model')?.value.trim() ?? '';
  const select = field(dlg, 'reasoning');
  if (!(select instanceof HTMLSelectElement)) return false;

  const available = availableReasoningLevels(type, model);
  const selected = desiredReasoning ?? normalizeReasoning(select.value);
  select.replaceChildren(
    ...available.map((level) => {
      const option = document.createElement('option');
      option.value = level;
      option.textContent =
        level === DEFAULT_REASONING
          ? `${REASONING_LABELS[level]}（不发送推理参数）`
          : REASONING_LABELS[level];
      return option;
    }),
  );

  const reset = !available.includes(selected);
  select.value = reset ? DEFAULT_REASONING : selected;

  const note = dlg.querySelector<HTMLElement>('[data-llm-reasoning-note]');
  if (note) {
    const capability = knownReasoningCapability(type, model);
    if (type === 'anthropic' && capability?.endpointType === 'anthropic') {
      note.textContent =
        capability.thinkingMode === 'adaptive'
          ? `已验证自适应思考：${capability.efforts.map((level) => REASONING_LABELS[level]).join(' / ')}。`
          : '已验证固定预算：低 1024 / 中 4096 / 高 8192 tokens。';
    } else if (type === 'anthropic') {
      note.textContent = '未知 Claude 模型仅可使用模型默认，不会猜测思考模式。';
    } else if (capability) {
      note.textContent = `已验证选项：${capability.efforts.map((level) => REASONING_LABELS[level]).join(' / ')}。`;
    } else {
      note.textContent = '未知模型可显式尝试低 / 中 / 高；这不代表已检测到支持，上游可能拒绝。';
    }
  }

  if (reset && announceReset) {
    status('原思考等级与当前端点或模型不兼容，已回到模型默认');
  }
  return reset;
}

export function openLlmSettings(msg?: string): void {
  const dlg = dialog();
  if (!dlg) return;

  const cfg = loadConfig();
  const set = (name: string, value: string) => {
    const control = field(dlg, name);
    if (control) control.value = value;
  };
  set('type', cfg.type);
  set('baseUrl', cfg.baseUrl);
  set('model', cfg.model);
  set('apiKey', cfg.apiKey);
  syncReasoningOptions(dlg, false, cfg.reasoning);

  status(
    msg ??
      `当前：${cfg.model} @ ${cfg.baseUrl} · 思考：${REASONING_LABELS[cfg.reasoning]}${cfg.apiKey ? '' : '（缺 key）'}`,
    !cfg.apiKey,
  );
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

  const revalidateReasoning = () => syncReasoningOptions(dlg, true);
  field(dlg, 'type')?.addEventListener('change', revalidateReasoning);
  field(dlg, 'model')?.addEventListener('change', revalidateReasoning);

  dlg.querySelector('[data-action="llm-clear"]')?.addEventListener('click', () => {
    clearConfig();
    openLlmSettings('已清空，回到构建时默认值；思考等级已恢复为模型默认');
  });

  dlg.querySelector('[data-action="llm-save"]')?.addEventListener('click', () => {
    const get = (name: string) => field(dlg, name)?.value.trim() ?? '';

    const resetReasoning = syncReasoningOptions(dlg, false);
    const cfg = {
      type: endpointType(get('type')),
      baseUrl: get('baseUrl'),
      model: get('model'),
      apiKey: get('apiKey'),
      reasoning: normalizeReasoning(get('reasoning')),
    };

    if (!cfg.baseUrl || !cfg.model) {
      status('端点地址和模型不能为空', true);
      return;
    }

    saveConfig(cfg);
    openLlmSettings(
      `已保存：${cfg.model} @ ${cfg.baseUrl} · 思考：${REASONING_LABELS[cfg.reasoning]}${
        resetReasoning ? '（原选择不兼容，已重置）' : ''
      }${cfg.apiKey ? '' : '（缺 key）'}`,
    );
  });
}
