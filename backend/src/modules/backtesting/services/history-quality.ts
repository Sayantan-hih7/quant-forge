import { intradaySessions, type MinuteRow, type SessionQuality } from '../../market-data/services/intraday-quality.js';
interface HistoryStock { id: string; intraday: MinuteRow[] }
export interface QualityCounts {
  sessionsChecked: number; incompleteSessions: number; missingMinutes: number; missingExitSessions: number;
  leadingMissingMinutes: number; internalMissingMinutes: number; trailingMissingMinutes: number;
  noCandleSessions: number; zeroVolumeMinutes: number;
}
export interface IntradayHistoryQuality extends QualityCounts {
  affected: (QualityCounts & { instrumentId: string; days: SessionQuality[] })[];
}
export const emptyQuality = ():QualityCounts => ({sessionsChecked:0,incompleteSessions:0,missingMinutes:0,missingExitSessions:0,
  leadingMissingMinutes:0,internalMissingMinutes:0,trailingMissingMinutes:0,noCandleSessions:0,zeroVolumeMinutes:0});
/** Audit missing sessions, opening gaps and non-trading bars separately. */
export function intradayHistoryQuality(stocks:HistoryStock[],config:{from:string;to:string},overnight:boolean):IntradayHistoryQuality {
  const result:IntradayHistoryQuality={...emptyQuality(),affected:[]};
  for(const stock of stocks){
    const days=intradaySessions(stock.intraday,config.from,config.to),item={...emptyQuality(),instrumentId:stock.id,days:days.filter(day=>day.missing||day.zeroVolumeMinutes)};
    for(const day of days){
      item.sessionsChecked++;item.incompleteSessions+=Number(day.missing>0);item.missingMinutes+=day.missing;
      item.leadingMissingMinutes+=day.leading;item.internalMissingMinutes+=day.internal;item.trailingMissingMinutes+=day.trailing;
      item.noCandleSessions+=Number(day.noCandles);item.zeroVolumeMinutes+=day.zeroVolumeMinutes;
      item.missingExitSessions+=Number(!overnight&&!day.hasExitTrade);
    }
    if(item.incompleteSessions||item.zeroVolumeMinutes)result.affected.push(item);
    for(const key of Object.keys(emptyQuality()) as (keyof QualityCounts)[])result[key]+=item[key];
  }
  return result;
}
