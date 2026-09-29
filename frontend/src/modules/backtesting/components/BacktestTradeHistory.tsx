import { Button, Table, Tag } from 'antd';
import type { BacktestPosition } from '../utils/stockResults';
import { reportMoney, reportTime } from '../utils/reportFormat';
import { ReportPnl } from './ReportPnl';

const outcomeColor = { Win: 'green', Loss: 'red', Breakeven: 'default', Open: 'blue', Incomplete: 'gold' } as const;

export function BacktestTradeHistory({ positions, selectedId, onSelectEvent }: {
  positions: BacktestPosition[]; selectedId?: string; onSelectEvent: (id: string) => void;
}) {
  return <section aria-label="Backtest trade history" className="bt-stock-history">
    <div className="bt-report-toolbar"><div><h3>Trade history</h3><p>Each row is one position. Expand a row for its partial exits. All times are IST.</p></div></div>
    <Table<BacktestPosition> size="small" rowKey="id" dataSource={positions} scroll={{ x: 1060 }}
      pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
      rowClassName={p => p.id === selectedId ? 'bt-selected-trade' : ''}
      locale={{ emptyText: 'No trades were executed for this stock during the test period.' }}
      expandable={{ rowExpandable: p => p.fills.length > 0, expandedRowRender: p => <div className="bt-exit-fills">
        <p>{p.quantity} initial shares · {p.soldQuantity} sold · {p.remainingQuantity} remaining</p>
        <Table size="small" pagination={false} rowKey="eventId" dataSource={p.fills.map((fill, i) => ({ ...fill, eventId: `${p.id}:exit:${i}` }))} scroll={{ x: 700 }} columns={[
          { title: 'Exit / chart', render: (_, fill) => <Button type="link" size="small" onClick={() => onSelectEvent(fill.eventId)}>{fill.reason}</Button> },
          { title: 'Exit date · IST', dataIndex: 'exitAt', render: reportTime },
          { title: 'Exit price', dataIndex: 'exit', render: reportMoney, align: 'right' },
          { title: 'Shares sold', dataIndex: 'quantity', align: 'right' },
          { title: 'Remaining', dataIndex: 'remainingQuantity', align: 'right', render: n => n ?? '—' },
          { title: 'Realized P&L', dataIndex: 'pnl', align: 'right', render: n => <ReportPnl value={n}/> },
        ]}/>
      </div> }} columns={[
        { title: 'Trade / chart', key: 'trade', width: 105, render: (_, p) => <Button type="link" size="small" disabled={!p.entryAt} onClick={() => onSelectEvent(`${p.id}:entry`)}>Trade {positions.indexOf(p) + 1}</Button> },
        { title: 'Entry date · IST', dataIndex: 'entryAt', render: reportTime, width: 170 },
        { title: 'Exit date · IST', key: 'exit', width: 170, render: (_, p) => p.outcome === 'Open' ? 'Still open at period end' : reportTime(p.exitAt) },
        { title: 'Entry price', dataIndex: 'entry', render: reportMoney, align: 'right', width: 100 },
        { title: 'Avg. exit price', dataIndex: 'averageExit', render: n => n == null ? '—' : reportMoney(n), align: 'right', width: 110 },
        { title: 'Bought / sold', key: 'quantity', align: 'right', width: 100, render: (_, p) => `${p.quantity} / ${p.soldQuantity}` },
        { title: 'Outcome', dataIndex: 'outcome', width: 110, render: outcome => <Tag color={outcomeColor[outcome as keyof typeof outcomeColor]}>{outcome}</Tag> },
        { title: 'Realized P&L', dataIndex: 'realizedPnl', align: 'right', width: 130, render: n => <ReportPnl value={n}/> },
        { title: 'Open P&L', key: 'open', align: 'right', width: 130, render: (_, p) => p.outcome === 'Open' ? <ReportPnl value={p.unrealizedPnl}/> : '—' },
      ]}/>
    <p className="bt-report-note">Average exit price is weighted by shares sold. Win or loss uses the combined realized P&L after the position fully closes. Open shares remain valued at the final replay close.</p>
  </section>;
}
