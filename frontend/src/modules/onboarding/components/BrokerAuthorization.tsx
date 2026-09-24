import { useEffect, useState } from "react";
import { Alert, Button, Divider, Form, Modal } from "antd";
import { ApiOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RhfInput } from "../../../components/forms";
import { RhfPassword } from "../../../components/forms/RhfPassword";
import {
  credentialsSchema,
  type CredentialsValues,
} from "../schemas/brokerSchema";
import { brokerById } from "../../../config/brokers";

export interface AuthorizationResult {
  clientId: string;
  method: "credentials" | "oauth";
}
export function BrokerAuthorization({
  brokerId,
  onBack,
  onAuthorized,
}: {
  brokerId: string;
  onBack: () => void;
  onAuthorized: (result: AuthorizationResult) => void;
}) {
  const broker = brokerById(brokerId)!;
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [oauth, setOauth] = useState(false);
  const { control, handleSubmit, reset, subscribe, getValues } =
    useForm<CredentialsValues>({
      resolver: zodResolver(credentialsSchema),
      mode: "onBlur",
      defaultValues: {
        clientId: "",
        apiKey: "",
        apiSecret: "",
        totpSecret: "",
      },
    });
  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: () => setStatus("idle"),
    });
  }, [subscribe]);
  const testConnection = async (values: CredentialsValues) => {
    setTesting(true);
    setStatus("idle");
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setStatus(
      values.apiKey.toLowerCase().includes("invalid") ? "error" : "success",
    );
    setTesting(false);
  };
  return (
    <div>
      <div className="onboarding-section-heading">
        <h2>Authorize {broker.name}</h2>
        <p>
          Connect your account with a demo authorization or sample API
          credentials.
        </p>
      </div>
      <Button
        block
        icon={<ApiOutlined />}
        onClick={() => setOauth(true)}
        disabled={testing}
      >
        Continue with {broker.name} · Demo OAuth
      </Button>
      <Divider plain>or use sample API credentials</Divider>
      <Form
        layout="vertical"
        onFinish={handleSubmit(testConnection)}
        requiredMark="optional"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <RhfInput
            name="clientId"
            control={control}
            label="Broker client ID"
            placeholder="DEMO1234"
            disabled={testing}
            required
          />
          <RhfInput
            name="apiKey"
            control={control}
            label="API key"
            placeholder="Sample API key"
            autoComplete="off"
            disabled={testing}
            required
          />
        </div>
        <RhfPassword
          name="apiSecret"
          control={control}
          label="API secret"
          placeholder="Sample API secret"
          autoComplete="off"
          disabled={testing}
          required
        />
        <div className="totp-box">
          <RhfPassword
            name="totpSecret"
            control={control}
            label="Daily authorization / TOTP secret"
            placeholder="Optional sample Base32 secret"
            autoComplete="off"
            disabled={testing}
          />
          <p>
            Preview field only. Secrets are discarded when you leave this step.
            Daily authorization and token renewal depend on the broker
            integration.
          </p>
        </div>
        <div className="connection-actions">
          <Button htmlType="submit" loading={testing} icon={<ApiOutlined />}>
            Test connection
          </Button>
          <Button
            type="link"
            disabled={testing}
            onClick={() =>
              reset({
                clientId: "DEMO1234",
                apiKey: "demo-api-key",
                apiSecret: "demo-secret-key",
                totpSecret: "",
              })
            }
          >
            Use sample credentials
          </Button>
        </div>
        {status === "success" && (
          <Alert
            showIcon
            type="success"
            title="Demo connection verified"
            description="Your sample account is ready for risk configuration."
          />
        )}
        {status === "error" && (
          <Alert
            showIcon
            type="error"
            title="Demo connection failed"
            description="Check the sample API key and try again. Keys containing “invalid” simulate a failed connection."
          />
        )}
        <p className="onboarding-help">
          No broker requests are sent. Use a key containing “invalid” to preview
          an error.
        </p>
        <div className="wizard-actions">
          <Button onClick={onBack} disabled={testing}>
            Back
          </Button>
          <Button
            type="primary"
            disabled={status !== "success" || testing}
            onClick={() => {
              onAuthorized({
                clientId: getValues("clientId"),
                method: "credentials",
              });
              reset();
            }}
          >
            Continue to risk setup
          </Button>
        </div>
      </Form>
      <Modal
        open={oauth}
        title={`Authorize QuantForge with ${broker.name}`}
        onCancel={() => setOauth(false)}
        okText="Approve demo connection"
        cancelText="Cancel"
        onOk={() => {
          setOauth(false);
          reset();
          onAuthorized({ clientId: "DEMO-OAUTH-1234", method: "oauth" });
        }}
      >
        <Alert
          type="info"
          title="Simulated broker authorization"
          description="This is a local preview of the consent step. No broker sign-in or permissions are requested."
          showIcon
        />
        <ul className="oauth-scopes">
          <li>
            <CheckCircleOutlined /> View account balances and holdings
          </li>
          <li>
            <CheckCircleOutlined /> Read orders and positions
          </li>
          <li>
            <CheckCircleOutlined /> Preview strategy execution access
          </li>
        </ul>
        <p className="muted">Account: DEMO-OAUTH-1234 · {broker.name}</p>
      </Modal>
    </div>
  );
}
