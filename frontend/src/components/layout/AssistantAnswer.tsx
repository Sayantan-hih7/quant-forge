import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Alert, Button, Dropdown, Space } from 'antd';
import type { AgentActivity } from '../../services/aiAssistant';
import { downloadText, exportWorkbook, printAnswer, tableCsv, type ExportTable } from '../../services/assistantExports';

export default function AssistantAnswer({ text, activity }: { text: string; activity?: AgentActivity[] }) {
  const content = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const tables: ExportTable[] = (activity ?? []).flatMap(check => (check.report?.tables ?? []).map(table => ({ ...table, scope: check.report!.scope, checkedAt: check.checkedAt })));
  function exportTables(): ExportTable[] {
    if (tables.length) return tables;
    return Array.from(content.current?.querySelectorAll('.assistant-markdown table') ?? []).map((table, i) => ({
      name: `Answer table ${i + 1}`, scope: 'AI-written table; not verified application records', checkedAt: '',
      columns: Array.from(table.querySelectorAll('thead th')).map(cell => cell.textContent ?? ''),
      rows: Array.from(table.querySelectorAll('tbody tr')).map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent ?? '')),
    }));
  }
  async function run(key: string) {
    setError(''); setBusy(true);
    try {
      if (key === 'md') downloadText('quantforge-answer.md', text, 'text/markdown;charset=utf-8');
      else if (key === 'pdf' && content.current) printAnswer(content.current);
      else {
        const available = exportTables();
        if (!available.length) throw new Error('This answer has no tables to export. Ask for a report in table format.');
        if (key === 'xlsx') await exportWorkbook(available);
        else if (available.length === 1) downloadText('quantforge-table.csv', tableCsv(available[0]), 'text/csv;charset=utf-8');
        else throw new Error('For multiple tables, use Excel or download an individual source table below.');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export this answer.'); }
    finally { setBusy(false); }
  }
  return <div ref={content} className="assistant-answer">
    <div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : ''}</span>,
      a: ({ href, children }) => href && /^(https?:|mailto:)/i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      table: ({ children }) => <div className="assistant-table-scroll"><table>{children}</table></div>,
    }}>{text}</ReactMarkdown></div>
    {!!tables.length && <details className="assistant-source-tables"><summary>Source tables & downloads ({tables.length})</summary><p>Snapshots at the time checked. Blank values are unavailable. Source timestamps use ISO format; Z means UTC. Samples are not complete ledgers.</p>{tables.map((table, i) => <section key={i}><h4>{table.name}</h4><p>{table.scope} · Checked {table.checkedAt}</p><div className="assistant-table-scroll"><table><thead><tr>{table.columns.map((name, j) => <th key={j}>{name}</th>)}</tr></thead><tbody>{table.rows.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}>{cell ?? '—'}</td>)}</tr>)}</tbody></table></div><Button data-export-controls size="small" onClick={() => downloadText(`quantforge-table-${i + 1}.csv`, tableCsv(table), 'text/csv;charset=utf-8')}>Download table {i + 1} CSV</Button></section>)}</details>}
    <div data-export-controls className="assistant-answer-actions"><Space><Dropdown trigger={['click']} menu={{ items: [{ key: 'md', label: 'Markdown (.md)' }, { key: 'pdf', label: 'Print / save PDF' }, { key: 'xlsx', label: 'Tables as Excel (.xlsx)' }, { key: 'csv', label: 'Table as CSV (.csv)' }], onClick: ({ key }) => void run(key) }}><Button size="small" loading={busy}>Export answer</Button></Dropdown></Space>{error && <Alert type="warning" title={error} closable onClose={() => setError('')} />}</div>
  </div>;
}
