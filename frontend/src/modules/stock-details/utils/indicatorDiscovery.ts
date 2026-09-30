import { indicatorCatalog, indicatorKinds, type IndicatorKind } from './indicatorCatalog';
import type { ChartIndicator } from './chartIndicators';

const aliases: Partial<Record<IndicatorKind, string>> = {
  sma: 'moving average simple moving average ma', ema: 'exponential moving average', dema: 'double exponential moving average double ema',
  wma: 'weighted moving average', vwma: 'volume weighted moving average', hma: 'hull moving average',
  connorsRsi: 'connors rsi crsi connor', rsi: 'relative strength index', macd: 'moving average convergence divergence',
  averagePrice: 'average price typical price midpoint hl2 hlc3 ohlc4', maCross: 'ma cross ema cross moving average crossover',
  vwap: 'volume weighted average price anchored vwap avwap', cmf: 'cmf money flow', sar: 'psar parabolic stop reverse',
};
export interface IndicatorChoice { value: string; label: string; search: string; group: string; kind?: IndicatorKind; settings?: Partial<ChartIndicator> }
export const indicatorChoices: IndicatorChoice[] = [
  {value:'volume',label:'Volume',search:'volume bars histogram volume sma average',group:'Volume'},
  ...indicatorKinds.filter(k=>k!=='volumeSma').map(kind=>({value:kind,label:indicatorCatalog[kind].label,kind,search:`${kind} ${indicatorCatalog[kind].label} ${aliases[kind]??''}`,group:indicatorCatalog[kind].pane==='price'?'On the price chart':'Below the price chart'})),
  {value:'ma9',label:'Moving Average (9)',search:'ma sma moving average 9',group:'Quick setups',kind:'sma',settings:{period:9}},
  {value:'emaCross',label:'EMA Cross (9 / 21)',search:'ema cross crossover',group:'Quick setups',kind:'maCross',settings:{maType:'ema',fastPeriod:9,slowPeriod:21}},
  {value:'smaCross',label:'MA Cross (9 / 21)',search:'ma sma cross crossover',group:'Quick setups',kind:'maCross',settings:{maType:'sma',fastPeriod:9,slowPeriod:21}},
  {value:'goldenCross',label:'Golden Cross (50 / 200)',search:'golden cross bullish sma 50 200',group:'Quick setups',kind:'maCross',settings:{maType:'sma',fastPeriod:50,slowPeriod:200,timeframe:'1d',crossDirection:'above'}},
  {value:'deathCross',label:'Death Cross (50 / 200)',search:'death dead cross bearish sma 50 200',group:'Quick setups',kind:'maCross',settings:{maType:'sma',fastPeriod:50,slowPeriod:200,timeframe:'1d',crossDirection:'below'}},
];
export function createChartIndicator(choice: IndicatorChoice, color: string): ChartIndicator {
  const kind=choice.kind!;
  return {id:crypto.randomUUID(),kind,period:indicatorCatalog[kind].period??14,timeframe:kind==='relativeStrength'?'1d':'chart',color,...choice.settings};
}
