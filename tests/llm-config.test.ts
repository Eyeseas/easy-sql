import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANTHROPIC_MAX_OUTPUT_TOKENS,
  ANTHROPIC_REASONING_BUDGETS,
  DEFAULT_REASONING,
  KNOWN_REASONING_CAPABILITIES,
  REASONING_LEVELS,
  anthropicMaxOutputTokens,
  availableReasoningLevels,
  knownReasoningCapability,
  normalizeReasoning,
  reasoningConfigurationError,
  reasoningSupport,
} from '../src/shared/llmConfig.ts';

test('reasoning config exposes the complete application enum and a safe default', () => {
  assert.deepEqual(REASONING_LEVELS, [
    'provider-default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
  ]);
  assert.equal(normalizeReasoning(undefined), DEFAULT_REASONING);
  assert.equal(normalizeReasoning('turbo'), DEFAULT_REASONING);
  assert.equal(normalizeReasoning('high'), 'high');
});

test('unknown compatible models get common efforts while unknown Claude aliases stay default-only', () => {
  assert.deepEqual(availableReasoningLevels('openai', 'private-compatible-model'), [
    DEFAULT_REASONING,
    'low',
    'medium',
    'high',
  ]);
  assert.equal(reasoningSupport('openai', 'private-compatible-model', 'low'), 'unverified');
  assert.equal(reasoningSupport('openai', 'private-compatible-model', 'minimal'), 'unsupported');

  assert.deepEqual(availableReasoningLevels('anthropic', 'private-claude-alias'), [
    DEFAULT_REASONING,
  ]);
  assert.equal(reasoningSupport('anthropic', 'private-claude-alias', 'high'), 'unsupported');
  assert.match(
    reasoningConfigurationError('anthropic', 'private-claude-alias', 'high') ?? '',
    /未知 Claude 模型/,
  );
});

test('the default OpenAI model exposes only its documented efforts and token policy', () => {
  assert.deepEqual(availableReasoningLevels('openai', 'GPT-5'), [
    DEFAULT_REASONING,
    'minimal',
    'low',
    'medium',
    'high',
  ]);
  assert.equal(reasoningSupport('openai', 'gpt-5', 'minimal'), 'verified');
  assert.equal(reasoningSupport('openai', 'gpt-5-2025-08-07', 'high'), 'verified');
  assert.equal(reasoningSupport('openai', 'gpt-5', 'none'), 'unsupported');
  assert.equal(reasoningSupport('openai', 'gpt-5', 'xhigh'), 'unsupported');

  const currentDefault = KNOWN_REASONING_CAPABILITIES.find(
    (capability) => capability.endpointType === 'openai' && capability.models.includes('gpt-5'),
  );
  if (!currentDefault || currentDefault.endpointType !== 'openai') {
    assert.fail('missing verified OpenAI capability');
  }
  assert.equal(currentDefault.chatCompletionTokenField, 'max_completion_tokens');
  assert.equal(currentDefault.maxOutputTokens, 128_000);
  assert.ok(currentDefault.sources.every((source) => source.startsWith('https://')));
});

test('known and unknown Codex models retain the established effort policy', () => {
  assert.deepEqual(availableReasoningLevels('codex', 'gpt-5-codex'), [
    DEFAULT_REASONING,
    'low',
    'medium',
    'high',
  ]);
  assert.equal(reasoningSupport('codex', 'gpt-5-codex', 'high'), 'verified');
  assert.equal(reasoningSupport('codex', 'gpt-5-codex', 'xhigh'), 'unsupported');
  assert.equal(reasoningSupport('codex', 'gpt-5.3-codex', 'xhigh'), 'verified');
  assert.equal(reasoningSupport('codex', 'private-alias', 'medium'), 'unverified');
  assert.equal(reasoningSupport('codex', 'private-alias', 'minimal'), 'unsupported');

  const currentDefault = KNOWN_REASONING_CAPABILITIES.find(
    (capability) =>
      capability.endpointType === 'codex' && capability.models.includes('gpt-5-codex'),
  );
  assert.ok(currentDefault);
  assert.ok(currentDefault.sources.every((source) => source.startsWith('https://')));
});

test('Claude capabilities distinguish adaptive and fixed-budget models', () => {
  assert.deepEqual(availableReasoningLevels('anthropic', 'claude-opus-5'), [
    DEFAULT_REASONING,
    'none',
    'low',
    'medium',
    'high',
    'xhigh',
  ]);
  assert.deepEqual(availableReasoningLevels('anthropic', 'claude-sonnet-4-6'), [
    DEFAULT_REASONING,
    'none',
    'low',
    'medium',
    'high',
  ]);
  assert.deepEqual(availableReasoningLevels('anthropic', 'claude-haiku-4-5'), [
    DEFAULT_REASONING,
    'none',
    'low',
    'medium',
    'high',
  ]);

  const currentDefault = knownReasoningCapability('anthropic', 'CLAUDE-OPUS-5');
  const adaptiveRepresentative = knownReasoningCapability('anthropic', 'claude-sonnet-4-6');
  const budgetRepresentative = knownReasoningCapability('anthropic', 'claude-haiku-4-5-20251001');
  assert.equal(currentDefault?.endpointType, 'anthropic');
  assert.equal(
    currentDefault?.endpointType === 'anthropic' ? currentDefault.thinkingMode : null,
    'adaptive',
  );
  assert.equal(
    adaptiveRepresentative?.endpointType === 'anthropic'
      ? adaptiveRepresentative.thinkingMode
      : null,
    'adaptive',
  );
  assert.equal(
    budgetRepresentative?.endpointType === 'anthropic' ? budgetRepresentative.thinkingMode : null,
    'budget',
  );
  assert.equal(reasoningSupport('anthropic', 'claude-opus-5', 'xhigh'), 'verified');
  assert.equal(reasoningSupport('anthropic', 'claude-sonnet-4-6', 'xhigh'), 'unsupported');
  assert.equal(reasoningSupport('anthropic', 'claude-haiku-4-5', 'minimal'), 'unsupported');
});

test('manual Claude budgets fit strictly inside the unchanged application output cap', () => {
  assert.deepEqual(ANTHROPIC_REASONING_BUDGETS, {
    low: 1_024,
    medium: 4_096,
    high: 8_192,
  });
  assert.equal(anthropicMaxOutputTokens('claude-opus-5'), ANTHROPIC_MAX_OUTPUT_TOKENS);
  assert.equal(anthropicMaxOutputTokens('claude-haiku-4-5'), ANTHROPIC_MAX_OUTPUT_TOKENS);
  for (const budget of Object.values(ANTHROPIC_REASONING_BUDGETS)) {
    assert.ok(budget >= 1_024);
    assert.ok(budget < anthropicMaxOutputTokens('claude-haiku-4-5'));
  }
});

test('every verified capability carries primary-source URLs', () => {
  assert.ok(KNOWN_REASONING_CAPABILITIES.length >= 6);
  for (const capability of KNOWN_REASONING_CAPABILITIES) {
    assert.ok(capability.sources.length > 0);
    assert.ok(capability.sources.every((source) => source.startsWith('https://')));
    if (capability.endpointType === 'anthropic') {
      assert.ok(capability.sources.every((source) => source.includes('platform.claude.com')));
      assert.ok(capability.maxOutputTokens > 0);
    }
  }
});
