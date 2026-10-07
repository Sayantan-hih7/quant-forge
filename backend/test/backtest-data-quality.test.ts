import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backtestDataIssues} from '../src/modules/backtesting/services/data-quality.js';
test('known missing observations and unevaluable decisions prevent a clean-data handoff',()=>{
 assert.equal(backtestDataIssues({historyQuality:{missingMinutes:2,missingExitSessions:1},unavailableDecisions:3}).length,3);
 assert.deepEqual(backtestDataIssues({historyQuality:{missingMinutes:0,missingExitSessions:0},zeroVolumeBars:200,unavailableDecisions:0}),[]);
});

 test('initial warm-up does not block handoff but never-ready stocks and later gaps do',()=>{
 assert.deepEqual(backtestDataIssues({unavailableDecisions:12,warmupDecisions:12,unreadyInstruments:[]}),[]);
 assert.equal(backtestDataIssues({unavailableDecisions:12,warmupDecisions:12,unreadyInstruments:['NSE:1']}).length,1);
 assert.equal(backtestDataIssues({unavailableDecisions:13,warmupDecisions:12,unreadyInstruments:[]}).length,1);
 });
