import { Navigate, useSearchParams } from 'react-router-dom';

export function BacktestRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (next.get('tab') === 'history') next.set('view', 'history');
  next.set('tab', 'backtests');
  return <Navigate to={`/strategies?${next}`} replace />;
}
