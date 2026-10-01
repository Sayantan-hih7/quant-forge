import type { NewsCompany, NewsItem } from './news.model.js';

const DAY = 86_400_000;
export const NEWS_FIELDS = ['newsSentiment7d', 'newsSentiment30d', 'newsCount7d', 'newsPositive30d', 'newsNegative30d', 'newsMood7d'] as const;
/** Per-company impact of one story: the AI's company score when it gave one, otherwise the story score. */
export function companyImpact(item: Pick<NewsItem, 'sentiment' | 'kind' | 'companies'>, company: NewsCompany) {
  const score = company.sentiment ?? item.sentiment.score;
  // Market roundups and live blogs name many companies in passing; each one counts for much less.
  const confidence = company.confidence * (item.companies.length > 3 ? 0.5 : 1);
  return { score, confidence, weight: Math.max(0.1, item.sentiment.confidence) * confidence, directional: Math.abs(score) >= 0.2 };
}
/** Aggregates for one company from its linked stories (newest first, one entry per story). */
export function newsAggregates(items: Pick<NewsItem, 'sentiment' | 'kind' | 'publishedAt' | 'titleKey' | 'companies'>[], isin: string, now: number) {
  const seen = new Set<string>();
  let w7 = 0, s7 = 0, w30 = 0, s30 = 0, count7 = 0, positive = 0, negative = 0;
  for (const item of items) {
    if (seen.has(item.titleKey)) continue; seen.add(item.titleKey);
    const company = item.companies.find(c => c.isin === isin); if (!company) continue;
    const age = (now - Date.parse(item.publishedAt)) / DAY;
    if (age < 0 || age > 30) continue;
    const { score, weight, directional, confidence } = companyImpact(item, company);
    // Routine filings are not "news": they neither count as coverage nor dilute the average.
    if (item.kind === 'filing' && !directional) continue;
    const d30 = weight * Math.exp(-age / 10); w30 += d30; s30 += d30 * score;
    if (score >= 0.25 && confidence >= 0.6) positive++;
    if (score <= -0.25 && confidence >= 0.6) negative++;
    if (age <= 7) { const d7 = weight * Math.exp(-age / 3); w7 += d7; s7 += d7 * score; count7++; }
  }
  const s7v = w7 > 0 ? Math.round(s7 / w7 * 100) : null, s30v = w30 > 0 ? Math.round(s30 / w30 * 100) : null;
  return { newsSentiment7d: s7v, newsSentiment30d: s30v, newsCount7d: count7, newsPositive30d: positive, newsNegative30d: negative,
    newsMood7d: s7v === null ? 'No coverage' : s7v >= 20 ? 'Positive' : s7v <= -20 ? 'Negative' : 'Neutral' };
}

