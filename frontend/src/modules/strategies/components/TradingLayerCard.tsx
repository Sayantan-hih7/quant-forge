import { App, Button, Dropdown, Tag } from 'antd';
import { MoreOutlined, PlayCircleOutlined, PauseCircleOutlined, EditOutlined, ThunderboltOutlined, CalendarOutlined, LineChartOutlined, ArrowRightOutlined } from '@ant-design/icons';
import type { MonthlyBase, TradingLayer } from '../types/workspace';
import { cadenceLabels, horizonLabels } from '../config/tradingTemplates';

export function TradingLayerCard({ layer, base, onEdit, onToggle, onQualify, onEvaluate, onRemove, onViewWatchlist, onViewMatches }: {
  layer: TradingLayer; base: MonthlyBase; onEdit: () => void; onToggle: () => void;
  onQualify: () => void; onEvaluate: () => void; onRemove: () => void;
  onViewWatchlist: () => void; onViewMatches: () => void;
}) {
  const { modal } = App.useApp();
  const active = layer.status === 'active';
  const hasWatchlist = layer.watchlist?.snapshotId === base.current.id;
  const hasResults = hasWatchlist && !!layer.evaluation && layer.evaluation.snapshotId === base.current.id && layer.evaluation.watchlistId === layer.watchlist?.id;
  const icon = layer.horizon === 'intraday' ? <ThunderboltOutlined /> : layer.horizon === 'short-term' ? <LineChartOutlined /> : <CalendarOutlined />;
  return <article className={`trading-layer-card ${!active ? 'layer-paused' : ''}`}>
    <div className="trading-layer-heading">
      <span className={`horizon-icon ${layer.horizon}`}>{icon}</span>
      <div><div className="layer-name-line"><h3>{layer.name}</h3><Tag>{horizonLabels[layer.horizon]}</Tag></div>
        <p>{layer.mode === 'PAPER' ? 'Paper trading' : 'Simulated live'} <span>·</span> <span className={active ? 'positive' : 'muted'}>{active ? 'Active' : 'Paused'}</span></p>
      </div>
      <Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: 'Edit / replace strategy' }, { key: 'remove', label: 'Remove trading layer', danger: true }], onClick: ({ key }) => key === 'edit' ? onEdit() : modal.confirm({ title: `Remove ${layer.name}?`, content: 'This removes the trading layer and its watchlist. Your monthly stock universe stays saved.', okText: 'Remove layer', okButtonProps: { danger: true }, onOk: onRemove }) }}>
        <Button type="text" aria-label={`Options for ${layer.name}`} icon={<MoreOutlined />} />
      </Dropdown>
    </div>
    <div className="layer-stage">
      <div className="layer-stage-heading"><strong>02 · QUALIFICATION RULE</strong><span>{cadenceLabels[layer.qualificationCadence]} review</span></div>
      <p>{layer.qualificationRule}</p>
    </div>
    <div className="layer-stage signal-stage">
      <div className="layer-stage-heading"><strong>03 · SIGNAL TRIGGERS</strong><span>{layer.timeframe} candles</span></div>
      <div className="layer-rules"><p><span>ENTRY</span>{layer.entryRule}</p><p><span>EXIT</span>{layer.exitRule}</p></div>
    </div>
    <div className="layer-funnel" aria-label={`${layer.name} qualification flow`}>
      <div><strong>{base.current.stocks.length}</strong><span>base stocks</span></div><ArrowRightOutlined />
      <button onClick={onViewWatchlist} disabled={!hasWatchlist} aria-label={`View watchlist for ${layer.name}`}><strong>{hasWatchlist ? layer.watchlist!.symbols.length : '—'}</strong><span>watchlist</span></button><ArrowRightOutlined />
      <button onClick={onViewMatches} disabled={!hasResults} aria-label={`View signals for ${layer.name}`}><strong>{hasResults ? layer.evaluation!.matchedSymbols.length : '—'}</strong><span>demo signals</span></button>
    </div>
    <div className="layer-coverage"><span>Base snapshot v{base.current.version} · {hasWatchlist ? 'Watchlist saved' : 'Qualify a watchlist first'}</span>
      {hasResults && <span>Signals checked {new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(layer.evaluation!.evaluatedAt))} IST</span>}
    </div>
    <div className="layer-footer">
      <div className="layer-edit-actions"><Button size="small" aria-label={`Edit ${layer.name}`} icon={<EditOutlined />} onClick={onEdit}>Edit</Button><Button size="small" aria-label={`${active ? 'Pause' : 'Resume'} ${layer.name}`} icon={active ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={onToggle}>{active ? 'Pause' : 'Resume'}</Button></div>
      <div><Button size="small" disabled={!active || !base.current.stocks.length} onClick={onQualify}>Refresh watchlist</Button><Button size="small" type="primary" disabled={!active || !hasWatchlist || !layer.watchlist?.symbols.length} onClick={onEvaluate}>Check signals</Button></div>
    </div>
  </article>;
}
