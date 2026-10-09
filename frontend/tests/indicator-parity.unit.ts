import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import fields from '../../packages/rule-catalog/fields.json' with {type:'json'};
import {indicatorValues} from '../src/modules/stock-details/utils/chartIndicators.ts';
import {indicatorCatalog,type IndicatorKind,type CalculationSettings} from '../src/modules/stock-details/utils/indicatorCatalog.ts';
const bars=Array.from({length:150},(_,i)=>{const close=100+i*.24+Math.sin(i*.7)*9,open=close+Math.cos(i)*2;return {time:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),open,high:Math.max(open,close)+1.4,low:Math.min(open,close)-2.1,close,volume:1000+Math.round(700*(1+Math.sin(i*.4)))};});
const variants:Partial<Record<IndicatorKind,CalculationSettings>>={dema:{source:'ohlc4'},averagePrice:{source:'hlc3'},connorsRsi:{streakPeriod:4,rankPeriod:20},ema:{source:'hlc3'},sma:{source:'open'},rsi:{source:'ohlc4'},bollinger:{maType:'ema',deviation:'population',multiplier:2.5,source:'hl2'},bollingerBandwidth:{maType:'wma',multiplier:1.7},supertrend:{multiplier:2},macd:{source:'open',fastPeriod:5,slowPeriod:13,signalPeriod:4},adx:{adxSmoothing:7},vwap:{anchor:'month'},keltner:{atrPeriod:9,multiplier:1.5},stochastic:{smoothK:2,dPeriod:4},stochRsi:{stochPeriod:9,smoothK:2,dPeriod:4},ichimoku:{conversionPeriod:5,basePeriod:10,spanPeriod:20,displacement:9},sar:{start:.01,increment:.03,maximum:.15}};
const pick:Record<string,number>={macdSignal:1,macdHistogram:2,bollingerLower:2,bollingerUpper:0,donchianLower:2,keltnerLower:2,atrBandLower:2,stochasticD:1,stochRsiD:1,aroonDown:1,ichimokuBase:1,ichimokuA:2,ichimokuB:3};
const cases=[];
for(const [field,raw] of Object.entries(fields)){const d=raw as {indicator?:IndicatorKind;period?:{default:number}};if(!d.indicator||['relativeStrength','benchmarkClose','benchmarkEma','pivots'].includes(d.indicator))continue;for(const settings of [{},...(variants[d.indicator]?[variants[d.indicator]!]:[])]){const period=d.period?.default;cases.push({field,period,settings,values:indicatorValues(bars,d.indicator,period??indicatorCatalog[d.indicator].period??14,settings)[pick[field]??0]});}}

test('chart and engine indicator variants agree on every candle', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const python = process.env.QUANTFORGE_PYTHON ?? resolve(root, process.platform === 'win32' ? 'engine/.venv/Scripts/python.exe' : 'engine/.venv/bin/python');
  const script = `import json,sys
import numpy as np
from quantforge.market import candles
from quantforge.rules import indicator
payload=json.load(sys.stdin)
df=candles(payload['bars'],'2026-01-01')
for c in payload['cases']:
 actual=indicator(df,c['field'],c.get('period'),c['settings']).to_numpy()
 expected=np.array([np.nan if v is None else v for v in c['values']])
 np.testing.assert_allclose(actual,expected,rtol=1e-8,atol=1e-8,equal_nan=True,err_msg=c['field']+str(c['settings']))
print(len(payload['cases']))`;
  const count = execFileSync(python, ['-c', script], { cwd: resolve(root, 'engine'), input: JSON.stringify({ bars, cases }), encoding: 'utf8', timeout: 60000 });
  assert.equal(Number(count.trim()), cases.length);
  assert.ok(cases.length >= 69);
});
