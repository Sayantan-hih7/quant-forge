import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tradeFeePaise} from '../src/modules/paper-trading/services/trading-costs.js';
const cases=JSON.parse(readFileSync(new URL('../../test/fixtures/cash-costs.json',import.meta.url),'utf8')) as {gross:number;side:'BUY'|'SELL';overnight:boolean;expected:number}[];
test('NSE March 2026 rates match shared independent paise ledger fixtures',()=>{
 for(const row of cases)assert.equal(tradeFeePaise(row.gross,row.side,{costModel:'indian-cash',overnight:row.overnight,feePercent:0}),row.expected);
});
