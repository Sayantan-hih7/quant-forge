import { Alert, Button, Select, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { PaperSession } from '../hooks/useBackendPaper';

export function SessionStockScope({ session, symbols = {}, onChart }: { session: PaperSession; symbols?: Record<string, string>; onChart?: (id: string) => void }) {
  const navigate = useNavigate(), scope = session.scope;
  if (!session.active || !scope) return null;
  return <section aria-label="Stocks monitored by this session" className="mb-5">
    <Space wrap className="mb-3">{onChart&&<Select aria-label="Open monitored stock chart" placeholder="Find a stock to chart" value={null} showSearch={{optionFilterProp:'label'}} style={{width:240}} options={scope.monitoredIds.map(id=>({value:id,label:symbols[id]??id}))} onChange={onChart}/>}<Tag>{scope.selectedIds.length} selected</Tag><Tag color="blue">{scope.eligibleIds.length} currently qualified</Tag><Tag>{scope.entryIds.length} enabled for buy checks</Tag><Tag>{scope.heldIds.length} held for exit checks</Tag></Space>
    {!!scope.excludedIds.length && <Alert showIcon type="warning" title={`${scope.excludedIds.length} selected stocks excluded from new buys`} description={<>
      <p>These stocks are outside this month’s qualified list. Your saved selection is unchanged. Any held shares still receive sell-rule and protective-exit monitoring; fills need fresh execution quotes.</p>
      <details><summary>View excluded stocks</summary><Space wrap className="mt-3">{scope.excludedIds.map(id => <Tag key={id}>{symbols[id] ?? id}{scope.heldIds.includes(id) ? ' · held, exits monitored' : ''}</Tag>)}</Space></details>
    </>} action={<Button onClick={() => navigate('/qualification?tab=universe')}>Review qualified stocks</Button>} />}
  </section>;
}
