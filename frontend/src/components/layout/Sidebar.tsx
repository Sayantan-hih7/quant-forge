import { Avatar, Button, Tooltip } from "antd";
import {
  DoubleLeftOutlined,
  DoubleRightOutlined,
  UserOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { NavLink } from "react-router-dom";
import { useWorkspaceNavigation } from "../../hooks/useWorkspaceNavigation";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";

export function Sidebar({
  mobile = false,
  onNavigate,
  realData = false,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
  realData?: boolean;
}) {
  const navigation = useWorkspaceNavigation();
  const session = useAuthStore((s) => s.session);
  const collapsed = useUiStore((s) => s.collapsed) && !mobile;
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-sidebar" : ""}`}
    >
      <div className="brand">
        <span className="brand-mark">
          Q<span>f</span>
        </span>
        {!collapsed && (
          <div>
            <strong>QuantForge</strong>
            <small>{realData ? 'CASH EQUITY · PAPER' : 'F&O ALGO ENGINE'}</small>
          </div>
        )}
        {mobile && (
          <Button
            type="text"
            aria-label="Close navigation"
            icon={<CloseOutlined />}
            onClick={onNavigate}
          />
        )}
      </div>
      <div className="environment">
        <span className="status-dot" />
        {!collapsed && (
          <>
            <span>{realData ? 'LOCAL WORKSPACE' : 'DEMO WORKSPACE'}</span>
            <span className="exchange">NSE/BSE</span>
          </>
        )}
      </div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        {navigation.map((group, index) => (
          <div key={group.title || "main"} className="nav-group">
            {group.title &&
              (!collapsed ? (
                <div className="nav-group-title">{group.title}</div>
              ) : (
                <div className="nav-divider" />
              ))}
            {group.items.map((item) => (
              <Tooltip
                key={item.path}
                title={collapsed ? item.label : undefined}
                placement="right"
              >
                <NavLink
                  to={item.path}
                  end
                  onClick={onNavigate}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                      {item.badge && (
                        <small className="nav-badge">{item.badge}</small>
                      )}
                    </>
                  )}
                </NavLink>
              </Tooltip>
            ))}
            {index === 0 && <span className="sr-only">Workspace modules</span>}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile">
          <Avatar size={30} icon={<UserOutlined />} />
          {!collapsed && (
            <div>
              <strong>{realData ? 'Local workspace' : session?.name ?? "Demo user"}</strong>
              <small>{realData ? 'Cash equities · paper trading' : session?.role === "client" ? "Personal workspace" : "AlphaForge Capital"}</small>
            </div>
          )}
        </div>
        {!mobile && (
          <Button
            className="collapse-button"
            type="text"
            block
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
            onClick={toggle}
          >
            {!collapsed && "Collapse sidebar"}
          </Button>
        )}
      </div>
    </aside>
  );
}
