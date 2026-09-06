/**
 * 答疑回答的 markdown 渲染（ADR-0003）：SQL 代码块的高亮复用站点已有的
 * prismjs 管线（token 配色在 base.css 的 .sql-code 里），不引入
 * react-syntax-highlighter。代码块的两个插槽分别接管：
 * CodeHeader（语言标签 + 复制按钮）与 SyntaxHighlighter（高亮体）。
 */
import { useState } from 'react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import type { CodeHeaderProps, SyntaxHighlighterProps } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql.js';

const sql = Prism.languages.sql;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 代码块头部：语言标签 + 复制按钮（v1 交互清单，issue #7） */
function QaCodeHeader({ language, code }: CodeHeaderProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板权限不给就算了，不影响阅读 */
    }
  };
  return (
    <div className="qa-code-head">
      <span>{language ? language.toUpperCase() : 'CODE'}</span>
      <button type="button" className="qa-copy" onClick={() => void copy()}>
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
}

/** 代码块高亮体：SQL 走 prismjs，其他语言原样转义展示 */
function QaSyntaxHighlighter({ language, code }: SyntaxHighlighterProps) {
  const html = language === 'sql' && sql ? Prism.highlight(code, sql, 'sql') : escapeHtml(code);
  return (
    <pre className="sql-code qa-code-pre">
      <code
        className={language ? `language-${language}` : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

// 模块级常量：components 引用稳定，避免 react-markdown 每次渲染都重建
const codeComponents = {
  CodeHeader: QaCodeHeader,
  SyntaxHighlighter: QaSyntaxHighlighter,
};

/**
 * 消息文本组件（MessagePrimitive.Parts 的 Text 插槽）：空文本且正在生成时
 * 显示输入中指示，其余交给 MarkdownTextPrimitive（remark-gfm 支持表格等）。
 */
export function MarkdownText({ text }: { text: string }) {
  if (!text) return <span className="qa-typing">···</span>;
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      components={codeComponents}
      className="qa-md"
    />
  );
}
