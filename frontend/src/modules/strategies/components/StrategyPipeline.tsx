import { CalendarOutlined, FilterOutlined, UnorderedListOutlined, ThunderboltOutlined, ArrowRightOutlined } from '@ant-design/icons';

export function StrategyPipeline() {
  return <div className="strategy-workflow" aria-label="Strategy workflow">
    <div><span className="workflow-icon"><CalendarOutlined /></span><span><strong>Monthly base</strong><small>Save the allowed stock universe</small></span></div><ArrowRightOutlined />
    <div><span className="workflow-icon"><FilterOutlined /></span><span><strong>Horizon rules</strong><small>Qualify from that universe</small></span></div><ArrowRightOutlined />
    <div><span className="workflow-icon"><UnorderedListOutlined /></span><span><strong>Watchlists</strong><small>Save each strategy’s shortlist</small></span></div><ArrowRightOutlined />
    <div><span className="workflow-icon"><ThunderboltOutlined /></span><span><strong>Signals</strong><small>Trigger only on qualified stocks</small></span></div>
  </div>;
}
