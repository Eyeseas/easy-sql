/** Shared, serializable LLM configuration policy. This module has no DOM or SDK dependencies. */
export const LLM_ENDPOINT_TYPES = ['anthropic', 'openai', 'codex'] as const;
export type LlmEndpointType = (typeof LLM_ENDPOINT_TYPES)[number];

export const REASONING_LEVELS = [
  'provider-default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export const DEFAULT_REASONING = 'provider-default' as const;
export const ANTHROPIC_MAX_OUTPUT_TOKENS = 16_000;
export const ANTHROPIC_REASONING_BUDGETS = {
  low: 1_024,
  medium: 4_096,
  high: 8_192,
} as const;

type ExplicitReasoningLevel = Exclude<ReasoningLevel, 'provider-default' | 'none'>;
type AnthropicBudgetLevel = keyof typeof ANTHROPIC_REASONING_BUDGETS;
const COMMON_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
const COMMON_ANTHROPIC_BUDGET_LEVELS = ['low', 'medium', 'high'] as const;

interface KnownReasoningCapabilityBase {
  readonly endpointType: LlmEndpointType;
  readonly models: readonly string[];
  readonly efforts: readonly ExplicitReasoningLevel[];
  readonly sources: readonly string[];
}

export interface KnownOpenAiReasoningCapability extends KnownReasoningCapabilityBase {
  readonly endpointType: 'openai';
  /** OpenAI Chat Completions reasoning models reject/deprecate the legacy max_tokens field. */
  readonly chatCompletionTokenField: 'max_completion_tokens';
  readonly maxOutputTokens: number;
}

export interface KnownCodexReasoningCapability extends KnownReasoningCapabilityBase {
  readonly endpointType: 'codex';
}

export interface KnownAnthropicReasoningCapability extends KnownReasoningCapabilityBase {
  readonly endpointType: 'anthropic';
  readonly thinkingMode: 'adaptive' | 'budget';
  readonly supportsDisabled: boolean;
  readonly maxOutputTokens: number;
}

export type KnownReasoningCapability =
  | KnownOpenAiReasoningCapability
  | KnownCodexReasoningCapability
  | KnownAnthropicReasoningCapability;

/**
 * Deliberately small: exact aliases only, so a similarly named model is not presented as verified.
 * Entries cover the current defaults plus representative adaptive and manual-budget Claude models.
 */
export const KNOWN_REASONING_CAPABILITIES: readonly KnownReasoningCapability[] = [
  {
    endpointType: 'openai',
    models: ['gpt-5', 'gpt-5-2025-08-07'],
    efforts: ['minimal', ...COMMON_REASONING_EFFORTS],
    chatCompletionTokenField: 'max_completion_tokens',
    maxOutputTokens: 128_000,
    sources: [
      'https://developers.openai.com/api/docs/models/gpt-5',
      'https://github.com/openai/openai-openapi/blob/master/openapi.yaml',
    ],
  },
  {
    endpointType: 'codex',
    models: ['gpt-5-codex'],
    efforts: COMMON_REASONING_EFFORTS,
    sources: [
      'https://developers.openai.com/api/docs/models/gpt-5-codex',
      'https://developers.openai.com/api/docs/guides/reasoning',
    ],
  },
  {
    endpointType: 'codex',
    models: ['gpt-5.3-codex'],
    efforts: [...COMMON_REASONING_EFFORTS, 'xhigh'],
    sources: ['https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide'],
  },
  {
    endpointType: 'anthropic',
    models: ['claude-opus-5'],
    efforts: [...COMMON_ANTHROPIC_BUDGET_LEVELS, 'xhigh'],
    thinkingMode: 'adaptive',
    supportsDisabled: true,
    maxOutputTokens: 128_000,
    sources: [
      'https://platform.claude.com/docs/en/models/opus-5/overview',
      'https://platform.claude.com/docs/en/build-with-claude/effort',
      'https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting',
    ],
  },
  {
    endpointType: 'anthropic',
    models: ['claude-sonnet-4-6'],
    efforts: COMMON_ANTHROPIC_BUDGET_LEVELS,
    thinkingMode: 'adaptive',
    supportsDisabled: true,
    maxOutputTokens: 128_000,
    sources: [
      'https://platform.claude.com/docs/en/models/sonnet-4-6/overview',
      'https://platform.claude.com/docs/en/build-with-claude/effort',
      'https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting',
    ],
  },
  {
    endpointType: 'anthropic',
    models: ['claude-haiku-4-5', 'claude-haiku-4-5-20251001'],
    // These are application budget policies, not Anthropic effort values.
    efforts: COMMON_ANTHROPIC_BUDGET_LEVELS,
    thinkingMode: 'budget',
    supportsDisabled: true,
    maxOutputTokens: 64_000,
    sources: [
      'https://platform.claude.com/docs/en/models/haiku-4-5/overview',
      'https://platform.claude.com/docs/en/build-with-claude/extended-thinking',
      'https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting',
    ],
  },
];

export type ReasoningSupport = 'provider-default' | 'verified' | 'unverified' | 'unsupported';

export interface AnthropicRequestConfig {
  readonly maxTokens: number;
  readonly thinking?:
    | { readonly type: 'adaptive' }
    | { readonly type: 'enabled'; readonly budget_tokens: number }
    | { readonly type: 'disabled' };
  readonly outputConfig?: { readonly effort: ExplicitReasoningLevel };
}

export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === 'string' && REASONING_LEVELS.some((level) => level === value);
}

export function normalizeReasoning(value: unknown): ReasoningLevel {
  return isReasoningLevel(value) ? value : DEFAULT_REASONING;
}

function isAnthropicBudgetLevel(value: ExplicitReasoningLevel): value is AnthropicBudgetLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

export function knownReasoningCapability(
  type: LlmEndpointType,
  model: string,
): KnownReasoningCapability | null {
  const normalizedModel = model.trim().toLowerCase();
  return (
    KNOWN_REASONING_CAPABILITIES.find(
      (capability) =>
        capability.endpointType === type &&
        capability.models.some((knownModel) => knownModel === normalizedModel),
    ) ?? null
  );
}

export function availableReasoningLevels(
  type: LlmEndpointType,
  model: string,
): readonly ReasoningLevel[] {
  const capability = knownReasoningCapability(type, model);
  if (capability) {
    return [
      DEFAULT_REASONING,
      ...(capability.endpointType === 'anthropic' && capability.supportsDisabled
        ? (['none'] as const)
        : []),
      ...capability.efforts,
    ];
  }
  return type === 'anthropic'
    ? [DEFAULT_REASONING]
    : [DEFAULT_REASONING, ...COMMON_REASONING_EFFORTS];
}

export function reasoningSupport(
  type: LlmEndpointType,
  model: string,
  reasoning: ReasoningLevel,
): ReasoningSupport {
  if (reasoning === DEFAULT_REASONING) return 'provider-default';

  const capability = knownReasoningCapability(type, model);
  if (capability) {
    if (reasoning === 'none') {
      return capability.endpointType === 'anthropic' && capability.supportsDisabled
        ? 'verified'
        : 'unsupported';
    }
    return capability.efforts.includes(reasoning) ? 'verified' : 'unsupported';
  }

  if (type === 'anthropic') return 'unsupported';
  return COMMON_REASONING_EFFORTS.includes(reasoning as (typeof COMMON_REASONING_EFFORTS)[number])
    ? 'unverified'
    : 'unsupported';
}

export function anthropicMaxOutputTokens(model: string): number {
  const capability = knownReasoningCapability('anthropic', model);
  const providerLimit =
    capability?.endpointType === 'anthropic'
      ? capability.maxOutputTokens
      : ANTHROPIC_MAX_OUTPUT_TOKENS;
  return Math.min(ANTHROPIC_MAX_OUTPUT_TOKENS, providerLimit);
}

export function reasoningConfigurationError(
  type: LlmEndpointType,
  model: string,
  reasoning: ReasoningLevel,
): string | null {
  if (reasoningSupport(type, model, reasoning) === 'unsupported') {
    if (type === 'anthropic' && !knownReasoningCapability(type, model)) {
      return '未知 Claude 模型仅可使用模型默认；显式思考等级需要已验证的模型能力';
    }
    return '所选思考等级与当前端点或模型不兼容，请在 AI 设置中改用模型默认';
  }

  const capability = knownReasoningCapability(type, model);
  if (
    capability?.endpointType === 'anthropic' &&
    capability.thinkingMode === 'budget' &&
    reasoning !== DEFAULT_REASONING &&
    reasoning !== 'none'
  ) {
    if (!isAnthropicBudgetLevel(reasoning)) {
      return '所选思考等级与当前 Claude 固定预算模式不兼容';
    }
    const budget = ANTHROPIC_REASONING_BUDGETS[reasoning];
    const maxTokens = anthropicMaxOutputTokens(model);
    if (budget < 1_024 || budget >= maxTokens) {
      return `思考预算 ${budget} 必须至少为 1024 且小于总输出上限 ${maxTokens}`;
    }
  }
  return null;
}

/** Build Anthropic's native fields after reasoningConfigurationError has accepted the request. */
export function anthropicRequestConfig(
  model: string,
  reasoning: ReasoningLevel,
): AnthropicRequestConfig {
  const maxTokens = anthropicMaxOutputTokens(model);
  if (reasoning === DEFAULT_REASONING) return { maxTokens };

  const capability = knownReasoningCapability('anthropic', model);
  const error = reasoningConfigurationError('anthropic', model, reasoning);
  if (error || capability?.endpointType !== 'anthropic') {
    throw new Error(error ?? 'Claude 思考等级配置无效');
  }
  if (reasoning === 'none') {
    return { maxTokens, thinking: { type: 'disabled' } };
  }
  if (capability.thinkingMode === 'adaptive') {
    return {
      maxTokens,
      thinking: { type: 'adaptive' },
      outputConfig: { effort: reasoning },
    };
  }
  if (!isAnthropicBudgetLevel(reasoning)) {
    throw new Error('所选思考等级与当前 Claude 固定预算模式不兼容');
  }
  return {
    maxTokens,
    thinking: {
      type: 'enabled',
      budget_tokens: ANTHROPIC_REASONING_BUDGETS[reasoning],
    },
  };
}
