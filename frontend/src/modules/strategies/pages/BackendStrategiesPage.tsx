import {useEffect} from 'react';
import {Alert,Button,Skeleton,Tabs} from 'antd';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {TradingStrategyEditor} from '../components/TradingStrategyEditor';
import {StrategyExamples} from '../components/StrategyExamples';
import {useBackendStrategies} from '../hooks/useBackendStrategies';
import {initialMonthlyRule} from '../../qualification/config/monthlyFields';
import {apiClient} from '../../../services/apiClient';
import {BackendBacktests} from '../../backtesting/components/BackendBacktests';
import type {QualificationWorkspace} from '../../qualification/types';
import '../../../styles/strategy-studio.css';
export default function BackendStrategiesPage(){
  const {strategies,error,loading,refresh}=useBackendStrategies(),[params,setParams]=useSearchParams(),navigate=useNavigate();
  useEffect(()=>{void refresh();},[refresh]);
  const selected=params.get('rule')??strategies[0]?._id??'new',tab=params.get('tab')==='backtests'?'backtests':'rules';
  const workspace:QualificationWorkspace={monthlyRule:initialMonthlyRule,monthlyRuleSaved:false,cacheHistory:[],activeBaseId:'',selectedTacticalId:selected,caches:{},runs:[],scheduledPreview:false,jobs:[],
    templates:strategies.flatMap(s=>[{...s.entry,id:s._id,revision:s.revision},{...s.exit,id:`${s._id}:exit`,revision:s.revision}]),
    tradingPlans:strategies.map(s=>({id:s._id,name:s.name,entryRuleId:s._id,exitRuleId:`${s._id}:exit`,risk:s.risk,updatedAt:s.savedAt}))};
  return <div className="strategy-page page-enter"><div className="page-heading"><div><h1>Algo strategies</h1><p>Save paired buy and sell rules, backtest stored market data, then start a paper session.</p></div><Button onClick={()=>navigate('/signal-runner')}>Signal runner</Button></div>
    {error&&<Alert type="error" showIcon title={error} action={<Button onClick={()=>void refresh()}>Retry</Button>}/>}
    {!loading&&<StrategyExamples savedIds={strategies.map(s=>s._id)} onCreated={refresh} onSelect={rule=>setParams({tab:'rules',rule})}/>}
    {loading?<Skeleton active/>:<Tabs activeKey={tab} destroyOnHidden onChange={tab=>setParams({tab,rule:selected})} items={[
      {key:'rules',label:'Trading rules',children:<><Alert className="mb-5" type="info" showIcon title="Backend connected · paper execution only" description="The manual builder remains available. Gemini suggestions are validated proposals. Review and apply them before saving. Fields without a verified source cannot be saved."/><TradingStrategyEditor key={selected} owner="backend-local" workspace={workspace} selected={selected} onSelect={rule=>setParams({tab:'rules',rule})} onBacktest={rule=>setParams({tab:'backtests',rule})} onSave={async draft=>{const saved=strategies.find(s=>s._id===selected),id=saved?._id??crypto.randomUUID();await apiClient.put(`/strategies/${id}`,{draft,expectedRevision:saved?.revision??0});await refresh();setParams({tab:'rules',rule:id});}}/></>},
      {key:'backtests',label:'Backtests',children:<BackendBacktests key={selected} strategies={strategies} selected={selected}/>},
    ]}/>}
  </div>;
}
