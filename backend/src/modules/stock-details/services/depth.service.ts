import { marketSession } from '../../../shared/market-calendar.js';
import { stockQuotes } from './quotes.service.js';
import type { Instrument } from '../../market-data/types.js';

/** While the market is open the five-level snapshot refreshes every ~3 s (Dhan allows one quote request per second). */
const OPEN_SNAPSHOT_MS = 3_000;
export async function stockDepth(stock: Instrument) {
  const session=marketSession();
  // The open drawer's depth waits up to 2 s for the shared allowance so table refreshes cannot starve it.
  const result=await stockQuotes([stock],{snapshotMaxAgeMs:session.open?OPEN_SNAPSHOT_MS:300_000,slotWaitMs:session.open?2_000:0});
  const quote=result.quotes[0];
  return {instrumentId:stock._id,depth:quote?.depth??null,liveDepth:quote?.liveDepth??null,session,message:result.message};
}
