import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, type CallWarning } from 'ai';
import {
  DEFAULT_REASONING,
  knownReasoningCapability,
  type ReasoningLevel,
} from '../../shared/llmConfig';
import {
  asObject,
  consumeSdkTextStream,
  elapsed,
  errorDetail,
  errorText,
  fetchSdkEndpoint,
  readResponseText,
  responseWithTrackedBody,
  type JsonObject,
  type SdkTextStreamResult,
} from './sdk';

const OPENAI_CHAT_COMPLETIONS_PATH = '/chat/completions';
const OPENAI_MAX_OUTPUT_TOKENS = 8_000;

interface OpenAiMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface OpenAiUpstreamConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly reasoning: ReasoningLevel;
  readonly system: string;
  readonly user?: string;
  readonly messages?: readonly OpenAiMessage[];
}

interface OpenAiResponseState {
  source: 'sse' | 'json';
  sawDone: boolean;
}

function joinUrl(base: string, path: string): string {
  const normalized = base.trim().replace(/\/+$/, '');
  if (normalized.endsWith(path)) return normalized;
  return `${normalized}${path}`;
}

function openAiBaseUrl(baseUrl: string): string {
  const endpoint = joinUrl(baseUrl, OPENAI_CHAT_COMPLETIONS_PATH);
  return endpoint.slice(0, -OPENAI_CHAT_COMPLETIONS_PATH.length);
}

function openAiErrorResponse(message: string, status: number): Response {
  return Response.json(
    { error: { message, type: 'api_error' } },
    { status: status >= 400 && status <= 599 ? status : 502 },
  );
}

function openAiText(data: JsonObject): {
  readonly text: string;
  readonly finishReason: string;
  readonly sawReasoning: boolean;
  readonly refusal: string;
} {
  const choice = asObject(Array.isArray(data.choices) ? data.choices[0] : undefined);
  const message = asObject(choice?.message);
  const content = message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map(asObject)
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
        : typeof choice?.text === 'string'
          ? choice.text
          : typeof data.output_text === 'string'
            ? data.output_text
            : '';
  const reasoning = message?.reasoning_content ?? message?.reasoning;
  return {
    text,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : '',
    sawReasoning: typeof reasoning === 'string' && reasoning.trim() !== '',
    refusal: typeof message?.refusal === 'string' ? message.refusal : '',
  };
}

function openAiJsonAsSse(data: JsonObject, status: number): Response {
  const { text, finishReason, sawReasoning, refusal } = openAiText(data);
  if (!text.trim()) {
    const details: string[] = [];
    if (finishReason) details.push(`finish_reason=${finishReason}`);
    if (sawReasoning) details.push('只返回了 reasoning_content，没有最终答案');
    if (refusal.trim()) details.push(`模型拒绝：${refusal}`);
    const suffix = details.length > 0 ? `（${details.join('，')}）` : '';
    return openAiErrorResponse(
      `端点返回 ${status}，但 choices[0].message.content 为空${suffix}`,
      502,
    );
  }
  if (!finishReason) {
    return openAiErrorResponse(`端点返回 ${status}，但缺少 finish_reason，响应不完整`, 502);
  }
  if (finishReason !== 'stop') {
    const detail =
      finishReason === 'length'
        ? '输出达到 token 上限并被截断（finish_reason=length），JSON 不完整'
        : `响应未正常结束（finish_reason=${finishReason}）`;
    return openAiErrorResponse(detail, 502);
  }

  const events = [
    { choices: [{ delta: { role: 'assistant' } }] },
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: finishReason }] },
  ];
  return new Response(
    `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
    { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } },
  );
}

function trackDoneMarker(state: OpenAiResponseState) {
  const decoder = new TextDecoder();
  let raw = '';
  const detectDone = (): void => {
    state.sawDone = /(?:^|\r\n|\r|\n)data:\s*\[DONE\]\s*(?=\r\n|\r|\n|$)/.test(raw);
  };
  return {
    chunk(value: Uint8Array) {
      raw += decoder.decode(value, { stream: true });
      detectDone();
    },
    end() {
      raw += decoder.decode();
      detectDone();
    },
    stop: () => state.sawDone,
  };
}

async function adaptOpenAiResponse(
  response: Response,
  release: () => void,
  state: OpenAiResponseState,
  signal: AbortSignal,
): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && contentType.includes('text/event-stream')) {
    return responseWithTrackedBody(response, release, signal, trackDoneMarker(state));
  }

  state.source = 'json';
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
    return openAiErrorResponse(`端点返回 ${status}，但响应不是 JSON 对象`, status);
  }

  const detail = errorDetail(data);
  const hasChoice = asObject(Array.isArray(data.choices) ? data.choices[0] : undefined) !== null;
  if (!response.ok || data.error !== undefined || (!hasChoice && detail)) {
    return openAiErrorResponse(`端点返回 ${status}${detail ? `：${detail}` : ''}`, status);
  }
  return responseWithTrackedBody(
    openAiJsonAsSse(data, status),
    () => {},
    signal,
    trackDoneMarker(state),
  );
}

function warningDescription(warning: CallWarning): string {
  if (warning.type === 'deprecated') return `${warning.setting}: ${warning.message}`;
  if (warning.type === 'other') return warning.message;
  return `${warning.feature}${warning.details ? `: ${warning.details}` : ''}`;
}

function warningChangesOpenAiContract(warning: CallWarning, reasoning: ReasoningLevel): boolean {
  const description = warningDescription(warning);
  if (/(maxOutputTokens|max output tokens|max_tokens|max_completion_tokens)/i.test(description)) {
    return true;
  }
  return (
    reasoning !== DEFAULT_REASONING && /(reasoning|reasoning_effort|effort)/i.test(description)
  );
}

export function assertOpenAiWarnings(
  warnings: readonly CallWarning[],
  reasoning: ReasoningLevel,
): void {
  const changed = warnings.find((warning) => warningChangesOpenAiContract(warning, reasoning));
  if (changed) {
    throw new Error(`AI SDK 未保持 OpenAI-compatible 请求契约：${warningDescription(changed)}`);
  }
}

function requestConfig(cfg: OpenAiUpstreamConfig): {
  readonly maxOutputTokens: number;
  readonly useMaxCompletionTokens: boolean;
} {
  const capability = knownReasoningCapability('openai', cfg.model);
  const knownOpenAi = capability?.endpointType === 'openai' ? capability : null;
  return {
    maxOutputTokens: Math.min(
      OPENAI_MAX_OUTPUT_TOKENS,
      knownOpenAi?.maxOutputTokens ?? OPENAI_MAX_OUTPUT_TOKENS,
    ),
    useMaxCompletionTokens:
      cfg.reasoning !== DEFAULT_REASONING &&
      knownOpenAi?.chatCompletionTokenField === 'max_completion_tokens',
  };
}

/** Run one OpenAI-compatible Chat Completions generation through AI SDK. */
export async function runOpenAiUpstream(
  cfg: OpenAiUpstreamConfig,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const startedAt = Date.now();
  const request = requestConfig(cfg);
  const responseState: OpenAiResponseState = { source: 'sse', sawDone: false };
  const provider = createOpenAICompatible({
    name: 'openaiCompatible',
    apiKey: cfg.apiKey,
    baseURL: openAiBaseUrl(cfg.baseUrl),
    transformRequestBody: (body) => {
      const transformed: Record<string, unknown> = { ...body };
      if (!cfg.messages) transformed.response_format = { type: 'json_object' };
      if (request.useMaxCompletionTokens) {
        transformed.max_completion_tokens = transformed.max_tokens;
        delete transformed.max_tokens;
      }
      return transformed;
    },
    fetch: async (input, init) => {
      const { response, release } = await fetchSdkEndpoint(input, init, signal);
      return adaptOpenAiResponse(response, release, responseState, signal);
    },
  });
  const result = streamText({
    model: provider.chatModel(cfg.model),
    system: cfg.system,
    messages: cfg.messages?.map((message) => ({
      role: message.role,
      content: message.content,
    })) ?? [{ role: 'user', content: cfg.user ?? '' }],
    maxOutputTokens: request.maxOutputTokens,
    ...(cfg.reasoning === DEFAULT_REASONING ? {} : { reasoning: cfg.reasoning }),
    maxRetries: 0,
    streamRetries: 0,
    onError: () => {},
    abortSignal: signal,
    include: { rawChunks: true },
  });

  let outcome: SdkTextStreamResult;
  try {
    outcome = await consumeSdkTextStream({
      stream: result.stream,
      signal,
      onDelta,
      onWarnings: (warnings) => assertOpenAiWarnings(warnings, cfg.reasoning),
    });
  } catch (error) {
    if (
      responseState.source === 'sse' &&
      !responseState.sawDone &&
      /ended without a finish reason/i.test(errorText(error))
    ) {
      throw new Error(`上游提前断开，响应不完整（${elapsed(startedAt)}）`);
    }
    throw error;
  }
  if (!responseState.sawDone) {
    throw new Error(`上游提前断开，响应不完整（${elapsed(startedAt)}）`);
  }
  if (outcome.finishReason !== 'stop') {
    const raw = outcome.rawFinishReason ? `，finish_reason=${outcome.rawFinishReason}` : '';
    if (outcome.finishReason === 'length') {
      throw new Error(`输出达到 token 上限并被截断（finish_reason=length${raw}），JSON 不完整`);
    }
    throw new Error(`上游未正常结束（finish_reason=${outcome.finishReason ?? 'missing'}${raw}）`);
  }
  if (!outcome.text.trim()) {
    const details = [elapsed(startedAt)];
    if (outcome.rawFinishReason) details.push(`finish_reason=${outcome.rawFinishReason}`);
    if (outcome.sawReasoning) details.push('只返回了 reasoning_content，没有最终答案');
    throw new Error(`端点返回 200，但流里没有任何文本（${details.join('，')}）`);
  }
  return outcome.text;
}
