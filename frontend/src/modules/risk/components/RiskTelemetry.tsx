import { Button } from "antd";
import {
  SafetyOutlined,
  StopOutlined,
  ClockCircleOutlined,
  LineChartOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
import { riskAlerts } from "../api/mockRisk";
export function RiskTelemetry() {
  const navigate = useNavigate();
  const icons = [
    <StopOutlined />,
    <ClockCircleOutlined />,
    <LineChartOutlined />,
  ];
  return (
    <Panel
      title={
        <>
          <SafetyOutlined /> Active Risk Telemetry
        </>
      }
      extra={<span className="tiny-label warning">3 WARNINGS</span>}
    >
      <div className="risk-list">
        {riskAlerts.map((alert, index) => (
          <div className={`risk-item ${alert.tone}`} key={alert.id}>
            <span className="risk-icon">{icons[index]}</span>
            <div>
              <div className="risk-title">
                <strong>{alert.title}</strong>
                <span className="mono">{alert.meta}</span>
              </div>
              <p>{alert.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="risk-footer">
        <span>
          System risk: <strong className="positive">STABLE (L2)</strong>
        </span>
        <Button type="link" size="small" onClick={() => navigate("/risk")}>
          Risk matrix →
        </Button>
      </div>
    </Panel>
  );
}
