/**
 * Public, credential-free headline feeds. Only headlines, short summaries and links are stored;
 * full articles stay with the publisher. Verified 2026-10-01 (Moneycontrol's RSS stopped in 2024;
 * Financial Express and Zee Business no longer publish one).
 */
export interface NewsSource { id: string; name: string; url: string; section: 'markets' | 'companies' | 'business' | 'latest' }
export const NEWS_SOURCES: NewsSource[] = [
  { id: 'cnbctv18-market', name: 'CNBC-TV18', section: 'markets', url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml' },
  { id: 'cnbctv18-business', name: 'CNBC-TV18', section: 'business', url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/business.xml' },
  { id: 'et-markets', name: 'Economic Times', section: 'markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { id: 'et-stocks', name: 'Economic Times', section: 'companies', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
  { id: 'bs-markets', name: 'Business Standard', section: 'markets', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { id: 'bs-companies', name: 'Business Standard', section: 'companies', url: 'https://www.business-standard.com/rss/companies-101.rss' },
  { id: 'mint-markets', name: 'Mint', section: 'markets', url: 'https://www.livemint.com/rss/markets' },
  { id: 'mint-companies', name: 'Mint', section: 'companies', url: 'https://www.livemint.com/rss/companies' },
  { id: 'hbl-markets', name: 'BusinessLine', section: 'markets', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
  { id: 'hbl-companies', name: 'BusinessLine', section: 'companies', url: 'https://www.thehindubusinessline.com/companies/feeder/default.rss' },
  { id: 'ndtvprofit', name: 'NDTV Profit', section: 'latest', url: 'https://feeds.feedburner.com/ndtvprofit-latest' },
];
export const NSE_ANNOUNCEMENTS = (day: string) => `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${day}&to_date=${day}`;
export const googleNewsUrl = (query: string) => `https://news.google.com/rss/search?${new URLSearchParams({ q: query, hl: 'en-IN', gl: 'IN', ceid: 'IN:en' })}`;
export const NEWS_HOSTS = new Set([...NEWS_SOURCES.map(s => new URL(s.url).hostname), 'www.nseindia.com', 'nsearchives.nseindia.com', 'news.google.com']);
