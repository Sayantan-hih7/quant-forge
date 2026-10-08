import {z} from 'zod';
import {BacktestRunModel,type BacktestRun} from '../models/backtest.model.js';
import {backtestDataIssues} from './data-quality.js';
import {StrategyModel} from '../../strategies/models/strategy.model.js';
import {MonthlyUniverseModel} from '../../qualification/models/qualification.model.js';
import {currentMonth} from '../../qualification/services/universe.service.js';
import {instruments} from '../../market-data/repository.js';
import {PaperSessionModel} from '../../paper-trading/models/paper.model.js';
import {invariant} from '../../../shared/errors.js';
export const eligibilityCriteriaSchema=z.object({minWinRate:z.number().min(0).max(100).default(55),minClosedTrades:z.number().int().min(1).max(10000).default(10),minNetPnl:z.number().min(0).max(100000000).default(0),maxClosedDrawdown:z.number().positive().max(100000000).optional()}).strict();
export const eligibilitySettingsSchema=z.object({criteria:eligibilityCriteriaSchema,validationReportId:z.string().uuid().optional()}).strict();
export type EligibilitySettings=z.infer<typeof eligibilitySettingsSchema>;
interface Fill {instrumentId:string;entryAt:string;exitAt:string;pnl:number;remainingQuantity?:number}
interface Open {instrumentId:string;entryAt?:string}
export function stockEligibilityMetrics(run:Pick<BacktestRun,'config'|'result'|'symbols'>){
 const groups=new Map<string,{instrumentId:string;entryAt:string;exitAt:string;pnl:number;remaining?:number;invalid:boolean}>();
 const fills=(run.result?.trades??[]) as Fill[], open=(run.result?.openPositions??[]) as Open[];
 for(const fill of [...fills].sort((a,b)=>Date.parse(a.exitAt)-Date.parse(b.exitAt))){
  const key=`${fill.instrumentId}:${Date.parse(fill.entryAt)}`,p=groups.get(key)??{instrumentId:fill.instrumentId,entryAt:fill.entryAt,exitAt:fill.exitAt,pnl:0,invalid:false};
  p.invalid ||= !Number.isFinite(fill.pnl)||!Number.isFinite(Date.parse(fill.entryAt))||!Number.isFinite(Date.parse(fill.exitAt));
  p.pnl+=Math.round(fill.pnl*100);p.exitAt=fill.exitAt;p.remaining=fill.remainingQuantity;groups.set(key,p);
 }
 return run.config.ids.map(instrumentId=>{
  const positions=[...groups.values()].filter(p=>p.instrumentId===instrumentId);
  const closed=positions.filter(p=>!p.invalid&&(p.remaining===0||p.remaining===undefined)&&!open.some(o=>o.instrumentId===instrumentId&&(!o.entryAt||Date.parse(o.entryAt)===Date.parse(p.entryAt)))).sort((a,b)=>Date.parse(a.exitAt)-Date.parse(b.exitAt));
  let equity=0,peak=0,drawdown=0;for(const p of closed){equity+=p.pnl;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}
  const wins=closed.filter(p=>p.pnl>0).length;
  return {instrumentId,symbol:run.symbols?.[instrumentId]??instrumentId,closedTrades:closed.length,wins,winRate:closed.length?wins/closed.length*100:null,netPnl:equity/100,closedDrawdown:drawdown/100,incomplete:positions.some(p=>p.invalid||((p.remaining??0)>0&&!open.some(o=>o.instrumentId===instrumentId&&(!o.entryAt||Date.parse(o.entryAt)===Date.parse(p.entryAt)))))};
 });
}
export function eligibilityReasons(metrics:ReturnType<typeof stockEligibilityMetrics>[number],criteria:EligibilitySettings['criteria']){
 const reasons:string[]=[];
 if(metrics.incomplete)reasons.push('Incomplete or invalid position records');
 if(metrics.closedTrades<criteria.minClosedTrades)reasons.push(`Needs ${criteria.minClosedTrades} closed trades; has ${metrics.closedTrades}`);
 if(metrics.winRate===null||metrics.winRate<criteria.minWinRate)reasons.push(`Win rate below ${criteria.minWinRate}% or unavailable`);
 if(metrics.netPnl<=0||metrics.netPnl<criteria.minNetPnl)reasons.push(`Closed-trade net P&L must be positive and at least INR ${criteria.minNetPnl}`);
 if(criteria.maxClosedDrawdown!==undefined&&metrics.closedDrawdown>criteria.maxClosedDrawdown)reasons.push(`Closed-trade drawdown exceeds INR ${criteria.maxClosedDrawdown}`);
 return reasons;
}
export async function assessPaperEligibility(id:string,raw:unknown){
 const settings=eligibilitySettingsSchema.parse(raw),run=await BacktestRunModel.findById(id).lean();invariant(run,'Backtest not found');
 const blockers:string[]=[];
 const checkReport=(r:BacktestRun,label:string)=>{
  if(r.status!=='completed'||!r.result)blockers.push(`${label} must be completed`);
  if(r.config.dataPolicy&&!r.selectionAudit)blockers.push(`${label} has no data readiness audit`);
  if(backtestDataIssues(r.result??{}).length)blockers.push(`${label} has unresolved data gaps`);
 };
 checkReport(run,'Selection report');
 const current=await StrategyModel.findById(run.strategy._id).lean();
 if(!current||current.archivedAt||current.revision!==run.strategy.revision)blockers.push('Backtest the current saved strategy revision before applying this shortlist');
 let validation:BacktestRun|null=null;
 if(settings.validationReportId){
  validation=await BacktestRunModel.findById(settings.validationReportId).lean();
  invariant(validation,'Validation backtest not found');
  invariant(validation.strategy._id===run.strategy._id&&validation.strategy.revision===run.strategy.revision,'Validation must use the same strategy and revision');
  invariant(Date.parse(validation.config.from)>=Date.parse(run.config.to),'Validation must be a separate later period without overlap');
  checkReport(validation,'Validation report');
 }
 const [universe,active,existingSession]=await Promise.all([MonthlyUniverseModel.findById(currentMonth()).lean(),instruments.find({_id:{$in:run.config.ids},active:true}).select('_id').lean(),PaperSessionModel.findOne({strategyId:run.strategy._id,active:true}).select('_id strategy.revision mode').lean()]);
 const qualified=new Set(universe?.members.map(m=>m.instrumentId)??[]),activeIds=new Set(active.map(s=>s._id));
 const validationMetrics=validation?new Map(stockEligibilityMetrics(validation).map(m=>[m.instrumentId,m])):undefined;
 const rows=stockEligibilityMetrics(run).map(metrics=>{
  const reasons=eligibilityReasons(metrics,settings.criteria);
  if(!qualified.has(metrics.instrumentId))reasons.push('Not in the current qualified list');
  if(!activeIds.has(metrics.instrumentId))reasons.push('Listing is inactive');
  const other=validationMetrics?.get(metrics.instrumentId);
  if(validationMetrics){if(!other)reasons.push('Not tested in the validation report');else reasons.push(...eligibilityReasons(other,settings.criteria).map(r=>'Validation: '+r));}
  return {...metrics,validation:other,reasons,eligible:!reasons.length&&!blockers.length};
 });
 return {sourceBacktestId:id,strategyId:run.strategy._id,revision:run.strategy.revision,settings,assessedAt:new Date().toISOString(),blockers,rows,eligibleIds:rows.filter(r=>r.eligible).map(r=>r.instrumentId),existingSession:existingSession?{id:existingSession._id,revision:existingSession.strategy.revision,mode:existingSession.mode}:null,validated:!!validation};
}
