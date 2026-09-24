import { useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Avatar, Button, Flex, Input, Modal, Dropdown, Tooltip, Typography, theme } from "antd";
import {
  BellOutlined,
  MenuOutlined,
  SearchOutlined,
  UserOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useWorkspaceNavigation } from "../../hooks/useWorkspaceNavigation";
import { useAuthStore } from "../../store/authStore";
import { useDemoStore } from "../../store/demoStore";
import { ThemeSwitcher } from "./ThemeSwitcher";

dayjs.extend(utc);
dayjs.extend(timezone);

function IndianClock() {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <time className="topbar-clock mono" dateTime={now.toISOString()} title="Current Indian Standard Time">
      {now.tz("Asia/Kolkata").format("HH:mm:ss")} IST
    </time>
  );
}

export function TopBar({ onOpenMenu, realData = false }: { onOpenMenu: () => void; realData?: boolean }) {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { session, signOut } = useAuthStore();
  const isClient = session?.role === "client";
  const navItems = useWorkspaceNavigation().flatMap((group) => group.items);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const paused = useDemoStore((s) => s.enginePaused);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return (
    <>
      <header className="topbar">
        <Button
          className="mobile-menu-button"
          type="text"
          aria-label="Open navigation"
          icon={<MenuOutlined />}
          onClick={onOpenMenu}
        />
        <div className="market-session">
          <span className="status-dot" />
          <strong>{realData ? 'NSE / BSE DATA' : 'NSE / BSE DEMO'}</strong>
          <span className="muted">09:15–15:30</span>
        </div>
        <IndianClock />
        <div className="topbar-connection positive">
          <ThunderboltOutlined /> {realData ? 'DATA SETUP' : paused ? "PAUSED" : "SIMULATED"}{" "}
          <span className="muted">{realData ? 'Paper workspace' : 'No broker feed'}</span>
        </div>
        <Flex className="topbar-actions" align="center">
          <ThemeSwitcher />
          <Tooltip title="Search workspace (Ctrl K)">
            <Button
              type="text"
              className="search-trigger"
              aria-label="Search workspace"
              icon={<SearchOutlined style={{ fontSize: 16 }} />}
              onClick={() => setSearchOpen(true)}
            >
              <Typography.Text keyboard type="secondary">Ctrl K</Typography.Text>
            </Button>
          </Tooltip>
          <Tooltip title="Notifications">
            <Button
              type="text"
              aria-label="Notifications"
              icon={
                <>
                  <BellOutlined style={{ fontSize: 16 }} />
                </>
              }
              onClick={() => navigate(isClient ? "/client/notifications" : "/notifications")}
            />
          </Tooltip>

          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'profile', label: session?.email, disabled: true },
            { key: 'settings', label: 'Account settings' },
            { key: 'logout', label: 'Sign out', danger: true },
          ], onClick: ({ key }) => {
            if (key === 'logout') { signOut(); navigate('/login', { replace: true }); }
            if (key === 'settings') navigate(isClient ? '/client/settings' : '/settings');
          } }}>
            <Button
              type="text"
              shape="circle"
              aria-label="Account menu"
              icon={
                <Avatar
                  size="small"
                  style={{ backgroundColor: token.colorPrimaryBg, color: token.colorPrimary }}
                  icon={<UserOutlined />}
                />
              }
            />
          </Dropdown>
        </Flex>
      </header>
      <Modal
        open={searchOpen}
        title="Go to workspace"
        footer={null}
        onCancel={() => {
          setSearchOpen(false);
          setQuery("");
        }}
      >
        <Input
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="Search pages…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search pages"
        />
        <div className="search-results">
          {navItems
            .filter((item) =>
              item.label.toLowerCase().includes(query.toLowerCase()),
            )
            .map((item) => (
              <Button
                block
                type="text"
                key={item.path}
                icon={item.icon}
                onClick={() => {
                  navigate(item.path);
                  setSearchOpen(false);
                  setQuery("");
                }}
              >
                {item.label}
              </Button>
            ))}
          {!navItems.some((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
          ) && <p className="muted p-4">No pages match your search.</p>}
        </div>
      </Modal>
    </>
  );
}
