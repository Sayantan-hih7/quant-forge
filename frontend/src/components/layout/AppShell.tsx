import { useState } from "react";
import { Drawer } from "antd";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useUiStore } from "../../store/uiStore";
import { useScanRuntime } from '../../modules/qualification/hooks/useScanRuntime';
import { useMonitorRuntime } from '../../modules/signals/hooks/useMonitorRuntime';
import {localWorkspacePaths} from '../../config/localWorkspace';
function PreviewRuntime() {
  useScanRuntime();
  useMonitorRuntime();
  return null;
}
export function AppShell() {
  const pathname = useLocation().pathname;
  const realData = localWorkspacePaths.includes(pathname);
  const collapsed = useUiStore((s) => s.collapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className={`app-shell ${collapsed ? "sidebar-is-collapsed" : ""}`}>
      {!realData && <PreviewRuntime />}
      <div className="desktop-sidebar">
        <Sidebar realData={realData} />
      </div>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        size={252}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <Sidebar realData={realData} mobile onNavigate={() => setMobileOpen(false)} />
      </Drawer>
      <div className="app-content">
        <TopBar realData={realData} onOpenMenu={() => setMobileOpen(true)} />
        <main id="main-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            <span className="status-dot" /> {realData ? 'Local data service · no live orders' : 'Simulated workspace · no live orders'}
          </span>
          <span>{realData ? 'QuantForge · Real source imports' : 'QuantForge · UI preview · Mock data only'}</span>
        </footer>
      </div>
    </div>
  );
}
