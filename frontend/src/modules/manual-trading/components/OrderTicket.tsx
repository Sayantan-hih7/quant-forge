import { useMemo, useState } from 'react';
import { Alert, App, Button, Divider, Drawer, Form, InputNumber, Radio, Segmented, Select, Space, Switch, Tag, Tooltip } from 'antd';
import { DeleteOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { FormProvider, useForm } from 'react-hook-form';
import { apiClient } from '../../../services/apiClient';
import { ConditionGroupsEditor } from '../../qualification/components/ConditionGroupsEditor';
import { defaultCondition } from '../../qualification/config/metrics';
import type { RuleDefinition } from '../../qualification/types';
import type { StockQuote } from '../../stock-details/types';
import type { ManualAccount, ManualOverview, Product, StopMode } from '../types';
import { inr } from '../format';
import '../../../styles/manual-trading.css';

type Side = 'BUY' | 'SELL';
type OrderType = 'market' | 'limit' | 'stop';
type QtyMode = 'shares' | 'amount' | 'risk';
type Cadence = '1m' | '5m' | '15m' | 'daily';
interface TargetRow { value: number | null; sellPercent: number }
const FEE = { delivery: 0.12, intraday: 0.05 } as const;
const frameFor = (cadence: Cadence) => (cadence === 'daily' ? '1d' : cadence);

/** Groww-style buy/sell ticket with the protection and conditional execution traders actually need. */
export function OrderTicket({ open, side: initialSide, symbol, instrumentId, quote, account, held, onClose, onDone }: {
  open: boolean; side: Side; symbol: string; instrumentId: string; quote?: StockQuote; account: ManualAccount;
  held?: NonNullable<ManualOverview['positions']>[number]; onClose: () => void; onDone: () => void;
}) {
  const { message } = App.useApp();
  const [side, setSide] = useState<Side>(initialSide);
  const [product, setProduct] = useState<Product>('delivery');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState<number | null>(null), [triggerPrice, setTriggerPrice] = useState<number | null>(null);
  const [qtyMode, setQtyMode] = useState<QtyMode>('shares'), [qtyValue, setQtyValue] = useState<number | null>(initialSide === 'SELL' ? held?.quantity ?? 1 : 1);
  const [stopMode, setStopMode] = useState<StopMode>('percent'), [stopValue, setStopValue] = useState<number | null>(2);
  const [targetUnit, setTargetUnit] = useState<'percent' | 'price'>('percent'), [targets, setTargets] = useState<TargetRow[]>([{ value: 4, sellPercent: 100 }]);
  const [breakeven, setBreakeven] = useState<'off' | 'target1' | 'profit1R'>('off'), [trailing, setTrailing] = useState<'off' | 'afterTarget1' | 'after1R'>('off');
  const [when, setWhen] = useState<'now' | 'condition'>('now'), [cadence, setCadence] = useState<Cadence>('15m'), [validity, setValidity] = useState<'day' | '7d' | '30d' | '90d'>('day');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [submitting, setSubmitting] = useState(false), [error, setError] = useState<string>();
  const condition = useForm<RuleDefinition>({ defaultValues: { name: 'Condition', description: '', tier: 'tactical', horizon: 'swing', side: 'BUY', cadence: 'daily', logic: 'AND',
    groups: [{ logic: 'AND', conditions: [{ ...defaultCondition, left: 'rsi', leftFrame: '15m', operator: 'crossAbove', value: 30 }] }] } as unknown as RuleDefinition });

  const buy = side === 'BUY';
  const live = quote?.price ?? null;
  // The price the order is expected to fill near: the limit/trigger when set, otherwise the live price.
  const ref = orderType === 'limit' ? limitPrice : orderType === 'stop' ? triggerPrice : live;
  const stopPrice = !ref || stopValue == null ? null : stopMode === 'percent' || stopMode === 'trailing' ? ref * (1 - stopValue / 100) : stopMode === 'price' ? stopValue : null;
  const riskPerShare = ref && stopPrice != null ? ref - stopPrice : null;
  const cash = account.cashPaise / 100;
  const shares = useMemo(() => {
    if (!buy) return Math.floor(qtyValue ?? 0);
    if (qtyMode === 'shares') return Math.floor(qtyValue ?? 0);
    if (!ref || !qtyValue) return 0;
    if (qtyMode === 'amount') return Math.floor(qtyValue / (ref * (1 + FEE[product] / 100)));
    return riskPerShare && riskPerShare > 0 ? Math.floor(qtyValue / riskPerShare) : 0;
  }, [buy, qtyMode, qtyValue, ref, riskPerShare, product]);
  const value = ref ? shares * ref : null, fees = value ? value * FEE[product] / 100 : null;
  const targetPrices = targets.map(t => t.value == null || !ref ? null : targetUnit === 'percent' ? ref * (1 + t.value / 100) : t.value);
  const firstTarget = targetPrices[0];
  const rewardRisk = firstTarget && riskPerShare && riskPerShare > 0 ? (firstTarget - (ref ?? 0)) / riskPerShare : null;

  const problems: string[] = [];
  if (shares < 1) problems.push(buy ? 'Quantity works out to less than 1 share' : 'Choose at least 1 share');
  if (!buy && held && shares > held.quantity) problems.push(`You hold ${held.quantity} shares`);
  if (!buy && !held) problems.push(`You don't hold ${symbol}`);
  if (orderType === 'limit' && !limitPrice) problems.push('Enter a limit price');
  if (orderType === 'stop' && !triggerPrice) problems.push('Enter a trigger price');
  if (buy) {
    if (value && value + (fees ?? 0) > cash) problems.push(`Needs about ${inr(value + (fees ?? 0))}; ${inr(cash)} available`);
    if (stopValue == null) problems.push('Set a stop-loss');
    if (stopPrice != null && ref && stopPrice >= ref) problems.push('The stop-loss must be below the buy price');
    if (targets.length) {
      if (targets.some(t => t.value == null)) problems.push('Enter every target value');
      if (targets.reduce((s, t) => s + t.sellPercent, 0) !== 100) problems.push('Target sell % must add up to 100%');
      if (targetPrices.some((p, i) => p != null && ((ref != null && p <= ref) || (i > 0 && targetPrices[i - 1] != null && p <= targetPrices[i - 1]!)))) problems.push('Targets must be above the buy price and increasing');
    }
    if ((breakeven === 'target1' || trailing === 'afterTarget1') && targets.length < 2) problems.push('Moving the stop after Target 1 needs at least two targets');
  }
  if (when === 'now' && orderType === 'market' && !live) problems.push('Waiting for a live price');

  const setTargetRow = (index: number, patch: Partial<TargetRow>) => setTargets(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addTarget = () => setTargets(rows => {
    if (rows.length >= 3) return rows;
    const each = Math.floor(100 / (rows.length + 1));
    const next = [...rows, { value: null, sellPercent: 0 }].map((row, i, all) => ({ ...row, sellPercent: i === all.length - 1 ? 100 - each * (all.length - 1) : each }));
    return next;
  });

  async function submit() {
    setError(undefined);
    const protection = buy ? { stop: { mode: stopMode, value: stopValue! }, targets: targets.map(t => ({ basis: targetUnit, value: t.value!, sellPercent: t.sellPercent })), breakeven, trailing } : undefined;
    setSubmitting(true);
    try {
      if (when === 'now') {
        await apiClient.post('/paper/manual/orders', { id: requestId, instrumentId, side, product, quantity: shares, orderType,
          ...(orderType === 'limit' ? { limitPrice } : {}), ...(orderType === 'stop' ? { triggerPrice } : {}), ...(protection ? { protection } : {}) });
        message.success(`${buy ? 'Buy' : 'Sell'} order placed for ${shares} × ${symbol}. It fills on the next live price.`);
      } else {
        const rule = condition.getValues();
        await apiClient.post('/paper/manual/triggers', { instrumentId, side, product, quantity: shares, cadence, validity, ...(protection ? { protection } : {}),
          rule: { logic: rule.logic, groups: rule.groups } });
        message.success(`Condition saved. ${buy ? 'Buys' : 'Sells'} ${shares} × ${symbol} when it is met on a completed ${cadence === 'daily' ? 'daily' : cadence} candle.`);
      }
      setRequestId(crypto.randomUUID()); onDone(); onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  }

  return <Drawer open={open} onClose={onClose} size={480} title={<div className="mt-ticket-title"><strong>{symbol}</strong><span>{live ? inr(live) : 'Waiting for price'}</span>
    {quote?.percent != null && <span className={quote.percent >= 0 ? 'positive' : 'negative'}>{quote.percent >= 0 ? '+' : ''}{quote.percent.toFixed(2)}%</span>}</div>}
    footer={<div className="mt-ticket-footer">
      <div className="mt-ticket-summary">{shares > 0 && value ? <>{shares} shares · ≈ {inr(value)}{buy && fees ? <span className="muted"> + ≈ {inr(fees)} charges</span> : null}</> : <span className="muted">Set a quantity</span>}
        <span className="muted">Paper cash {inr(cash)}</span></div>
      <Button type="primary" size="large" block danger={!buy} className={buy ? 'mt-buy-button' : undefined} disabled={!!problems.length} loading={submitting} onClick={() => { void submit(); }}>
        {when === 'condition' ? `Save ${buy ? 'buy' : 'sell'} condition` : `${buy ? 'Buy' : 'Sell'} ${shares > 0 ? shares : ''} ${symbol}`}
      </Button></div>}>
    <Segmented<Side> block size="large" className={`mt-side mt-side-${side.toLowerCase()}`} value={side} onChange={v => { setSide(v); setQtyValue(v === 'SELL' ? held?.quantity ?? 1 : 1); setQtyMode('shares'); }}
      options={[{ label: 'Buy', value: 'BUY' }, { label: `Sell${held ? ` · ${held.quantity} held` : ''}`, value: 'SELL', disabled: !held }]} />
    <Form layout="vertical" requiredMark={false} className="mt-ticket">
      {buy && <Form.Item label="Product"><Segmented<Product> block value={product} onChange={setProduct} options={[{ label: 'Delivery (hold overnight)', value: 'delivery' }, { label: 'Intraday (auto-exit 3:15 PM)', value: 'intraday' }]} /></Form.Item>}
      <Form.Item label="When">
        <Radio.Group value={when} onChange={e => setWhen(e.target.value)}><Radio.Button value="now">Now</Radio.Button><Radio.Button value="condition">When a condition is met</Radio.Button></Radio.Group>
      </Form.Item>
      {when === 'now' && <Form.Item label="Order type" extra={orderType === 'market' ? 'Fills on the next live price (+0.05% assumed slippage).' : orderType === 'limit' ? `${buy ? 'Buys at this price or lower' : 'Sells at this price or higher'}, valid till market close today.` : `${buy ? 'Buys once the price rises to the trigger (breakout)' : 'Sells once the price falls to the trigger'}, valid till close today.`}>
        <Segmented<OrderType> block value={orderType} onChange={setOrderType} options={[{ label: 'Market', value: 'market' }, { label: 'Limit', value: 'limit' }, { label: buy ? 'Stop (breakout)' : 'Stop', value: 'stop' }]} />
      </Form.Item>}
      {when === 'now' && orderType === 'limit' && <Form.Item label="Limit price (₹)"><InputNumber style={{ width: '100%' }} min={0.01} precision={2} value={limitPrice} onChange={setLimitPrice} placeholder={live?.toFixed(2)} /></Form.Item>}
      {when === 'now' && orderType === 'stop' && <Form.Item label="Trigger price (₹)"><InputNumber style={{ width: '100%' }} min={0.01} precision={2} value={triggerPrice} onChange={setTriggerPrice} placeholder={live?.toFixed(2)} /></Form.Item>}
      {when === 'condition' && <div className="mt-condition">
        <Alert type="info" showIcon title={`${buy ? 'Buy' : 'Sell'} automatically when all of these are true`} description="Checked on every completed candle after you save it, using the same engine as strategies. Executes once as a market order; your stop-loss and targets apply from the fill." />
        <Space wrap className="mt-condition-settings">
          <span>Candle</span><Select<Cadence> value={cadence} style={{ width: 120 }} onChange={v => { setCadence(v); if (v === 'daily' && product === 'intraday') setProduct('delivery'); }}
            options={[{ value: '1m', label: '1 minute' }, { value: '5m', label: '5 minutes' }, { value: '15m', label: '15 minutes' }, { value: 'daily', label: 'Daily', disabled: product === 'intraday' }]} />
          <span>Valid for</span><Select value={validity} style={{ width: 130 }} onChange={setValidity}
            options={[{ value: 'day', label: 'Today' }, ...(product === 'intraday' ? [] : [{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }])]} />
        </Space>
        <p className="muted">Use {frameFor(cadence)} candles in your conditions to match the checking candle.</p>
        <FormProvider {...condition}><ConditionGroupsEditor tier="tactical" initialCondition={{ ...defaultCondition, left: 'rsi', leftFrame: frameFor(cadence), operator: buy ? 'crossAbove' : 'crossBelow', value: buy ? 30 : 70 } as never} /></FormProvider>
      </div>}

      <Divider titlePlacement="start" plain>Quantity</Divider>
      {buy && <Segmented<QtyMode> block value={qtyMode} onChange={v => { setQtyMode(v); setQtyValue(v === 'shares' ? 1 : v === 'amount' ? 10000 : 500); }}
        options={[{ label: 'Shares', value: 'shares' }, { label: 'Amount ₹', value: 'amount' }, { label: <Tooltip title="Buys as many shares as keep the loss at your stop-loss within this amount">Max loss ₹ <InfoCircleOutlined /></Tooltip>, value: 'risk', disabled: stopMode === 'atr' }]} />}
      <Space className="mt-qty" align="center" wrap>
        <InputNumber min={1} precision={qtyMode === 'shares' || !buy ? 0 : 2} value={qtyValue} onChange={setQtyValue} style={{ width: 160 }} prefix={buy && qtyMode !== 'shares' ? '₹' : undefined} />
        {buy && qtyMode !== 'shares' && <Tag>= {shares} shares</Tag>}
        {!buy && held && <><Button size="small" onClick={() => setQtyValue(Math.max(1, Math.floor(held.quantity / 2)))}>Half</Button><Button size="small" onClick={() => setQtyValue(held.quantity)}>All {held.quantity}</Button></>}
      </Space>

      {buy && <>
        <Divider titlePlacement="start" plain>Stop-loss <Tag color="red" bordered={false}>required</Tag></Divider>
        <Space.Compact block>
          <Select<StopMode> value={stopMode} style={{ width: 170 }} onChange={v => { setStopMode(v); setStopValue(v === 'price' ? (ref ? +(ref * 0.98).toFixed(2) : null) : v === 'atr' ? 2 : 2); if (v === 'atr' && qtyMode === 'risk') setQtyMode('shares'); if (v === 'trailing') setTrailing('off'); }}
            options={[{ value: 'percent', label: '% below buy' }, { value: 'price', label: 'At price ₹' }, { value: 'atr', label: '× ATR (volatility)' }, { value: 'trailing', label: 'Trailing %' }]} />
          <InputNumber style={{ width: '100%' }} min={0.1} precision={2} value={stopValue} onChange={setStopValue} />
        </Space.Compact>
        <p className="mt-hint">{stopMode === 'atr' ? `Stop is set at fill: ${stopValue ?? '—'}× the 14-day ATR below the buy price.` : stopPrice != null && ref ? <>Stop ≈ <strong>{inr(stopPrice)}</strong> ({((stopPrice / ref - 1) * 100).toFixed(2)}%) · risk ≈ <strong>{inr((ref - stopPrice) * shares)}</strong> on {shares} shares{stopMode === 'trailing' ? ' · then follows the highest price' : ''}</> : 'Enter a price to preview the stop.'}</p>

        <Divider titlePlacement="start" plain>Targets <span className="muted">(optional, up to 3)</span></Divider>
        {targets.length > 0 && <Segmented<'percent' | 'price'> size="small" value={targetUnit} onChange={v => { setTargetUnit(v); setTargets(rows => rows.map(r => ({ ...r, value: null }))); }} options={[{ label: '% above buy', value: 'percent' }, { label: 'Price ₹', value: 'price' }]} />}
        {targets.map((t, i) => <div className="mt-target-row" key={i}>
          <span className="mt-target-label">T{i + 1}</span>
          <InputNumber min={0.01} precision={2} value={t.value} onChange={v => setTargetRow(i, { value: v })} prefix={targetUnit === 'price' ? '₹' : undefined} suffix={targetUnit === 'percent' ? '%' : undefined} style={{ width: 130 }} />
          <InputNumber min={1} max={100} precision={0} value={t.sellPercent} onChange={v => setTargetRow(i, { sellPercent: v ?? 0 })} suffix="% sell" style={{ width: 120 }} />
          <span className="muted">{targetPrices[i] != null ? inr(targetPrices[i]!) : ''}</span>
          <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Remove target ${i + 1}`} onClick={() => setTargets(rows => rows.filter((_, k) => k !== i).map((r, k, all) => ({ ...r, sellPercent: k === all.length - 1 ? 100 - all.slice(0, -1).reduce((s, x) => s + x.sellPercent, 0) : r.sellPercent })))} />
        </div>)}
        <Space wrap>{targets.length < 3 && <Button size="small" icon={<PlusOutlined />} onClick={addTarget}>Add target</Button>}
          {!targets.length && <span className="muted">No target: exits only by stop-loss, trailing stop, a sell condition or your own sell.</span>}
          {rewardRisk != null && <Tag color={rewardRisk >= 2 ? 'green' : rewardRisk >= 1 ? 'blue' : 'orange'}>Reward : risk at T1 ≈ {rewardRisk.toFixed(1)} : 1</Tag>}</Space>

        <Divider titlePlacement="start" plain>Protect profits</Divider>
        <Form.Item label="Move stop-loss to buy price (breakeven)">
          <Select value={breakeven} onChange={setBreakeven} options={[{ value: 'off', label: 'Off' }, { value: 'target1', label: 'After Target 1 is hit', disabled: targets.length < 2 }, { value: 'profit1R', label: 'After price gains as much as my risk (+1R)' }]} />
        </Form.Item>
        <Form.Item label="Trailing stop-loss">
          <Select value={trailing} disabled={stopMode === 'trailing'} onChange={setTrailing} options={[{ value: 'off', label: stopMode === 'trailing' ? 'Already trailing' : 'Off' }, { value: 'afterTarget1', label: 'Start after Target 1, trail by my risk distance', disabled: targets.length < 2 }, { value: 'after1R', label: 'Start after +1R, trail by my risk distance' }]} />
        </Form.Item>
        <div className="mt-safe"><Switch size="small" checked disabled /> <span>Stop-loss, targets and {product === 'intraday' ? '3:15 PM square-off' : 'trailing'} are managed automatically on live prices, even when this screen is closed.</span></div>
      </>}
      {problems.length > 0 && <Alert className="mt-3" type="warning" showIcon title={problems[0]} description={problems.length > 1 ? problems.slice(1).join(' · ') : undefined} />}
      {error && <Alert className="mt-3" type="error" showIcon title={error} />}
    </Form>
  </Drawer>;
}
