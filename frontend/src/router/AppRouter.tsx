import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AppShell } from '../components/layout/AppShell';
import { PublicOnly, RoleGuard, BrokerReadyGuard } from './AuthGuards';
import { BacktestRedirect } from './BacktestRedirect';
const DashboardPage = lazy(() => import('../modules/dashboard/pages/DashboardPage'));
const QualificationPage = lazy(() => import('../modules/qualification/pages/BackendQualificationPage'));
const StrategiesPage = lazy(() => import('../modules/strategies/pages/BackendStrategiesPage'));
const PaperTradingPage = lazy(() => import('../modules/paper-trading/pages/BackendPaperPage'));
const SettingsPage = lazy(() => import('../modules/settings/pages/SettingsPage'));
const DataSourcesPage = lazy(() => import('../modules/data-sources/pages/DataSourcesPage'));
const DhanCallbackPage = lazy(() => import('../modules/data-sources/pages/DhanCallbackPage'));
const IndicesPage = lazy(() => import('../modules/market-data/pages/IndicesPage'));
const ModulePreviewPage = lazy(() => import('../pages/ModulePreviewPage'));
const AuthPage = lazy(() => import('../modules/auth/pages/AuthPage'));
const VerifyPage = lazy(() => import('../modules/auth/pages/VerifyPage'));
const BrokerOnboardingPage = lazy(() => import('../modules/onboarding/pages/BrokerOnboardingPage'));
const ClientDashboardPage = lazy(() => import('../modules/client/pages/ClientDashboardPage'));
const ClientSettingsPage = lazy(() => import('../modules/client/pages/ClientSettingsPage'));
const ClientNotificationsPage = lazy(() => import('../modules/client/pages/ClientNotificationsPage'));

export function AppRouter() {
  return <Suspense fallback={<div className="loading-page"><Spin size="large" /></div>}><Routes>
    <Route path="/connections/dhan/callback" element={<DhanCallbackPage />} />
    <Route element={<AppShell />}>
      <Route path="/admin/dashboard" element={<DashboardPage />} />
      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/market-data/indices" element={<IndicesPage />} />
      <Route path="/market-data" element={<Navigate to="/market-data/indices" replace />} />
      <Route path="/data-sources" element={<DataSourcesPage />} /><Route path="/qualification" element={<QualificationPage />} />
      <Route path="/strategies" element={<StrategiesPage />} /><Route path="/strategy-builder" element={<Navigate to="/strategies?tab=rules" replace />} />
      <Route path="/backtesting" element={<BacktestRedirect />} /><Route path="/signal-runner" element={<PaperTradingPage runner />} /><Route path="/paper-trading" element={<PaperTradingPage />} />
      <Route path="/signals" element={<Navigate to="/signal-runner" replace />} /><Route path="/scanner" element={<Navigate to="/signal-runner" replace />} />
      <Route path="/orders" element={<Navigate to="/paper-trading" replace />} /><Route path="/portfolio" element={<Navigate to="/paper-trading" replace />} />
      <Route path="*" element={<ModulePreviewPage />} />
    </Route>
    <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
    <Route element={<PublicOnly />}>
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/signup" element={<AuthPage key="signup" signup />} />
    </Route>
    <Route path="/auth/verify" element={<VerifyPage />} />
    <Route element={<RoleGuard role="client" />}>
      <Route path="/onboarding/broker" element={<BrokerOnboardingPage />} />
      <Route element={<AppShell />}>
        <Route path="/client/settings" element={<ClientSettingsPage />} />
        <Route element={<BrokerReadyGuard />}>
          <Route path="/client/dashboard" element={<ClientDashboardPage />} />
          <Route path="/client/strategies" element={<ClientDashboardPage subscriptions />} />
          <Route path="/client/notifications" element={<ClientNotificationsPage />} />
        </Route>
      </Route>
    </Route>
  </Routes></Suspense>;
}
