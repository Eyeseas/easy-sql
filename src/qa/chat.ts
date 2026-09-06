/**
 * 答疑的 ChatModelAdapter（issue #7、ADR-0003）：assistant-ui 只当 runtime 用，
 * 这里把它的消息历史接到 /api/llm 的对话模式（body 带 messages）上。系统提示词
 * 在适配器创建时组装一次（不随对话重发变化）；每一轮 run 会收到完整历史，
 * 由代理原样转给上游。abortSignal 直接传给 fetch，「停止」即时生效。
 */
import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react';
import { loadConfig, chatViaProxy, type ChatTurn, type GenContextDay } from '../scripts/llm';
import { buildQaSystem } from './prompt';

/** 取一条消息的纯文本（答疑只有文本回合，附件不在范围） */
function textOf(message: ThreadMessage): string {
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** 按天构造答疑适配器：当天上下文在创建时烤进系统提示词 */
export function qaChatAdapter(day: GenContextDay): ChatModelAdapter {
  const system = buildQaSystem(day);
  return {
    async *run({ messages, abortSignal }) {
      const cfg = loadConfig();
      if (!cfg.apiKey.trim()) {
        throw new Error('还没有配置 API key：点「打开 AI 设置」填好端点，保存后回来接着问');
      }

      const turns: ChatTurn[] = [];
      for (const m of messages) {
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        turns.push({ role: m.role, content: textOf(m) });
      }
      const last = turns.at(-1);
      if (!last || last.role !== 'user' || !last.content.trim()) {
        throw new Error('没有可发送的提问');
      }

      // yield 的是累计全文（assistant-ui 的约定），增量由 chatViaProxy 逐段给出
      let full = '';
      for await (const delta of chatViaProxy(cfg, system, turns, abortSignal)) {
        full += delta;
        yield { content: [{ type: 'text', text: full }] };
      }
      if (!full.trim()) throw new Error('端点没有返回内容，重试一次通常就好');
    },
  };
}
