import { Alert, Button, Collapse, Form, Tag } from "antd";
import { PlayCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { RhfSelect, RhfInputNumber } from "../../../components/forms";
import { RhfDatePicker } from "../../../components/forms/RhfDatePicker";
import { RhfSwitch } from "../../../components/forms/RhfSwitch";
import type { BacktestConfig } from "../types";
import type { RuleTemplate } from "../../qualification/types";
import { todayIST } from "../schemas/backtestSchema";
import { money } from "../config/backtestDefaults";
import type { TradingPlan } from "../../strategies/types/tradingPlan";

export function BacktestConfiguration({
  form,
  entries,
  exits,
  plans,
  onEntryChange,
  busy,
  candidateCount,
  onExitEdit,
  onSave,
  onRun,
}: {
  form: UseFormReturn<BacktestConfig>;
  entries: RuleTemplate[];
  exits: RuleTemplate[];
  plans: TradingPlan[];
  onEntryChange: (id: string) => void;
  busy: boolean;
  candidateCount: number;
  onExitEdit: () => void;
  onSave: (value: BacktestConfig) => void;
  onRun: (value: BacktestConfig) => void;
}) {
  const values = useWatch({ control: form.control });
  const entry = entries.find((rule) => rule.id === values.entryRuleId);
  const plan = plans.find((item) => item.entryRuleId === entry?.id);
  const field = { control: form.control };
  const maxDate = dayjs(todayIST()).subtract(1, "day");
  return (
    <section
      className="bt-panel bt-configuration"
      aria-label="Backtest configuration"
    >
      <header className="bt-panel-heading">
        <div>
          <span className="bt-eyebrow">TEST SETUP</span>
          <h2>Configure backtest</h2>
        </div>
        <Tag>Long only</Tag>
      </header>
      <Form
        layout="vertical"
        requiredMark={false}
        onFinish={form.handleSubmit(onRun)}
      >
        <div className="bt-config-actions">
          <Button
            icon={<SaveOutlined aria-hidden />}
            onClick={form.handleSubmit(onSave)}
          >
            Save setup
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<PlayCircleOutlined aria-hidden />}
            disabled={busy || !entries.length || !candidateCount}
          >
            {busy ? "Run in progress" : "Run backtest"}
          </Button>
        </div>
        <div className="bt-form-section">
          <h3>
            <span>01</span> Entry & exit
          </h3>
          <RhfSelect
            {...field}
            name="entryRuleId"
            label="Strategy"
            showSearch
            optionFilterProp="label"
            onValueChange={onEntryChange}
            options={entries.map((rule) => ({
              value: rule.id,
              label: plans.find(item => item.entryRuleId === rule.id)?.name ?? rule.name,
            }))}
          />
          <div className="bt-field-link">
            {entry ? (
              <Link
                to={`/strategies?tab=rules&rule=${encodeURIComponent(entry.id)}`}
              >
                Edit in Algo Strategies →
              </Link>
            ) : (
              <Link to="/strategies?tab=rules">Complete a strategy →</Link>
            )}
          </div>
          <div className="bt-risk-note"><span>Saved sell rules</span><strong>{exits.find(rule => rule.id === plan?.exitRuleId)?.name ?? 'Complete this strategy in Trading rules'}</strong></div>
          <div className="bt-field-link">
            <Button type="link" size="small" onClick={onExitEdit}>
              Edit exit conditions →
            </Button>
          </div>
          <p className="bt-help">
            One strategy includes its buy rules, sell rules and risk settings. Edit both sides in Trading rules.
          </p>
          <p className="bt-help">
            Buy when entry conditions match. Sell held shares when exit
            conditions match, a protective exit fires, or the session ends.
          </p>
        </div>
        <div className="bt-form-section">
          <h3>
            <span>02</span> Period & stock universe
          </h3>
          <div className="bt-form-grid">
            <RhfDatePicker
              {...field}
              name="startDate"
              label="Start date"
              maxDate={maxDate}
              format="DD MMM YYYY"
            />
            <RhfDatePicker
              {...field}
              name="endDate"
              label="End date"
              maxDate={maxDate}
              format="DD MMM YYYY"
            />
          </div>
          <RhfSelect
            {...field}
            name="universe"
            label="Stock universe"
            options={[
              { value: "historical", label: "Demo monthly snapshots" },
              {
                value: "current",
                label: "Current qualified list · exploratory",
              },
            ]}
          />
          {values.universe === "current" ? (
            <>
              <Alert
                type="warning"
                showIcon
                title="Current selection applied to past dates"
                description="This introduces selection bias. It is an exploratory comparison, not a point-in-time historical universe."
              />
              <RhfSwitch
                {...field}
                name="includeManual"
                label="Include manually added stocks"
              />
              <p className="bt-help">
                {candidateCount} stocks in scope. Custom selections are not
                monthly rule matches.
              </p>
            </>
          ) : (
            <p className="bt-help">
              Illustrative monthly membership. Real historical snapshots and
              point-in-time data will be connected with the backend.
            </p>
          )}
          <div className="bt-form-grid">
            <RhfSelect
              {...field}
              name="timeframe"
              label="Execution interval"
              options={["1m", "5m", "15m", "1h", "1d"].map((value) => ({
                value,
                label:
                  value === "1d"
                    ? "Daily"
                    : value === "1h"
                      ? "1 hour"
                      : `${value.slice(0, -1)} minutes`,
              }))}
            />
            <RhfSwitch
              {...field}
              name="overnight"
              label="Allow overnight holding"
            />
          </div>
          <p className="bt-help">
            Conditions keep their own timeframes. The execution interval sets
            when they are checked. Overnight off: square off at 15:15 IST.
          </p>
        </div>
        <div className="bt-form-section">
          <h3>
            <span>03</span> Capital & protection
          </h3>
          <RhfInputNumber
            {...field}
            name="initialCapital"
            label="Initial capital (₹)"
            min={1000}
            max={100000000}
            step={10000}
          />
          <div className="bt-form-grid">
            <RhfInputNumber
              {...field}
              name="riskPercent"
              label="Risk per trade (%)"
              min={0.1}
              max={5}
              step={0.1}
            />
            <RhfInputNumber
              {...field}
              name="maxPositions"
              label="Max open positions"
              min={1}
              max={20}
              precision={0}
            />
          </div>
          <div className="bt-risk-note">
            Initial risk budget{" "}
            <strong>
              {money(
                ((values.initialCapital ?? 0) * (values.riskPercent ?? 0)) /
                  100,
              )}
            </strong>
            <small>
              Position size also respects available cash and the per-position
              capital cap. Stops are not guaranteed loss limits.
            </small>
          </div>
          <RhfSelect
            {...field}
            name="stopMode"
            label="Stop-loss mode"
            options={[
              { value: "ATR", label: "ATR-based" },
              { value: "fixed", label: "Fixed percentage" },
              { value: "trailing", label: "Trailing percentage" },
            ]}
          />
          {values.stopMode === "ATR" ? (
            <div className="bt-form-grid">
              <RhfInputNumber
                {...field}
                name="atrPeriod"
                label="ATR period"
                min={2}
                max={100}
                precision={0}
              />
              <RhfInputNumber
                {...field}
                name="atrMultiplier"
                label="ATR multiplier"
                min={0.5}
                max={10}
                step={0.5}
              />
            </div>
          ) : (
            <RhfInputNumber
              {...field}
              name="stopPercent"
              label={
                values.stopMode === "trailing"
                  ? "Trailing distance (%)"
                  : "Stop distance (%)"
              }
              min={0.1}
              max={25}
              step={0.1}
            />
          )}
          <RhfInputNumber
            {...field}
            name="targetR"
            label="Profit target (R)"
            min={0.5}
            max={10}
            step={0.5}
          />
        </div>
        <Collapse
          ghost
          items={[
            {
              key: "costs",
              label: "Trading costs & fill assumptions",
              children: (
                <>
                  <div className="bt-form-grid">
                    <RhfInputNumber
                      {...field}
                      name="slippagePercent"
                      label="Slippage per side (%)"
                      min={0}
                      max={2}
                      step={0.01}
                    />
                    <RhfInputNumber
                      {...field}
                      name="feePercent"
                      label="Estimated fees per side (%)"
                      min={0}
                      max={2}
                      step={0.01}
                    />
                  </div>
                  <p className="bt-help">
                    0.02% = 2 basis points. Fees are an editable combined
                    estimate, not a broker-specific tax schedule. Both sides are
                    charged. Signals use closed candles; fills occur on the next
                    available bar.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Form>
    </section>
  );
}
