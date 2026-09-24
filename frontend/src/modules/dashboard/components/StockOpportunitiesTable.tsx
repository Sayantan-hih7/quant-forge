import { Button, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { StockOpportunity } from '../types/opportunities';
import { formatPrice } from '../utils/stockOpportunities';

export function StockOpportunitiesTable({ rows, onReview }: {
  rows: StockOpportunity[]; onReview: (opportunity: StockOpportunity) => void;
}) {
  const columns: ColumnsType<StockOpportunity> = [
    { title: 'Stock / strategy', key: 'stock', width: 230, sorter: (a, b) => a.symbol.localeCompare(b.symbol), render: (_, row) => <div className="opportunity-stock"><strong>{row.symbol} <Tag color={row.risk === 'Low' ? 'cyan' : row.risk === 'Medium' ? 'gold' : 'red'}>{row.risk[0]}</Tag></strong><small>{row.name}</small><small className="opportunity-strategy">{row.strategy}</small></div> },
    { title: 'LTP', dataIndex: 'ltp', width: 105, align: 'right', sorter: (a, b) => a.ltp - b.ltp, render: (_, row) => <div className="opportunity-price">{formatPrice(row.ltp)}<small className={row.changePercent >= 0 ? 'positive' : 'negative'}>{row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%</small></div> },
    { title: 'Entry', dataIndex: 'entry', width: 105, align: 'right', render: (_, row) => <div className="opportunity-price">{formatPrice(row.entry)}<small className={row.side === 'BUY' ? 'positive' : 'negative'}>{row.side}</small></div> },
    { title: 'Stop-loss', dataIndex: 'stopLoss', width: 105, align: 'right', render: (value) => <span className="opportunity-price negative">{formatPrice(value)}</span> },
    { title: 'Target', dataIndex: 'target', width: 105, align: 'right', render: (_, row) => <div className="opportunity-price positive">{formatPrice(row.target)}<small className="reward-risk">1 : {row.rewardRisk.toFixed(2)}</small></div> },
    { title: 'Potential', dataIndex: 'upside', width: 85, align: 'right', sorter: (a, b) => a.upside - b.upside, render: (value: number) => <span className="positive opportunity-price">{value.toFixed(2)}%</span> },
    { title: 'Action', key: 'action', width: 100, align: 'center', render: (_, row) => <Button size="small" onClick={() => onReview(row)} aria-label={`Review ${row.symbol} alert`}>Review alert</Button> },
  ];
  return <Table<StockOpportunity> className="stock-opportunities-table" rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `${total} ready buy alerts` }} size="small" scroll={{ x: 835 }} locale={{ emptyText: 'No ready buy alerts. Start monitoring in Signal Runner, or adjust these filters.' }} />;
}
