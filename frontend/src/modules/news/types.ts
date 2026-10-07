export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type NewsEventType = 'results' | 'orders' | 'corporate-action' | 'deal' | 'rating' | 'regulatory' | 'management' | 'legal' | 'guidance' | 'market-move' | 'macro' | 'other';
export interface NewsCompany { isin: string; symbol: string; name: string; confidence: number; method: 'filing' | 'name' | 'alias' | 'symbol' | 'ai'; sentiment?: number }
export interface NewsStory {
  _id: string; kind: 'news' | 'filing'; title: string; summary: string; url: string; publisher: string; category?: string;
  publishedAt: string; knownAt: string; companies: NewsCompany[];
  sentiment: { score: number; label: SentimentLabel; confidence: number; method: 'ai' | 'lexicon'; eventType: NewsEventType; reason: string; model?: string };
}
export interface NewsPage { items: NewsStory[]; total: number; page: number; pageSize: number }
export interface NewsSummary { newsSentiment7d: number | null; newsSentiment30d: number | null; newsCount7d: number; newsPositive30d: number; newsNegative30d: number; newsMood7d: 'Positive' | 'Neutral' | 'Negative' | 'No coverage' }
export interface StockNews { summary: NewsSummary; items: NewsStory[]; checkedAt: string; message?: string }
export interface NewsMover { instrumentId: string; isin: string; symbol: string; name: string; exchange: string; stories: number; score: number; positive: number; negative: number }
export interface NewsMovers { days: number; positive: NewsMover[]; negative: NewsMover[] }
export interface NewsSources { publishers?: string[]; sources: string[]; last24h: { _id: string; stories: number; latest: string }[]; lastRun: null | { status: string; startedAt: string; finishedAt?: string; failures: { item: string; message: string }[] } }
export const eventLabels: Record<NewsEventType, string> = {
  results: 'Results', orders: 'Orders & contracts', 'corporate-action': 'Corporate action', deal: 'Deal / stake', rating: 'Rating / target', regulatory: 'Regulatory',
  management: 'Management', legal: 'Legal', guidance: 'Business update', 'market-move': 'Price move', macro: 'Market / macro', other: 'Other',
};
