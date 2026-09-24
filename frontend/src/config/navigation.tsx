import {
  AppstoreOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  CodeOutlined,
  ThunderboltOutlined,


  TeamOutlined,
  SafetyOutlined,
  ApiOutlined,
  StockOutlined,
  AuditOutlined,
  BellOutlined,
  SettingOutlined,
  RadarChartOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  badge?: string;
}
export const navigation: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [{ path: "/", label: "Dashboard", icon: <AppstoreOutlined /> }],
  },
  {
    title: "Market Data",
    items: [{ path: "/market-data/indices", label: "Indices", icon: <StockOutlined /> }],
  },
  {
    title: "Strategy",
    items: [
      {
        path: "/qualification",
        label: "Qualification",
        icon: <SafetyCertificateOutlined />,
      },
      { path: "/strategies", label: "Algo Strategies", icon: <ThunderboltOutlined /> },
      { path: "/signal-runner", label: "Signal Runner", icon: <RadarChartOutlined /> },
    ],
  },
  {
    title: "Execution",
    items: [
      {
        path: "/paper-trading",
        label: "Paper Trading",
        icon: <ExperimentOutlined />,
        badge: "Paper",
      },
      { path: "/live-trading", label: "Live Trading", badge: "Planned", icon: <CodeOutlined /> },
    ],
  },
  {
    title: "Clients",
    items: [
      { path: "/subscribers", label: "Subscribers", badge: "Planned", icon: <TeamOutlined /> },
      { path: "/risk", label: "Risk Management", badge: "Planned", icon: <SafetyOutlined /> },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        path: "/broker-connections",
        label: "Broker Connections", badge: "Planned",
        icon: <ApiOutlined />,
      },
      {
        path: "/compliance",
        label: "Compliance", badge: "Planned",
        icon: <SafetyCertificateOutlined />,
      },
      { path: "/audit", label: "Audit Logs", badge: "Planned", icon: <AuditOutlined /> },
    ],
  },
  {
    title: "System",
    items: [
      { path: "/data-sources", label: "Connections & Data", icon: <ApiOutlined /> },
      {
        path: "/notifications",
        label: "Notifications",
        icon: <BellOutlined />,
      },
      { path: "/settings", label: "Settings", icon: <SettingOutlined /> },
    ],
  },
];
export const navItems = navigation.flatMap((group) => group.items);
