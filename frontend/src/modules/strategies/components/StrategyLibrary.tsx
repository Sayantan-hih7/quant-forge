import { Button, Collapse, Popconfirm, Space, Tag } from 'antd';
import { RestoreStrategyButton } from './RestoreStrategyButton';
import { StrategyHistoryButton } from './StrategyHistoryButton';
import { horizonLabels } from '../../qualification/config/metrics';
import type { Horizon } from '../../qualification/types';
import type { SavedStrategy } from '../hooks/useBackendStrategies';
export function StrategyLibrary({strategies,onNew,onView,onEdit,onTest,onArchive}:{strategies:SavedStrategy[];onNew:(horizon:Horizon)=>void;onView:(id:string)=>void;onEdit:(id:string)=>void;onTest:(id:string)=>void;onArchive:(strategy:SavedStrategy)=>Promise<void>}){
 const archived=strategies.filter(s=>s.archivedAt);
 return <section className="strategy-library" aria-label="Saved strategies">
  <h2>Three trading plans</h2><p>Keep one current strategy for each holding period. Edit it as you learn; each save preserves a revision. Saving does not start trading.</p>
  <div className="strategy-library-list">{(['intraday','swing','long-term'] as Horizon[]).map(horizon=>{
   const current=strategies.filter(s=>!s.archivedAt&&s.entry.horizon===horizon);
   return <article className="strategy-library-row" key={horizon} aria-label={`${horizonLabels[horizon]} strategy slot`}>
    <div className="strategy-library-identity"><Tag color={horizon==='intraday'?'blue':horizon==='swing'?'purple':'cyan'}>{horizonLabels[horizon]}</Tag>
     {!current.length?<><h3>No strategy yet</h3><Button type="primary" onClick={()=>onNew(horizon)}>Create {horizonLabels[horizon].toLowerCase()} strategy</Button></>:current.map(strategy=><div key={strategy._id}>
      <h3><button className="stock-symbol-button" onClick={()=>onView(strategy._id)}>{strategy.name}</button></h3><p>Revision {strategy.revision} ? {strategy.risk.riskPercent}% risk per trade ? {strategy.risk.maxPositions} positions</p>
      {current.length>1&&<p>Earlier duplicate strategies exist. Archive the ones you no longer use to keep one current plan.</p>}
      <Space wrap><Button onClick={()=>onView(strategy._id)}>View strategy</Button><Button onClick={()=>onEdit(strategy._id)}>Edit rules</Button><Button onClick={()=>onTest(strategy._id)}>Backtest</Button><StrategyHistoryButton strategy={strategy} history label="Version history" />
       <Popconfirm title="Archive this strategy and free its slot?" description="Rules, revisions, reports and trade history are kept. Stop monitoring and close positions first." onConfirm={()=>onArchive(strategy)}><Button>Archive and replace</Button></Popconfirm>
      </Space></div>)}
    </div>
   </article>;
  })}</div>
  {!!archived.length&&<Collapse className="strategy-archive" items={[{key:'archive',label:`Archived strategies (${archived.length})`,children:archived.map(strategy=>{
   const occupied=strategies.some(s=>!s.archivedAt&&s.entry.horizon===strategy.entry.horizon);
   return <article key={strategy._id} className="strategy-archive-row">
    <div className="strategy-archive-heading"><strong>{strategy.name}</strong><Tag>{horizonLabels[strategy.entry.horizon]}</Tag><span className="muted">Revision {strategy.revision}</span></div>
    <div className="strategy-archive-actions"><Button onClick={()=>onView(strategy._id)}>View strategy</Button><StrategyHistoryButton strategy={strategy} history label="Rules & history"/><Button onClick={()=>onTest(strategy._id)}>Past backtests</Button><RestoreStrategyButton strategy={strategy} occupied={occupied}/></div>
    <p className="strategy-archive-note">{occupied?'Archive the current strategy of this type first.':'Restoring keeps all history. Monitoring and paper trading stay stopped.'}</p>
   </article>;
  })}]} />}

 </section>;
}
