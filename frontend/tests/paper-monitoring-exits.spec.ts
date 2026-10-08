import {test,expect,type Page} from '@playwright/test';
import {sampleTradingPlan} from '../src/modules/strategies/utils/tradingPlans';
import {watchingStocks} from '../src/modules/paper-trading/utils/watchingStocks';
import type {PaperData} from '../src/modules/paper-trading/hooks/useBackendPaper';
const at='2026-10-08T06:00:00Z',strategy={...sampleTradingPlan('intraday'),_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,savedAt:at};
const session={_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',strategy,mode:'automatic' as const,active:true,entriesPaused:false,cashPaise:900000,initialPaise:1000000,ids:['NSE:1','NSE:2']};
const position={_id:session._id+':NSE:1',sessionId:session._id,instrumentId:'NSE:1',symbol:'RELIANCE',quantity:6,initialQuantity:10,entryPaise:10000,stopPaise:10000,targetPaise:12000,openedAt:at,targets:[{pricePaise:11000,quantity:4,completed:true,filledQuantity:4},{pricePaise:12000,quantity:6,completed:false}]};
const paper:PaperData={sessions:[session],positions:[],orders:[],signals:[],symbols:{'NSE:1':'RELIANCE','NSE:2':'GABRIEL'},workerRunning:true,marketOpen:true,feed:{state:'live',message:'Live',freshIds:['NSE:1','NSE:2']},observations:[{_id:'o',sessionId:session._id,instrumentId:'NSE:1',barEnd:at,checkedAt:at,current:true,entry:{matched:false,checks:[{field:'close',matched:false,left:99,right:100}]},exit:{matched:false,disabled:true,checks:[]}}]};
async function setup(page:Page,data:PaperData){await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().endsWith('/session')?{authenticated:true,mode:'local'}:{}}));await page.route('**/api/strategies',route=>route.fulfill({json:[strategy]}));await page.route('**/api/paper',route=>route.fulfill({json:data}));}
test('monitoring rows exist before any signals and distinguish market close from an offline worker',()=>{
 expect(watchingStocks(paper).map(r=>r.status)).toEqual(['Waiting for buy conditions','Waiting for first completed-candle check']);
 expect(watchingStocks({...paper,marketOpen:false,workerRunning:false})[0].status).toContain('Market closed');
 expect(watchingStocks({...paper,workerRunning:false})[0].status).toContain('offline');
 expect(watchingStocks({...paper,marketOpen:false,sessions:[{...session,entriesPaused:true}]})[0].status).toContain('remain paused');
});
test('signal page displays every monitored stock without a buy or sell event',async({page})=>{
 test.setTimeout(60000);await setup(page,paper);await page.goto('/signal-runner');const area=page.getByRole('region',{name:'Stocks being monitored'});
 await expect(area.getByText('RELIANCE',{exact:true})).toBeVisible({timeout:20000});await expect(area.getByText('GABRIEL',{exact:true})).toBeVisible();
 await area.getByRole('button',{name:'Expand row'}).first().click();await expect(area.getByText(/observed 99.00/)).toBeVisible();await expect(area.getByText('Not met',{exact:true})).toBeVisible();
});
test('exit editor reviews new levels and restores the strategy state without editing completed targets',async({page})=>{
 test.setTimeout(60000);await setup(page,{...paper,positions:[position]});let payload:Record<string,unknown>|undefined;
 const edited={...position,stopPaise:9500,exitControl:{strategyStopPaise:10500,strategyTargetPrices:[11000,12000],stopOverridden:true,targetOverrides:[false,true],revision:1,changedAt:at}};
 await page.route('**/api/paper/positions/*/exits',route=>{if(route.request().method()==='PATCH'){payload=route.request().postDataJSON();return route.fulfill({json:edited});}return route.fulfill({json:{position:edited,history:[]}});});
 await page.goto('/paper-trading');await page.getByRole('button',{name:'Manage SL / targets'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Position target 1',{exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Restore strategy levels',exact:true}).click();await expect(dialog.getByLabel('Position stop price')).toHaveValue('105.00');
 await expect(dialog.getByRole('button',{name:'Apply restored levels'})).toBeDisabled();
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Apply restored levels'}).click();
 await expect.poll(()=>payload).toMatchObject({action:'restore',expectedRevision:1,expectedQuantity:6,expectedStopPaise:9500,acknowledgeRisk:true});await expect(dialog).toHaveCount(0);
});
