import type { RuleDefinition } from '../../qualification/types';
import type { StrategyRisk } from '../schemas/tradingPlanSchema';
import type { AiQuestion } from '../../../services/aiAssistant';

export interface TradingPlanDraft {
  name: string;
  entry: RuleDefinition;
  exit: RuleDefinition;
  risk: StrategyRisk;
}
export interface TradingPlan {
  id: string;
  name: string;
  entryRuleId: string;
  exitRuleId: string;
  risk: StrategyRisk;
  updatedAt: string;
  needsReview?: boolean;
}
export interface StrategyMessage { id: string; role: 'user' | 'assistant'; text: string; questions?: AiQuestion[]; blockers?: string[]; assumptions?: string[]; explanationOnly?: boolean }
