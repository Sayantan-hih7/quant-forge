import { Space, Tag } from 'antd';
import type { PaperPosition } from '../hooks/useBackendPaper';

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export function PaperPositionTargets({ position }: { position: PaperPosition }) {
  if (!position.targets?.length) return <>{money(position.targetPaise)}</>;
  return <Space orientation="vertical" size={4}>{position.targets.map((target, index, targets) => {
    const remaining = Math.max(0, position.quantity - targets.slice(0, index).reduce((sum, t) => sum + (t.completed ? 0 : t.quantity), 0));
    const shares = target.completed ? 0 : index === targets.length - 1 ? remaining : Math.min(remaining, target.quantity);
    const status = target.completed ? target.filledQuantity ? `${target.filledQuantity} sold` : 'Rounded to later target'
      : `${shares} shares${index === targets.length - 1 ? ' · remainder' : ''}`;
    return <span key={index}><Tag color={target.completed ? 'green' : 'default'}>T{index + 1}</Tag>{money(target.pricePaise)} · {status}</span>;
  })}</Space>;
}
