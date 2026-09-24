import { Button } from "antd";
import {
  ExperimentOutlined,
  PlusCircleOutlined,
  RadarChartOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { MetricCards } from "../components/MetricCards";
import { MarketTicker } from "../components/MarketTicker";
import { EngineTelemetry } from "../components/EngineTelemetry";
import { StockOpportunities } from "../components/StockOpportunities";
import { SignalBroadcast } from "../../signals/components/SignalBroadcast";
import { useDemoStore } from "../../../store/demoStore";
import { useAuthStore } from "../../../store/authStore";
export default function DashboardPage() {
  const navigate = useNavigate();
  const paused = useDemoStore((s) => s.enginePaused);
  const firstName = useAuthStore((s) => s.session?.name.split(' ')[0] ?? 'Manish');
  return (
    <div className="dashboard page-enter">
      <div className="page-heading">
        <div>
          <div className="greeting-line">
            <h1>
              Good morning, {firstName}<span className="greeting-dot">.</span>
            </h1>
            <span className={`engine-status ${paused ? "is-paused" : ""}`}>
              <span className="status-dot" />
              UI DEMO {paused ? "· ENTRIES PAUSED" : "· NO LIVE ORDERS"}
            </span>
          </div>
          <p>
            UI workspace <span>·</span> {new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" })} <span>·</span> Mock data only
          </p>
        </div>
        <div className="page-actions">
          <Button
            icon={<RadarChartOutlined />}
            onClick={() => navigate("/signal-runner")}
          >
            Signal runner
          </Button>
          <Button
            type="primary"
            icon={<PlusCircleOutlined />}
            onClick={() => navigate('/qualification?tab=rules')}
          >
            Rule builder
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => navigate("/paper-trading")}
          >
            Paper trading
          </Button>
        </div>
      </div>
      <MetricCards />
      <MarketTicker />
      <StockOpportunities />
      <div className="dashboard-bottom">
        <div className="dashboard-column">
          <EngineTelemetry />

        </div>
        <div className="dashboard-column">
          <SignalBroadcast />

        </div>
      </div>
    </div>
  );
}
