import { test, expect, type Page } from '@playwright/test';
import { tradingPlanSchema } from '../src/modules/strategies/schemas/tradingPlanSchema';
import { sampleTradingPlan } from '../src/modules/strategies/utils/tradingPlans';
import { newMonthlyCondition } from '../src/modules/qualification/config/monthlyFields';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const empty = { questions: [], assumptions: [], blockers: [], proposal: null, baseline: null, review: null, destination: null };
const review = { blocked: false, issues: [] };
test.setTimeout(60000);
test.beforeEach(async ({ page }) => {
  const chats=new Map<string,Record<string,unknown>>();
  await page.route('**/api/ai/conversations**',async route=>{const req=route.request(),id=new URL(req.url()).pathname.split('/')[4];
    if(id==='storage')return route.fulfill({json:{usedBytes:1000,count:chats.size,maxBytes:104857600,maxCount:500,percent:chats.size/5,warningPercent:90,lastRemovedCount:0}});
    if(!id)return route.fulfill({json:[...chats.values()]});
    if(req.method()==='PUT'){const body=req.postDataJSON();const row={_id:id,title:chats.get(id)?.title??(body.snapshot.messages[0]?.text??body.snapshot.resume?.prompt??'Conversation'),revision:(Number(chats.get(id)?.revision)||0)+1,updatedAt:new Date().toISOString(),snapshot:body.snapshot};chats.set(id,row);return route.fulfill({json:{revision:row.revision}});}
    if(req.method()==='PATCH'){chats.set(id,{...chats.get(id),title:req.postDataJSON().title});return route.fulfill({json:{ok:true}});}
    if(req.method()==='DELETE'){chats.delete(id);return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:chats.get(id)});
  });
  await page.route('**/api/session', route => route.fulfill({ json: { mode: 'local', authenticated: true } }));
  await page.route('**/api/strategies', route => route.fulfill({ json: [] }));
  await page.route('**/api/qualification', route => route.fulfill({ json: { rule: null, runs: [], canRun: false, universe: null } }));
});
async function open(page: Page) { await page.goto('/strategies', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Assistant', exact: true }).click(); }
async function send(page: Page, text: string) { await page.getByRole('textbox', { name: 'Message QuantForge assistant' }).fill(text); await page.getByRole('button', { name: 'Send', exact: true }).click(); }

test('create a strategy from clarification to confirmed save without leaving chat', async ({ page }, testInfo) => {
  let requests = 0, writes = 0;
  const task = { scope: 'strategy', id, revision: 0 };
  await page.addInitScript(() => localStorage.setItem('quantforge-assistant-preferences', 'retired notes'));
  await page.route('**/api/ai/chat', route => {
    requests++; const input = route.request().postDataJSON(); expect(input.preferences).toBeUndefined();
    if (requests === 1) return route.fulfill({ json: { ...empty, text: 'What capital should this use?', task, questions: [{ id: 'capital', question: 'How much capital?', options: ['100000'], reason: 'For sizing' }] } });
    expect(input.task).toEqual(task); expect(input.messages.some((m: { text: string }) => m.text.includes('How much capital?'))).toBe(true);
    return route.fulfill({ json: { ...empty, text: 'Review this swing draft.', task, proposal: sampleTradingPlan('swing'), review } });
  });
  await page.route(`**/api/strategies/${id}`, route => { writes++; const input = route.request().postDataJSON(); expect(input.expectedRevision).toBe(0); expect(input.draft.entry.horizon).toBe('swing'); return route.fulfill({ json: { revision: 1 } }); });
  await open(page);
  await expect(page.getByText('My preferences', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('quantforge-assistant-preferences'))).toBeNull();
  await send(page, 'Create a swing strategy'); await expect(page.getByRole('log')).toContainText('How much capital?');
  await send(page, 'Use 100000 capital');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  expect(writes).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('assistant-review.png') });
  await page.getByRole('button', { name: 'Save these rules', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('saved as revision 1');
  await expect(page).toHaveURL(/\/assistant$/); expect(writes).toBe(1);
});

test('edit existing strategy shows before and after and uses expected revision', async ({ page }) => {
  const before = sampleTradingPlan('swing'), after = { ...before, risk: { ...before.risk, riskPercent: 0.5 } };
  let writes = 0;
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, text: 'Risk changed to 0.5%.', task: { scope: 'strategy', id, revision: 7 }, baseline: before, proposal: after, review } }));
  await page.route(`**/api/strategies/${id}`, route => { writes++; expect(route.request().postDataJSON()).toEqual({ draft: tradingPlanSchema.parse(after), expectedRevision: 7 }); return route.fulfill({ json: { revision: 8 } }); });
  await open(page); await send(page, 'Set my swing risk to 0.5%');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Currently saved (revision 7)' })).toBeVisible();
  await page.getByRole('button', { name: 'Save these rules', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('saved as revision 8'); expect(writes).toBe(1);
});

test('monthly qualification is reviewed and saved inside chat with no scan or navigation', async ({ page }) => {
  const rule = { name: 'Monthly qualification', description: '', timeframe: '1mo', logic: 'AND', groups: [{ logic: 'AND', conditions: [{ ...newMonthlyCondition(), value: 2000 }] }] };
  let saves = 0, scans = 0;
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { choices: {} } }));
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, text: 'Market cap at least 2000 crore.', task: { scope: 'monthly', id: 'monthly', revision: 3 }, proposal: rule, review } }));
  await page.route('**/api/qualification/rule', route => { saves++; expect(route.request().postDataJSON()).toEqual({ rule, expectedRevision: 3 }); return route.fulfill({ json: { revision: 4 } }); });
  await page.route('**/api/qualification/runs', route => { scans++; return route.fulfill({ json: {} }); });
  await open(page); await send(page, 'Qualification market cap at least 2000 crore');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  await page.getByRole('button', { name: 'Save these rules', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Qualification rule saved as revision 4');
  await expect(page).toHaveURL(/\/assistant$/); expect(saves).toBe(1); expect(scans).toBe(0);
});

test('save conflict retains draft and never announces success', async ({ page }) => {
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, text: 'Review the changes.', task: { scope: 'strategy', id, revision: 4 }, proposal: sampleTradingPlan('swing'), review } }));
  await page.route(`**/api/strategies/${id}`, route => route.fulfill({ status: 409, json: { message: 'This strategy changed elsewhere. Start a new conversation.' } }));
  await open(page); await send(page, 'Edit my swing strategy');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  await page.getByRole('button', { name: 'Save these rules', exact: true }).click();
  await expect(page.getByText('Save not confirmed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('log')).not.toContainText('saved as revision');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save these rules', exact: true })).toBeEnabled();
});

test('conflicting draft cannot be saved from the shared assistant', async ({ page }) => {
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, text: 'Review the draft.', task: { scope: 'strategy', id, revision: 0 }, proposal: sampleTradingPlan('swing'), review: { blocked: true, issues: [{ severity: 'error', title: 'Impossible condition', explanation: 'Price cannot be negative.', recommendation: 'Choose the intended comparison.' }] } } }));
  await open(page); await send(page, 'Build my strategy');
  await expect(page.getByText('Resolve the conflicting rules before saving')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and save', exact: true })).toHaveCount(0);
});

test('stopping chat cancels pending generation', async ({ page }) => {
  let finish!: () => void; const finished = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/ai/chat', async route => { await new Promise(resolve => setTimeout(resolve, 1000)); await route.fulfill({ json: { ...empty, task: null, text: 'Late answer must not appear' } }).catch(() => {}); finish(); });
  await open(page); await send(page, 'Explain the workflow');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await finished;
  await expect(page.getByRole('log')).not.toContainText('Late answer must not appear');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
});


test('saved monthly rules can scan and show progress in the same assistant', async ({ page }) => {
  const rule = { name: 'Monthly qualification', description: '', timeframe: '1mo', logic: 'AND', groups: [{ logic: 'AND', conditions: [newMonthlyCondition()] }] };
  let queued = false;
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { choices: {} } }));
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, text: 'Monthly rules ready.', task: { scope: 'monthly', id: 'monthly', revision: 3 }, proposal: rule, review } }));
  await page.route('**/api/qualification/rule', route => route.fulfill({ json: { revision: 4 } }));
  await page.route('**/api/qualification', route => route.fulfill({ json: { rule: { revision: 4, rule }, canRun: !queued, universe: null, runs: queued ? [{ _id: id, status: 'running', revision: 4, total: 50, processed: 10, qualified: 2, rejected: 8, unavailable: 0 }] : [] } }));
  await page.route('**/api/qualification/runs', route => { expect(route.request().postDataJSON()).toEqual({ expectedRevision: 4 }); queued = true; return route.fulfill({ json: { id } }); });
  await open(page); await send(page, 'Change my qualification market cap');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  await page.getByRole('button', { name: 'Save these rules', exact: true }).click();
  await page.getByRole('button', { name: 'Run qualification scan', exact: true }).click();
  await expect(page.getByText('10 / 50 stocks checked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish qualified stocks', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/assistant$/);
});

test('publishing scan results requires acknowledging missing inputs', async ({ page }) => {
  const rule = { name: 'Monthly qualification', description: '', timeframe: '1mo', logic: 'AND', groups: [{ logic: 'AND', conditions: [newMonthlyCondition()] }] };
  let published = false;
  await page.route('**/api/market-data/capabilities', route => route.fulfill({ json: { choices: {} } }));
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, text: 'Review this rule.', task: { scope: 'monthly', id: 'monthly', revision: 3 }, proposal: rule, review } }));
  await page.route('**/api/qualification/rule', route => route.fulfill({ json: { revision: 4 } }));
  await page.route('**/api/qualification', route => route.fulfill({ json: { rule: { revision: 4, rule }, canRun: true, universe: published ? { runId: id } : null, runs: [{ _id: id, status: 'completed', revision: 4, total: 50, processed: 50, qualified: 20, rejected: 25, unavailable: 3, awaitingHistory: 2 }] } }));
  await page.route(`**/api/qualification/runs/${id}/publish`, route => { expect(route.request().postDataJSON()).toEqual({ acknowledgeMissingData: true }); published = true; return route.fulfill({ json: {} }); });
  await open(page); await send(page, 'Set my qualification rules');
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  await page.getByRole('button', { name: 'Save these rules', exact: true }).click();
  await page.getByRole('button', { name: 'Publish qualified stocks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish list', exact: true })).toBeDisabled();
  expect(published).toBe(false);
  await page.getByRole('checkbox', { name: /I reviewed the 5 stocks/ }).check();
  await page.getByRole('button', { name: 'Publish list', exact: true }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible(); expect(published).toBe(true);
});


test('assistant page offers starters and retains conversation across workspace navigation', async ({ page }, testInfo) => {
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, task: null, text: 'Qualification selects your stock universe.' } }));
  await page.goto('/assistant');
  await expect(page.getByRole('heading', { name: 'What would you like to build?' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('assistant-page-desktop.png') });
  await page.getByRole('button', { name: 'Qualify stocks' }).click();
  await expect(page.getByRole('textbox', { name: 'Message QuantForge assistant' })).toHaveValue('Help me set my monthly qualification rules.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Qualification selects your stock universe.');
  await page.getByRole('link', { name: 'Algo Strategies', exact: true }).click();
  await expect(page.getByRole('log')).toHaveCount(0);
  await page.getByRole('link', { name: 'AI assistant', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Qualification selects your stock universe.');
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: 'Message QuantForge assistant' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('assistant-page-mobile.png') });
});

test('guided questions preserve custom answers and fill only permitted defaults',async({page},testInfo)=>{
 let calls=0;
 const questions=[
  {id:'holding',question:'How long can you hold?',reason:'Choose a holding period.',options:['Swing','Intraday'],recommendedOption:'Swing',recommendationReason:'Allows less frequent monitoring.',allowRecommendedDefault:true},
  {id:'capital',question:'Paper capital?',reason:'For sizing.',options:['100000','50000'],recommendedOption:'100000',recommendationReason:'Editable simulation amount.',allowRecommendedDefault:true},
  {id:'risk',question:'Risk per trade?',reason:'Controls planned loss.',options:['0.25%','0.5%'],recommendedOption:'0.25%',recommendationReason:'Smaller starting paper risk.',allowRecommendedDefault:true},
 ];
 await page.route('**/api/ai/chat',r=>{calls++;if(calls===1)return r.fulfill({json:{...empty,text:'A few details.',task:null,questions}});const body=r.request().postDataJSON();expect(body.prompt).toContain('Hold for a week');expect(body.prompt).toContain('100000');expect(body.prompt).toContain('0.25%');return r.fulfill({json:{...empty,text:'Answers received.',task:null}});});
 await open(page);await send(page,'I am new, help me prepare a paper plan');
 await page.getByRole('radio',{name:'Write my own answer',exact:true}).check();
 await page.getByRole('textbox',{name:'Your answer to question 1'}).fill('Hold for a week');
 await page.getByRole('tab',{name:'Question 2'}).click();await page.getByRole('tab',{name:'Question 1'}).click();
 await expect(page.getByRole('textbox',{name:'Your answer to question 1'})).toHaveValue('Hold for a week');
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('guided-mobile.png')});
 await page.getByRole('button',{name:'Use recommended defaults',exact:true}).click();
 await expect(page.getByRole('log')).toContainText('Answers received.');expect(calls).toBe(2);
});

test('required question cannot be skipped and failed request retains answers',async({page})=>{
 let calls=0;
 await page.route('**/api/ai/chat',r=>{calls++;return calls===1?r.fulfill({json:{...empty,text:'Choose the intended entry.',task:null,questions:[{id:'entry',question:'Actual buy limit or example?',reason:'Cannot guess entry intent.',options:['Example','Actual limit']}]}}):r.fulfill({status:503,json:{message:'Please retry'}});});
 await open(page);await send(page,'Buy at 100, is this an example');
 await page.getByRole('button',{name:'Proceed',exact:true}).click();await expect(page.getByRole('alert')).toContainText('needs your answer');expect(calls).toBe(1);
 await page.getByRole('radio',{name:'Example',exact:true}).check();await page.getByRole('button',{name:'Proceed',exact:true}).click();
 await expect(page.getByText('Please retry',{exact:true})).toBeVisible();await expect(page.getByRole('radio',{name:'Example',exact:true})).toBeChecked();
});

test('attachments are visible, sent as bounded context, removable and reject unsupported files',async({page})=>{
 await page.route('**/api/ai/chat',r=>{expect(r.request().postDataJSON().attachments).toEqual([{kind:'text',name:'plan.txt',text:'Use EMA 5 above EMA 21'}]);return r.fulfill({json:{...empty,text:'I read your note.',task:null}});});
 await open(page);
 await page.getByLabel('Attach strategy file').setInputFiles({name:'plan.pdf',mimeType:'application/pdf',buffer:Buffer.from('pdf')});
 await expect(page.getByText(/PDF and spreadsheet/)).toBeVisible();
 await page.getByLabel('Attach strategy file').setInputFiles({name:'plan.txt',mimeType:'text/plain',buffer:Buffer.from('Use EMA 5 above EMA 21')});
 await expect(page.getByRole('button',{name:'Remove plan.txt'})).toBeVisible();
 await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('I read your note.');
 await page.getByRole('button',{name:'Remove plan.txt'}).click();await expect(page.getByRole('button',{name:'Remove plan.txt'})).toHaveCount(0);
});

test('dictation is reviewed before sending and microphone errors are actionable',async({page})=>{
 await page.addInitScript(()=>{class SpeechMock {onresult?: (event:unknown)=>void;onend?:()=>void;onerror?:(event:unknown)=>void;start(){Object.assign(window,{speechMock:this});}stop(){this.onend?.();}abort(){}};Object.assign(window,{SpeechRecognition:SpeechMock});});
 let calls=0;await page.route('**/api/ai/chat',r=>{calls++;expect(r.request().postDataJSON().prompt).toBe('Help me make a paper strategy');return r.fulfill({json:{...empty,text:'Let us build a plan.',task:null}});});
 await open(page);await page.getByRole('button',{name:'Start dictation'}).click();
 await page.evaluate(()=>{(window as unknown as {speechMock:{onresult:(event:unknown)=>void}}).speechMock.onresult({results:[{0:{transcript:'Help me make a paper strategy'},isFinal:true}]});});
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();expect(calls).toBe(0);
 await page.getByRole('button',{name:'Stop dictation'}).click();
 await expect(page.getByRole('textbox',{name:'Message QuantForge assistant'})).toHaveValue('Help me make a paper strategy');
 await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('Let us build a plan.');
 await page.getByRole('button',{name:'Start dictation'}).click();await page.evaluate(()=>{(window as unknown as {speechMock:{onerror:(event:unknown)=>void}}).speechMock.onerror({error:'not-allowed'});});
 await expect(page.getByText(/Microphone access was denied/)).toBeVisible();expect(calls).toBe(1);
});

test('context menu offers trading inputs and pasted code stays an attachment until sent',async({page})=>{
 let calls=0;
 await page.route('**/api/ai/chat',r=>{calls++;expect(r.request().postDataJSON().attachments).toEqual([{kind:'text',name:'strategy-note.txt',text:'strategy("Example")'}]);return r.fulfill({json:{...empty,text:'This is strategy code to review.',task:null}});});
 await open(page);
 await expect(page.getByRole('combobox',{name:'Dictation language'})).toHaveCount(0);
 await page.getByRole('button',{name:'Add context',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Attach chart screenshot'})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Attach strategy note / CSV'})).toBeVisible();
 await page.getByRole('menuitem',{name:'Paste trading idea or code'}).click();
 await page.getByRole('textbox',{name:'Trading idea or code'}).fill('strategy("Example")');
 await page.getByRole('button',{name:'Attach to message',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remove strategy-note.txt'})).toBeVisible();expect(calls).toBe(0);
 await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('This is strategy code to review.');expect(calls).toBe(1);
});

test('large paste becomes a previewable attachment without truncation or automatic submission',async({page})=>{
 let calls=0;const pasted='EMA strategy notes\n'.repeat(100);
 await page.route('**/api/ai/chat',r=>{calls++;expect(r.request().postDataJSON().attachments[0].text).toBe(pasted);return r.fulfill({json:{...empty,text:'Read your full note.',task:null}});});
 await open(page);const box=page.getByRole('textbox',{name:'Message QuantForge assistant'});await box.fill('Please explain this');
 await box.evaluate((element,text)=>{const data=new DataTransfer();data.setData('text/plain',text);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},pasted);
 await expect(page.getByRole('button',{name:'Preview pasted-text.txt'})).toBeVisible();await expect(box).toHaveValue('Please explain this');expect(calls).toBe(0);
 await page.getByRole('button',{name:'Preview pasted-text.txt'}).click();await expect(page.getByRole('textbox',{name:'Attached text preview'})).toHaveValue(pasted);await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('Read your full note.');
 const oversized='x'.repeat(20001);
 await box.evaluate((element,text)=>{const data=new DataTransfer();data.setData('text/plain',text);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},oversized);
 await expect(page.getByRole('textbox',{name:'Trading idea or code'})).toHaveValue(oversized);await expect(page.getByRole('button',{name:'Attach to message',exact:true})).toBeDisabled();expect(calls).toBe(1);
});

test('agent evidence remains attached to the answer and source navigation is explicit',async({page})=>{
 await page.route('**/api/ai/chat',r=>r.fulfill({json:{...empty,text:'Your latest report has incomplete data.',task:null,activity:[{tool:'backtests',status:'completed',checkedAt:'2026-10-07T06:00:00Z',summary:'Checked latest 5 reports',data:{privateDetails:'never rendered'}},{tool:'connections',status:'unavailable',checkedAt:'2026-10-07T06:00:00Z',summary:'Could not read connection records.'}]}}));
 await open(page);await send(page,'Inspect my backtest and feed');
 await page.getByText('App records checked (2)',{exact:true}).click();
 await expect(page.getByText('Checked latest 5 reports',{exact:true})).toBeVisible();await expect(page.getByText('Could not read connection records.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open source screen'})).toHaveCount(2);await expect(page.getByText('never rendered')).toHaveCount(0);
 await expect(page).toHaveURL(/assistant$/);
});


test('inline backtest retries safely and starts paper only after explicit mode selection',async({page})=>{
 const reportId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let attempts=0,paper=0;const requestIds:string[]=[];
 await page.route('**/api/ai/chat',route=>route.fulfill({json:{...empty,text:'Review the backtest settings.',task:null,workflow:{kind:'backtest',strategyId:id,revision:3,name:'Test swing',cadence:'daily',capital:100000}}}));
 await page.route('**/api/backtests/universe?*',route=>route.fulfill({json:{stocks:[{_id:'NSE:1',symbol:'TEST',exchange:'NSE',source:'scan',suitability:{profiles:[{horizon:'swing',status:'matched',checks:[]}]}},{_id:'BSE:2',symbol:'OTHER',exchange:'BSE'}]}}));
 await page.route('**/api/backtests',route=>{attempts++;const body=route.request().postDataJSON();requestIds.push(body.requestId);expect(body.ids).toEqual(['NSE:1']);expect(body.expectedRevision).toBe(3);if(attempts===1)return route.fulfill({status:503,json:{message:'Response interrupted. Retry.'}});return route.fulfill({json:{id:reportId}});});
 await page.route(`**/api/backtests/${reportId}`,route=>route.fulfill({json:{_id:reportId,status:'completed',strategy:{revision:3},config:{ids:['NSE:1'],dataPolicy:'ready'},selectionAudit:{includedIds:['NSE:1']},result:{netPnl:123,returnPercent:1.23,winRate:50,unavailableDecisions:0}}}));
 await page.route('**/api/paper/sessions',route=>{paper++;expect(route.request().postDataJSON()).toEqual({strategyId:id,expectedRevision:3,sourceBacktestId:reportId,ids:['NSE:1'],mode:'automatic'});return route.fulfill({json:{id:reportId}});});
 await open(page);await send(page,'Backtest my swing strategy');
 const panel=page.getByRole('region',{name:'Assistant backtest workflow'});
 await expect(panel.getByText('1 selected / 1 available')).toBeVisible();expect(attempts).toBe(0);
 await expect(panel.getByRole('button',{name:'Run backtest',exact:true})).toBeDisabled();
 await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Run backtest',exact:true}).click();await expect(panel.getByText('Response interrupted. Retry.')).toBeVisible();
 await panel.getByRole('button',{name:'Run backtest',exact:true}).click();await expect(panel.getByText('Net P&L: INR 123')).toBeVisible();expect(requestIds[0]).toBe(requestIds[1]);expect(paper).toBe(0);
 await panel.getByRole('combobox',{name:'Paper execution mode'}).click();await page.getByText('Automatic paper fills under strategy risk limits',{exact:true}).click();await panel.getByRole('button',{name:'Start paper monitoring'}).click();await expect(panel.getByText('Paper session started')).toBeVisible();expect(paper).toBe(1);
});

test('incomplete report cannot start paper monitoring in chat',async({page})=>{
 const reportId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await page.route('**/api/ai/chat',route=>route.fulfill({json:{...empty,text:'Report',task:null,workflow:{kind:'paper',strategyId:id,revision:3,name:'Test swing',sourceReportId:reportId}}}));
 await page.route(`**/api/backtests/${reportId}`,route=>route.fulfill({json:{_id:reportId,status:'completed',strategy:{revision:3},config:{ids:['NSE:1']},result:{netPnl:123,returnPercent:1.23,winRate:50,unavailableDecisions:2}}}));
 await open(page);await send(page,'Review and start paper from this report');await expect(page.getByText('Data gaps need attention before starting paper trading')).toBeVisible();await expect(page.getByRole('button',{name:'Start paper monitoring'})).toHaveCount(0);
});


test('improvement follow-up sends selected workflow context and replaces its controls with a draft',async({page})=>{
 let calls=0;
 await page.route('**/api/backtests/universe?*',r=>r.fulfill({json:{stocks:[]}}));
 await page.route('**/api/ai/chat',r=>{calls++;if(calls===1)return r.fulfill({json:{...empty,text:'Backtest settings',task:{scope:'strategy',id,revision:6},workflow:{kind:'backtest',strategyId:id,revision:6,name:'Saved swing',cadence:'daily'}}});
 expect(r.request().postDataJSON().activeWorkflow).toEqual({kind:'backtest',strategyId:id,revision:6});
 return r.fulfill({json:{...empty,text:'Review the proposed strategy changes.',clearWorkflow:true,task:{scope:'strategy',id,revision:6},proposal:sampleTradingPlan('swing'),review}});});
 await open(page);await send(page,'Help with my swing strategy');await expect(page.getByRole('region',{name:'Assistant backtest workflow'})).toBeVisible();
 await send(page,'no i mean improve strategy for probable good results.');await expect(page.getByRole('button',{name:'Review and save',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Assistant backtest workflow'})).toHaveCount(0);
 await expect(page.getByText('Editing saved revision 6')).toBeVisible();
});


test('saved conversation survives new chat and reload and can be renamed and deleted',async({page})=>{
 await page.route('**/api/ai/chat',r=>r.fulfill({json:{...empty,text:'Your plan uses completed candles.',task:null}}));
 await open(page);await send(page,'Explain my trading plan');await expect(page.getByRole('log')).toContainText('completed candles');
 await page.getByRole('button',{name:'New conversation',exact:true}).click();await expect(page.getByRole('log')).not.toContainText('completed candles');
 await page.getByRole('button',{name:'Chat history',exact:true}).click();const history=page.getByRole('complementary',{name:'Saved conversations'});await history.getByRole('button',{name:/Explain my trading plan/}).first().click();await expect(page.getByRole('log')).toContainText('completed candles');
 await expect(page.getByRole('dialog',{name:'Chat history'})).not.toBeVisible();await page.reload();await page.getByRole('button',{name:'Chat history',exact:true}).click();await history.getByRole('button',{name:/Explain my trading plan/}).first().click();await expect(page.getByRole('log')).toContainText('completed candles');
 await page.getByRole('button',{name:'Chat history',exact:true}).click();await history.getByRole('button',{name:'Options for Explain my trading plan'}).click();await page.getByRole('menuitem',{name:'Rename',exact:true}).click();await page.getByRole('textbox',{name:'Conversation name'}).fill('My learning plan');await page.getByRole('button',{name:'OK',exact:true}).click();
 await expect(history.getByRole('button',{name:'Options for My learning plan'})).toBeVisible();await history.getByRole('button',{name:'Options for My learning plan'}).click();await page.getByRole('menuitem',{name:'Delete',exact:true}).click();await page.getByRole('button',{name:'Delete chat',exact:true}).click();await expect(history.getByRole('button',{name:'Options for My learning plan'})).toHaveCount(0);
});


test('compacted context is inspectable and older transcript messages remain visible',async({page})=>{
 let count=0;await page.route('**/api/ai/chat',r=>{count++;expect(r.request().postDataJSON().messages.length).toBeLessThanOrEqual(10);return r.fulfill({json:{...empty,text:`Answer ${count}`,task:null,...(count===7?{memory:'Agreed: paper only, capital 100000.'}:{})}});});
 await open(page);for(let i=1;i<=7;i++){await send(page,`Question number ${i}`);await expect(page.getByRole('log')).toContainText(`Answer ${i}`);}
 await expect(page.getByRole('log')).toContainText('Question number 1');await page.getByText('Earlier context - automatically compacted',{exact:true}).click();await expect(page.getByText('Agreed: paper only, capital 100000.',{exact:true})).toBeVisible();
});

test('failed history save does not discard conversation when starting a new one',async({page})=>{
 await page.route('**/api/ai/conversations/*',r=>r.fulfill({status:503,json:{message:'Chat storage temporarily unavailable'}}));
 await page.route('**/api/ai/chat',r=>r.fulfill({json:{...empty,text:'Retain this answer.',task:null}}));
 await open(page);await send(page,'Keep my trading discussion');await expect(page.getByRole('log')).toContainText('Retain this answer.');await page.getByRole('button',{name:'New conversation',exact:true}).click();await expect(page.getByRole('log')).toContainText('Retain this answer.');await expect(page.getByText('Chat storage temporarily unavailable').first()).toBeVisible();
});


test('history drawer explains storage limits and warns at ninety percent',async({page})=>{
 await page.route('**/api/ai/conversations/storage',r=>r.fulfill({json:{usedBytes:1024*1024,count:450,maxBytes:104857600,maxCount:500,percent:90,warningPercent:90,lastRemovedCount:75,lastCleanupAt:'2026-10-07T08:00:00Z'}}));
 await open(page);await page.getByRole('button',{name:'Chat history',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Chat history'});await expect(drawer.getByText('Chat storage is nearly full')).toBeVisible();await expect(drawer).toContainText('450 / 500 conversations');await expect(drawer).toContainText('1.0 / 100 MB');await expect(drawer).toContainText('75 older chats removed');await expect(drawer).toContainText('The chat being saved is protected');
});

test('formatted answers render safe Markdown and export source tables', async ({ page }) => {
  await page.route('**/api/ai/chat', route => route.fulfill({ json: { ...empty, task: null,
    text: '## Report\n\n**Result**\n\n| Stock | P&L |\n| --- | --- |\n| TEST | ₹125 |\n\n<script>window.bad=true</script>\n\n[unsafe](javascript:alert(1))',
    activity: [{tool:'backtests',status:'completed',checkedAt:'2026-10-07T04:00:00Z',summary:'One report',report:{title:'Backtests',scope:'one report; sample only',tables:[{name:'Trades sample',columns:['Stock','P&L (INR)'],rows:[['=HYPERLINK("x")',-125],['TEST',null]]}]}}]
  } }));
  await open(page); await send(page, 'Show my report as a table');
  await expect(page.getByRole('heading',{name:'Report',exact:true})).toBeVisible();
  await expect(page.locator('.assistant-markdown table')).toContainText('₹125');
  await expect(page.locator('.assistant-markdown script')).toHaveCount(0);
  await expect(page.locator('.assistant-markdown a')).toHaveCount(0);
  await page.getByText('Source tables & downloads (1)',{exact:true}).click();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download table 1 CSV'}).click();
  const download=await downloaded;const stream=await download.createReadStream();let csv='';for await(const chunk of stream!)csv+=chunk.toString();
  expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('"-125"');expect(csv).toContain('sample only');expect(csv).not.toContain('₹125');
  await page.getByRole('button',{name:'Export answer'}).click();
  const excelDownload=page.waitForEvent('download');await page.getByText('Tables as Excel (.xlsx)',{exact:true}).click();
  const excel=await excelDownload;expect(excel.suggestedFilename()).toBe('quantforge-report.xlsx');
  const {default: ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile((await excel.path())!);
  expect(workbook.worksheets[1].getCell('A2').value).toBe('=HYPERLINK("x")');expect(workbook.worksheets[1].getCell('B2').value).toBe(-125);
  await expect(page.getByRole('button',{name:'Export answer'})).toBeEnabled();
  await page.getByRole('button',{name:'Export answer'}).click();
  const markdownDownload=page.waitForEvent('download');await page.getByText('Markdown (.md)',{exact:true}).click();
  expect((await markdownDownload).suggestedFilename()).toBe('quantforge-answer.md');
  await page.evaluate(()=>{const original=window.open.bind(window);window.open=(...args)=>{const result=original(...args);if(result)result.print=()=>{};return result;};});
  await page.getByRole('button',{name:'Export answer'}).click();
  const printWindow=page.waitForEvent('popup');await page.getByText('Print / save PDF',{exact:true}).click();
  const printable=await printWindow;await expect(printable.locator('body')).toContainText('\u20b9125');
  await expect(printable.locator('details')).toHaveAttribute('open','');
  await expect(printable.getByRole('button')).toHaveCount(0);await printable.close();
  await page.getByRole('button',{name:'New conversation',exact:true}).click();
  await page.getByRole('button',{name:'Chat history',exact:true}).click();
  await page.getByRole('button',{name:'Show my report as a table',exact:false}).first().click();
  await expect(page.getByText('Source tables & downloads (1)',{exact:true})).toBeVisible();
});

test('live voice waveform responds to samples and releases the microphone on stop', async ({page}, testInfo) => {
 await page.addInitScript(()=>{
  const state={volume:0,reads:0,stops:0,closes:0};Object.assign(window,{waveTest:state});
  class SpeechMock {onend?:()=>void;start(){}stop(){this.onend?.();}abort(){}}
  const track={stop(){state.stops++;},addEventListener(){}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})});
  class AudioMock {state='running';createAnalyser(){return {fftSize:1024,getByteTimeDomainData(data:Uint8Array){state.reads++;data.fill(128+state.volume);}};}createMediaStreamSource(){return {connect(){},disconnect(){}};}async resume(){}async close(){state.closes++;this.state='closed';}}
  Object.assign(window,{SpeechRecognition:SpeechMock,AudioContext:AudioMock});
 });
 await open(page);await page.getByRole('button',{name:'Start dictation'}).click();
 await expect(page.getByText('Listening - speak naturally',{exact:true})).toBeVisible();
 const canvas=page.locator('.assistant-voice-visualizer canvas');
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {waveTest:{reads:number}}).waveTest.reads)).toBeGreaterThan(3);
 const quiet=await canvas.evaluate((node:HTMLCanvasElement)=>node.toDataURL());
 await page.evaluate(()=>(window as unknown as {waveTest:{volume:number}}).waveTest.volume=22);
 await expect.poll(()=>canvas.evaluate((node:HTMLCanvasElement)=>node.toDataURL())).not.toBe(quiet);
 await page.screenshot({path:testInfo.outputPath('voice-waveform.png')});
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Stop dictation'}).click();
 await expect(canvas).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {waveTest:{stops:number}}).waveTest.stops)).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {waveTest:{closes:number}}).waveTest.closes)).toBeGreaterThan(0);
});

test('late microphone permission is released after dictation is stopped',async({page})=>{
 await page.addInitScript(()=>{
  class SpeechMock {onend?:()=>void;start(){}stop(){this.onend?.();}abort(){}}
  const state={stops:0,resolve:()=>{}};Object.assign(window,{lateMic:state,SpeechRecognition:SpeechMock});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>new Promise(resolve=>{state.resolve=()=>resolve({getTracks:()=>[{stop(){state.stops++;}}]});})});
 });
 await open(page);await page.getByRole('button',{name:'Start dictation'}).click();
 await expect(page.getByText('Opening microphone visualizer...', {exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Stop dictation'}).click();
 await page.evaluate(()=>(window as unknown as {lateMic:{resolve:()=>void}}).lateMic.resolve());
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {lateMic:{stops:number}}).lateMic.stops)).toBe(1);
 await expect(page.locator('.assistant-voice-visualizer')).toHaveCount(0);
});

test('assistant loader shows pending state and disappears when stopped',async({page})=>{
 let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/ai/chat',async route=>{await waiting;await route.fulfill({json:{...empty,task:null,text:'Done'}}).catch(()=>{});});
 await open(page);await send(page,'Explain my strategy');
 await expect(page.getByRole('status',{name:'Preparing your response'})).toBeVisible();
 await expect(page.getByText('You can stop this request at any time.')).toBeVisible();
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await expect(page.getByRole('status',{name:'Preparing your response'})).toHaveCount(0);
 release();
});

test('no speech message auto dismisses while microphone permission errors remain actionable',async({page})=>{
 await page.addInitScript(()=>{class SpeechMock {onerror?:(event:unknown)=>void;start(){Object.assign(window,{speechMock:this});}abort(){}stop(){}}Object.assign(window,{SpeechRecognition:SpeechMock});});
 await open(page);await page.getByRole('button',{name:'Start dictation'}).click();
 await page.evaluate(()=>(window as unknown as {speechMock:{onerror:(event:unknown)=>void}}).speechMock.onerror({error:'no-speech'}));
 const notice=page.getByText('No speech detected. Try again or type your message.',{exact:true});
 await expect(notice).toBeVisible();await expect(notice).toHaveCount(0,{timeout:8500});
 await page.getByRole('button',{name:'Start dictation'}).click();
 await page.evaluate(()=>(window as unknown as {speechMock:{onerror:(event:unknown)=>void}}).speechMock.onerror({error:'not-allowed'}));
 await expect(page.getByText('Microphone access was denied.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Dismiss voice message'}).click();
 await expect(page.getByText('Microphone access was denied.',{exact:false})).toHaveCount(0);
});

test('failed request removes stale questions and assumptions but preserves the conversation',async({page})=>{
 let calls=0;
 await page.route('**/api/ai/chat',route=>++calls===1?route.fulfill({json:{...empty,task:null,text:'Choose a filter',assumptions:['Old filter assumption'],questions:[{id:'filter',question:'Which filter?',reason:'Select definition',options:['Daily strength']}]}}):route.fulfill({status:422,json:{message:'Relative strength cannot use 5m. Choose daily candles.'}}));
 await open(page);await send(page,'Build an intraday strategy');
 await expect(page.getByText('Old filter assumption',{exact:true})).toBeVisible();
 await send(page,'Use my filter');
 await expect(page.getByText('Relative strength cannot use 5m. Choose daily candles.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Proceed',exact:true})).toHaveCount(0);
 await expect(page.getByText('Old filter assumption',{exact:true})).not.toBeVisible();
 await expect(page.getByRole('log')).toContainText('Use my filter');
});

test('backtest shortlist explains profile evidence instead of choosing every stock',async({page})=>{
 await page.route('**/api/ai/chat',route=>route.fulfill({json:{...empty,text:'Review the research shortlist.',task:null,workflow:{kind:'backtest',strategyId:id,revision:7,name:'Intraday plan',cadence:'5m',horizon:'intraday'}}}));
 await page.route('**/api/backtests/universe?*',route=>{expect(route.request().url()).toContain('suitability=true');return route.fulfill({json:{stocks:[{_id:'NSE:1',symbol:'MATCH',exchange:'NSE',source:'scan',suitability:{assessedAt:'2026-10-07',profiles:[{horizon:'intraday',status:'matched',checks:[{label:'Liquidity',rule:'Turnover above threshold',value:25,unit:'Cr',status:'pass',asOf:'2026-10-06'}]}]}},{_id:'NSE:2',symbol:'UNKNOWN',exchange:'NSE',source:'manual'}]}});});
 await open(page);await send(page,'Backtest suitable intraday stocks and explain why');
 await expect(page.getByText('1 selected / 2 available',{exact:true})).toBeVisible();
 await expect(page.getByText('Selected: MATCH / NSE - matched',{exact:true})).toBeVisible();
 await page.getByText('Selected: MATCH / NSE - matched',{exact:true}).click();
 await expect(page.getByText(/Turnover above threshold/)).toBeVisible();
 await expect(page.getByText('Not selected: UNKNOWN / NSE - needs data',{exact:true})).toBeVisible();
 await expect(page.getByText(/not a ranking of expected returns/)).toBeVisible();
});

test('history restores partial question answers and pending strategy review',async({page})=>{
 let calls=0;
 await page.route('**/api/strategies/review',r=>r.fulfill({json:review}));
 await page.route('**/api/ai/chat',r=>r.fulfill({json:calls++===0?{...empty,text:'Choose your capital',task:{scope:'strategy',id,revision:0},questions:[{id:'capital',question:'Capital amount?',reason:'Sizing',options:['100000','50000']}]}:{...empty,text:'Review your plan',task:{scope:'strategy',id,revision:0},proposal:sampleTradingPlan('swing'),review}}));
 await open(page);await send(page,'Create my saved review');
 await page.getByRole('radio',{name:'50000',exact:true}).check();
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 await page.getByRole('button',{name:'Chat history',exact:true}).click();
 await page.getByRole('button',{name:/Create my saved review/}).first().click();
 await expect(page.getByRole('radio',{name:'50000',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Proceed',exact:true}).click();
 await expect(page.getByRole('button',{name:'Review and save',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 await page.getByRole('button',{name:'Chat history',exact:true}).click();
 await page.getByRole('button',{name:/Create my saved review/}).first().click();
 await expect(page.getByRole('button',{name:'Review and save',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review and save',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save these rules',exact:true})).toBeVisible();
});


test('composer continues lists, previews Markdown and pastes clipboard tables safely',async({page})=>{
 let calls=0;await page.route('**/api/ai/chat',r=>{calls++;return r.fulfill({json:{...empty,text:'Received.',task:null}});});
 await open(page);const input=page.getByRole('textbox',{name:'Message QuantForge assistant'});
 await input.fill('trend');await input.press('Control+a');await page.getByRole('button',{name:'Format',exact:true}).click();await page.getByRole('button',{name:'Bold',exact:true}).click();await expect(input).toHaveValue('**trend**');await page.getByRole('button',{name:'Format',exact:true}).click();
 await input.fill('1. First point');await input.press('Enter');await expect(input).toHaveValue('1. First point\n2. ');expect(calls).toBe(0);
 await input.press('Enter');await expect(input).toHaveValue('1. First point\n');
 await input.fill('- [x] Check data');await input.press('Enter');await expect(input).toHaveValue('- [x] Check data\n- [ ] ');
 await input.fill('');await input.evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','Stock\tReason\nABC\tLiquid');data.setData('text/html','<table><tr><th>Stock</th><th>Reason</th></tr><tr><td>ABC</td><td>Liquid<script>window.badPaste=true</script></td></tr></table>');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(input).toHaveValue('| Stock | Reason |\n| --- | --- |\n| ABC | Liquid |');
 await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(page.locator('.assistant-compose-preview table')).toContainText('ABC');expect(await page.evaluate(()=>('badPaste' in window))).toBe(false);
 await page.getByRole('button',{name:'Edit text',exact:true}).click();await input.press('Control+Enter');await expect(page.getByRole('log')).toContainText('Received.');expect(calls).toBe(1);
 await expect(page.locator('.assistant-message.user table')).toBeVisible();
});

test('refresh restores current chat with attachments and earlier proposal details',async({page})=>{
 let calls=0;await page.route('**/api/ai/chat',r=>{calls++;return r.fulfill({json:calls===1?{...empty,text:'First proposed plan.',task:{scope:'strategy',id,revision:0},proposal:sampleTradingPlan('swing'),review}:{...empty,text:'We can discuss it further.',task:null}});});
 await open(page);await page.locator('input[type=file]').setInputFiles({name:'rules.md',mimeType:'text/plain',buffer:Buffer.from('- Review the risks')});
 await send(page,'Create a plan for review');await expect(page.getByRole('log')).toContainText('First proposed plan.');
 await send(page,'Explain the risk settings');await expect(page.getByRole('log')).toContainText('We can discuss it further.');
 await page.getByRole('textbox',{name:'Message QuantForge assistant'}).fill('My unfinished next question');
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('quantforge-active-chat'))).not.toBeNull();
 await page.waitForTimeout(1000);await page.reload();await expect(page.getByRole('log')).toContainText('We can discuss it further.');await expect(page.getByRole('textbox',{name:'Message QuantForge assistant'})).toHaveValue('My unfinished next question');
 await page.getByText('Proposal & review at this point',{exact:true}).first().click();await expect(page.getByRole('log')).toContainText('Historical snapshot.');
 await page.getByText('Attachments (1)',{exact:true}).first().click();await expect(page.getByRole('log')).toContainText('- Review the risks');expect(calls).toBe(2);
});


test('backtest selection and report resume without replaying an action',async({page})=>{
 let runs=0;
 await page.route('**/api/ai/chat',route=>route.fulfill({json:{...empty,text:'Choose stocks.',task:null,workflow:{kind:'backtest',strategyId:id,revision:7,name:'Intraday plan',cadence:'5m',horizon:'intraday'}}}));
 await page.route('**/api/backtests/universe?*',route=>route.fulfill({json:{stocks:[1,2].map(n=>({_id:`NSE:${n}`,symbol:`STOCK${n}`,exchange:'NSE',source:'scan',suitability:{profiles:[{horizon:'intraday',status:'matched',checks:[]}]}}))}}));
 await page.route('**/api/backtests',route=>{runs++;expect(route.request().postDataJSON().ids).toEqual(['NSE:2']);return route.fulfill({json:{id:'retained-report'}});});
 await page.route('**/api/backtests/retained-report',route=>route.fulfill({json:{_id:'retained-report',status:'running',stage:'calculating'}}));
 await open(page);await send(page,'Prepare an intraday backtest');const panel=page.getByRole('region',{name:'Assistant backtest workflow'});
 await expect(panel).toContainText('2 selected / 2 available');
 await panel.getByRole('combobox',{name:'Stocks to backtest'}).click();await page.locator('.ant-select-dropdown').getByText('STOCK1 / NSE',{exact:true}).click();await page.keyboard.press('Escape');
 await panel.getByRole('checkbox').check();await expect(panel).toContainText('1 selected / 2 available');
 await page.getByRole('link',{name:'Algo Strategies',exact:true}).click();await page.getByRole('link',{name:'AI assistant',exact:true}).click();await expect(panel).toContainText('1 selected / 2 available');
 await page.waitForTimeout(1000);await page.reload();await expect(panel).toContainText('1 selected / 2 available');await expect(panel.getByRole('checkbox')).toBeChecked();expect(runs).toBe(0);
 await panel.getByRole('button',{name:'Run backtest',exact:true}).click();await expect(panel).toContainText('calculating');await page.waitForTimeout(1000);await page.reload();await expect(panel).toContainText('calculating');expect(runs).toBe(1);
});
