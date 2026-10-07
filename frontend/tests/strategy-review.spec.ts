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
async function fixture(page:Page,conditions:Condition[],unavailable=false,tightStop=false){
  const initial=sampleTradingPlan('swing');
  if(tightStop)initial.risk.maxStopPercent=3;
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
  await page.goto('/strategies?rule='+id+'&mode=edit');
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
  await expect(drawer.getByRole('button',{name:'Undo change'})).toBeVisible();
  expect(state.saved().entry.groups[0].conditions).toHaveLength(2);
  await drawer.getByRole('button',{name:'Undo change'}).click();
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
  await page.getByRole('button',{name:'Edit strategy',exact:true}).click();
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
  await expect(page.getByRole('button',{name:'Undo change'})).toBeVisible();
  await page.getByLabel('Strategy name',{exact:true}).fill('My changed draft');
  await expect(page.getByRole('button',{name:'Undo change'})).toHaveCount(0);
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


test('guided conflict fix previews, rechecks, applies to draft and undoes without saving',async({page})=>{
  const state=await fixture(page,[c('gt',70),c('lt',30)]);
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  await drawer.getByRole('button',{name:'Suggest a fix',exact:true}).first().click();
  await page.getByRole('button',{name:'Edit manually instead',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Suggest a fix',exact:true});
  await expect(modal.getByRole('button',{name:'Preview change'})).toBeDisabled();
  await modal.getByRole('button',{name:'Remove this condition',exact:true}).click();
  await modal.getByRole('button',{name:'Preview change'}).click();
  await expect(modal.getByText('No conflict found in the supported checks',{exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Apply to draft'}).click();
  await expect(drawer.getByText('0 conflicts',{exact:true})).toBeVisible();
  expect(state.writes()).toBe(0);
  expect(state.saved().entry.groups[0].conditions).toHaveLength(2);
  await drawer.getByRole('button',{name:'Undo change'}).click();
  await expect(drawer.getByText('1 conflicts',{exact:true})).toBeVisible();
});

test('replacement validates settings and rejects stale nested parameters; risk changes stay in draft',()=>{
  const draft=sampleTradingPlan('swing');
  draft.entry.groups=[{logic:'AND',conditions:[{...c('gt',60),leftSettings:{source:'close'}}]}];
  const original=structuredClone(draft.entry.groups[0].conditions[0]);
  const issue:RuleReviewIssue={id:'fix',severity:'error',title:'Conflict',explanation:'',recommendation:'',section:'entry',locations:[],fix:{kind:'replace-condition',label:'Correct',location:{side:'entry',group:0,condition:0},expectedCondition:original,replacement:{...original,value:55}}};
  expect(applyRuleReviewFix(draft,issue)?.entry.groups[0].conditions[0].value).toBe(55);
  draft.entry.groups[0].conditions[0].leftSettings={source:'open'};
  expect(applyRuleReviewFix(draft,issue)).toBeUndefined();
  const riskIssue:RuleReviewIssue={...issue,fix:{kind:'update-risk',label:'Risk',expectedRisk:structuredClone(draft.risk),replacement:{...draft.risk,maxStopPercent:5}}};
  expect(applyRuleReviewFix(draft,riskIssue)?.risk.maxStopPercent).toBe(5);
  expect(draft.risk.maxStopPercent).not.toBe(5);
  if(riskIssue.fix?.kind==='update-risk')riskIssue.fix.replacement.maxStopPercent=-1;
  expect(applyRuleReviewFix(draft,riskIssue)).toBeUndefined();
});


test('single impossible condition is corrected explicitly without deleting the final condition',async({page},testInfo)=>{
  const state=await fixture(page,[{...c('lte',0),left:'close'}]);
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  await drawer.getByRole('button',{name:'Suggest a fix',exact:true}).first().click();
  await page.getByRole('button',{name:'Edit manually instead',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Suggest a fix',exact:true});
  await expect(modal.getByRole('button',{name:'Remove this condition'})).toBeDisabled();
  await modal.getByRole('button',{name:'Correct this condition'}).click();
  await modal.getByRole('spinbutton',{name:/Threshold/}).fill('100');
  await modal.getByRole('button',{name:'Preview change'}).click();
  await expect(modal.getByText('No conflict found in the supported checks',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('guided-fix-preview.png')});
  await modal.getByRole('button',{name:'Apply to draft'}).click();
  await expect(drawer.getByText('0 conflicts',{exact:true})).toBeVisible();
  expect(state.saved().entry.groups[0].conditions[0].value).toBe(0);
  expect(state.writes()).toBe(0);
});

test('tight stop warning can be kept or adjusted with preview and undo',async({page})=>{
  const state=await fixture(page,[c('gt',50)],false,true);
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  const warning=drawer.locator('article').filter({hasText:'Tight stop for an overnight strategy'});
  await warning.getByRole('button',{name:'Suggest a fix'}).click();
  await page.getByRole('button',{name:'Edit manually instead',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Suggest a fix',exact:true});
  await modal.getByRole('button',{name:'Keep this setting'}).click();
  await expect(warning.getByText('Kept for this draft')).toBeVisible();
  expect(state.saved().risk.maxStopPercent).toBe(3);
  await warning.getByRole('button',{name:'Suggest a fix'}).click();
  await page.getByRole('button',{name:'Edit manually instead',exact:true}).click();
  await modal.getByRole('spinbutton',{name:'Maximum initial stop distance (%)',exact:true}).fill('5');
  await modal.getByRole('button',{name:'Preview change'}).click();
  await expect(modal.getByRole('button',{name:'Apply to draft'})).toBeEnabled();
  await modal.getByRole('button',{name:'Apply to draft'}).click();
  await expect(drawer.getByText('Tight stop for an overnight strategy',{exact:true})).toHaveCount(0);
  await drawer.getByRole('button',{name:'Undo change'}).click();
  await expect(warning).toBeVisible();
  expect(state.writes()).toBe(0);
});


test('AI proposes a conflict correction automatically, previews and applies without saving',async({page})=>{
  let calls=0;
  const state=await fixture(page,[c('gt',70),c('lt',30)]);
  await page.route('**/api/ai/status',r=>r.fulfill({json:{configured:true,provider:'gemini',model:'test'}}));
  await page.route('**/api/ai/proposals',r=>{
    calls++;
    const body=r.request().postDataJSON();
    expect(body.prompt).toContain('Buy rules cannot match');
    const proposal=structuredClone(body.currentDraft);
    proposal.entry.groups[0].conditions=[c('gt',70)];
    proposal.name='Unrelated AI change';
    proposal.risk.initialCapital=999999;
    return r.fulfill({json:{text:'Keep the momentum condition and remove the opposing threshold.',assumptions:['The momentum requirement is intended.'],proposal,questions:[],blockers:[],example:null,provider:'gemini',model:'test'}});
  });
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Review strategy rules'});
  await drawer.getByRole('button',{name:'Suggest a fix'}).first().click();
  const modal=page.getByRole('dialog',{name:'AI suggested fix'});
  await expect(modal.getByText('The momentum requirement is intended.')).toBeVisible();
  await expect(modal.getByRole('button',{name:'Apply to draft'})).toBeEnabled();
  await expect(modal).not.toContainText('Unrelated AI change');
  expect(calls).toBe(1);
  await modal.getByRole('button',{name:'Apply to draft'}).click();
  await expect(drawer.getByText('0 conflicts',{exact:true})).toBeVisible();
  expect(state.writes()).toBe(0);
  expect(state.saved().entry.groups[0].conditions).toHaveLength(2);
  await drawer.getByRole('button',{name:'Undo change'}).click();
  await expect(drawer.getByText('1 conflicts',{exact:true})).toBeVisible();
});

test('AI clarification keeps Apply disabled until the requested answer produces a checked fix',async({page})=>{
  const state=await fixture(page,[{...c('lte',0),left:'close'}]);
  let calls=0;
  await page.route('**/api/ai/status',r=>r.fulfill({json:{configured:true,provider:'gemini',model:'test'}}));
  await page.route('**/api/ai/proposals',r=>{
    const body=r.request().postDataJSON();calls++;
    const proposal=structuredClone(body.currentDraft);
    proposal.entry.groups[0].conditions=[{...c('lte',100),left:'close'}];
    return r.fulfill({json:{text:calls===1?'Which price did you intend?':'Use the requested price.',assumptions:[],proposal:calls===1?null:proposal,questions:calls===1?[{id:'price',question:'What price should the close be below?',reason:'Zero is not a valid stock-price limit.',options:['100']}]:[],blockers:[],example:null,provider:'gemini',model:'test'}});
  });
  await page.getByRole('button',{name:'Review rules',exact:true}).click();
  await page.getByRole('dialog',{name:'Review strategy rules'}).getByRole('button',{name:'Suggest a fix'}).first().click();
  const modal=page.getByRole('dialog',{name:'AI suggested fix'});
  await expect(modal.getByRole('button',{name:'Apply to draft'})).toBeDisabled();
  await modal.getByRole('radio',{name:'100',exact:true}).check();
  await modal.getByRole('button',{name:'Proceed'}).click();
  await expect(modal.getByRole('button',{name:'Apply to draft'})).toBeEnabled();
  expect(calls).toBe(2);expect(state.writes()).toBe(0);
});
