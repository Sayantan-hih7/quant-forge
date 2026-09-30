import { Alert, Button, Collapse, Skeleton, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useStockResource } from '../hooks/useStockResource';
import type { StockChartData } from '../types';
import { technicalSummary,dailyResearchPath } from '../utils/technicalSummary';
import { stockMoney, stockNumber } from '../utils/format';
import { StockBeta } from './StockBeta';
const label={bullish:'Bullish',bearish:'Bearish',neutral:'Neutral',unavailable:'Insufficient history'};
export function StockTechnicals({instrumentId,now}:{instrumentId:string;now:number}){
  const resource=useStockResource<StockChartData>(dailyResearchPath(instrumentId));
  const result=technicalSummary(resource.data?.bars??[],now);
  return <section className="stock-research-section" aria-label="Stock technical analysis">
    <div className="stock-section-heading"><div><h3>Technical snapshot</h3><p className="muted">Completed daily candles{result.asOf?` · Through ${result.asOf.slice(0,10)}`:''}</p></div><Button size="small" onClick={resource.retry} loading={resource.loading}>Refresh</Button></div>
    {(resource.error||resource.data?.message)&&<Alert type="warning" showIcon title="Daily history is incomplete" description={resource.error||resource.data?.message}/>}
    {resource.loading&&!resource.data?<Skeleton active/>:<>
      <div className={`technical-verdict technical-verdict--${result.verdict}`}>
        <div><span className="muted">Direction across available indicators</span><h2>{label[result.verdict]}</h2><span>{result.available} of {result.total} directional readings available</span></div>
        <div className="technical-votes"><span className="positive"><b>{result.bullish}</b>Bullish</span><span><b>{result.neutral}</b>Neutral</span><span className="negative"><b>{result.bearish}</b>Bearish</span></div>
      </div>
      <p className="stock-chart-note">Each available directional indicator has one vote; the larger bullish or bearish count determines the summary. A tie is neutral. Indicators overlap, so this is a description of price behaviour, not a strategy signal or trade recommendation.</p>
      <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Indicator</th><th>Value</th><th>Reading</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.name}><td>{r.name} <Tooltip title={r.explanation}><InfoCircleOutlined aria-label={`${r.name} explanation`}/></Tooltip></td><td>{stockNumber(r.value)}</td><td><Tag color={r.verdict==='bullish'?'green':r.verdict==='bearish'?'red':undefined}>{r.directional?label[r.verdict]:r.value===null?'Insufficient history':r.name.startsWith('ADX')?r.value>25?'Stronger trend':'Weak / developing':'Volatility'}</Tag></td></tr>)}</tbody></table></div>
      <Collapse className="research-methodology" ghost items={[{key:'method',label:'How these readings are calculated',children:<><p>The same indicator calculations power our charts. The current forming candle is excluded. Missing values never count as neutral.</p><p>RSI uses Wilder smoothing; MACD uses EMA 12/26 with signal 9. Moving averages compare against the last completed close. Warm-up data is requested automatically.</p></>}]}/>
      <StockBeta instrumentId={instrumentId} history={resource.data} loading={resource.loading} error={resource.error} now={now}/>
      <div className="stock-section-heading"><h3>Support & resistance</h3><Tag>Traditional daily pivots</Tag></div>
      <p className="muted">Calculated from the last completed session ({result.asOf?.slice(0,10)??'unavailable'}) for the following session. These are reference levels, not guaranteed turning points.</p>
      {result.pivots?<div className="pivot-ladder">{[['R3',5],['R2',3],['R1',1],['Pivot',0],['S1',2],['S2',4],['S3',6]].map(([name,index])=><div key={name} className={name==='Pivot'?'pivot-ladder-center':''}><span>{name}</span><strong>{stockMoney(result.pivots![Number(index)])}</strong></div>)}</div>:<p className="muted">A completed daily candle is needed for pivot levels.</p>}
    </>}
  </section>;
}
