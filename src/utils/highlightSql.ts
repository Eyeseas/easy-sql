import Prism from 'prismjs';
import 'prismjs/components/prism-sql.js';

const sqlGrammar = (() => {
  const grammar = Prism.languages.sql;
  if (!grammar) throw new Error('Prism SQL grammar failed to load');
  return grammar;
})();

/** Prism escapes the source before adding token markup, so this is safe for set:html/innerHTML. */
export function highlightSql(source: string): string {
  return `<code class="language-sql">${Prism.highlight(source, sqlGrammar, 'sql')}</code>`;
}
