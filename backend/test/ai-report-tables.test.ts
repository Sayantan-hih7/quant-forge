import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceReport, sourceReportSchema } from '../src/modules/ai/services/report-tables.js';
test('source tables preserve real currency units, unavailable values and scope', () => {
 const report=sourceReportSchema.parse(sourceReport('paper',{scope:'latest 12 orders; samples only',sessions:[],orders:[{_id:'one',quantity:2,fillPaise:12055,feePaise:0,realizedPnlPaise:-125,filledAt:new Date('2026-10-07T04:00:00Z')}]}));
 assert.equal(report.tables[1].rows[0][7],120.55);assert.equal(report.tables[1].rows[0][8],0);assert.equal(report.tables[1].rows[0][9],-1.25);assert.equal(report.tables[1].rows[0][2],null);assert.match(report.scope,/samples only/);assert.equal(report.tables[1].rows[0][6],'2026-10-07T04:00:00.000Z');
});
test('backtest export preserves revision, gaps, rupees and sample label',()=>{
 const report=sourceReportSchema.parse(sourceReport('backtests',{scope:'one report',runs:[{id:'report',strategy:{name:'Swing',revision:7},result:{netPnl:-500,returnPercent:-0.5},dataQuality:{status:'incomplete'},qualityIssues:[{message:'Missing minute'}],tradeSample:[{quantity:5,pnl:100,entry:200}]}]}));
 assert.equal(report.tables[0].rows[0][2],7);assert.equal(report.tables[0].rows[0][6],-500);assert.match(String(report.tables[0].rows[0][12]),/Missing minute/);assert.match(report.tables[1].name,/sample/);assert.equal(report.tables[1].rows[0][7],100);assert.equal(report.tables[1].rows[0][6],null);
});
