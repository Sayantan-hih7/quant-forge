import type { StockChartData } from '../types';
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
const time = (value: string) => new Date(value).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
export function ChartGapDetails({ data, times }: { data?: StockChartData; times?: string[] }) {
 const intervals = (data?.incompleteIntervals ?? []).filter(gap => !times || times.includes(gap.time));
 return <>
  {data?.historyReview && <p>Last check: {data.historyReview.recoveredCandles} minutes recovered; {data.historyReview.checkedSessions} past sessions requested.{data.historyReview.deferredSessions > 0 && ` ${data.historyReview.deferredSessions} sessions remain to check on later refreshes.`}{data.historyReview.failedChecks > 0 && ` ${data.historyReview.failedChecks} checks unavailable.`}</p>}
  <p>Closed intervals are missing stored minutes, separate from the forming candle. Retry asks for missing history again; absent minutes are never replaced with invented prices.</p>
  {!!intervals.length && <div aria-label="Missing candle times" style={{ maxHeight: 200, overflowY: 'auto' }}>
   {intervals.map(gap => <div key={gap.time} style={{ marginBottom: 8 }}><strong>{date(gap.time)} {time(gap.time)} - {time(gap.end)} IST</strong><div>Missing: {gap.missingMinutes.map(time).join(', ')}</div></div>)}
  </div>}
  <small>Times are minute start times. Missing observations can mean an unfinished download, a provider omission, or no reported trades. The count covers loaded sessions.</small>
 </>;
}
