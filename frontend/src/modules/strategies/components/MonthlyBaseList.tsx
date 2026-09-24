import { PlusOutlined, DatabaseOutlined, CheckCircleFilled } from '@ant-design/icons';
import { Button } from 'antd';
import type { MonthlyBase } from '../types/workspace';
import { formatMonth } from '../utils/monthlyCycle';

export function MonthlyBaseList({ bases, selectedId, onSelect, onCreate }: {
  bases: MonthlyBase[]; selectedId: string; onSelect: (id: string) => void; onCreate: () => void;
}) {
  return <aside className="monthly-base-list" aria-label="Monthly bases">
    <header><h2>Monthly bases</h2><span>{bases.length}</span></header>
    <p className="base-list-description">A saved stock universe for each base rule.</p>
    <div className="base-list-items">{bases.map((base, index) => (
      <button key={base.id} className={`monthly-base-option ${base.id === selectedId ? 'selected' : ''}`}
        onClick={() => onSelect(base.id)} aria-pressed={base.id === selectedId} aria-label={`Select ${base.name}`}>
        <div className="base-option-top"><span>BASE {String(index + 1).padStart(2, '0')}</span>{base.id === selectedId && <CheckCircleFilled />}</div>
        <strong>{base.name}</strong>
        <div className="base-option-count"><DatabaseOutlined /> {base.current.stocks.length} stocks <span>{base.layers.length} layers</span></div>
        <small>{formatMonth(base.current.month, true)} · v{base.current.version}{base.plannedRules ? ' · Update planned' : ''}</small>
      </button>
    ))}</div>
    <Button block type="dashed" icon={<PlusOutlined />} onClick={onCreate}>New monthly base</Button>
    <div className="base-list-note"><span className="status-dot" /> Saved on this device<p>Your base lists and trading layers stay available when you return.</p></div>
  </aside>;
}
