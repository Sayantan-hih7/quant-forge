import { Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import type { StockQuote } from '../types';
import { priceState, stockMoney, stockSigned, stockTime, stockTone } from '../utils/format';
export function StockPrice({ quote, connected, now, large = false }: { quote?: StockQuote; connected: boolean; now: number; large?: boolean }) {
  const state = priceState(quote, connected, now);
  return <div className={`stock-price ${large ? 'stock-price--large' : ''}`}>
    <strong>{stockMoney(quote?.price)}</strong>
    <Tooltip title={quote ? `${state} · ${stockTime(quote.lastTradeAt)} · ${quote.source.startsWith('dhan') ? 'Dhan' : 'Stored Dhan history'}` : 'A current quote has not been received for this stock.'}>
      <span className={`stock-price-state ${state === 'Live' ? 'stock-price-state--live' : ''}`}>{state === 'Live' && <i />}{state}</span>
    </Tooltip>
  </div>;
}
export function StockChange({ quote }: { quote?: StockQuote }) {
  return <div className={`stock-change ${stockTone(quote?.change)}`}>
    <strong>{quote?.change != null && quote.change !== 0 && (quote.change > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />)} {stockSigned(quote?.percent, '%')}</strong>
    <small>{quote?.change != null ? `${stockSigned(quote.change)} INR` : 'Change unavailable'}</small>
  </div>;
}
