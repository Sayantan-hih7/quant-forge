import type { PaperOrder } from '../models/paper.model.js';

export interface ExitAccounting { entryPaise:number; allocatedCostPaise:number; entryFeePaise:number; realizedPnlPaise:number; positionOpenedAt:string }
/** Integer cost allocation matches partial position reductions in the fill transaction. */
export function exitAccounting(held:{entryPaise:number;quantity:number;costPaise:number;openedAt:string},quantity:number,fillPaise:number,feePaise:number):ExitAccounting {
  const allocatedCostPaise=quantity===held.quantity?held.costPaise:Math.round(held.costPaise*quantity/held.quantity);
  return {entryPaise:held.entryPaise,allocatedCostPaise,entryFeePaise:allocatedCostPaise-held.entryPaise*quantity,
    realizedPnlPaise:fillPaise*quantity-feePaise-allocatedCostPaise,positionOpenedAt:held.openedAt};
}

/** Read-only compatibility for fills recorded before exit accounting was stored.
 * Replay the entire ledger, never just the visible history page. */
export function legacyExitAccounting(fills:PaperOrder[]) {
  const held=new Map<string,{entryPaise:number;quantity:number;costPaise:number;openedAt:string}>(), results=new Map<string,ExitAccounting>();
  const rows=[...fills].sort((a,b)=>(a.filledAt??a.createdAt).localeCompare(b.filledAt??b.createdAt)||a.createdAt.localeCompare(b.createdAt)||a._id.localeCompare(b._id));
  for(const row of rows){
    if(row.status!=='filled')continue;
    const key=`${row.sessionId}/${row.instrumentId}`,position=held.get(key);
    if(row.fillPaise==null || row.feePaise==null || row.quantity<1){held.delete(key);continue;}
    if(row.side==='BUY'){
      // The execution engine does not pyramid. An incomplete ledger must not invent costs.
      if(position){held.delete(key);continue;}
      held.set(key,{entryPaise:row.fillPaise,quantity:row.quantity,costPaise:row.quantity*row.fillPaise+row.feePaise,openedAt:row.filledAt??row.createdAt});
    }else if(position && position.quantity>=row.quantity){
      const accounting=exitAccounting(position,row.quantity,row.fillPaise,row.feePaise);results.set(row._id,accounting);
      position.quantity-=row.quantity;position.costPaise-=accounting.allocatedCostPaise;
      if(!position.quantity)held.delete(key);
    }else held.delete(key);
  }
  return results;
}
