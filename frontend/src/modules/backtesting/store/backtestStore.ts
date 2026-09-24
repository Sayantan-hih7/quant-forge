import { create } from "zustand";
import { persist } from "zustand/middleware";
import { backtestSchema } from "../schemas/backtestSchema";
import { BACKTEST_DURATION } from "../config/backtestDefaults";
import { simulateBacktest } from "../api/mockBacktest";
import type { BacktestConfig, BacktestRun, BacktestScope } from "../types";
import type { RuleTemplate } from "../../qualification/types";

interface BacktestWorkspace {
  draft?: BacktestConfig;
  runs: BacktestRun[];
}
interface BacktestState {
  workspaces: Record<string, BacktestWorkspace>;
  saveDraft: (owner: string, config: BacktestConfig) => void;
  start: (
    owner: string,
    config: BacktestConfig,
    entry: RuleTemplate,
    exit: RuleTemplate,
    scope: BacktestScope,
  ) => string | null;
  cancel: (owner: string, id: string) => void;
  advance: (owner: string, now: number) => void;
}
export const useBacktestStore = create<BacktestState>()(
  persist(
    (set, get) => ({
      workspaces: {},
      saveDraft: (owner, draft) =>
        set((state) => ({
          workspaces: {
            ...state.workspaces,
            [owner]: {
              ...state.workspaces[owner],
              runs: state.workspaces[owner]?.runs ?? [],
              draft: structuredClone(draft),
            },
          },
        })),
      start: (owner, config, entry, exit, scope) => {
        if (
          !backtestSchema.safeParse(config).success ||
          !scope.symbols.length ||
          entry.side !== "BUY" ||
          exit.side !== "SELL" ||
          config.entryRuleId !== entry.id ||
          config.exitRuleId !== exit.id ||
          get().workspaces[owner]?.runs.some((run) => run.status === "running")
        )
          return null;
        const run: BacktestRun = structuredClone({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          status: "running",
          config,
          entryRule: entry,
          exitRule: exit,
          scope,
        });
        set((state) => ({
          workspaces: {
            ...state.workspaces,
            [owner]: {
              draft: config,
              runs: [run, ...(state.workspaces[owner]?.runs ?? [])].slice(
                0,
                30,
              ),
            },
          },
        }));
        return run.id;
      },
      cancel: (owner, id) =>
        set((state) => {
          const workspace = state.workspaces[owner];
          return workspace
            ? {
                workspaces: {
                  ...state.workspaces,
                  [owner]: {
                    ...workspace,
                    runs: workspace.runs.map((run) =>
                      run.id === id && run.status === "running"
                        ? {
                            ...run,
                            status: "cancelled",
                            finishedAt: Date.now(),
                          }
                        : run,
                    ),
                  },
                },
              }
            : state;
        }),
      advance: (owner, now) => {
        if (
          !get().workspaces[owner]?.runs.some(
            (run) =>
              run.status === "running" &&
              now - run.createdAt >= BACKTEST_DURATION,
          )
        )
          return;
        set((state) => ({
          workspaces: {
            ...state.workspaces,
            [owner]: {
              ...state.workspaces[owner],
              runs: state.workspaces[owner].runs.map((run) => {
                if (
                  run.status !== "running" ||
                  now - run.createdAt < BACKTEST_DURATION
                )
                  return run;
                try {
                  return {
                    ...run,
                    status: "completed",
                    finishedAt: now,
                    result: simulateBacktest(run),
                  };
                } catch {
                  return {
                    ...run,
                    status: "failed",
                    finishedAt: now,
                    error:
                      "The sample result could not be prepared. Review settings and start another run.",
                  };
                }
              }),
            },
          },
        }));
      },
    }),
    { name: "quantforge-backtests", version: 1 },
  ),
);
