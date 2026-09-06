import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_REASONING,
  KNOWN_REASONING_CAPABILITIES,
  REASONING_LEVELS,
  availableReasoningLevels,
  normalizeReasoning,
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

test('reasoning capability policy keeps Anthropic on defaults and opens OpenAI common efforts', () => {
  assert.deepEqual(availableReasoningLevels('anthropic', 'claude-opus-5'), [DEFAULT_REASONING]);
  assert.deepEqual(availableReasoningLevels('openai', 'private-compatible-model'), [
    DEFAULT_REASONING,
    'low',
    'medium',
    'high',
  ]);
  assert.equal(reasoningSupport('anthropic', 'claude-opus-5', 'high'), 'unsupported');
  assert.equal(reasoningSupport('openai', 'private-compatible-model', 'low'), 'unverified');
  assert.equal(reasoningSupport('openai', 'private-compatible-model', 'minimal'), 'unsupported');
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
  assert.ok(currentDefault);
  assert.equal(currentDefault.chatCompletionTokenField, 'max_completion_tokens');
  assert.equal(currentDefault.maxOutputTokens, 128_000);
  assert.ok(currentDefault.sources.every((source) => source.startsWith('https://')));
});

test('known and unknown Codex models are reported honestly', () => {
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
