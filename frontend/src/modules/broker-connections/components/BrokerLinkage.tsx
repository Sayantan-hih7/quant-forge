import { Button } from "antd";
import { ApiOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
export function BrokerLinkage() {
  const navigate = useNavigate();
  return (
    <Panel
      title={
        <>
          <ApiOutlined /> Broker Gateway Linkage
        </>
      }
      extra={<span className="tiny-label positive">ALL NORMAL</span>}
    >
      <div className="broker-list">
        {[
          {
            name: "Dhan HQ API",
            initial: "D",
            accounts: 347,
            latency: 182,
            success: 99.6,
            color: "green",
          },
          {
            name: "Motilal Oswal Web API",
            initial: "MO",
            accounts: 261,
            latency: 224,
            success: 99.1,
            color: "orange",
          },
        ].map((broker) => (
          <div className="broker-row" key={broker.name}>
            <div className={`broker-logo ${broker.color}`}>
              {broker.initial}
            </div>
            <div className="broker-info">
              <strong>{broker.name}</strong>
              <small>{broker.accounts} accounts · Simulated</small>
            </div>
            <div className="broker-stats">
              <strong className="mono">{broker.latency} ms</strong>
              <small className="positive">{broker.success}% success</small>
            </div>
            <span className="status-dot" />
          </div>
        ))}
      </div>
      <div className="webhook-status">
        <span>
          <span className="status-dot" /> Multi-tenant webhook listeners
        </span>
        <span className="positive mono">0 drops</span>
      </div>
      <div className="panel-bottom">
        <Button
          type="text"
          block
          size="small"
          onClick={() => navigate("/broker-connections")}
        >
          Manage connections <ArrowRightOutlined />
        </Button>
      </div>
    </Panel>
  );
}
