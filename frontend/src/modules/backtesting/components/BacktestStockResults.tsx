import { useState } from 'react';
import { Input, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { StockChartButton } from '../../stock-details/components/StockChartButton';
import type { BacktestStockResult } from '../utils/stockResults';
import { ReportPnl } from './ReportPnl';

export function BacktestStockResults({ stocks, onSelect }: { stocks: BacktestStockResult[]; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState(''), [scope, setScope] = useState('All stocks');
  const filtered = stocks.filter(stock => (scope === 'All stocks' || stock.totalTrades > 0) &&
    `${stock.symbol} ${stock.instrumentId}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section aria-label="Stock-wise backtest results">
    <div className="bt-report-toolbar"><div><h3>Performance by stock</h3><p>Click a stock to see its candles, indicators and trade history.</p></div>
      <Space wrap><Input aria-label="Search backtest stocks" placeholder="Search stocks" prefix={<SearchOutlined />} allowClear value={search} onChange={e => setSearch(e.target.value)} />
        <Segmented aria-label="Backtest stock filter" options={['All stocks', 'With trades']} value={scope} onChange={setScope}/></Space>
    </div>
    <Table<BacktestStockResult> className="bt-stock-results" size="small" rowKey="instrumentId" dataSource={filtered}
      pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false, showTotal: count => `${count} stocks` }} scroll={{ x: 980 }}
      onRow={stock => ({ onClick: () => onSelect(stock.instrumentId), className: 'bt-clickable-row' })}
      locale={{ emptyText: 'No stocks match this view.' }} columns={[
        { title: 'Stock', key: 'symbol', fixed: 'left', width: 170, sorter: (a, b) => a.symbol.localeCompare(b.symbol), render: (_, stock) => <div>
          <StockChartButton symbol={stock.symbol} onClick={() => onSelect(stock.instrumentId)} />
          <div className="bt-stock-caption">{stock.instrumentId.split(':')[0]}{!stock.totalTrades ? ' · No trades' : ''}{stock.incomplete > 0 && <Tag color="gold">Incomplete history</Tag>}</div>
        </div> },
        { title: <Tooltip title="Realized P&L plus the value of shares still open at the end of this backtest. Costs are included.">Period P&L</Tooltip>, key: 'totalPnl', align: 'right', width: 140, defaultSortOrder: 'descend', sorter: (a, b) => a.totalPnl - b.totalPnl, render: (_, s) => <ReportPnl value={s.totalPnl}/> },
        { title: 'Realized P&L', key: 'realized', align: 'right', width: 135, render: (_, s) => <ReportPnl value={s.realizedPnl}/> },
        { title: <Tooltip title="Unrealized P&L at the last replay close, not today's price.">Open P&L</Tooltip>, key: 'open', align: 'right', width: 130, render: (_, s) => s.openQuantity ? <ReportPnl value={s.unrealizedPnl}/> : '—' },
        { title: <Tooltip title="Number of entries, including positions still open. Partial exits belong to the same trade.">Trades</Tooltip>, key: 'trades', align: 'right', width: 85, sorter: (a, b) => a.totalTrades - b.totalTrades, render: (_, s) => s.totalTrades },
        { title: 'Closed', dataIndex: 'closedTrades', align: 'right', width: 75 },
        { title: 'Win rate', key: 'winRate', align: 'right', width: 110, sorter: (a, b) => (a.winRate ?? -1) - (b.winRate ?? -1), render: (_, s) => s.winRate == null ? '—' : `${s.winRate.toFixed(1)}%` },
        { title: <Tooltip title="Winning / losing / breakeven completed trades, after combining all partial exits and costs.">W / L / BE</Tooltip>, key: 'outcomes', align: 'center', width: 100, render: (_, s) => `${s.wins} / ${s.losses} / ${s.breakeven}` },
        { title: 'Open shares', dataIndex: 'openQuantity', align: 'right', width: 100 },
      ]}/>
    <p className="bt-report-note">Win rate = winning completed trades ÷ all completed trades. Partial exits count as one trade; open positions are excluded. P&L includes the backtest’s fees and slippage.</p>
  </section>;
}
