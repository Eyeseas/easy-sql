/**
 * 天页答疑 island（issue #7、ADR-0003）：右下角悬浮按钮，点开锚定问答面板。
 * assistant-ui 只用 runtime（useLocalRuntime + 自定义 ChatModelAdapter）与
 * 无样式 primitives，样式全在 ./qa.css 手写匹配终端美学。会话内存态：面板
 * 收起不丢，刷新即清。兜底横条（data-timer-bar）可见时按钮与面板上移避让
 * （ADR-0001：横条只在计时中的会话不属于本页时出现）。
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from '@assistant-ui/react';
import { qaChatAdapter } from './chat';
import { MarkdownText } from './MarkdownText';
import { isConfigured, type GenContextDay } from '../scripts/llm';
import { openLlmSettings } from '../scripts/llmSettings';
import './qa.css';

/** 空态建议问题（静态文案，v1 交互清单）：点一下直接发送 */
function suggestionsFor(day: GenContextDay): { label: string; prompt: string }[] {
  return [
    {
      label: '大白话讲讲今天的重点',
      prompt: `用大白话讲讲《${day.title}》今天教的知识点：重点是什么、为什么业务上需要它。`,
    },
    {
      label: '今天最容易踩什么坑',
      prompt: '结合今天学的内容，说说最容易踩的坑，以及面试官常怎么追问。',
    },
    {
      label: '出一道题考考我',
      prompt: '结合今天的剧情出一道小练习考考我，先别给答案，我写完再对。',
    },
  ];
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="qa-msg is-user">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="qa-msg is-assistant">
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      <MessagePrimitive.Error>
        <div className="qa-error">
          <ErrorPrimitive.Message />
          <span className="qa-error-hint">多半是端点配置或网络的事，处理后再发一次试试。</span>
        </div>
      </MessagePrimitive.Error>
    </MessagePrimitive.Root>
  );
}

function QaThread({ day }: { day: GenContextDay }) {
  return (
    <ThreadPrimitive.Root className="qa-thread">
      <ThreadPrimitive.Viewport className="qa-viewport" autoScroll>
        <AuiIf condition={(s) => s.thread.messages.length === 0}>
          <div className="qa-empty">
            <p className="qa-empty-title">卡在哪了？问问今天的课 ——</p>
            {suggestionsFor(day).map((s) => (
              <ThreadPrimitive.Suggestion
                key={s.prompt}
                className="qa-suggestion"
                prompt={s.prompt}
                send={true}
              >
                {s.label}
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
        </AuiIf>
        <ThreadPrimitive.Messages>
          {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="qa-composer">
        <ComposerPrimitive.Input
          className="qa-input"
          rows={1}
          placeholder="问今天的课程……（Enter 发送）"
          autoFocus
        />
        <div className="qa-composer-row">
          <span className="qa-composer-hint">回答限定在已学范围内</span>
          <div className="qa-composer-actions">
            <AuiIf condition={(s) => s.thread.isRunning}>
              <ComposerPrimitive.Cancel className="btn">停止</ComposerPrimitive.Cancel>
            </AuiIf>
            <AuiIf condition={(s) => !s.thread.isRunning}>
              <ComposerPrimitive.Send className="btn">发送</ComposerPrimitive.Send>
            </AuiIf>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

/** 未配置 API key 时的引导（issue #7：按钮照常显示，面板里给入口） */
function SetupGuide() {
  return (
    <div className="qa-guide">
      <p>
        答疑和出题共用同一个端点配置。还没有填 API key —— 先去「AI 设置」配好，保存后回来接着问。
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => openLlmSettings('填好端点地址、模型和 API key 后保存')}
      >
        打开 AI 设置
      </button>
    </div>
  );
}

export default function QaIsland({ day }: { day: GenContextDay }) {
  const adapter = useMemo(() => qaChatAdapter(day), [day]);
  const runtime = useLocalRuntime(adapter);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  // 兜底横条可见时占用的底部空间（px），按钮与面板随之上移避让
  const [lift, setLift] = useState(0);

  // 兜底横条显隐（timer.ts 渲染时改 hidden 属性）→ 量出高度上移
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-timer-bar]');
    if (!bar) return;
    const update = () => setLift(bar.hidden ? 0 : bar.offsetHeight + 12);
    update();
    const observer = new MutationObserver(update);
    observer.observe(bar, { attributes: true, attributeFilter: ['hidden'] });
    return () => observer.disconnect();
  }, []);

  // 面板打开时检查配置；设置弹窗收起后复查（保存写在 localStorage，同页不触发 storage 事件）
  useEffect(() => {
    if (!open) return;
    const check = () => setConfigured(isConfigured());
    check();
    const dlg = document.querySelector<HTMLElement>('[data-llm-dialog]');
    if (!dlg) return;
    const observer = new MutationObserver(check);
    observer.observe(dlg, { attributes: true, attributeFilter: ['hidden'] });
    return () => observer.disconnect();
  }, [open]);

  return (
    <div className="qa-root" style={{ '--qa-lift': `${lift}px` } as CSSProperties}>
      {/* Provider 必须常驻、不随面板开合卸载：消息状态存在它挂载的 store 里，
          卸了就全丢。会话内存态——收起保留，刷新才清（issue #7）。 */}
      <AssistantRuntimeProvider runtime={runtime}>
        {open && (
          <section className="qa-panel" aria-label="答疑面板">
            <header className="qa-head">
              <span className="qa-head-title">答疑 · D{String(day.no).padStart(2, '0')}</span>
              <button type="button" className="qa-head-close" onClick={() => setOpen(false)}>
                收起
              </button>
            </header>
            {configured ? <QaThread day={day} /> : <SetupGuide />}
          </section>
        )}
      </AssistantRuntimeProvider>
      <button
        type="button"
        className={open ? 'qa-fab is-open' : 'qa-fab'}
        aria-expanded={open}
        aria-label={open ? '收起答疑面板' : '打开答疑面板'}
        title="答疑：问问今天的课"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '问'}
      </button>
    </div>
  );
}
