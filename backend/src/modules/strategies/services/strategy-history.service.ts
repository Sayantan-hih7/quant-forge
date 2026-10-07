import { AppError } from '../../../shared/errors.js';
import { StrategyModel, StrategyRevisionModel, type Strategy } from '../models/strategy.model.js';
import { BacktestRunModel } from '../../backtesting/models/backtest.model.js';
import { PaperSessionModel } from '../../paper-trading/models/paper.model.js';

export interface RevisionUse { id:string; kind:'backtest'|'signals'|'paper'; at?:string; status:string }
export interface RevisionSnapshot { strategy:Strategy; source:'saved'|'backtest'|'session'; uses:RevisionUse[]; inconsistent:boolean }
export interface StrategyHistory { strategyId:string; currentRevision:number|null; revisions:RevisionSnapshot[]; missingRanges:string[] }
type RecordedUse={strategy:Strategy;use:RevisionUse};
function definition(value:unknown):unknown {
  if(Array.isArray(value))return value.map(definition);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['_id','id','revision','savedAt','archivedAt','lifecycleSerial'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,definition(v)]));
  return value;
}

/** Saved revisions are authoritative; embedded run snapshots recover genuinely recorded legacy history. */
export function assembleStrategyHistory(id:string,current:Strategy|null,revisions:Strategy[],uses:RecordedUse[]):StrategyHistory {
  const records=new Map<number,RevisionSnapshot>();
  const add=(strategy:Strategy,source:RevisionSnapshot['source'])=>{
    if(!Number.isSafeInteger(strategy.revision)||strategy.revision<1)return;
    const existing=records.get(strategy.revision);
    if(existing){if(JSON.stringify(definition(existing.strategy))!==JSON.stringify(definition(strategy)))existing.inconsistent=true;return;}
    records.set(strategy.revision,{strategy:{...strategy,_id:id},source,uses:[],inconsistent:false});
  };
  for(const strategy of revisions)add(strategy,'saved');
  if(current)add(current,'saved');
  for(const record of uses){add(record.strategy,record.use.kind==='backtest'?'backtest':'session');records.get(record.strategy.revision)?.uses.push(record.use);}
  const sorted=[...records.keys()].sort((a,b)=>a-b),missingRanges:string[]=[];
  let previous=0;
  for(const revision of sorted){if(revision>previous+1)missingRanges.push(revision===previous+2?String(previous+1):`${previous+1}–${revision-1}`);previous=revision;}
  return {strategyId:id,currentRevision:current?.revision??null,revisions:[...records.values()].sort((a,b)=>b.strategy.revision-a.strategy.revision),missingRanges};
}

export async function strategyHistory(id:string):Promise<StrategyHistory> {
  // ID is UUID-validated by the route; the prefix uses MongoDB's existing _id index.
  const [current,revisions,backtests,sessions]=await Promise.all([
    StrategyModel.findById(id).lean(),StrategyRevisionModel.find({_id:{$regex:`^${id}:`}}).lean(),
    BacktestRunModel.find({'strategy._id':id}).select('_id strategy createdAt status').sort({createdAt:-1}).lean(),
    PaperSessionModel.find({$or:[{strategyId:id},{'strategy._id':id}]}).select('_id strategy createdAt active mode').sort({createdAt:-1}).lean(),
  ]);
  const result=assembleStrategyHistory(id,current,revisions,[
    ...backtests.map(run=>({strategy:run.strategy,use:{id:run._id,kind:'backtest' as const,at:run.createdAt,status:run.status}})),
    ...sessions.map(session=>({strategy:session.strategy,use:{id:session._id,kind:session.mode==='signals'?'signals' as const:'paper' as const,at:session.createdAt,status:session.active?'Active':'Stopped'}})),
  ]);
  if(!result.revisions.length)throw new AppError(404,'NOT_FOUND','No recorded revisions were found for this strategy');
  return result;
}
