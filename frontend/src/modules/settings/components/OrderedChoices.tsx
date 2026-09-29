import { Button } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined } from '@ant-design/icons';
export function OrderedChoices({ ids, labels, onChange, name }: { ids: string[]; labels: Record<string, string>; onChange: (ids: string[]) => void; name: string }) {
  function move(index: number, offset: number) { const next = [...ids]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next); }
  return <ol className="dashboard-ordered-choices" aria-label={name}>{ids.map((id, i) => <li key={id}><span className="dashboard-choice-number">{i + 1}</span><span>{labels[id] ?? 'Unavailable selection'}</span><div>
    <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} aria-label={`Move ${labels[id] ?? id} up`} onClick={() => move(i, -1)} />
    <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === ids.length - 1} aria-label={`Move ${labels[id] ?? id} down`} onClick={() => move(i, 1)} />
    <Button size="small" type="text" icon={<CloseOutlined />} aria-label={`Remove ${labels[id] ?? id}`} onClick={() => onChange(ids.filter(value => value !== id))} />
  </div></li>)}</ol>;
}
