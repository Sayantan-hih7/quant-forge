import { Button, Popover } from 'antd';
import type { DiscoveryMatchData } from '../types';
import { discoveryNumber, discoveryTime } from '../utils/format';
const sourceName = (source: string) => source === 'dhan-snapshot' ? 'Dhan market snapshot' : source === 'dhan-public-company' ? 'Dhan public financial reports' : source === 'dhan-company' ? 'Dhan company information' : source;
export function DiscoveryMatch({ data, rankBy, symbol }: { data: DiscoveryMatchData; rankBy?: string; symbol: string }) {
  const main = data.checks.find(check => check.field === rankBy) ?? data.checks[0];
  return <div className="discovery-match"><span className="discovery-rank">#{data.rank}</span><div>{main && <strong>{discoveryNumber(main.value, main.unit)}</strong>}<Popover trigger="click" title={`${symbol} · why included`} content={<div className="discovery-evidence">{data.checks.map(check => <div key={check.field}><div><span>{check.label}</span><strong>{discoveryNumber(check.value, check.unit)}</strong></div><small>{sourceName(check.source)}{check.period ? ` · period ${check.period}` : ''}{check.statementBasis ? ` · ${check.statementBasis}` : ''}<br />Observed {discoveryTime(check.observedAt)}</small></div>)}<p>These values explain inclusion at evaluation time. The last-price column may update separately.</p></div>}><Button type="link" size="small" aria-label={`Why ${symbol} is included`}>Why included</Button></Popover></div></div>;
}
