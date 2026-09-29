import { test, expect, type Page } from '@playwright/test';
import { respondToStrategyReview } from './helpers/strategyReview';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { applyRuleReviewFix } from '../src/modules/strategies/utils/ruleReviewFixes';
import type { Condition } from '../src/modules/qualification/types';
import type { RuleReviewIssue } from '../src/modules/strategies/types/ruleReview';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const browserErrors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{
  const errors:string[]=[];browserErrors.set(page,errors);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/cannot be a descendant|cannot contain|hydration|Uncaught/.test(msg.text()))errors.push(msg.text());});
});
test.afterEach(async({page})=>{expect(browserErrors.get(page)).toEqual([]);});
const c=(operator:Condition['operator'],value:number):Condition=>({left:'rsi',leftFrame:'1d',operator,rightType:'value',right:'ema20',rightFrame:'1d',value,multiplier:1,tolerance:2});
const step=(page:Page,name:string)=>page.getByRole('navigation',{name:'Strategy editor steps'}).getByRole('button',{name});
async function fixture(page:Page,conditions:Condition[],unavailable=false){
  const initial=sampleTradingPlan('swing');
  initial.entry.groups=[{logic:'AND',conditions}]; initial.exit={...initial.exit,enabled:false,groups:[]};
  let saved={...initial,_id:id,revision:2,savedAt:new Date().toISOString()},writes=0,reviews=0;
  await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:{}}));
  await page.route('**/api/session',route=>route.fulfill({json:{mode:'local',authenticated:true}}));
  await page.route('**/api/strategies',route=>route.fulfill({json:[saved]}));
  await page.route('**/api/strategies/*',route=>{
    if(route.request().url().endsWith('/review')){reviews++;return unavailable?route.fulfill({status:503,json:{message:'Review temporarily unavailable'}}):respondToStrategyReview(route);}
    if(route.request().method()!=='PUT')return route.fulfill({json:[]});
    saved={...route.request().postDataJSON().draft,_id:id,revision:++writes+2,savedAt:new Date().toISOString()};
    return route.fulfill({json:saved});
  });
  await page.route('**/api/backtests**',route=>route.fulfill({json:[]}));
  await page.goto('/strategies?rule='+id);
  return {saved:()=>saved,writes:()=>writes,reviews:()=>reviews};
}

test('simplifications preview, apply only to draft, undo, save and reload',async({page},testInfo)=>{
  const state=await fixture(page,[c('gte',50),c('gt',60)]);
  await expect(page.getByText('1 simplifications',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  await expect(drawer.getByText('A condition adds no extra filtering',{exact:true})).toBeVisible();
  await drawer.getByRole('button',{name:'Preview simplification'}).click();
  const modal=page.getByRole('dialog',{name:'Review this simplification'});
  await expect(modal.getByText('Before · AND',{exact:true})).toBeVisible();
  await expect(modal.getByText('After · AND',{exact:true})).toBeVisible();
  expect(state.writes()).toBe(0);
  await modal.getByRole('button',{name:'Apply to draft'}).click();
  await expect(drawer.getByRole('button',{name:'Undo simplification'})).toBeVisible();
  expect(state.saved().entry.groups[0].conditions).toHaveLength(2);
  await drawer.getByRole('button',{name:'Undo simplification'}).click();
  await expect(drawer.getByRole('button',{name:'Preview simplification'})).toBeVisible();
  await drawer.getByRole('button',{name:'Preview simplification'}).click();
  await modal.getByRole('button',{name:'Apply to draft'}).click();
  await drawer.getByRole('button',{name:'Close',exact:true}).click();
  await step(page,'2 Buy rules').click();
  await expect(page.getByLabel('Condition 1 in group 1',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Condition 2 in group 1',{exact:true})).toHaveCount(0);
  await step(page,'5 Review & save').click();
  await expect(page.getByText('No conflict found in the supported checks',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('rule-review-desktop.png'),fullPage:true});
  await page.getByLabel('Dark theme',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:testInfo.outputPath('rule-review-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('rule-review-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Save strategy',exact:true}).click();
  await expect.poll(()=>state.writes()).toBe(1);
  expect(state.saved().entry.groups[0].conditions).toEqual([c('gt',60)]);
  await page.reload();
  await step(page,'2 Buy rules').click();
  await expect(page.getByLabel('Condition 2 in group 1',{exact:true})).toHaveCount(0);
});

test('impossible rules explain affected conditions, prevent save and link back to editing',async({page},testInfo)=>{
  const state=await fixture(page,[c('gt',70),c('lt',30)]);
  await page.getByLabel('Strategy name',{exact:true}).fill('Review contradictory conditions');
  await expect(page.getByText('1 conflicts',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByText('Buy rules cannot match',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Preview simplification'})).toHaveCount(0);
  expect(state.writes()).toBe(0);
  await page.getByRole('button',{name:'Edit buy rules',exact:true}).click();
  await page.getByRole('button',{name:'Remove condition 2 from group 1',exact:true}).click();
  await expect(page.getByText('0 conflicts',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect.poll(()=>state.writes()).toBe(1);
  await page.screenshot({path:testInfo.outputPath('rule-review-editor.png'),fullPage:true});
});

test('editing after applying a suggestion disables undo of the older draft',async({page})=>{
  await fixture(page,[c('gt',60),c('gt',60)]);
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  await page.getByRole('button',{name:'Preview simplification'}).click();
  await page.getByRole('button',{name:'Apply to draft'}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  await drawer.getByRole('button',{name:'Close',exact:true}).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Undo simplification'})).toBeVisible();
  await page.getByLabel('Strategy name',{exact:true}).fill('My changed draft');
  await expect(page.getByRole('button',{name:'Undo simplification'})).toHaveCount(0);
});

test('failed review is explicit and recoverable, never shown as a successful analysis',async({page})=>{
  const state=await fixture(page,[c('gt',50)],true);
  await expect(page.getByText('Rule review is unavailable',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  await expect(drawer.getByText('Rule review is unavailable',{exact:true})).toBeVisible();
  await page.route('**/api/strategies/review',respondToStrategyReview);
  await drawer.getByRole('button',{name:'Retry review'}).click();
  await expect(drawer.getByText('No conflict found in the supported checks',{exact:true})).toBeVisible();
  expect(state.writes()).toBe(0);
});

test('an older review response cannot replace the review of corrected rules',async({page})=>{
  await fixture(page,[c('gt',70),c('lt',30)]);
  await expect(page.getByText('1 conflicts',{exact:true})).toBeVisible();
  let release!:()=>void,completed!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),done=new Promise<void>(resolve=>{completed=resolve;});
  await page.route('**/api/strategies/review',async route=>{
    const body=route.request().postDataJSON();
    if(body.entry.groups[0].conditions.length===2){
      await gate;
      try { await respondToStrategyReview(route); } finally { completed(); }
    }else await respondToStrategyReview(route);
  });
  const requested=page.waitForRequest(r=>r.url().endsWith('/strategies/review'));
  await page.getByLabel('Strategy name',{exact:true}).fill('An updated plan');
  await requested;
  await step(page,'2 Buy rules').click();
  await page.getByRole('button',{name:'Remove condition 2 from group 1',exact:true}).click();
  await expect(page.getByText('0 conflicts',{exact:true})).toBeVisible();
  release();await done;
  await expect(page.getByText('0 conflicts',{exact:true})).toBeVisible();
  await expect(page.getByText('Resolve conflicting rules',{exact:true})).toHaveCount(0);
});

test('safe fix rejects missing or changed conditions and never empties a group',()=>{
  const draft=sampleTradingPlan('swing');draft.entry.groups=[{logic:'AND',conditions:[c('gt',50),c('gt',50)]}];
  const issue:RuleReviewIssue={id:'one',severity:'suggestion',title:'Duplicate',explanation:'',recommendation:'',section:'entry',locations:[],fix:{kind:'remove-condition',label:'Simplify',location:{side:'entry',group:0,condition:1},expectedCondition:c('gt',50)}};
  const next=applyRuleReviewFix(draft,issue)!;
  expect(next.entry.groups[0].conditions).toHaveLength(1);
  expect(draft.entry.groups[0].conditions).toHaveLength(2);
  expect(applyRuleReviewFix(next,issue)).toBeUndefined();
  draft.entry.groups[0].conditions[1].value=60;
  expect(applyRuleReviewFix(draft,issue)).toBeUndefined();
});
