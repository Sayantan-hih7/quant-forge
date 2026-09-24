import { Card, Radio, Alert } from "antd";
import { SunOutlined, MoonOutlined, DesktopOutlined } from "@ant-design/icons";
import { useUiStore } from "../../../store/uiStore";
import { Link } from 'react-router-dom';
export default function SettingsPage() {
  const mode = useUiStore((s) => s.themeMode);
  const setMode = useUiStore((s) => s.setThemeMode);
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Workspace settings</h1>
          <p>Make QuantForge feel at home.</p>
        </div>
      </div>
      <Card title="Appearance" className="settings-card">
        <p className="muted mb-5">
          Your preference is saved on this device. System mode follows your
          operating system automatically.
        </p>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          options={[
            {
              value: "light",
              label: (
                <>
                  <SunOutlined /> Light
                </>
              ),
            },
            {
              value: "dark",
              label: (
                <>
                  <MoonOutlined /> Dark
                </>
              ),
            },
            {
              value: "system",
              label: (
                <>
                  <DesktopOutlined /> System
                </>
              ),
            },
          ]}
        />
      </Card>
      <Alert
        className="mt-5"
        showIcon
        type="info"
        title="Connections & Data"
        description={<span>Manage your market-data connections and check the monthly stock-universe update. <Link to="/data-sources">Open connections and data</Link></span>}
      />
    </div>
  );
}
