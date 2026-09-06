import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { streamText, type CallWarning } from 'ai';
import {
  asObject,
  consumeSdkTextStream,
  elapsed,
  errorDetail,
  fetchSdkEndpoint,
  readResponseText,
  responseWithTrackedBody,
  type JsonObject,
} from './sdk';
import {
  DEFAULT_REASONING,
  anthropicRequestConfig,
  type ReasoningLevel,
} from '../../shared/llmConfig';

const ANTHROPIC_MESSAGES_PATH = '/v1/messages';

interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AnthropicUpstreamConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly reasoning: ReasoningLevel;
  readonly system: string;
  readonly user?: string;
  readonly messages?: readonly AnthropicMessage[];
}

function joinUrl(base: string, path: string): string {
  const normalized = base.trim().replace(/\/+$/, '');
  if (normalized.endsWith(path)) return normalized;
  if (path.startsWith('/v1/') && normalized.endsWith('/v1')) {
    return `${normalized}${path.slice(3)}`;
  }
  return `${normalized}${path}`;
}

function anthropicBaseUrl(baseUrl: string): string {
  const endpoint = joinUrl(baseUrl, ANTHROPIC_MESSAGES_PATH);
  return endpoint.slice(0, -'/messages'.length);
}

function anthropicErrorResponse(message: string, status: number): Response {
  return Response.json(
    { type: 'error', error: { type: 'api_error', message } },
    { status: status >= 400 && status <= 599 ? status : 502 },
  );
}

function anthropicJsonAsSse(data: JsonObject, model: string): Response {
  const content = Array.isArray(data.content) ? data.content : [];
  const text = content
    .map(asObject)
    .filter((block): block is JsonObject => block?.type === 'text')
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('');
  const stopReason = typeof data.stop_reason === 'string' ? data.stop_reason : '';

  if (!text.trim()) {
    const sawReasoning = content.some((block) => {
      const type = asObject(block)?.type;
      return type === 'thinking' || type === 'redacted_thinking';
    });
    const details = [sawReasoning ? '只返回了 reasoning，没有最终答案' : 'content 中没有文本'];
    if (stopReason) details.push(`stop_reason=${stopReason}`);
    return anthropicErrorResponse(`端点返回 200，但${details.join('，')}`, 502);
  }
  if (!stopReason) {
    return anthropicErrorResponse('端点返回 200，但缺少 stop_reason，响应不完整', 502);
  }
  if (stopReason !== 'end_turn' && stopReason !== 'stop_sequence') {
    const detail =
      stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded'
        ? `输出被截断（stop_reason=${stopReason}）`
        : `响应未正常结束（stop_reason=${stopReason}）`;
    return anthropicErrorResponse(detail, 502);
  }

  const responseModel = typeof data.model === 'string' ? data.model : model;
  const events: JsonObject[] = [
    {
      type: 'message_start',
      message: {
        id: typeof data.id === 'string' ? data.id : 'json-fallback',
        type: 'message',
        role: 'assistant',
        content: [],
        model: responseModel,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: data.stop_sequence ?? null },
      usage: { output_tokens: 0 },
    },
    { type: 'message_stop' },
  ];
  const encoded = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(encoded, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

async function adaptAnthropicResponse(
  response: Response,
  release: () => void,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && contentType.includes('text/event-stream')) {
    return responseWithTrackedBody(response, release, signal);
  }

  const status = response.status;
  const raw = await readResponseText(response, release, signal);
  signal.throwIfAborted();
  let data: JsonObject | null = null;
  try {
    data = asObject(JSON.parse(raw));
  } catch {
    // The normalized SDK error below keeps non-JSON proxy failures readable.
  }
  if (!data) {
    return anthropicErrorResponse(`端点返回 ${status}，但响应不是 JSON 对象`, status);
  }

  const detail = errorDetail(data);
  if (!response.ok || data.error !== undefined) {
    return anthropicErrorResponse(`端点返回 ${status}${detail ? `：${detail}` : ''}`, status);
  }
  return anthropicJsonAsSse(data, model);
}

export type AnthropicSdkWarning = CallWarning;

function warningDescription(warning: AnthropicSdkWarning): string {
  if (warning.type === 'deprecated') return `${warning.setting}: ${warning.message}`;
  if (warning.type === 'other') return warning.message;
  return `${warning.feature}${warning.details ? `: ${warning.details}` : ''}`;
}

function warningChangesReasoning(warning: AnthropicSdkWarning): boolean {
  const description = warningDescription(warning);
  return /(reasoning|thinking|effort|budget|maxOutputTokens|max output tokens)/i.test(description);
}

export function assertReasoningWarnings(
  warnings: readonly AnthropicSdkWarning[],
  reasoning: ReasoningLevel,
): void {
  if (reasoning === DEFAULT_REASONING) return;
  const changed = warnings.find(warningChangesReasoning);
  if (changed) {
    throw new Error(`AI SDK 未按所选思考等级执行：${warningDescription(changed)}`);
  }
}

function sdkReasoningConfig(model: string, reasoning: ReasoningLevel) {
  const native = anthropicRequestConfig(model, reasoning);
  if (!native.thinking) return { maxOutputTokens: native.maxTokens };

  if (native.thinking.type === 'enabled') {
    const budgetTokens = native.thinking.budget_tokens;
    const options = {
      thinking: { type: 'enabled', budgetTokens },
    } satisfies AnthropicLanguageModelOptions;
    return {
      maxOutputTokens: native.maxTokens - budgetTokens,
      providerOptions: { anthropic: options },
    };
  }
  if (native.thinking.type === 'adaptive') {
    const effort = native.outputConfig?.effort;
    if (effort === 'minimal' || effort === undefined) {
      throw new Error('Claude 自适应思考等级配置无效');
    }
    const options = {
      thinking: { type: 'adaptive' },
      effort,
    } satisfies AnthropicLanguageModelOptions;
    return { maxOutputTokens: native.maxTokens, providerOptions: { anthropic: options } };
  }

  const options = {
    thinking: { type: 'disabled' },
  } satisfies AnthropicLanguageModelOptions;
  return { maxOutputTokens: native.maxTokens, providerOptions: { anthropic: options } };
}

/** Run one Anthropic Messages generation through AI SDK while preserving the app's text contract. */
export async function runAnthropicUpstream(
  cfg: AnthropicUpstreamConfig,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const startedAt = Date.now();
  const sdkConfig = sdkReasoningConfig(cfg.model, cfg.reasoning);
  const provider = createAnthropic({
    apiKey: cfg.apiKey,
    baseURL: anthropicBaseUrl(cfg.baseUrl),
    fetch: async (input, init) => {
      const { response, release } = await fetchSdkEndpoint(input, init, signal);
      return adaptAnthropicResponse(response, release, cfg.model, signal);
    },
  });
  const result = streamText({
    model: provider(cfg.model),
    system: cfg.system,
    messages: cfg.messages?.map((message) => ({
      role: message.role,
      content: message.content,
    })) ?? [{ role: 'user', content: cfg.user ?? '' }],
    maxOutputTokens: sdkConfig.maxOutputTokens,
    ...(sdkConfig.providerOptions ? { providerOptions: sdkConfig.providerOptions } : {}),
    maxRetries: 0,
    streamRetries: 0,
    onError: () => {},
    abortSignal: signal,
    include: { rawChunks: true },
  });

  let sawMessageStop = false;
  const outcome = await consumeSdkTextStream({
    stream: result.stream,
    signal,
    onDelta,
    onWarnings: (warnings) => assertReasoningWarnings(warnings, cfg.reasoning),
    onRaw: (rawValue) => {
      if (asObject(rawValue)?.type === 'message_stop') sawMessageStop = true;
    },
  });

  if (!sawMessageStop) {
    throw new Error(`上游提前断开，响应不完整（${elapsed(startedAt)}）`);
  }
  if (outcome.finishReason !== 'stop') {
    const raw = outcome.rawFinishReason ? `，stop_reason=${outcome.rawFinishReason}` : '';
    if (outcome.finishReason === 'length') {
      throw new Error(`输出达到 token 上限并被截断（finish_reason=length${raw}），JSON 不完整`);
    }
    throw new Error(`上游未正常结束（finish_reason=${outcome.finishReason ?? 'missing'}${raw}）`);
  }
  if (!outcome.text.trim()) {
    const details = [elapsed(startedAt)];
    if (outcome.sawReasoning) details.push('只返回了 reasoning_content，没有最终答案');
    throw new Error(`端点返回 200，但流里没有任何文本（${details.join('，')}）`);
  }
  return outcome.text;
}
