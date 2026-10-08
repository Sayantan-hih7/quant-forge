import {test,expect} from '@playwright/test';
import {reportFixture,reportStrategy} from './fixtures/backtestReport';
test('backtest eligibility previews, saves and starts only passing stocks with attached filters',async({page})=>{
 test.setTimeout(60000);const run=reportFixture();let saved:unknown,started:unknown;
 await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));
 await page.route('**/api/strategies',route=>route.fulfill({json:[reportStrategy]}));
 await page.route('**/api/backtests**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/paper-eligibility')){
   const settings=route.request().postDataJSON();if(route.request().method()==='PUT')saved=settings;
   const eligible=settings.criteria.minWinRate<=60;
   return route.fulfill({json:{settings,assessedAt:new Date().toISOString(),blockers:[],existingSession:null,validated:false,eligibleIds:eligible?['NSE:1']:[],rows:[{instrumentId:'NSE:1',symbol:'ALPHA',closedTrades:10,wins:6,winRate:60,netPnl:100,closedDrawdown:20,eligible,reasons:eligible?[]:['Win rate below threshold']}]}});
  }
  return route.fulfill({json:path.endsWith('/universe')?{stocks:[],listCount:0}:path.endsWith(run._id)?run:[run]});
 });
 await page.route('**/api/paper/sessions',route=>{started=route.request().postDataJSON();return route.fulfill({json:{_id:'test'}});});
 await page.goto(`/strategies?tab=backtests&rule=${run.strategy._id}`);
 await page.getByRole('tab',{name:/Run history/}).click();
 await page.getByRole('button',{name:'View report',exact:true}).click();
 await page.getByRole('button',{name:'Use for paper trading',exact:true}).click();
 await expect(page.getByText('1 eligible / 1 tested stocks')).toBeVisible({timeout:20000});
 const start=page.getByRole('button',{name:'Start paper trading with eligible stocks'});
 await expect(start).toBeDisabled();
 await page.getByRole('checkbox',{name:/I understand this selects historical winners/}).check();
 await page.getByLabel('Minimum win rate',{exact:true}).fill('80');
 await expect(page.getByText('0 eligible / 1 tested stocks')).toBeVisible();await expect(start).toBeDisabled();
 await page.getByLabel('Minimum win rate',{exact:true}).fill('55');
 await expect(page.getByText('1 eligible / 1 tested stocks')).toBeVisible();
 await page.getByRole('button',{name:'Save filters',exact:true}).click();await expect(page.getByText('Filters saved with this report.')).toBeVisible();
 expect(saved).toMatchObject({criteria:{minWinRate:55,minClosedTrades:10,minNetPnl:0}});
 await start.click();await expect(page).toHaveURL(/paper-trading/);
 expect(started).toMatchObject({ids:['NSE:1'],sourceBacktestId:run._id,expectedRevision:run.strategy.revision,mode:'confirmation',eligibility:saved});
});
