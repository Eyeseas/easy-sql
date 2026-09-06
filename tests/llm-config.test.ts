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

test('reasoning capability policy restricts non-Codex endpoints to provider defaults', () => {
  assert.deepEqual(availableReasoningLevels('anthropic', 'claude-opus-5'), [DEFAULT_REASONING]);
  assert.deepEqual(availableReasoningLevels('openai', 'gpt-5'), [DEFAULT_REASONING]);
  assert.equal(reasoningSupport('anthropic', 'claude-opus-5', 'high'), 'unsupported');
  assert.equal(reasoningSupport('openai', 'gpt-5', 'low'), 'unsupported');
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

  const currentDefault = KNOWN_REASONING_CAPABILITIES.find((capability) =>
    capability.models.includes('gpt-5-codex'),
  );
  assert.ok(currentDefault);
  assert.ok(currentDefault.sources.every((source) => source.startsWith('https://')));
});
