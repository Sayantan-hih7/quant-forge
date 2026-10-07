import type { Horizon } from '../../qualification/types';
import { Alert, Button, Empty, Form, Select, Tag } from 'antd';
import type { ScopedStock } from '../hooks/useQualifiedStockScope';

export function QualifiedStockPicker({ stocks, value, onChange, loading, error, validationError, onRetry, horizon, historical = false }: {
  stocks: ScopedStock[]; value: string[]; onChange: (ids: string[]) => void; loading: boolean; error?: string; validationError?: string; onRetry: () => void; horizon?: Horizon; historical?: boolean;
}) {
  const horizonLabel=horizon==='intraday'?'Intraday':horizon==='swing'?'Swing':'Long-term';
  const matches=stocks.filter(stock=>stock.suitability?.profiles.some(p=>p.horizon===horizon&&p.status==='matched'));
  const available = new Set(stocks.map(s => s._id)), unavailable = loading || error ? [] : value.filter(id => !available.has(id));
  return <div className="qualified-stock-picker">
    <div className="stock-scope-actions"><span>{value.length} selected / {stocks.length} available</span><Button size="small" disabled={loading || !!error || !stocks.length} onClick={() => onChange(stocks.slice(0, 10).map(s => s._id))}>Select first 10</Button><Button size="small" disabled={loading || !!error || !stocks.length} onClick={() => onChange(stocks.map(s => s._id))}>Select all</Button><>{horizon&&!historical&&<Button size="small" disabled={loading||!!error||!matches.length} title="Replaces your selection with stocks matching this holding-period profile" onClick={()=>onChange(matches.map(s=>s._id))}>Select matching stocks ({matches.length})</Button>}</><Button type="text" size="small" disabled={!value.length} onClick={() => onChange([])}>Clear</Button></div>
    {error && <Alert className="mb-3" showIcon type="error" title="Stock list could not be loaded" description={error} action={<Button onClick={onRetry}>Retry stock list</Button>} />}
    <Form.Item label="Qualified stocks" htmlFor="qualified-stock-selection" validateStatus={validationError || unavailable.length ? 'error' : undefined} help={validationError}>
      <Select id="qualified-stock-selection" mode="multiple" showSearch optionFilterProp="label" maxTagCount={5} allowClear loading={loading} disabled={loading || !!error} value={value} onChange={onChange} placeholder="Search by stock name or symbol" optionRender={option => {
        const stock=stocks.find(s=>s._id===option.value), profile=stock?.suitability?.profiles.find(p=>p.horizon===horizon);
        const status=profile?.status;
        return <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,whiteSpace:'normal'}}><span>{option.label}</span>{horizon&&<Tag style={{marginInlineEnd:0,flexShrink:0}} color={historical?'default':status==='matched'?'green':status==='not-matched'?'orange':'gold'} title={historical?'Current suitability is not applied to historical lists':profile?.checks.map(c=>`${c.label}: ${c.rule} (${c.status})`).join('\n')??'Suitability inputs are not available'}>{historical?'Historical fit: not assessed':`${horizonLabel}: ${status==='matched'?'Matches profile':status==='not-matched'?'Outside profile':'Needs data'}`}</Tag>}</div>;
      }} options={stocks.map(s => ({ value: s._id, label: `${s.symbol} · ${s.exchange}${s.source === 'manual' ? ' · Manually added' : ''}` }))} notFoundContent={loading ? 'Loading qualified stocks…' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No qualified stocks in this scope" />} />
    </Form.Item>
    {!!unavailable.length && <Alert showIcon type="warning" title={`${unavailable.length} selected stocks are outside this scope`} description="Remove them or change the stock universe before continuing." action={<Button onClick={() => onChange(value.filter(id => available.has(id)))}>Remove unavailable</Button>} />}
    {!loading && !error && !stocks.length && <p className="muted">No published stocks match this selection. Review Qualification or choose another date range for historical lists.</p>}
  </div>;
}
