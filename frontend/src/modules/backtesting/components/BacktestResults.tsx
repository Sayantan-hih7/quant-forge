import { Alert, Button, Descriptions, Empty, Table, Tabs, Tag } from "antd";
import { DownloadOutlined, ExperimentOutlined } from "@ant-design/icons";
import type { BacktestRun, BacktestTrade } from "../types";
import { money, signedMoney, tradeTime } from "../config/backtestDefaults";
import { BacktestCharts } from "./BacktestCharts";
import { RulePairSummary } from "./RulePairSummary";

function exportTrades(run: BacktestRun) {
  const rows = [
    [
      "Run",
      "Data",
      "Symbol",
      "Quantity",
      "Entry IST",
      "Exit IST",
      "Buy fill INR",
      "Sell fill INR",
      "Estimated fees INR",
      "Net PnL INR",
      "Exit reason",
    ],
    ...(run.result?.trades ?? []).map((trade) => [
      run.id,
      "Simulated, not historical performance",
      trade.symbol,
      trade.quantity,
      tradeTime(trade.entryTime),
      tradeTime(trade.exitTime),
      trade.entry.toFixed(2),
      trade.exit.toFixed(2),
      trade.fees.toFixed(2),
      trade.pnl.toFixed(2),
      trade.reason,
    ]),
  ];
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `backtest-${run.id.slice(0, 8)}-simulated.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BacktestResults({
  run,
  changed,
  canPaper,
  onPaper,
}: {
  run?: BacktestRun;
  changed: boolean;
  canPaper: boolean;
  onPaper: () => void;
}) {
  if (!run?.result)
    return (
      <section className="bt-panel bt-empty-results">
        <div className="bt-empty-icon">
          <ExperimentOutlined aria-hidden />
        </div>
        <h2>Know the trade before the trade</h2>
        <p>
          Pair your entry and exit rules, choose the test period, and review the
          complete trade lifecycle.
        </p>
        <div className="bt-empty-flow">
          <span>Buy condition</span>
          <i>→</i>
          <span>Risk & sizing</span>
          <i>→</i>
          <span>Sell condition</span>
        </div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Run a backtest to preview equity, drawdown, costs, and the trade ledger."
        />
        <small>
          UI simulation only. No historical feed or strategy evaluation engine
          is connected.
        </small>
      </section>
    );
  const result = run.result;
  const stats = [
    {
      label: "Net P&L",
      value: signedMoney(result.netPnl),
      tone: result.netPnl >= 0 ? "positive" : "negative",
      sub: `${((result.netPnl / run.config.initialCapital) * 100).toFixed(2)}% return after costs`,
    },
    {
      label: "Max drawdown",
      value: `${result.maxDrawdown.toFixed(2)}%`,
      tone: "negative",
      sub: "Based on closed-trade equity",
    },
    {
      label: "Win rate",
      value: `${result.winRate.toFixed(1)}%`,
      sub: `${result.trades.length} completed trades`,
    },
    {
      label: "Profit factor",
      value:
        result.profitFactor === null ? "—" : result.profitFactor.toFixed(2),
      sub: "Net wins ÷ absolute net losses",
    },
    {
      label: "Ending capital",
      value: money(result.endingCapital),
      sub: `${money(run.config.initialCapital)} starting capital`,
    },
    {
      label: "Estimated fees",
      value: money(result.fees),
      sub: "Slippage included in fill prices",
    },
  ];
  const columns = [
    {
      title: "Stock / quantity",
      key: "symbol",
      width: 150,
      render: (_: unknown, trade: BacktestTrade) => (
        <div className="bt-table-stock">
          <strong>{trade.symbol}</strong>
          <small>{trade.quantity} shares · long</small>
        </div>
      ),
    },
    {
      title: "Buy entry",
      key: "entry",
      width: 160,
      render: (_: unknown, trade: BacktestTrade) => (
        <div className="bt-table-stock">
          <strong>{money(trade.entry)}</strong>
          <small>{tradeTime(trade.entryTime)} IST</small>
        </div>
      ),
    },
    {
      title: "Sell exit",
      key: "exit",
      width: 160,
      render: (_: unknown, trade: BacktestTrade) => (
        <div className="bt-table-stock">
          <strong>{money(trade.exit)}</strong>
          <small>{tradeTime(trade.exitTime)} IST</small>
        </div>
      ),
    },
    { title: "Exit reason", dataIndex: "reason", width: 150 },
    { title: "Fees", dataIndex: "fees", width: 100, render: money },
    {
      title: "Net P&L",
      dataIndex: "pnl",
      width: 130,
      sorter: (a: BacktestTrade, b: BacktestTrade) => a.pnl - b.pnl,
      render: (value: number) => (
        <strong className={value >= 0 ? "positive" : "negative"}>
          {signedMoney(value)}
        </strong>
      ),
    },
  ];
  return (
    <section className="bt-panel bt-results" aria-label="Backtest result">
      <header className="bt-panel-heading">
        <div>
          <span className="bt-eyebrow">
            COMPLETED SIMULATION · {run.id.slice(0, 8)}
          </span>
          <h2>{run.entryRule.name}</h2>
          <p>
            {run.config.startDate} → {run.config.endDate} ·{" "}
            {run.config.timeframe} · {run.scope.symbols.length} stocks
          </p>
        </div>
        <Tag color="purple">Sample result</Tag>
      </header>
      {changed && (
        <Alert
          className="bt-result-note"
          showIcon
          type="info"
          title="Showing the previous setup's result"
          description="Your current settings or saved rules differ. Run again to create a separate report; this snapshot remains unchanged."
        />
      )}
      <div className="bt-stat-grid">
        {stats.map((stat) => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <strong className={stat.tone}>{stat.value}</strong>
            <small>{stat.sub}</small>
          </div>
        ))}
      </div>
      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: "overview",
            label: "Overview",
            children: result.trades.length ? (
              <BacktestCharts
                data={result.curve}
                capital={run.config.initialCapital}
              />
            ) : (
              <Empty description="No sample fills fit this period and capital. Try a longer period or review position sizing." />
            ),
          },
          {
            key: "trades",
            label: `Trade ledger (${result.trades.length})`,
            children: (
              <Table<BacktestTrade>
                className="bt-trades-table"
                size="small"
                rowKey="id"
                dataSource={result.trades}
                columns={columns}
                scroll={{ x: 850 }}
                pagination={{ pageSize: 8, showSizeChanger: false }}
              />
            ),
          },
          {
            key: "assumptions",
            label: "Rules & assumptions",
            children: (
              <div className="bt-assumptions">
                <RulePairSummary entry={run.entryRule} exit={run.exitRule} />
                <Descriptions
                  size="small"
                  column={1}
                  items={[
                    {
                      key: "universe",
                      label: "Stock universe",
                      children: run.scope.label,
                    },
                    {
                      key: "manual",
                      label: "Manual selections",
                      children: `${run.scope.manualCount} included · no manual interventions in this report`,
                    },
                    {
                      key: "risk",
                      label: "Position sizing",
                      children: `${run.config.riskPercent}% equity risk · maximum ${run.config.maxPositions} positions · no leverage`,
                    },
                    {
                      key: "stop",
                      label: "Protective exits",
                      children: `${run.config.stopMode === "ATR" ? `ATR(${run.config.atrPeriod}) × ${run.config.atrMultiplier}` : `${run.config.stopPercent}% ${run.config.stopMode}`} · target ${run.config.targetR}R`,
                    },
                    {
                      key: "session",
                      label: "Holding",
                      children: run.config.overnight
                        ? "Overnight enabled; close remaining positions at period end."
                        : "Square off at 15:15 IST; no overnight positions.",
                    },
                    {
                      key: "cost",
                      label: "Costs per side",
                      children: `${run.config.slippagePercent}% slippage + ${run.config.feePercent}% combined fee estimate`,
                    },
                  ]}
                />
                <p>
                  Intended engine behavior: evaluate completed candles, fill on
                  the next available bar, and apply a protective stop first when
                  stop and target touch within the same bar.
                </p>
                <Alert
                  showIcon
                  type="warning"
                  title="Illustrative report, not a strategy performance claim"
                  description="Sample trades are generated for UI review; saved indicator rules are not evaluated. ATR uses a synthetic distance, and historical monthly membership is a fixture. Holidays, corporate actions, liquidity, gaps, intrabar paths, and real taxes are not modeled. Drawdown uses closed trades rather than continuous portfolio valuation."
                />
              </div>
            ),
          },
        ]}
      />
      <footer className="bt-result-footer">
        <Button
          icon={<DownloadOutlined aria-hidden />}
          disabled={!result.trades.length}
          onClick={() => exportTrades(run)}
        >
          Export trades
        </Button>
        <Button
          type="primary"
          icon={<ExperimentOutlined aria-hidden />}
          disabled={!canPaper}
          onClick={onPaper}
        >
          Start paper session
        </Button>
      </footer>
      {!canPaper && (
        <p className="bt-help bt-result-note">
          Publish a non-empty current monthly stock list before opening a paper
          session.
        </p>
      )}
      <p className="bt-disclosure">
        Simulated prices and sample fills · Manual buy/sell actions belong to
        paper trading and never alter this result.
      </p>
    </section>
  );
}
