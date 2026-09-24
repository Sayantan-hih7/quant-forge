import { Panel } from '../../../components/ui/Panel';
import { BrokerSessionBanner } from '../components/BrokerSessionBanner';
export default function ClientNotificationsPage() {
  return <div className="page-enter"><div className="page-heading"><div><h1>Notifications</h1><p>Updates for your personal demo workspace.</p></div></div><BrokerSessionBanner /><Panel title="Recent updates"><div className="risk-list">
    <article className="notification-item"><strong>Your workspace is ready</strong><p className="muted">Your demo broker connection and risk guardrails are configured.</p></article>
    <article className="notification-item"><strong>Daily loss protection is active</strong><p className="muted">Your configured daily stop loss is shown on the portfolio dashboard.</p></article>
  </div></Panel></div>;
}
