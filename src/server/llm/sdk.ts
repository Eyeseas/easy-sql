import type { CallWarning, FinishReason, TextStreamPart, ToolSet } from 'ai';

export const UPSTREAM_TIMEOUT_MS = 180_000;

export interface JsonObject {
  [key: string]: unknown;
}

export interface EndpointResponse {
  readonly response: Response;
  readonly release: () => void;
}

export interface TrackedBodyObserver {
  readonly chunk?: (value: Uint8Array) => void;
  readonly end?: () => void;
  readonly stop?: () => boolean;
}

export interface SdkTextStreamResult {
  readonly text: string;
  readonly sawReasoning: boolean;
  readonly finishReason: FinishReason | undefined;
  readonly rawFinishReason: string | undefined;
}

export interface ConsumeSdkTextStreamOptions<TOOLS extends ToolSet> {
  readonly stream: AsyncIterable<TextStreamPart<TOOLS>>;
  readonly signal: AbortSignal;
  readonly onDelta: (delta: string) => void;
  readonly onWarnings?: (warnings: readonly CallWarning[]) => void;
  readonly onRaw?: (rawValue: unknown) => void;
}

export function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function elapsed(startedAt: number): string {
  return `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`;
}

export function errorDetail(data: JsonObject): string {
  const error = data.error;
  if (typeof error === 'string') return error;
  const nestedMessage = asObject(error)?.message;
  if (typeof nestedMessage === 'string') return nestedMessage;
  return typeof data.message === 'string' ? data.message : '';
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchSdkEndpoint(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  signal: AbortSignal,
): Promise<EndpointResponse> {
  signal.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  let released = false;
  const onAbort = (): void => controller.abort(signal.reason);
  const release = (): void => {
    if (released) return;
    released = true;
    signal.removeEventListener('abort', onAbort);
  };

  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(input, { ...init, signal: controller.signal });
    return { response, release };
  } catch (error) {
    release();
    signal.throwIfAborted();
    if (timedOut && controller.signal.aborted) {
      throw new Error(`端点请求超过 ${UPSTREAM_TIMEOUT_MS / 1000} 秒，已取消`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function responseWithTrackedBody(
  response: Response,
  release: () => void,
  signal: AbortSignal,
  observer: TrackedBodyObserver = {},
): Response {
  if (!response.body) {
    observer.end?.();
    release();
    return response;
  }

  const reader = response.body.getReader();
  let settled = false;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    signal.removeEventListener('abort', cancelReader);
    try {
      observer.end?.();
      reader.releaseLock();
    } finally {
      release();
    }
  };
  const cancelReader = (): void => {
    void reader
      .cancel(signal.reason)
      .catch(() => {})
      .finally(finish);
  };
  signal.addEventListener('abort', cancelReader, { once: true });
  if (signal.aborted) cancelReader();

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          finish();
          controller.close();
        } else {
          observer.chunk?.(chunk.value);
          controller.enqueue(chunk.value);
          if (observer.stop?.()) {
            try {
              await reader.cancel();
            } finally {
              finish();
              controller.close();
            }
          }
        }
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function readResponseText(
  response: Response,
  release: () => void,
  signal: AbortSignal,
): Promise<string> {
  const tracked = responseWithTrackedBody(response, release, signal);
  try {
    return await tracked.text();
  } finally {
    if (tracked.body && !tracked.body.locked) {
      try {
        await tracked.body.cancel();
      } catch {
        // The body is already complete or was cancelled by the request signal.
      }
    }
  }
}

export async function consumeSdkTextStream<TOOLS extends ToolSet>({
  stream,
  signal,
  onDelta,
  onWarnings,
  onRaw,
}: ConsumeSdkTextStreamOptions<TOOLS>): Promise<SdkTextStreamResult> {
  let text = '';
  let sawReasoning = false;
  let finishReason: FinishReason | undefined;
  let rawFinishReason: string | undefined;

  for await (const part of stream) {
    signal.throwIfAborted();
    switch (part.type) {
      case 'start-step':
        onWarnings?.(part.warnings);
        break;
      case 'raw':
        onRaw?.(part.rawValue);
        break;
      case 'reasoning-start':
      case 'reasoning-delta':
        sawReasoning = true;
        break;
      case 'text-delta':
        if (part.text) {
          text += part.text;
          onDelta(part.text);
        }
        break;
      case 'finish':
        finishReason = part.finishReason;
        rawFinishReason = part.rawFinishReason;
        break;
      case 'error':
        throw new Error(`端点在流里报错：${errorText(part.error)}`);
      case 'abort':
        signal.throwIfAborted();
        throw new Error('上游生成已取消');
      default:
        break;
    }
  }

  signal.throwIfAborted();
  return { text, sawReasoning, finishReason, rawFinishReason };
}
