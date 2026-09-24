import type { ReactNode } from 'react';
import { SafetyCertificateOutlined, ApiOutlined, LineChartOutlined } from '@ant-design/icons';
import { ThemeSwitcher } from '../../../components/layout/ThemeSwitcher';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-layout">
    <aside className="auth-story">
      <div className="auth-brand"><span className="brand-mark">Q<span>f</span></span><strong>QuantForge</strong><span className="auth-preview-tag">PREVIEW</span></div>
      <div className="auth-story-content">
        <span className="auth-eyebrow">YOUR EDGE. SYSTEMATICALLY EXECUTED.</span>
        <h2>A clearer way to<br />trade with conviction.</h2>
        <p>One workspace for your strategies, broker connections, and risk. Built for the way you trade.</p>
        <div className="auth-terminal-card">
          <div className="auth-terminal-top"><span><span className="status-dot" /> QuantForge workspace</span><span>DEMO</span></div>
          <div className="auth-curve" aria-hidden="true"><svg viewBox="0 0 360 90"><path className="curve-grid" d="M0 20H360M0 45H360M0 70H360" /><path d="M0 75 24 69 42 73 64 56 86 61 110 40 128 48 149 37 170 45 192 28 213 34 235 22 254 28 279 13 300 18 328 6 360 9" /></svg></div>
          <div className="auth-terminal-bottom"><span><SafetyCertificateOutlined /> Risk controls active</span><span><ApiOutlined /> Broker connected</span></div>
        </div>
        <div className="auth-features"><span><LineChartOutlined /> Strategy-first execution</span><span><SafetyCertificateOutlined /> Risk at every step</span></div>
      </div>
      <div className="auth-story-footer">Designed for Indian markets <span>NSE · BSE</span></div>
    </aside>
    <main className="auth-main"><div className="auth-top"><span>Trading workspace</span><ThemeSwitcher /></div><div className="auth-form-container">{children}</div><footer className="auth-footer">UI preview · Simulated authentication · Use sample details only</footer></main>
  </div>;
}
