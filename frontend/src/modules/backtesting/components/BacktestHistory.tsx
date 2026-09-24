import { Button, Empty, Table, Tag } from "antd";
import type { BacktestRun } from "../types";
import { signedMoney, tradeTime } from "../config/backtestDefaults";

export function BacktestHistory({
  runs,
  onOpen,
  onReuse,
}: {
  runs: BacktestRun[];
  onOpen: (run: BacktestRun) => void;
  onReuse: (run: BacktestRun) => void;
}) {
  return (
    <section className="bt-panel bt-history">
      <header className="bt-panel-heading">
        <div>
          <h2>Run history</h2>
          <p>Each run keeps its own rules, universe, and settings.</p>
        </div>
        <Tag>{runs.length} runs</Tag>
      </header>
      <Table<BacktestRun>
        rowKey="id"
        size="small"
        dataSource={runs}
        scroll={{ x: 850 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{
          emptyText: <Empty description="Your first run will appear here." />,
        }}
        columns={[
          {
            title: "Strategy / created",
            key: "name",
            width: 220,
            render: (_, run) => (
              <div className="bt-table-stock">
                <strong>{run.entryRule.name}</strong>
                <small>
                  {tradeTime(run.createdAt)} · {run.id.slice(0, 8)}
                </small>
              </div>
            ),
          },
          {
            title: "Test period",
            key: "period",
            render: (_, run) => (
              <span>
                {run.config.startDate} → {run.config.endDate}
              </span>
            ),
          },
          {
            title: "Interval",
            key: "timeframe",
            render: (_, run) => run.config.timeframe,
          },
          {
            title: "Status",
            dataIndex: "status",
            render: (value: string) => (
              <Tag
                color={
                  value === "completed"
                    ? "green"
                    : value === "running"
                      ? "blue"
                      : "default"
                }
              >
                {value}
              </Tag>
            ),
          },
          {
            title: "Sample net P&L",
            key: "pnl",
            render: (_, run) =>
              run.result ? (
                <strong
                  className={run.result.netPnl >= 0 ? "positive" : "negative"}
                >
                  {signedMoney(run.result.netPnl)}
                </strong>
              ) : (
                "—"
              ),
          },
          {
            title: "Actions",
            key: "actions",
            render: (_, run) => (
              <div className="bt-actions">
                <Button
                  size="small"
                  disabled={!run.result}
                  onClick={() => onOpen(run)}
                >
                  View report
                </Button>
                <Button size="small" onClick={() => onReuse(run)}>
                  Use settings
                </Button>
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
