import { useState } from "react";
import { Button, Dropdown, Input, Segmented, Table, App } from "antd";
import {
  CheckCircleFilled,
  MoreOutlined,
  SearchOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
import { StatusTag } from "../../../components/ui/StatusTag";
import { useDemoStore } from "../../../store/demoStore";
import { formatMoney, formatCapital } from "../../../utils/format";
import type { Strategy } from "../types";
export function StrategyTable({
  initialFilter = "All",
}: {
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const strategies = useDemoStore((s) => s.strategies);
  const setMode = useDemoStore((s) => s.setStrategyMode);
  const paused = useDemoStore((s) => s.enginePaused);
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const rows = strategies.filter(
    (s) =>
      (filter === "All" || s.mode === filter.toUpperCase()) &&
      s.name.toLowerCase().includes(query.toLowerCase()),
  );
  const details = (item: Strategy) =>
    modal.info({
      title: item.name,
      content: (
        <div className="strategy-details">
          <p>{item.description}</p>
          <p>Segment: {item.segment}</p>
          <p>Allocated capital: {formatCapital(item.capital)}</p>
          <p>Today’s P&amp;L: {formatMoney(item.pnl)}</p>
          <p>Maximum drawdown: {item.drawdown}%</p>
          <p>Execution: {paused ? "Engine paused" : item.mode}</p>
          <small className="muted">Demo snapshot · no real execution</small>
        </div>
      ),
    });
  const columns: ColumnsType<Strategy> = [
    {
      title: "Strategy",
      dataIndex: "name",
      width: 248,
      render: (_, s) => (
        <button className="strategy-name" onClick={() => details(s)}>
          <strong>{s.name}</strong>
          <small>{s.description}</small>
        </button>
      ),
    },
    {
      title: "Mode",
      dataIndex: "mode",
      width: 88,
      render: (mode: string) => (
        <StatusTag status={paused && mode === "LIVE" ? "HALTED" : mode} />
      ),
    },
    {
      title: "Segment",
      dataIndex: "segment",
      width: 125,
      render: (s: string) => <span className="mono text-xs">{s}</span>,
    },
    { title: "Signals", dataIndex: "signals", width: 72, align: "right" },
    { title: "Clients", dataIndex: "clients", width: 75, align: "right" },
    {
      title: "Cap Alloc",
      dataIndex: "capital",
      width: 112,
      align: "right",
      render: formatCapital,
    },
    {
      title: "Today P&L",
      dataIndex: "pnl",
      width: 166,
      align: "right",
      sorter: (a, b) => a.pnl - b.pnl,
      render: (_, s) => (
        <div className={s.pnl >= 0 ? "positive mono" : "negative mono"}>
          {s.pnl > 0 ? "+" : ""}
          {formatMoney(s.pnl)}
          <small className="block">
            ({s.roi > 0 ? "+" : ""}
            {s.roi}%)
          </small>
        </div>
      ),
    },
    {
      title: "Max DD",
      dataIndex: "drawdown",
      width: 83,
      align: "right",
      render: (n: number) => (
        <span className={n <= -5 ? "negative mono" : "mono"}>
          {n.toFixed(1)}%
        </span>
      ),
    },
    {
      title: "Health",
      width: 123,
      render: (_, s) =>
        s.mode === "HALTED" ? (
          <span className="negative text-xs">DD ceiling hit</span>
        ) : (
          <span className="positive mono text-xs">
            <CheckCircleFilled /> {s.health}%
          </span>
        ),
    },
    {
      title: "",
      width: 42,
      render: (_, s) => (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "details", label: "View details" },
              {
                key: "toggle",
                label: s.mode === "HALTED" ? "Move to paper" : "Pause strategy",
              },
            ],
            onClick: ({ key }) => {
              if (key === "details") details(s);
              else {
                setMode(s.id, s.mode === "HALTED" ? "PAPER" : "HALTED");
                message.success("Demo strategy updated");
              }
            },
          }}
        >
          <Button
            type="text"
            aria-label={`Actions for ${s.name}`}
            icon={<MoreOutlined />}
          />
        </Dropdown>
      ),
    },
  ];
  return (
    <Panel
      title={
        <>
          <span className="section-dot" /> Live Quantitative Strategies{" "}
          <span className="count-label">
            {paused ? 0 : strategies.filter((s) => s.mode === "LIVE").length}{" "}
            ACTIVE ENGINES
          </span>
        </>
      }
      extra={<span className="tiny-label">SESSION OVERVIEW</span>}
      className="strategies-panel"
    >
      <div className="table-toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={["All", "Live", "Paper", "Halted"].map((value) => ({
            value,
            label: `${value} (${value === "All" ? strategies.length : strategies.filter((s) => s.mode === value.toUpperCase()).length})`,
          }))}
        />
        <Input
          aria-label="Search strategies"
          prefix={<SearchOutlined />}
          placeholder="Search strategies"
          value={query}
          allowClear
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 210 }}
        />
      </div>
      <Table<Strategy>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={false}
        size="small"
        scroll={{ x: 1200 }}
        rowClassName={(s) => (s.mode === "HALTED" ? "halted-row" : "")}
        locale={{ emptyText: "No strategies match your filters." }}
      />
      <div className="table-footer">
        <span>
          Aggregated pool:{" "}
          <strong>
            {formatCapital(strategies.reduce((sum, s) => sum + s.capital, 0))}
          </strong>
          <span className="footer-divider">|</span>Total signals:{" "}
          <strong>{strategies.reduce((sum, s) => sum + s.signals, 0)}</strong>
        </span>
        <Button type="link" size="small" onClick={() => navigate("/signals")}>
          View signal telemetry <ArrowRightOutlined />
        </Button>
      </div>
    </Panel>
  );
}
