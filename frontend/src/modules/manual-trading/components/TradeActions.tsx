import { useState } from 'react';
import { Button, Modal, Space, Tooltip } from 'antd';
import type { StockQuote } from '../../stock-details/types';
import type { ManualOverview } from '../types';
import { OrderTicket } from './OrderTicket';
import { OpenManualAccount } from './StockTradePanel';
import { inr, paise } from '../format';

/** Buy / Sell buttons beside the price. Opens the order ticket, or the account opener the first time. */
export function TradeActions({ symbol, instrumentId, quote, data, refresh, sellRequest }: {
  symbol: string; instrumentId: string; quote?: StockQuote; data?: ManualOverview; refresh: () => void; sellRequest?: number;
}) {
  const [ticket, setTicket] = useState<{ side: 'BUY' | 'SELL'; key: number }>();
  const [opening, setOpening] = useState<'BUY' | 'SELL'>();
  const [handledSell, setHandledSell] = useState(sellRequest);
  const held = data?.positions?.[0];
  const start = (side: 'BUY' | 'SELL') => { if (!data?.account) setOpening(side); else setTicket({ side, key: Date.now() }); };
  // The trades panel's "Sell" button asks this component to open the sell ticket.
  if (sellRequest !== handledSell) { setHandledSell(sellRequest); if (sellRequest && data?.account) setTicket({ side: 'SELL', key: sellRequest }); }
  return <>
    <Space className="mt-actions" wrap>
      <Button className="mt-buy-button" size="large" onClick={() => start('BUY')} disabled={!data}>Buy</Button>
      <Tooltip title={held ? undefined : 'You can sell shares you hold in the manual paper account'}>
        <Button danger type="primary" size="large" onClick={() => start('SELL')} disabled={!data || (!!data.account && !held)}>Sell</Button>
      </Tooltip>
      {data?.account && <span className="mt-cash muted">Paper cash {inr(paise(data.account.cashPaise))}</span>}
    </Space>
    {ticket && data?.account && <OrderTicket key={ticket.key} open side={ticket.side} symbol={symbol} instrumentId={instrumentId} quote={quote} account={data.account} held={held}
      onClose={() => setTicket(undefined)} onDone={refresh} />}
    <Modal open={!!opening} footer={null} onCancel={() => setOpening(undefined)} title="Manual paper trading" destroyOnHidden>
      <OpenManualAccount onOpened={() => { const side = opening!; setOpening(undefined); refresh(); setTicket({ side, key: Date.now() }); }} />
    </Modal>
  </>;
}
