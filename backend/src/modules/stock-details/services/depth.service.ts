import { marketSession } from '../../../shared/market-calendar.js';
import { stockQuotes } from './quotes.service.js';
import type { Instrument } from '../../market-data/types.js';

export async function stockDepth(stock: Instrument) {
  const session=marketSession();
  const result=await stockQuotes([stock],{snapshotMaxAgeMs:session.open?15_000:300_000});
  const quote=result.quotes[0];
  return {instrumentId:stock._id,depth:quote?.depth??null,session,message:result.message};
}
