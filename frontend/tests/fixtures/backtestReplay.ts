import type { BacktestReplayView, ReplayEvent } from '../../src/modules/backtesting/types/replay';
export function replayFixture(): BacktestReplayView {
  const entryAt = '2026-09-01T03:45:00Z';
  const common = {instrumentId:'NSE:1',entryAt};
  const events: ReplayEvent[] = [
    {...common,kind:'signal',at:'2026-08-31T10:00:00Z',phase:'close',sequence:0,side:'BUY',checks:[{field:'bodyAboveEma',matched:true,left:85.91,right:80}],candle:{time:'2026-08-31',end:'2026-08-31T10:00:00Z',timeframe:'1d',open:96,high:100,low:95,close:99,volume:1000}},
    {...common,kind:'entry',at:entryAt,fillAt:entryAt,phase:'open',sequence:1,side:'BUY',price:100,quantity:10,remainingQuantity:10,stop:96,initialRisk:4,targets:[{number:1,price:108,quantity:4},{number:2,price:116,quantity:6}]},
    {...common,kind:'exit',at:'2026-09-02T10:00:00Z',fillAt:'2026-09-02T03:45:00Z',phase:'close',sequence:2,side:'SELL',price:108,quantity:4,remainingQuantity:6,pnl:31,reason:'Target 1'},
    {...common,kind:'stop',at:'2026-09-02T10:00:00Z',phase:'close',sequence:3,previousStop:96,stop:100,remainingQuantity:6,effective:'next-bar',reason:'Breakeven / target protection'},
    {...common,kind:'exit',at:'2026-09-03T10:00:00Z',fillAt:'2026-09-03T03:45:00Z',phase:'close',sequence:4,side:'SELL',price:116,quantity:6,remainingQuantity:0,pnl:95,reason:'Target 2'},
  ];
  const dates = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04'];
  const bars = dates.map(time => ({time,open:96,high:100,low:95,close:99,volume:1000}));
  bars[6] = {time:dates[6],open:100,high:101,low:96.5,close:99.5,volume:4567};
  bars[7] = {time:dates[7],open:100,high:110,low:98,close:109,volume:2000};
  bars[8] = {time:dates[8],open:110,high:118,low:109,close:117,volume:3000};
  return {instrumentId:'NSE:1',revision:3,timeframe:'1d',source:'verified-reconstruction',events,frames:{'1d':bars},warnings:[],preparedAt:'2026-09-28T04:30:00Z'};
}
