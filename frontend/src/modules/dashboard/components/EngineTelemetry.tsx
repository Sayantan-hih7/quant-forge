import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../../../components/ui/Panel';
export function EngineTelemetry() {
  const navigate = useNavigate();
  return <Panel title="Your trading workflow"><div className="workflow-summary">{[
    ['Qualification', 'Choose the monthly stock list. Custom additions are labelled separately.', '/qualification'],
    ['Algo strategies', 'Save buy rules, sell rules and risk settings together. Backtest the pair.', '/strategies'],
    ['Signal Runner', 'Monitor the saved pair and review buy or held-position sell alerts.', '/signal-runner'],
    ['Paper Trading', 'Confirm a simulated fill from an alert, or buy and sell manually.', '/paper-trading'],
  ].map(([title, description, path], index) => <div key={path}><span>{index + 1}</span><div><Button type="link" onClick={() => navigate(path)}>{title}</Button><p>{description}</p></div></div>)}</div></Panel>;
}