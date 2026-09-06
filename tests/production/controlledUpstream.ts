import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export type ControlledProtocol = 'anthropic' | 'openai' | 'codex';

export interface ControlledRequest {
  readonly protocol: ControlledProtocol;
  readonly model: string;
  readonly body: Record<string, unknown>;
  readonly headers: IncomingHttpHeaders;
  readonly path: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function protocolFromPath(path: string): ControlledProtocol | null {
  if (path.endsWith('/messages')) return 'anthropic';
  if (path.endsWith('/chat/completions')) return 'openai';
  if (path.endsWith('/responses')) return 'codex';
  return null;
}

function anthropicEvent(event: Record<string, unknown>): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

function exerciseText(protocol: ControlledProtocol): string {
  return JSON.stringify({
    exercises: [
      {
        task: `${protocol} 生产验收题`,
        hint: '检查受控出站记录',
        referenceSql: 'SELECT 1;',
        checkpoint: '返回一行',
      },
    ],
  });
}

function isGeneration(protocol: ControlledProtocol, body: Record<string, unknown>): boolean {
  if (protocol === 'openai') return body.response_format !== undefined;
  const system = protocol === 'codex' ? body.instructions : body.system;
  return JSON.stringify(system).includes('出练习题');
}

function successText(protocol: ControlledProtocol, body: Record<string, unknown>): string {
  return isGeneration(protocol, body) ? exerciseText(protocol) : `${protocol} 受控答疑完成`;
}

function successJson(protocol: ControlledProtocol, model: string, text: string): unknown {
  if (protocol === 'anthropic') {
    return {
      id: 'msg_controlled',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  }
  if (protocol === 'openai') {
    return {
      id: 'chatcmpl_controlled',
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    };
  }
  return {
    id: 'resp_controlled',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
  };
}

function sendSuccessSse(
  protocol: ControlledProtocol,
  model: string,
  text: string,
  response: ServerResponse,
): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  if (protocol === 'anthropic') {
    response.end(
      [
        {
          type: 'message_start',
          message: {
            id: 'msg_controlled',
            type: 'message',
            role: 'assistant',
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 1 },
        },
        { type: 'message_stop' },
      ]
        .map(anthropicEvent)
        .join(''),
    );
    return;
  }
  if (protocol === 'openai') {
    response.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n',
    );
    return;
  }
  response.end(
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n` +
      `data: ${JSON.stringify({ type: 'response.completed', response: successJson('codex', model, text) })}\n\n`,
  );
}

export class ControlledUpstream {
  readonly requests: ControlledRequest[] = [];
  readonly closedStreams = new Map<string, number>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private server: Server | null = null;
  baseUrl = '';

  count(protocol: ControlledProtocol, model: string): number {
    return this.requests.filter(
      (request) => request.protocol === protocol && request.model === model,
    ).length;
  }

  closeCount(model: string): number {
    return this.closedStreams.get(model) ?? 0;
  }

  async start(): Promise<void> {
    this.server = createServer(async (request, response) => {
      const path = request.url ?? '';
      const protocol = protocolFromPath(path);
      if (!protocol) {
        response.writeHead(404).end();
        return;
      }

      let rawBody = '';
      for await (const chunk of request) rawBody += String(chunk);
      const body = asObject(JSON.parse(rawBody)) ?? {};
      const model = typeof body.model === 'string' ? body.model : '';
      this.requests.push({ protocol, model, body, headers: request.headers, path });

      const markClosed = (): void => {
        this.closedStreams.set(model, this.closeCount(model) + 1);
      };

      if (model === 'acceptance-headers-timeout') {
        response.on('close', markClosed);
        return;
      }

      if (model.startsWith('acceptance-cancel-before-headers')) {
        response.on('close', markClosed);
        return;
      }

      if (model.startsWith('acceptance-cancel')) {
        const isBrowserRetry =
          model === 'acceptance-cancel-browser' && this.count(protocol, model) > 1;
        if (!isBrowserRetry) {
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            connection: 'keep-alive',
          });
          response.on('close', markClosed);
          if (protocol === 'anthropic') {
            response.write(
              anthropicEvent({
                type: 'message_start',
                message: {
                  id: 'msg_cancel',
                  type: 'message',
                  role: 'assistant',
                  content: [],
                  model,
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 1, output_tokens: 0 },
                },
              }),
            );
          } else if (protocol === 'openai') {
            response.write('data: {"choices":[{"delta":{"reasoning_content":"held"}}]}\n\n');
          } else {
            response.write(
              'data: {"type":"response.reasoning_summary_text.delta","delta":"held"}\n\n',
            );
            if (model === 'acceptance-cancel-browser') {
              const timer = setTimeout(() => {
                this.timers.delete(timer);
                response.end(
                  'data: {"type":"response.output_text.delta","delta":"stale canceled text"}\n\n' +
                    `data: ${JSON.stringify({
                      type: 'response.completed',
                      response: successJson(protocol, model, 'stale canceled text'),
                    })}\n\n`,
                );
              }, 2_000);
              this.timers.add(timer);
            }
          }
          return;
        }
      }

      if (model === 'acceptance-keepalive') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        response.write('data: {"choices":[{"delta":{"reasoning_content":"not exposed"}}]}\n\n');
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          response.end(
            'data: {"choices":[{"delta":{"content":"keepalive complete"}}]}\n\n' +
              'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
              'data: [DONE]\n\n',
          );
        }, 16_000);
        this.timers.add(timer);
        return;
      }

      if (model === 'acceptance-disconnect') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          connection: 'keep-alive',
        });
        response.write(
          protocol === 'codex'
            ? 'data: {"type":"response.output_text.delta","delta":"partial"}\n\n'
            : protocol === 'openai'
              ? 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
              : anthropicEvent({
                  type: 'message_start',
                  message: {
                    id: 'msg_disconnect',
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 1, output_tokens: 0 },
                  },
                }),
        );
        response.socket?.destroy();
        return;
      }

      if (model === 'acceptance-json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(successJson(protocol, model, `${protocol} JSON fallback`)));
        return;
      }

      if (model === 'acceptance-http200-error' || model === 'acceptance-ui-error') {
        const message =
          model === 'acceptance-ui-error'
            ? `controlled-${'very-long-error-'.repeat(30)}`
            : 'controlled HTTP 200 error';
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message } }));
        return;
      }

      if (model === 'acceptance-truncated') {
        const data =
          protocol === 'anthropic'
            ? {
                ...(asObject(successJson(protocol, model, 'partial')) ?? {}),
                stop_reason: 'max_tokens',
              }
            : protocol === 'openai'
              ? {
                  ...(asObject(successJson(protocol, model, 'partial')) ?? {}),
                  choices: [
                    {
                      message: { role: 'assistant', content: 'partial' },
                      finish_reason: 'length',
                    },
                  ],
                }
              : {
                  ...(asObject(successJson(protocol, model, 'partial')) ?? {}),
                  status: 'incomplete',
                  incomplete_details: { reason: 'max_output_tokens' },
                };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(data));
        return;
      }

      if (model === 'acceptance-empty' || model === 'acceptance-reasoning-only') {
        const reasoningOnly = model === 'acceptance-reasoning-only';
        const data =
          protocol === 'anthropic'
            ? {
                ...(asObject(successJson(protocol, model, '')) ?? {}),
                content: reasoningOnly ? [{ type: 'thinking', thinking: 'private' }] : [],
              }
            : protocol === 'openai'
              ? {
                  ...(asObject(successJson(protocol, model, '')) ?? {}),
                  choices: [
                    {
                      message: {
                        role: 'assistant',
                        content: '',
                        ...(reasoningOnly ? { reasoning_content: 'private' } : {}),
                      },
                      finish_reason: 'stop',
                    },
                  ],
                }
              : {
                  ...(asObject(successJson(protocol, model, '')) ?? {}),
                  output: reasoningOnly ? [{ type: 'reasoning', summary: [] }] : [],
                };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(data));
        return;
      }

      if (model === 'acceptance-missing-terminator') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
        });
        if (protocol === 'anthropic') {
          response.end(
            [
              {
                type: 'message_start',
                message: {
                  id: 'msg_missing',
                  type: 'message',
                  role: 'assistant',
                  content: [],
                  model,
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 1, output_tokens: 0 },
                },
              },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              },
              {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'partial' },
              },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: 1 },
              },
            ]
              .map(anthropicEvent)
              .join(''),
          );
        } else if (protocol === 'openai') {
          response.end(
            'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' +
              'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          );
        } else {
          response.end('data: {"type":"response.output_text.delta","delta":"partial"}\n\n');
        }
        return;
      }

      if (model === 'acceptance-completed-only' && protocol === 'codex') {
        const text = 'codex completed-only fallback';
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
        response.end(
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: successJson(protocol, model, text),
          })}\n\n`,
        );
        return;
      }

      const text = successText(protocol, body);
      if (model === 'claude-opus-5' && protocol === 'anthropic' && !isGeneration(protocol, body)) {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          sendSuccessSse(protocol, model, text, response);
        }, 3_000);
        this.timers.add(timer);
        return;
      }
      sendSuccessSse(protocol, model, text, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, '127.0.0.1', resolve);
    });
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }
}
