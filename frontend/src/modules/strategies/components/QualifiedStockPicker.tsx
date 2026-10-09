import { RequestFeedback } from '../../../components/feedback/RequestFeedback';
import { orderedBacktestStocks } from '../utils/backtestSelection';
import type { Horizon } from '../../qualification/types';
import { Alert, Button, Empty, Form, Select, Tag } from 'antd';
import type { ScopedStock } from '../hooks/useQualifiedStockScope';

export function QualifiedStockPicker({ stocks, value, onChange, loading, error, validationError, onRetry, horizon, historical = false, maxStocks }: {
  stocks: ScopedStock[]; value: string[]; onChange: (ids: string[]) => void; loading: boolean; error?: string; validationError?: string; onRetry: () => void; horizon?: Horizon; historical?: boolean; maxStocks?:number;
}) {
  const horizonLabel=horizon==='intraday'?'Intraday':horizon==='swing'?'Swing':'Long-term';
  const ordered=maxStocks?orderedBacktestStocks(stocks,horizon,historical):stocks;
  const limit=(list:ScopedStock[])=>list.slice(0,maxStocks??list.length).map(s=>s._id);
  const matches=ordered.filter(stock=>stock.suitability?.profiles.some(p=>p.horizon===horizon&&p.status==='matched'));
  const available = new Set(stocks.map(s => s._id)), unavailable = loading || error ? [] : value.filter(id => !available.has(id));
  return <div className="qualified-stock-picker">
    <div className="stock-scope-actions"><span>{value.length} selected / {stocks.length} available</span><Button size="small" disabled={loading || !!error || !stocks.length} onClick={() => onChange(limit(ordered.slice(0, 10)))}>Select first 10</Button><Button size="small" disabled={loading || !!error || !stocks.length} onClick={() => onChange(limit(ordered))}>{maxStocks&&stocks.length>maxStocks?`Select up to ${maxStocks}`:'Select all'}</Button><>{horizon&&!historical&&<Button size="small" disabled={loading||!!error||!matches.length} title="Replaces your selection with stocks matching this holding-period profile" onClick={()=>onChange(limit(matches))}>Select matching stocks ({Math.min(matches.length,maxStocks??matches.length)})</Button>}</><Button type="text" size="small" disabled={!value.length} onClick={() => onChange([])}>Clear</Button></div>
    {maxStocks&&<p className="muted">Up to {maxStocks} stocks per run. {historical?"Historical lists use alphabetical order; today's suitability is not applied.":'Selection prioritises stocks matching this strategy profile, then uses alphabetical order. This is not a ranking of expected returns.'} {value.length>=maxStocks?'Limit reached: remove a selected stock to add another.':''}</p>}
    {error && <RequestFeedback className="mb-3" showIcon type="error" title="Stock list could not be loaded" description={error} action={<Button onClick={onRetry}>Retry stock list</Button>} />}
    <Form.Item label="Qualified stocks" htmlFor="qualified-stock-selection" validateStatus={validationError || unavailable.length ? 'error' : undefined} help={validationError}>
      <Select id="qualified-stock-selection" mode="multiple" maxCount={maxStocks} showSearch optionFilterProp="label" maxTagCount={5} allowClear loading={loading} disabled={loading || !!error} value={value} onChange={onChange} placeholder="Search by stock name or symbol" optionRender={option => {
        const stock=stocks.find(s=>s._id===option.value), profile=stock?.suitability?.profiles.find(p=>p.horizon===horizon);
        const status=profile?.status;
        return <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,whiteSpace:'normal'}}><span>{option.label}</span>{horizon&&<Tag style={{marginInlineEnd:0,flexShrink:0}} color={historical?'default':status==='matched'?'green':status==='not-matched'?'orange':'gold'} title={historical?'Current suitability is not applied to historical lists':profile?.checks.map(c=>`${c.label}: ${c.rule} (${c.status})`).join('\n')??'Suitability inputs are not available'}>{historical?'Historical fit: not assessed':`${horizonLabel}: ${status==='matched'?'Matches profile':status==='not-matched'?'Outside profile':'Needs data'}`}</Tag>}</div>;
      }} options={stocks.map(s => ({ value: s._id, label: `${s.symbol} · ${s.exchange}${s.source === 'manual' ? ' · Manually added' : ''}` }))} notFoundContent={loading ? 'Loading qualified stocks…' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No qualified stocks in this scope" />} />
    </Form.Item>
    {!!unavailable.length && <Alert showIcon type="warning" title={`${unavailable.length} selected stocks are outside this scope`} description="Remove them or change the stock universe before continuing." action={<Button onClick={() => onChange(value.filter(id => available.has(id)))}>Remove unavailable</Button>} />}
    {!loading && !error && !stocks.length && <p className="muted">No published stocks match this selection. Review Qualification or choose another date range for historical lists.</p>}
  </div>;
}
