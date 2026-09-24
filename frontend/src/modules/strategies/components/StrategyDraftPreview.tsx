import { Collapse, Empty, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, SafetyOutlined } from '@ant-design/icons';
import { summarizeCondition } from '../../qualification/utils/ruleSummary';
import { horizonLabels } from '../../qualification/config/metrics';
import { money } from '../../backtesting/config/backtestDefaults';
import type { RuleDefinition } from '../../qualification/types';
import type { TradingPlanDraft } from '../types/tradingPlan';

function TradeSide({ rule }: { rule: RuleDefinition }) {
  const buy = rule.side === 'BUY';
  return <section className={`strategy-side ${buy ? 'buy' : 'sell'}`} aria-label={buy ? 'Buy rules' : 'Sell rules'}>
    <header><span className="strategy-side-icon">{buy ? <ArrowUpOutlined /> : <ArrowDownOutlined />}</span><div><h3>{buy ? 'Buy to enter' : 'Sell to exit'}</h3><p>{buy ? 'Open a long position when conditions match' : 'Close held shares; does not open a short'}</p></div><Tag color={buy ? 'green' : 'red'}>{rule.side}</Tag></header>
    {rule.groups.length > 1 && <div className="strategy-logic">{rule.logic === 'AND' ? 'Match all groups (AND)' : 'Match any group (OR)'}</div>}
    {rule.groups.map((group, index) => <div className="strategy-condition-set" key={index}><span>{group.logic === 'AND' ? 'ALL conditions' : 'ANY condition'} <small>({group.logic})</small></span><ul>{group.conditions.map((condition, i) => <li key={i}>{summarizeCondition(condition)}</li>)}</ul></div>)}
  </section>;
}
export function StrategyDraftPreview({ draft, changed, saved }: { draft?: TradingPlanDraft; changed: boolean; saved: boolean }) {
  if (!draft) return <div className="strategy-draft-empty"><div className="strategy-empty-flow"><span>BUY</span><i>→</i><span>HOLD</span><i>→</i><span>SELL</span></div><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Your strategy will take shape here" /><p>Describe your strategy in chat. Review the entry, exit and risk settings together before saving.</p></div>;
  const { risk } = draft;
  return <><div className="strategy-draft-title"><div><span className="strategy-eyebrow">{changed ? 'DRAFT FOR REVIEW' : 'SAVED STRATEGY'}</span><h2>{draft.name}</h2></div><Tag color={changed ? 'gold' : 'green'}>{changed ? saved ? 'Unsaved changes' : 'Not saved' : 'Saved'}</Tag></div>
    <div className="strategy-draft-meta"><Tag>{horizonLabels[draft.entry.horizon]}</Tag><span>{risk.timeframe === '1d' ? 'Daily execution' : `${risk.timeframe} execution`}</span><span>Long only</span></div>
    <TradeSide rule={draft.entry} /><TradeSide rule={draft.exit} />
    <section className="strategy-risk" aria-label="Strategy risk settings"><header><SafetyOutlined /><h3>Risk & protective exits</h3></header><div className="strategy-risk-grid"><div><span>Risk per trade</span><strong>{risk.riskPercent}% <small>of equity</small></strong></div><div><span>Open positions</span><strong>{risk.maxPositions} <small>maximum</small></strong></div><div><span>Stop loss</span><strong>{risk.stopMode === 'ATR' ? `ATR(${risk.atrPeriod}) × ${risk.atrMultiplier}` : `${risk.stopPercent}% ${risk.stopMode}`}</strong></div><div><span>Profit target</span><strong>{risk.targetR}R</strong></div></div><p>First applicable exit wins: sell condition, stop, target{risk.overnight ? '.' : ', or 15:15 IST session close.'} {risk.overnight ? 'Overnight holding allowed.' : 'No overnight positions.'}</p>
      <Collapse ghost size="small" items={[{ key: 'assumptions', label: 'Capital, costs & execution assumptions', children: <dl className="strategy-assumptions"><dt>Initial capital</dt><dd>{money(risk.initialCapital)}</dd><dt>Slippage / side</dt><dd>{risk.slippagePercent}%</dd><dt>Estimated fees / side</dt><dd>{risk.feePercent}%</dd><dt>Execution</dt><dd>Closed candles · next available bar</dd><dt>Stock pool</dt><dd>Current monthly qualified list, including custom additions</dd></dl> }]} />
    </section></>;
}
