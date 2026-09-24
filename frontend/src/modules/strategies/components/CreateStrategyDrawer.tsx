import { Alert, App, Button, Drawer, Form } from "antd";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RhfInput,
  RhfAutoComplete,
  RhfSelect,
  RhfInputNumber,
} from "../../../components/forms";
import {
  strategySchema,
  segments,
  type StrategyFormValues,
} from "../schemas/strategySchema";
import { useDemoStore } from "../../../store/demoStore";
export function CreateStrategyDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const add = useDemoStore((s) => s.addStrategy);
  const { control, handleSubmit, reset } = useForm<StrategyFormValues>({
    resolver: zodResolver(strategySchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      segment: "NSE EQ",
      mode: "PAPER",
      timeframe: "5m",
      capital: 100000,
    },
  });
  const close = () => {
    reset();
    onClose();
  };
  const submit = (values: StrategyFormValues) => {
    add({
      ...values,
      id: crypto.randomUUID(),
      description: `TF: ${values.timeframe} · Custom strategy`,
      signals: 0,
      clients: 0,
      pnl: 0,
      roi: 0,
      drawdown: 0,
      health: 100,
    });
    message.success("Strategy added to this demo session");
    close();
  };
  return (
    <Drawer
      title="Create a strategy"
      size={440}
      open={open}
      onClose={close}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" htmlType="submit" form="strategy-form">
            Create strategy
          </Button>
        </div>
      }
    >
      <p className="muted mb-6">
        Configure a reusable strategy for your workspace.
      </p>
      <Form
        id="strategy-form"
        layout="vertical"
        onFinish={handleSubmit(submit)}
        requiredMark="optional"
      >
        <RhfInput
          name="name"
          control={control}
          label="Strategy name"
          placeholder="e.g. Nifty Momentum V1"
          required
        />
        <RhfAutoComplete
          name="segment"
          control={control}
          label="Market segment"
          options={segments.map((value) => ({ value }))}
          placeholder="Search market segments"
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <RhfSelect
            name="mode"
            control={control}
            label="Execution mode"
            options={[
              { value: "PAPER", label: "Paper trading" },
              { value: "LIVE", label: "Live (simulated)" },
            ]}
            required
          />
          <RhfSelect
            name="timeframe"
            control={control}
            label="Timeframe"
            options={["1m", "3m", "5m", "15m", "Daily"].map((value) => ({
              value,
              label: value,
            }))}
            required
          />
        </div>
        <RhfInputNumber
          name="capital"
          control={control}
          label="Capital allocation (₹)"
          step={10000}
          required
        />
        <Alert
          type="info"
          showIcon
          title="UI preview only"
          description="Strategies are kept for this session. No orders will be placed, including in simulated live mode."
        />
      </Form>
    </Drawer>
  );
}
