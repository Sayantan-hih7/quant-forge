import {sourceReport,type SourceReport} from './report-tables.js';
import { z } from 'zod';
import { BacktestRunModel } from '../../backtesting/models/backtest.model.js';
import { PaperSessionModel, PaperOrderModel, PaperObservationModel } from '../../paper-trading/models/paper.model.js';
import { QualificationRunModel, MonthlyUniverseModel } from '../../qualification/models/qualification.model.js';
import { ConnectionModel } from '../../connections/models/connection.model.js';
import { feedStatus } from '../../market-feed/services/feed.service.js';
import { clockHealth } from '../../../shared/clock-health.js';

export const agentToolSchema=z.object({name:z.enum(['backtests','paper','qualification','connections']),id:z.string().uuid().nullable().optional()}).strict();
export type AgentToolCall=z.infer<typeof agentToolSchema>;
export interface AgentActivity {durationMs?:number;tool:AgentToolCall['name'];status:'completed'|'unavailable';checkedAt:string;checkedAtIst?:string;summary:string;data:unknown;report?:SourceReport}
export const agentToolsDescription=`Read-only application tools (never code execution, URLs or broker orders):
backtests: id omitted lists latest 5 report summaries; id set reads one report. Includes stored strategy revision, metrics, data quality and limited trade sample. Start with the list to discover report IDs.
paper: latest sessions, recent orders and rule observations; id optionally limits to a known session. Paise values are explicitly named; divide by 100 for rupees. Samples are not lifetime totals.
qualification: latest scan counts and missing-input summary. Counts are scan results, not proof of data readiness for every strategy.
connections: current feed freshness, cached clock verification and saved Dhan connection status. A connected token alone does not mean prices stream.
Use tools to answer questions about actual results, missing data, connection health or why paper trades did not happen. Do not answer observed-state questions from general knowledge. Tools return timestamped, bounded snapshots; no report means unavailable, not zero profit. No sampling result is a portfolio total. No tool changes application state. Timestamp objects contain iso and displayIst: quote displayIst and checkedAtIst verbatim rather than converting or relabelling iso yourself. The current flag means the last saved evaluation, not a fresh live evaluation: use checkedAt and ageSeconds and identify inactive sessions. Do not claim a sampled failed rule is the only reason for no fills across all stocks. Backtest money is rupees; winRate and returnPercent are percentages.`;
function pick(value:unknown,fields:string[]){const object=value&&typeof value==='object'?value as Record<string,unknown>:{};return Object.fromEntries(fields.filter(k=>object[k]!==undefined).map(k=>[k,object[k]]));}
export async function readAgentTool(raw:AgentToolCall,signal?:AbortSignal):Promise<unknown>{
 signal?.throwIfAborted();const call=agentToolSchema.parse(raw);
 if(call.name==='backtests'){
  const runs=await BacktestRunModel.find(call.id?{_id:call.id}:{}).select('_id strategy._id strategy.name strategy.revision config.from config.to config.universe status createdAt finishedAt result.initialCapital result.equity result.netPnl result.returnPercent result.winRate result.profitFactor result.closedTrades result.totalFees result.maxDrawdownPercent result.metrics result.dataQuality result.unavailableDecisions result.warmupDecisions result.historyQuality result.trades').slice('result.trades',-10).sort({createdAt:-1}).limit(call.id?1:5).maxTimeMS(5000).lean();
  return {scope:call.id?'one report':'latest 5 reports',runs:runs.map(r=>({id:r._id,strategy:r.strategy,period:r.config,status:r.status,createdAt:r.createdAt,finishedAt:r.finishedAt,result:pick(r.result,['initialCapital','equity','netPnl','returnPercent','winRate','profitFactor','closedTrades','totalFees','maxDrawdownPercent','unavailableDecisions','warmupDecisions']),metrics:pick(r.result?.metrics,['cagrPercent','sharpe','sortino','expectancy','dailyObservations','method']),dataQuality:pick(r.result?.dataQuality,['status']),qualityIssues:Array.isArray((r.result?.dataQuality as {issues?:unknown[]})?.issues)?(r.result?.dataQuality as {issues:unknown[]}).issues.slice(0,8):[],historyQuality:pick(r.result?.historyQuality,['missingMinutes','incompleteSessions','zeroVolumeMinutes']),tradeSample:call.id&&Array.isArray(r.result?.trades)?r.result.trades.slice(-10).map(t=>pick(t,['instrumentId','entryAt','exitAt','quantity','entry','exit','pnl','reason'])):undefined}))};
 }
 if(call.name==='qualification'){
  const [runs,published]=await Promise.all([QualificationRunModel.find({}).select('_id month revision cutoff status total processed qualified rejected unavailable awaitingHistory finishedAt dataGaps').sort({cutoff:-1}).limit(3).maxTimeMS(5000).lean(),MonthlyUniverseModel.aggregate([{$sort:{month:-1}},{$limit:1},{$project:{month:1,revision:1,publishedAt:1,runId:1,stockCount:{$size:{$ifNull:['$members',[]]}}}}]).option({maxTimeMS:5000})]);
  return {scope:'latest 3 scans and latest published list; scan results can differ from published stocks',runs,published};
 }
 if(call.name==='paper'){
  const sessions=await PaperSessionModel.find(call.id?{_id:call.id}:{}).select('_id strategyId strategy.name strategy.revision active entriesPaused mode cashPaise initialPaise checkedAt createdAt dailyLossLimitPercent lossLimitDate').sort({createdAt:-1}).limit(3).maxTimeMS(5000).lean();
  const ids=sessions.map(s=>s._id);
  const [orders,observations]=await Promise.all([PaperOrderModel.find({sessionId:{$in:ids}}).select('_id sessionId instrumentId side quantity status source reason createdAt filledAt fillPaise feePaise realizedPnlPaise').sort({createdAt:-1}).limit(12).maxTimeMS(5000).lean(),PaperObservationModel.find({sessionId:{$in:ids},current:true}).select('sessionId instrumentId checkedAt barEnd entry.matched entry.checks exit.matched exit.checks').sort({checkedAt:-1}).limit(12).maxTimeMS(5000).lean()]);
  return {scope:'latest 3 sessions, latest 12 orders and 12 current rule observations; samples only, no portfolio P&L calculation',sessions,orders,observations:observations.map(o=>({...o,ageSeconds:Number.isFinite(Date.parse(o.checkedAt))?Math.round((Date.now()-Date.parse(o.checkedAt))/1000):null,entry:{matched:o.entry.matched,checks:o.entry.checks?.slice(0,6).map(c=>pick(c,['matched','field','missingField','left','right','reason']))},exit:{matched:o.exit.matched,checks:o.exit.checks?.slice(0,6).map(c=>pick(c,['matched','field','missingField','left','right','reason']))}}))};
 }
 const [connection,feed,clock]=await Promise.all([ConnectionModel.findById('dhan').select('_id status expiresAt verifiedAt reconnectState reconnectCheckedAt renewalState').maxTimeMS(5000).lean(),feedStatus(),clockHealth()]);
 return {dhan:connection,feed:pick(feed,['state','provider','updatedAt','lastTickAt','workerRunning','enabled','marketClosed']),freshQuotes:feed.quotes.filter(q=>q.fresh).length,subscribedInstruments:feed.instruments?.length??0,clock:pick(clock,['state','checkedAt','offsetMs','uncertaintyMs'])};
}
export function evidenceTimes(value:unknown):unknown{
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)))return {iso:value,displayIst:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date(value))+' IST'};
 if(Array.isArray(value))return value.map(evidenceTimes);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,evidenceTimes(v)]));
 return value;
}
export async function executeAgentTool(call:AgentToolCall,signal?:AbortSignal,read=readAgentTool):Promise<AgentActivity>{
 signal?.throwIfAborted();
 try{const data=await read(agentToolSchema.parse(call),signal);signal?.throwIfAborted();
  if(JSON.stringify(data).length>24000)throw new Error('Tool result too large');
  return {tool:call.name,status:'completed',checkedAt:new Date().toISOString(),checkedAtIst:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date())+' IST',summary:`Checked ${call.name} records${data&&typeof data==='object'&&'scope' in data?': '+String(data.scope):''}`,data:evidenceTimes(data),report:sourceReport(call.name,data)};
 }catch(error){if(signal?.aborted)throw error;return {tool:call.name,status:'unavailable',checkedAt:new Date().toISOString(),checkedAtIst:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date())+' IST',summary:`Could not read ${call.name} records. Retry the request.`,data:null};}
}
