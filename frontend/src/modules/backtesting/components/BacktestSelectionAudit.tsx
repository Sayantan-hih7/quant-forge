import { Alert, Table } from 'antd';
import type { BackendBacktest } from '../types/backend';
export function BacktestSelectionAudit({run}:{run:BackendBacktest}) {
 const audit=run.selectionAudit;if(!audit)return run.config.dataPolicy ? <Alert type="warning" showIcon title="Readiness audit unavailable" description="Restart the updated worker and engine, then rerun this backtest. This report cannot be linked to paper trading."/> : null;
 return <section aria-label="Backtest stock readiness">
  <Alert type={audit.excluded.length?'warning':'info'} showIcon title={audit.policy==='all'?`${audit.requestedIds.length} stocks retained for research / ${audit.excluded.length} with readiness warnings`:`${audit.requestedIds.length} requested / ${audit.includedIds.length} passed initial readiness / ${audit.excluded.length} with issues`}
    description={audit.policy==='ready'?'Stocks with issues were excluded before simulation. They remain in qualification. This report applies only to the tested subset.':'Research mode retained the requested stocks. Readiness issues can affect the results.'}/>
  <p className="muted">{audit.method}</p>
  {!!audit.excluded.length&&<Table size="small" rowKey="instrumentId" dataSource={audit.excluded} pagination={{pageSize:10}} scroll={{x:520}} columns={[
   {title:'Stock',dataIndex:'instrumentId',render:id=>run.symbols?.[id]??id},
   {title:'Why / next step',dataIndex:'reasons',render:(reasons:string[])=>reasons.map(reason=><p key={reason}>{reason}</p>)},
  ]}/>}
 </section>;
}
