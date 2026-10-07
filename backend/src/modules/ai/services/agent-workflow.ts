import {z} from 'zod';
import {StrategyModel} from '../../strategies/models/strategy.model.js';
import {BacktestRunModel} from '../../backtesting/models/backtest.model.js';
import {MonthlyRuleModel} from '../../qualification/models/qualification.model.js';
import {backtestDataIssues} from '../../backtesting/services/data-quality.js';
import {invariant} from '../../../shared/errors.js';
export const workflowRequestSchema=z.object({kind:z.enum(['backtest','paper','qualification']),strategyId:z.string().uuid().nullable().optional(),reportId:z.string().uuid().nullable().optional()}).strict();
export type WorkflowRequest=z.infer<typeof workflowRequestSchema>;
export async function prepareAgentWorkflow(request:WorkflowRequest){
 const input=workflowRequestSchema.parse(request);
 if(input.kind==='qualification'){const rule=await MonthlyRuleModel.findById('monthly').select('revision').lean();invariant(rule,'Save monthly qualification rules before scanning.');return {kind:'qualification' as const,revision:rule.revision};}
 const report=input.kind==='paper'&&input.reportId?await BacktestRunModel.findById(input.reportId).select('-snapshots -result.replay -result.curve -result.trades').lean():null;
 if(input.kind==='paper'){
  invariant(report?.status==='completed','Choose a completed backtest report before starting paper monitoring from chat.');
  invariant(!report.config.dataPolicy||report.selectionAudit,'This report has no data readiness audit. Rerun it before paper trading.');
  invariant(report.result&&!backtestDataIssues(report.result).length,'Repair the backtest data gaps and rerun before using this report for paper trading.');
  invariant(!input.strategyId||input.strategyId===report.strategy._id,'The report belongs to a different strategy.');
 }
 const strategy=await StrategyModel.findById(report?.strategy._id??input.strategyId).lean();
 invariant(strategy&&!strategy.archivedAt,'Choose a current saved strategy.');
 invariant(!report||report.strategy.revision===strategy.revision,'This report uses older rules. Backtest the current revision first.');
 return {kind:input.kind,strategyId:strategy._id,revision:strategy.revision,name:strategy.name,cadence:strategy.entry.cadence,horizon:strategy.entry.horizon,capital:strategy.risk.initialCapital,sourceReportId:report?report._id:undefined};
}
