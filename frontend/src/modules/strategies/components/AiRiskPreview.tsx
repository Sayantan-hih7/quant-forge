import { Tag } from 'antd';
import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import type { AiExample } from '../../../services/aiAssistant';
import { riskNarrative } from '../utils/riskNarrative';
import { RiskExampleOutcome } from './RiskExampleCalculator';
import { FixedPriceNotice } from './FixedPriceNotice';

export function AiRiskPreview({ risk, before, example, proposed = true }: { risk: StrategyRisk; before: StrategyRisk; example?: AiExample | null; proposed?: boolean }) {
  const previous = riskNarrative(before);
  return <section aria-label="Risk plan in plain language" className="ai-risk-preview">
    <h3>{proposed ? 'Your proposed trade plan' : 'Your current trade plan'}</h3>
    <p className="muted">Read this in the order a trade happens. {proposed ? 'Changed settings are highlighted before you apply.' : 'Describe what you would change or ask the assistant to explain a part.'}</p>
    <ol>{riskNarrative(risk).map((row, i) => <li key={row.key} className={proposed && row.text !== previous[i].text ? 'changed' : ''}>
      <div><strong>{row.title}</strong>{proposed && row.text !== previous[i].text && <Tag color="blue">Changed</Tag>}</div>
      <p>{row.text}</p>{proposed && row.text !== previous[i].text && <details><summary>Previously</summary><p>{previous[i].text}</p></details>}
    </li>)}</ol>
    <FixedPriceNotice risk={risk} />
    {example?.entry && <div className="risk-example"><h4>Your example, calculated</h4><p className="muted">Preview only. These numbers do not set your buy price.</p><RiskExampleOutcome risk={risk} entry={example.entry} atr={example.atr} /></div>}
    <p className="strategy-footnote">Sell rules or the active stop can close remaining shares before all targets. Protective targets and stops run automatically in both paper execution modes. Backtest before starting a new monitoring session.</p>
    <p className="strategy-footnote">The assistant checks supported settings, not current stock prices or downloaded history. Your backtest and monitoring setup check the data available for the selected stocks.</p>
  </section>;
}
