import type { SourceReport } from './aiAssistant';
export type ExportTable = SourceReport['tables'][number] & { scope: string; checkedAt: string };
export function downloadText(name: string, content: string, type: string) {
  downloadBlob(name, new Blob([content], { type }));
}
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function tableCsv(table: ExportTable) {
  return '\ufeff' + [[...table.columns, 'Source scope', 'Checked at (ISO timestamp)'], ...table.rows.map(row => [...row, table.scope, table.checkedAt])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export async function exportWorkbook(tables: ExportTable[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const notes = workbook.addWorksheet('Read me');
  notes.addRows([['QuantForge report'], ['Blank cells mean unavailable. Timestamps retain their source timezone (Z means UTC).'], ['Source tables are snapshots; samples are not complete ledgers. AI-written tables are not verified records.'], ['Table', 'Scope', 'Checked at']]);
  tables.forEach((table, i) => {
    const sheet = workbook.addWorksheet(`${i + 1} ${table.name}`.replace(/[\\/*?:[\]]/g, '').slice(0, 31));
    sheet.addRow(table.columns); sheet.addRows(table.rows); sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach(column => { column.width = 23; });
    notes.addRow([sheet.name, table.scope, table.checkedAt]);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob('quantforge-report.xlsx', new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
export function printAnswer(element: HTMLElement) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow the print window to open, then try again.');
  popup.document.title = 'QuantForge report';
  const style = popup.document.createElement('style');
  style.textContent = 'body{font:14px Arial,sans-serif;margin:28px;color:#111}table{border-collapse:collapse;width:100%;font-size:11px;overflow-wrap:anywhere}td,th{border:1px solid #bbb;padding:6px;text-align:left}pre{white-space:pre-wrap}button,select,.ant-collapse-expand-icon{display:none}details{display:block}@page{size:landscape;margin:12mm}h2,h3{break-after:avoid}tr{break-inside:avoid}';
  popup.document.head.append(style);
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-export-controls]').forEach(node => node.remove());
  clone.querySelectorAll('details').forEach(node => node.open = true);
  popup.document.body.append(clone);
  popup.focus(); setTimeout(() => popup.print(), 200);
}
