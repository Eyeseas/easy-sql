/**
 * 提示词共用的文本清洗与小讲义展开。出题（scripts/llm 的 buildPrompt）与
 * 答疑（qa/prompt 的 buildQaSystem）两个 LLM 功能共用，见 CONTEXT.md。
 */
import { learnTitle, type LearnEntry } from '../types/curriculum';

/**
 * 课程文案里带 <code>/<b> 标签和 HTML 实体，喂给模型前都处理掉：省 token、
 * 避免它学着输出 HTML，也避免 SQL 里的 &gt; 之类实体干扰语义。
 */
export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // amp 最后解，避免「&amp;gt;」二次解码成 '>'
}

/**
 * 小讲义展开成一行文字：标题 + 场景 + 讲解 + 示例 SQL + 易错点。示例 SQL 是
 * 「今天教了什么语法」最直接的证据，带上它回答/出题的语法水平才能对齐当天进度。
 */
export function learnForPrompt(x: LearnEntry): string {
  if (typeof x === 'string') return stripTags(x);
  const parts = [stripTags(learnTitle(x))];
  if (x.scene) parts.push(`场景：${stripTags(x.scene)}`);
  parts.push(stripTags(x.body));
  if (x.sql) parts.push(`示例：${stripTags(x.sql.replace(/\s+/g, ' '))}`);
  if (x.pitfall) parts.push(`易错：${stripTags(x.pitfall)}`);
  return parts.join(' ');
}
