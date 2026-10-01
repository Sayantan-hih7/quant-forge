import { Alert, Skeleton } from 'antd';
import type { StockChartData, StockQuote } from '../types';
import { useStockResource } from '../hooks/useStockResource';
import { stockMoney,stockTime } from '../utils/format';
import { observedRange,dailyResearchPath } from '../utils/technicalSummary';
import { Flash } from './Flash';

export function PriceRange({label,low,high,price}:{label:string;low?:number|null;high?:number|null;price?:number}){
  const valid=low!=null&&high!=null&&high>=low;
  const position=valid&&price!=null?high===low?50:Math.max(0,Math.min(100,(price-low)/(high-low)*100)):null;
  return <div className="stock-price-range"><div><span>{label} low<strong><Flash value={low}>{stockMoney(low)}</Flash></strong></span><span>{label} high<strong><Flash value={high}>{stockMoney(high)}</Flash></strong></span></div><div className="price-range-track">{position!==null&&<span className="price-range-marker" style={{left:`${position}%`}} aria-label={`Last price ${stockMoney(price)}`}/>}</div>{price!=null&&valid&&(price<low||price>high)&&<small className="muted">Last price is outside this recorded range.</small>}</div>;
}
export function StockPerformance({instrumentId,quote,now}:{instrumentId:string;quote?:StockQuote;now:number}){
  const history=useStockResource<StockChartData>(dailyResearchPath(instrumentId));
  const range=observedRange(history.data?.bars??[],now);
  const full=!!range&&Date.parse(range.from)<now-355*86400000;
  return <section aria-label="Stock performance"><div className="stock-section-heading"><h3>Performance</h3><span className="muted">Marker shows last price</span></div>
    <PriceRange label="Session" low={quote?.low} high={quote?.high} price={quote?.price}/>
    {history.loading&&!history.data?<Skeleton active paragraph={{rows:1}}/>:<><PriceRange label={full?'52-week':'Available history'} low={range?.low} high={range?.high} price={quote?.price}/><p className="muted">{range?`${range.count} completed sessions · ${range.from.slice(0,10)} to ${range.to.slice(0,10)}${full?'':' · Less than 52 weeks available'}`:'Historical range is not available yet.'}</p></>}
    {(history.error||history.data?.message)&&<Alert type="warning" title="Historical range may be incomplete" description={history.error||history.data?.message}/>}
    <div className="stock-session-metrics">{([['Open',stockMoney(quote?.open),quote?.open],['Previous close',stockMoney(quote?.previousClose),quote?.previousClose],['Volume',quote?.volume?.toLocaleString('en-IN')??'—',quote?.volume],['Average price',stockMoney(quote?.averagePrice),quote?.averagePrice],['Lower circuit',stockMoney(quote?.lowerCircuit),quote?.lowerCircuit],['Upper circuit',stockMoney(quote?.upperCircuit),quote?.upperCircuit]] as const).map(([name,value,raw])=><div className="stock-metric" key={name}><span>{name}</span><strong><Flash value={raw}>{value}</Flash></strong></div>)}</div>
    <p className="stock-chart-note">Session values relate to the displayed quote. {quote?.lastTradeAt?stockTime(quote.lastTradeAt):'Quote timestamp unavailable.'}</p>
  </section>;
}
