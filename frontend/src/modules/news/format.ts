import type { SentimentLabel } from './types';

export const sentimentText: Record<SentimentLabel, string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };
export const tone = (score: number): SentimentLabel => score >= 0.2 ? 'positive' : score <= -0.2 ? 'negative' : 'neutral';
export function relativeTime(at: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return new Date(at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}
