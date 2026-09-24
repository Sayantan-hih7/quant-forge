import { Alert, Button, Form } from "antd";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RhfInputNumber } from "../../../components/forms";
import { RhfSlider } from "../../../components/forms/RhfSlider";
import { riskSchema, type RiskValues } from "../schemas/brokerSchema";
export function RiskProfileForm({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (values: RiskValues) => void;
}) {
  const { control, handleSubmit } = useForm<RiskValues>({
    resolver: zodResolver(riskSchema),
    mode: "onBlur",
    defaultValues: { capital: 100000, dailyLoss: 2500, multiplier: 1 },
  });
  return (
    <div>
      <div className="onboarding-section-heading">
        <h2>Set your risk guardrails</h2>
        <p>Choose the limits for your simulated strategy portfolio.</p>
      </div>
      <Form
        layout="vertical"
        onFinish={handleSubmit(onComplete)}
        requiredMark={false}
      >
        <RhfInputNumber
          name="capital"
          label="Default allocated capital (₹)"
          control={control}
          step={10000}
          required
        />
        <RhfInputNumber
          name="dailyLoss"
          label="Maximum daily stop loss (₹)"
          control={control}
          step={100}
          required
        />
        <RhfSlider
          name="multiplier"
          label="Risk multiplier"
          control={control}
        />
        <Alert
          type="info"
          showIcon
          title="You stay in control"
          description="The demo dashboard tracks these limits. No funds are moved and no trades are placed."
        />
        <div className="wizard-actions">
          <Button onClick={onBack}>Back</Button>
          <Button type="primary" htmlType="submit">
            Finish setup
          </Button>
        </div>
      </Form>
    </div>
  );
}
