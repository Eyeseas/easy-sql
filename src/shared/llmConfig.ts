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

const COMMON_CODEX_EFFORTS = ['low', 'medium', 'high'] as const;

export interface KnownReasoningCapability {
  readonly endpointType: 'codex';
  readonly models: readonly string[];
  readonly efforts: readonly Exclude<ReasoningLevel, 'provider-default'>[];
  readonly sources: readonly string[];
}

/**
 * Deliberately small: exact aliases only, so a similarly named model is not presented as verified.
 * The current default model is retained even though OpenAI now marks that alias deprecated.
 */
export const KNOWN_REASONING_CAPABILITIES: readonly KnownReasoningCapability[] = [
  {
    endpointType: 'codex',
    models: ['gpt-5-codex'],
    efforts: COMMON_CODEX_EFFORTS,
    sources: [
      'https://developers.openai.com/api/docs/models/gpt-5-codex',
      'https://developers.openai.com/api/docs/guides/reasoning',
    ],
  },
  {
    endpointType: 'codex',
    models: ['gpt-5.3-codex'],
    efforts: [...COMMON_CODEX_EFFORTS, 'xhigh'],
    sources: ['https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide'],
  },
];

export type ReasoningSupport = 'provider-default' | 'verified' | 'unverified' | 'unsupported';

export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === 'string' && REASONING_LEVELS.some((level) => level === value);
}

export function normalizeReasoning(value: unknown): ReasoningLevel {
  return isReasoningLevel(value) ? value : DEFAULT_REASONING;
}

export function knownReasoningCapability(
  type: LlmEndpointType,
  model: string,
): KnownReasoningCapability | null {
  if (type !== 'codex') return null;
  const normalizedModel = model.trim().toLowerCase();
  return (
    KNOWN_REASONING_CAPABILITIES.find(
      (capability) =>
        capability.endpointType === type && capability.models.includes(normalizedModel),
    ) ?? null
  );
}

export function availableReasoningLevels(
  type: LlmEndpointType,
  model: string,
): readonly ReasoningLevel[] {
  if (type !== 'codex') return [DEFAULT_REASONING];
  const capability = knownReasoningCapability(type, model);
  return [DEFAULT_REASONING, ...(capability?.efforts ?? COMMON_CODEX_EFFORTS)];
}

export function reasoningSupport(
  type: LlmEndpointType,
  model: string,
  reasoning: ReasoningLevel,
): ReasoningSupport {
  if (reasoning === DEFAULT_REASONING) return 'provider-default';
  if (type !== 'codex') return 'unsupported';

  const capability = knownReasoningCapability(type, model);
  if (capability) return capability.efforts.includes(reasoning) ? 'verified' : 'unsupported';
  return COMMON_CODEX_EFFORTS.includes(reasoning as (typeof COMMON_CODEX_EFFORTS)[number])
    ? 'unverified'
    : 'unsupported';
}
