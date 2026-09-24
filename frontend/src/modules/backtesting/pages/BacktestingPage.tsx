import { useEffect, useState } from "react";
import { Alert, App, Button, Skeleton, Tabs, Tag } from "antd";
import {
  ExperimentOutlined,
  HistoryOutlined,
  SlidersOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQualification } from "../../qualification/hooks/useQualification";
import { useBacktestStore } from "../store/backtestStore";
import { usePaperTradingStore } from "../../paper-trading/store/paperTradingStore";
import {
  backtestSchema,
  defaultBacktestConfig,
} from "../schemas/backtestSchema";

import { createBacktestScope } from "../api/mockBacktest";
import { BacktestConfiguration } from "../components/BacktestConfiguration";
import { BacktestResults } from "../components/BacktestResults";
import { BacktestProgress } from "../components/BacktestProgress";
import { BacktestHistory } from "../components/BacktestHistory";
import type { BacktestConfig, BacktestRun } from "../types";
import type {
  MonthlyCache,
  QualificationWorkspace,
} from "../../qualification/types";
import { savedStrategyPairs } from "../../strategies/utils/strategyPairs";
import "../../../styles/backtesting.css";

export default function BacktestingPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const { owner, workspace, cache } = useQualification();
  const [params] = useSearchParams();
  if (!workspace) return <Skeleton active />;
  return (
    <BacktestingWorkspace
      key={`${owner}:${params.get("strategy") ?? ""}`}
      owner={owner}
      workspace={workspace}
      cache={cache}
    />
  );
}

export function BacktestingWorkspace({
  owner,
  workspace,
  cache,
  embedded = false,
}: {
  owner: string;
  workspace: QualificationWorkspace;
  cache?: MonthlyCache;
  embedded?: boolean;
}) {
  const actions = useBacktestStore();
  const saved = actions.workspaces[owner];
  const runs = saved?.runs ?? [];
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [now, setNow] = useState(Date.now);
  const pairs = savedStrategyPairs(workspace).filter(({ plan }) => !plan.needsReview);
  const entries = pairs.map(pair => pair.entry);
  const exits = pairs.map(pair => pair.exit);
  const requestedEntry = entries.find(
    (rule) => rule.id === params.get("strategy"),
  );
  const requestedPlan = workspace.tradingPlans?.find(
    (plan) =>
      plan.entryRuleId ===
      (requestedEntry?.id ?? saved?.draft?.entryRuleId ?? entries[0]?.id),
  );
  const form = useForm<BacktestConfig>({
    resolver: zodResolver(backtestSchema),
    mode: "onBlur",
    defaultValues: {
      ...(saved?.draft ??
        defaultBacktestConfig(entries[0]?.id ?? "", exits[0]?.id ?? "")),
      ...(requestedPlan ? { entryRuleId: requestedPlan.entryRuleId, exitRuleId: requestedPlan.exitRuleId } : {}),
      ...(requestedPlan && (requestedEntry || !saved?.draft)
        ? {
            ...requestedPlan.risk,
            entryRuleId: requestedPlan.entryRuleId,
            exitRuleId: requestedPlan.exitRuleId,
          }
        : {}),
    },
  });
  const config = useWatch({ control: form.control }) as BacktestConfig;
  const entry = entries.find((rule) => rule.id === config.entryRuleId);
  const exit = exits.find((rule) => rule.id === config.exitRuleId);
  const active = runs.find((run) => run.status === "running");
  const selected =
    runs.find((run) => run.id === params.get("run") && run.result) ??
    runs.find((run) => run.status === "completed");
  const scope = createBacktestScope(config, cache);
  const currentMatches =
    selected &&
    JSON.stringify(selected.config) === JSON.stringify(config) &&
    JSON.stringify(entry) === JSON.stringify(selected.entryRule) &&
    JSON.stringify(exit) === JSON.stringify(selected.exitRule);
  const advance = actions.advance;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      advance(owner, time);
    }, 500);
    return () => window.clearInterval(timer);
  }, [active, advance, owner]);
  const setTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("view", tab);
    setParams(next);
  };
  const showRun = (run: BacktestRun) => {
    const next = new URLSearchParams(params);
    next.set("run", run.id);
    next.set("view", "workbench");
    setParams(next);
  };
  const start = (values: BacktestConfig) => {
    if (!entry || !exit) {
      message.error("Choose a saved strategy with both buy and sell rules.");
      return;
    }
    const id = actions.start(
      owner,
      values,
      entry,
      exit,
      createBacktestScope(values, cache),
    );
    if (!id) {
      message.warning(
        "A run is already active or the selected stock list is empty.",
      );
      return;
    }
    setNow(() => Date.now());
    const next = new URLSearchParams(params);
    next.delete("run");
    next.set("view", "workbench");
    setParams(next);
    message.info(
      "Backtest queued. Saved rules and settings are pinned to this run.",
    );
  };
  const selectEntry = (id: string) => {

    const plan = workspace.tradingPlans?.find(
      (item) => item.entryRuleId === id,
    );
    form.reset({
      ...form.getValues(),
      ...(plan?.risk ?? {}),
      entryRuleId: id,
      exitRuleId: plan?.exitRuleId ?? "",
    });
  };
  const paper = () => {
    if (!selected || !cache?.candidates.length) return;
    const id = usePaperTradingStore
      .getState()
      .start(
        owner,
        selected,
        createBacktestScope(
          { ...selected.config, universe: "current", includeManual: true },
          cache,
        ),
      );
    if (id) navigate(`/paper-trading?session=${id}`);
  };
  return (
    <div className={`bt-page page-enter ${embedded ? "bt-embedded" : ""}`}>
      {!embedded && (
        <div className="page-heading">
          <div>
            <span className="bt-eyebrow">STRATEGY LAB / BACKTESTS</span>
            <h1>Backtests</h1>
            <p>Test the complete journey from buy signal to sell exit.</p>
          </div>
          <div className="bt-actions">
            <Tag color="purple">UI SIMULATION</Tag>
            <Button
              icon={<ExperimentOutlined aria-hidden />}
              onClick={() => navigate("/paper-trading")}
            >
              Paper trading
            </Button>
          </div>
        </div>
      )}
      <div className="bt-workflow">
        <div>
          <span>01</span>
          <strong>Define the trade</strong>
          <small>Entry + exit + risk</small>
        </div>
        <i>→</i>
        <div className="active">
          <span>02</span>
          <strong>Review the backtest</strong>
          <small>Fills, costs & drawdown</small>
        </div>
        <i>→</i>
        <div>
          <span>03</span>
          <strong>Practice in paper</strong>
          <small>Algo signals + manual control</small>
        </div>
      </div>
      <Tabs
        activeKey={params.get("view") === "history" ? "history" : "workbench"}
        onChange={setTab}
        items={[
          {
            key: "workbench",
            label: (
              <>
                <SlidersOutlined aria-hidden /> Workbench
              </>
            ),
            children: (
              <>
                {(!entry || !exit) && (
                  <Alert
                    className="bt-banner"
                    showIcon
                    type="warning"
                    title="A selected rule is unavailable or its direction changed. Select an available buy and sell pair."
                  />
                )}
                {runs[0]?.status === "cancelled" && (
                  <Alert
                    className="bt-banner"
                    type="info"
                    showIcon
                    title="Run cancelled. Previous reports are unchanged."
                  />
                )}
                {runs[0]?.status === "failed" && (
                  <Alert
                    className="bt-banner"
                    type="error"
                    showIcon
                    title={runs[0].error}
                  />
                )}
                {active && (
                  <div className="bt-banner">
                    <BacktestProgress
                      run={active}
                      now={now}
                      onCancel={() => actions.cancel(owner, active.id)}
                    />
                  </div>
                )}
                {selected && (
                  <div className="bt-mobile-result-link">
                    <span>Report available · {selected.entryRule.name}</span>
                    <Button
                      size="small"
                      onClick={() =>
                        document
                          .getElementById("backtest-report")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    >
                      Jump to report
                    </Button>
                  </div>
                )}
                <div className="bt-workbench">
                  <BacktestConfiguration
                    form={form}
                    entries={entries}
                    exits={exits}
                    plans={pairs.map(pair => pair.plan)}
                    onEntryChange={selectEntry}
                    busy={!!active}
                    candidateCount={scope.symbols.length}
                    onExitEdit={() =>
                      navigate(
                        `/strategies?tab=rules&rule=${encodeURIComponent(entry?.id ?? "")}`,
                      )
                    }
                    onSave={(values) => {
                      actions.saveDraft(owner, values);
                      form.reset(values);
                      message.success("Backtest setup saved. No run started.");
                    }}
                    onRun={start}
                  />
                  <div className="bt-output">
                    <div id="backtest-report">
                      <BacktestResults
                        key={selected?.id ?? "empty"}
                        run={selected}
                        changed={!!selected && !currentMatches}
                        canPaper={!!cache?.candidates.length}
                        onPaper={paper}
                      />
                    </div>
                    <div className="bt-panel bt-human-control">
                      <strong>You remain in control</strong>
                      <p>
                        Backtests measure the saved rules alone. In paper
                        trading, use Manual buy, Sell now, or Sell all & pause.
                        Every intervention is recorded separately.
                      </p>
                      <small>
                        Starting paper trading uses this report’s rules and risk
                        settings, fresh initial capital, and the current
                        qualified stock list.
                      </small>
                    </div>
                  </div>
                </div>
              </>
            ),
          },
          {
            key: "history",
            label: (
              <>
                <HistoryOutlined aria-hidden /> Run history{" "}
                {runs.length > 0 && `(${runs.length})`}
              </>
            ),
            children: (
              <BacktestHistory
                runs={runs}
                onOpen={showRun}
                onReuse={(run) => {
                  form.reset(structuredClone(run.config));
                  showRun(run);
                  message.info(
                    "Settings loaded. Run again to test them; previous results stay unchanged.",
                  );
                }}
              />
            ),
          },
        ]}
      />
      <p className="bt-disclosure">
        Frontend preview · Runs, fills, historical membership, and prices are
        simulated. No broker or backend is connected.
      </p>
    </div>
  );
}
