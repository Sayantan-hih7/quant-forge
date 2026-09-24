import { Button, Progress, Tag } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { BACKTEST_DURATION } from "../config/backtestDefaults";
import type { BacktestRun } from "../types";

export function BacktestProgress({
  run,
  now,
  onCancel,
}: {
  run: BacktestRun;
  now: number;
  onCancel: () => void;
}) {
  const elapsed = Math.max(0, now - run.createdAt);
  const percent = Math.min(98, Math.floor((elapsed / BACKTEST_DURATION) * 100));
  const phase =
    elapsed < 4000
      ? "Queued"
      : elapsed < 11000
        ? "Preparing sample candles"
        : elapsed < 25000
          ? "Simulating fills & exits"
          : "Preparing report";
  return (
    <section className="bt-panel bt-progress" role="status">
      <div className="bt-progress-heading">
        <span>
          <LoadingOutlined aria-hidden /> {phase}
        </span>
        <Tag color="blue">{Math.floor(elapsed / 1000)}s elapsed</Tag>
      </div>
      <Progress percent={percent} size="small" />
      <p>
        {run.entryRule.name} · {run.config.startDate} → {run.config.endDate} ·{" "}
        {run.scope.symbols.length} stocks
      </p>
      <div className="bt-progress-footer">
        <small>
          Accelerated UI simulation. Previous results remain available.
        </small>
        <Button size="small" onClick={onCancel}>
          Cancel run
        </Button>
      </div>
    </section>
  );
}
