import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Steps } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { ThemeSwitcher } from "../../../components/layout/ThemeSwitcher";
import { useAuthStore } from "../../../store/authStore";
import { BrokerSelector } from "../components/BrokerSelector";
import {
  BrokerAuthorization,
  type AuthorizationResult,
} from "../components/BrokerAuthorization";
import { RiskProfileForm } from "../components/RiskProfileForm";
import type { RiskValues } from "../schemas/brokerSchema";

export default function BrokerOnboardingPage() {
  const [step, setStep] = useState(0);
  const [brokerId, setBrokerId] = useState("dhan");
  const [authorization, setAuthorization] =
    useState<AuthorizationResult | null>(null);
  const auth = useAuthStore();
  const navigate = useNavigate();
  const complete = (risk: RiskValues) => {
    if (!authorization) return;
    auth.connectBroker({
      brokerId,
      ...authorization,
      ...risk,
      connectedAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    });
    navigate("/client/dashboard", { replace: true });
  };
  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <div className="auth-brand">
          <span className="brand-mark">
            Q<span>f</span>
          </span>
          <strong>QuantForge</strong>
        </div>
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <Button
            onClick={() => {
              auth.signOut();
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="onboarding-main">
        <div className="onboarding-intro">
          <span className="auth-eyebrow">LET’S SET UP YOUR WORKSPACE</span>
          <h1>Connect your broker. Define your limits.</h1>
          <p>Three simple steps to your personal trading dashboard.</p>
        </div>
        <Steps
          current={step}
          size="small"
          items={[
            { title: "Select broker" },
            { title: "Authorize account" },
            { title: "Risk guardrails" },
          ]}
        />
        <section className="onboarding-card">
          <div className="step-counter">
            STEP {step + 1} OF 3 <span>DEMO SETUP</span>
          </div>
          {step === 0 && (
            <>
              <div className="onboarding-section-heading">
                <h2>Choose your primary broker</h2>
                <p>Select the account you want to use with QuantForge.</p>
              </div>
              <BrokerSelector value={brokerId} onChange={setBrokerId} />
              <div className="onboarding-security">
                <SafetyCertificateOutlined />
                <span>
                  Credentials stay in this form only. Use sample values for this
                  preview.
                </span>
              </div>
              <div className="wizard-actions">
                <span className="muted">
                  Signed in as {auth.session?.email}
                </span>
                <Button type="primary" onClick={() => setStep(1)}>
                  Continue
                </Button>
              </div>
            </>
          )}
          {step === 1 && (
            <BrokerAuthorization
              brokerId={brokerId}
              onBack={() => {
                setAuthorization(null);
                setStep(0);
              }}
              onAuthorized={(result) => {
                setAuthorization(result);
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <RiskProfileForm
              onBack={() => {
                setAuthorization(null);
                setStep(1);
              }}
              onComplete={complete}
            />
          )}
        </section>
        <p className="onboarding-footer">
          Broker access and risk settings can be managed from your account.
        </p>
      </main>
    </div>
  );
}
