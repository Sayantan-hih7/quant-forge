import { useState } from 'react';
import { Alert, Button, Segmented, Skeleton, Tooltip } from 'antd';
import { ArrowRightOutlined, CheckOutlined } from '@ant-design/icons';
import { useStockResource } from '../hooks/useStockResource';
import { stockNumber } from '../utils/format';
import type { StockListing } from '../types';

type CapBand = { key: 'large' | 'mid' | 'small' | 'micro'; label: string; rank: number; of: number };
interface Profile {
  sector: string | null; industry: string | null; marketCap: number | null; marketCapObservedAt: string | null;
  pe: number | null; pb: number | null; roe: number | null; roce: number | null; debtEquity: number | null;
  turnover: number | null; indices: string[] | null; band: CapBand | null;
}
type RelatedItem = StockListing & Profile & {
  score: number; strength: 'close' | 'good' | 'partial'; reasons: { key: string; label: string }[];
  correlation: number | null; sectorRank: number | null;
};
type LensKey = 'peers' | 'size' | 'leaders';
interface RelatedData {
  checkedAt: string; sector: string | null; industry: string | null; rankedCompanies: number;
  subject: Profile & { sectorRank: number | null; sectorSize: number };
  lenses: { key: LensKey; label: string; description: string; items: RelatedItem[]; message: string | null }[];
}
const PAGE = 6;
const strengthLabel = { close: 'Close match', good: 'Good match', partial: 'Partial match' };
const bandHelp = (band: CapBand) => `Rank #${band.rank.toLocaleString('en-IN')} of ${band.of.toLocaleString('en-IN')} companies with a saved market cap. SEBI/AMFI method: ranks 1–100 large cap, 101–250 mid cap, 251+ small cap; 501+ shown as micro cap. AMFI's official list may differ.`;
const pct = (value: number | null) => value === null ? null : `${stockNumber(value, 1)}%`;
const cap = (value: number | null) => value === null ? null : `₹${stockNumber(value, value >= 1000 ? 0 : 2)} Cr`;

function Metrics({ item }: { item: Profile }) {
  const rows = [['Mcap', cap(item.marketCap)], ['P/E', item.pe === null ? null : stockNumber(item.pe, 1)], ['ROCE', pct(item.roce)], ['D/E', item.debtEquity === null ? null : stockNumber(item.debtEquity, 2)]] as const;
  return <dl className="related-metrics">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}
function BandTag({ band }: { band: CapBand | null }) {
  return band ? <Tooltip title={bandHelp(band)}><span className={`cap-band cap-band-${band.key}`}>{band.label}</span></Tooltip> : null;
}

export function RelatedStocks({ instrumentId, ready, onSelect }: { instrumentId: string; ready: boolean; onSelect: (stock: StockListing) => void }) {
  const resource = useStockResource<RelatedData>(ready ? `/stocks/${encodeURIComponent(instrumentId)}/related` : null);
  const data = resource.data;
  // Opening another stock starts again on closest peers.
  const [view, setView] = useState<{ id: string; lens: LensKey; expanded: boolean }>({ id: instrumentId, lens: 'peers', expanded: false });
  const { lens: lensKey, expanded } = view.id === instrumentId ? view : { lens: 'peers' as const, expanded: false };
  const lens = data?.lenses?.find(row => row.key === lensKey) ?? data?.lenses?.[0];
  const subject = data?.subject;
  const items = lens ? (expanded ? lens.items : lens.items.slice(0, PAGE)) : [];
  const sectorText = subject?.sector && subject.industry && subject.sector.toLowerCase() !== subject.industry.toLowerCase() ? `${subject.sector} › ${subject.industry}` : subject?.sector ?? subject?.industry;
  return <section className="stock-related-section" aria-label="Related stocks">
    <div className="stock-links-heading"><div><h3>Related stocks</h3><p>Compared on industry, size, valuation, returns on capital, leverage, liquidity and price co-movement</p></div></div>
    {resource.error ? <Alert type="warning" showIcon title="Related stocks unavailable" description={resource.error} action={<Button onClick={resource.retry}>Retry</Button>} />
      : !ready || resource.loading ? <Skeleton active paragraph={{ rows: 3 }} />
      : !data?.lenses?.length || !lens ? <p className="muted">No related companies are available yet.</p>
      : <>
        {subject && <div className="related-subject" aria-label="This company's profile">
          <span className="related-subject-label">This company</span>
          <BandTag band={subject.band} />
          {sectorText && <span>{sectorText}</span>}
          {subject.sectorRank && <span>#{subject.sectorRank} of {subject.sectorSize} in sector by market cap</span>}
          <Metrics item={subject} />
        </div>}
        <div className="related-lens-bar">
          <Segmented<LensKey> value={lens.key} onChange={value => setView({ id: instrumentId, lens: value, expanded: false })}
            options={data.lenses.map(row => ({ value: row.key, label: `${row.label}${row.items.length ? ` · ${row.items.length}` : ''}` }))} />
        </div>
        <p className="related-lens-description">{lens.description}</p>
        {!lens.items.length ? <p className="muted">{lens.message ?? 'No matching companies have saved data yet.'}</p>
          : <><div className="related-stock-grid">{items.map(stock => <button key={stock._id} className="stock-research-link related-card" onClick={() => onSelect(stock)} aria-label={`View related stock ${stock.symbol} on ${stock.exchange}`}>
            <span className="stock-link-symbol"><strong>{stock.symbol}</strong><small>{stock.exchange}</small>
              {lens.key !== 'leaders' && <span className={`related-strength related-strength-${stock.strength}`}>{strengthLabel[stock.strength]}</span>}
              <ArrowRightOutlined /></span>
            <span className="stock-link-name">{stock.name || stock.symbol}</span>
            <span className="related-tags"><BandTag band={stock.band} />{stock.industry && <span className="related-industry">{stock.industry}</span>}</span>
            <Tooltip title={stock.marketCapObservedAt ? `Market cap observed ${new Date(stock.marketCapObservedAt).toLocaleDateString('en-IN')}` : 'Market cap is not available'}><span><Metrics item={stock} /></span></Tooltip>
            {!!stock.reasons.length && <ul className="related-reasons">{stock.reasons.map(reason => <li key={reason.key}><CheckOutlined />{reason.label}</li>)}</ul>}
          </button>)}</div>
            {lens.items.length > PAGE && <Button type="link" className="related-more" onClick={() => setView({ id: instrumentId, lens: lens.key, expanded: !expanded })}>{expanded ? 'Show fewer' : `Show ${lens.items.length - PAGE} more`}</Button>}</>}
        <p className="stock-chart-note">Uses saved company data and stored price history (co-movement shown only where both histories exist). Same exchange, one listing per company. These are research links, not buy or sell signals.</p>
      </>}
  </section>;
}
