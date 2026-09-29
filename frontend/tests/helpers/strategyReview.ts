import type { Route } from '@playwright/test';
import { reviewStrategy } from '../../../backend/src/modules/strategies/services/rule-review.service.js';
import { ruleReviewRequestSchema } from '../../../backend/src/modules/strategies/validations/rule-review.validation.js';

/** Exercise the real, pure review logic without contacting a provider or writing user data. */
export function respondToStrategyReview(route: Route) {
  const result=ruleReviewRequestSchema.safeParse(route.request().postDataJSON());
  return result.success?route.fulfill({json:reviewStrategy(result.data)}):route.fulfill({status:422,json:{message:result.error.message}});
}
