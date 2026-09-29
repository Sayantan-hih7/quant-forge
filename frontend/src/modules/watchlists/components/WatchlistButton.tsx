import { App, Button, Tooltip } from 'antd';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useStockActions, type ActionStock } from '../hooks/useStockActions';

export function WatchlistButton({ stock, onChanged }: { stock: ActionStock; onChanged?: () => void }) {
  const { watchlists, pending, toggle } = useStockActions();
  const { message } = App.useApp();
  const saved = watchlists?.lists[0]?.ids.includes(stock._id) ?? false;
  const label = saved ? `Remove ${stock.symbol} from watchlist` : `Add ${stock.symbol} to watchlist`;
  return <Tooltip title={label}><Button size="small" type="text" aria-label={label} aria-pressed={saved}
    style={saved ? { color: 'var(--primary)' } : undefined} icon={saved ? <StarFilled /> : <StarOutlined />}
    disabled={!watchlists || stock.active === false && !saved} loading={pending.includes(stock._id)}
    onClick={async () => { try { await toggle(stock); onChanged?.(); } catch (error) { message.error((error as Error).message); } }} /></Tooltip>;
}
