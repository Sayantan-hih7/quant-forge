import { summarizeCondition } from '../../qualification/utils/ruleSummary';
import { cadenceLabel } from './strategyLabels';
import { horizonLabels } from '../../qualification/config/metrics';
import type { TradingPlanDraft } from '../types/tradingPlan';
import type { Condition,RuleDefinition } from '../../qualification/types';

export interface StrategyChange {section:string;label:string;before:string;after:string}
const missing='Not set';
function describe(c:Condition){try{return summarizeCondition(c);}catch{return `Older condition: ${JSON.stringify(c)}`;}}
const labels:Record<string,string>={signalRanking:'Competing signal priority',reentryCooldownMinutes:'Wait after full exit (minutes)',maxEntriesPerStockPerDay:'Maximum entries per stock per day',dailyLossLimitPercent:'Daily loss entry limit (%)',maxEntryDeviationPercent:'Maximum entry price deviation (%)',entryCutoffMinute:'Intraday entry cutoff (minutes after midnight IST)',costModel:'Trading cost model',exchangeFeePercent:'Exchange fee (%)',initialCapital:'Initial capital (₹)',riskPercent:'Risk per trade (%)',maxPositions:'Maximum open positions',timeframe:'Execution candle',stopMode:'Initial stop method',stopPercent:'Initial stop (%)',stopValue:'Initial stop amount / price (₹)',entryOrderType:'Buy order type',entryLimitPrice:'Maximum buy price (₹)',atrPeriod:'ATR period',atrMultiplier:'ATR multiplier',targetR:'Single target (R)',overnight:'Overnight holding',breakevenAfterTarget1:'Move to entry after Target 1',slippagePercent:'Slippage per side (%)',feePercent:'Fees per side (%)',basis:'Target unit',profitPercent:'Gain (%)',value:'Target value',closePercent:'Position to close (%)',moveStopTo:'Move stop after fill',trigger:'Activation',at:'Activation threshold',distanceR:'Trail distance (R)'};
const human=(v:unknown)=>v===undefined||v===null?missing:typeof v==='boolean'?v?'Enabled':'Disabled':typeof v==='number'?v.toLocaleString('en-IN',{maximumFractionDigits:12}):String(v);
function flatten(value:unknown,prefix='',out:Record<string,unknown>={}):Record<string,unknown>{
  if(value&&typeof value==='object'){for(const [key,v] of Object.entries(value))flatten(v,prefix?`${prefix}.${key}`:key,out);}
  else out[prefix]=value;
  return out;
}
function riskLabel(path:string){return path.split('.').map((part,i,all)=>/^\d+$/.test(part)?`Target ${Number(part)+1}`:part==='maxStopPercent'?'Maximum initial stop distance (%)':part==='exitTargets'?'Profit targets':part==='stopManagement'?'Stop adjustments':part==='breakeven'?'Move stop to entry':part==='trailing'?'Trailing stop':labels[part]??all[i]).join(' · ');}
function riskValue(path:string,value:unknown){
  if(value===undefined||value===null)return missing;
  if(path.endsWith('.moveStopTo'))return value===0?'Entry price':`Target ${value}`;
  const key=path.split('.').at(-1)!;
  const names:Record<string,Record<string,string>>={
    stopMode:{fixed:'Fixed percentage',trailing:'Trailing percentage',ATR:'ATR-based',price:'Exact stop price',amount:'Rupee distance from entry',candleLow:'Buy-signal candle low'},
    entryOrderType:{market:'Next available price',limit:'Limit buy'},
    basis:{risk:'Risk multiple (R)',percent:'Percentage gain',amount:'Rupee gain per share',price:'Exact target price'},
    trigger:{risk:'Risk multiple (R)',target:'Target filled'},
  };
  return names[key]?.[String(value)]??human(value);
}
function activeRisk(draft:TradingPlanDraft){
  const risk={...draft.risk};
  if(risk.entryOrderType!=='limit')delete risk.entryLimitPrice;
  if(!['price','amount'].includes(risk.stopMode))delete risk.stopValue;
  // Historical snapshots may contain inactive defaults. Show active controls only.
  const result:Record<string,unknown>={...risk};
  if(!['fixed','trailing'].includes(risk.stopMode))delete result.stopPercent;
  if(risk.stopMode!=='ATR'){delete result.atrPeriod;delete result.atrMultiplier;}
  if(risk.exitTargets?.length)delete result.targetR;
  if(!risk.breakevenAfterTarget1)delete result.breakevenAfterTarget1;
  result.entryOrderType??='market';
  return result;
}
export function strategyChanges(before:TradingPlanDraft,after:TradingPlanDraft):StrategyChange[]{
  const changes:StrategyChange[]=[];
  const add=(section:string,label:string,a:unknown,b:unknown)=>{if(human(a)!==human(b))changes.push({section,label,before:human(a),after:human(b)});};
  add('Setup','Strategy name',before.name,after.name);
  const rules=(side:'entry'|'exit')=>{
    const a=before[side],b=after[side],section=side==='entry'?'Buy rules':'Sell rules';
    add(section,'Rule name',a.name,b.name);
    add(section,'Description',a.description,b.description);
    add(section,'Enabled',a.enabled!==false,b.enabled!==false);
    add(section,'Trading horizon',horizonLabels[a.horizon],horizonLabels[b.horizon]);
    add(section,'Check frequency',cadenceLabel(a.cadence),cadenceLabel(b.cadence));
    if(a.enabled===false&&b.enabled===false)return;
    add(section,'Connect groups',a.logic,b.logic);
    const groupText=(group:RuleDefinition['groups'][number]|undefined)=>group?`${group.logic}: ${group.conditions.map(describe).join(' ')}`:undefined;
    for(let gi=0;gi<Math.max(a.groups.length,b.groups.length);gi++){
      const ag=a.groups[gi],bg=b.groups[gi];
      if(!ag||!bg){add(section,`Group ${gi+1}`,groupText(ag),groupText(bg));continue;}
      add(section,`Group ${gi+1} logic`,ag.logic,bg.logic);
      // Match unchanged conditions before pairing edits, so an insertion does not mark every later condition changed.
      const remaining=bg.conditions.map(condition=>({condition,text:describe(condition)})),removed:typeof remaining=[];
      for(const condition of ag.conditions){const text=describe(condition),i=remaining.findIndex(item=>item.text===text);if(i>=0)remaining.splice(i,1);else removed.push({condition,text});}
      for(const item of removed){
        // Do not imply an unrelated new indicator replaced a deleted condition.
        const sameField=remaining.findIndex(next=>next.condition.left===item.condition.left&&next.condition.leftFrame===item.condition.leftFrame&&next.condition.leftPeriod===item.condition.leftPeriod&&next.condition.leftOffset===item.condition.leftOffset);
        const replacement=sameField>=0?remaining.splice(sameField,1)[0]:undefined;
        add(section,`Group ${gi+1} · condition ${replacement?'changed':'removed'}`,item.text,replacement?.text);
      }
      for(const item of remaining)add(section,`Group ${gi+1} · condition added`,undefined,item.text);
    }
  };
  rules('entry');rules('exit');
  const oldRisk=flatten(activeRisk(before)),newRisk=flatten(activeRisk(after));
  for(const key of new Set([...Object.keys(oldRisk),...Object.keys(newRisk)]))add('Risk & execution',riskLabel(key),riskValue(key,oldRisk[key]),riskValue(key,newRisk[key]));
  return changes;
}
