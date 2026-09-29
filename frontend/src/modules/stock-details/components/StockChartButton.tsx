import { LineChartOutlined } from '@ant-design/icons';
export function StockChartButton({ symbol, onClick }: { symbol: string; onClick: () => void }) {
  return <button className="stock-symbol-button stock-chart-button" aria-label={`View ${symbol} chart`} onClick={onClick}>{symbol}<LineChartOutlined aria-hidden /></button>;
}
