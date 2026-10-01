import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { invariant } from '../../shared/errors.js';
import { object } from '../../shared/http-client.js';

export interface RawHeadline { title: string; summary: string; url: string; publishedAt: string; publisher: string; category?: string; symbol?: string; isin?: string }

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
/** Plain text only: tags, CDATA markers and entities are removed; nothing from a feed is rendered as HTML. */
const decode = (text: string) => text.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
  const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : e.startsWith('#') ? Number(e.slice(1)) : NaN;
  return Number.isFinite(code) ? code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '' : entities[e.toLowerCase()] ?? m;
});
export function plain(value: unknown, max = 600) {
  // Feeds often entity-encode their HTML (Google News): decode before stripping tags, and strip again after.
  let text = String(value ?? '').replace(/<!\[CDATA\[|\]\]>/g, '');
  for (let i = 0; i < 2; i++) text = decode(text.replace(/<[^>]*>/g, ' '));
  // An unfinished tag (text cut mid-tag) is removed too.
  return text.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** Price/quote pages and comparison widgets from aggregators are not news. */
export const NOT_NEWS = /\bcompare\b.{0,80}\bwith\b|share price.{0,40}(forecast|live quotes|today)|stock price (today|live)|nse\/bse forecast|technical analysis|price target \d{4}|trading window clos/i;
export function safeLink(value: unknown) {
  try { const url = new URL(plain(value, 2000)); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href.replace(/^http:/, 'https:') : null; } catch { return null; }
}
/** A stable identity per story: the canonical link, so the same article from two feeds is stored once. */
export const headlineId = (url: string) => createHash('sha256').update(url.replace(/[?#].*$/, '').toLowerCase()).digest('hex').slice(0, 24);
/** Second-level dedupe across outlets/aggregators that rewrite links. */
export const titleKey = (title: string) => createHash('sha256').update(title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex').slice(0, 24);

// CDATA merges into the text value; entities are decoded by plain(), never by the XML parser.
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false, trimValues: true });
export function parseRss(xml: string, publisher: string, now = Date.now()): RawHeadline[] {
  const channel = object(object(object(parser.parse(xml)).rss).channel);
  invariant(Object.keys(channel).length, `${publisher} feed is not RSS`);
  const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
  return items.flatMap(raw => {
    const r = object(raw), url = safeLink(r.link ?? r.guid), title = plain(r.title, 300), at = Date.parse(plain(r.pubDate, 100));
    // Undated or future-dated stories are dropped; never backdate or invent a publication time.
    if (!url || !title || !Number.isFinite(at) || at > now + 10 * 60_000) return [];
    const source = object(r.source), outlet = plain(source['#text'] ?? r.source, 80);
    // Google News appends " - Publisher" to titles; keep the real outlet as the publisher.
    const cleanTitle = outlet && title.endsWith(` - ${outlet}`) ? title.slice(0, -outlet.length - 3) : title;
    if (NOT_NEWS.test(cleanTitle)) return [];
    const summary = plain(r.description, 600);
    // Aggregator descriptions only repeat the headline and outlet.
    const useful = summary && !summary.startsWith(cleanTitle.slice(0, 40)) ? summary : '';
    return [{ title: cleanTitle, summary: useful, url, publishedAt: new Date(at).toISOString(), publisher: outlet || publisher }];
  });
}

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function nseTime(value: unknown) {
  const m = /^(\d{1,2})-([a-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/i.exec(String(value ?? '').trim());
  if (!m) return null;
  const month = months.indexOf(m[2].toLowerCase()) + 1;
  const at = Date.parse(`${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4]}:${m[5]}:${m[6]}+05:30`);
  return month && Number.isFinite(at) ? new Date(at).toISOString() : null;
}
/** NSE's market-wide announcement list: already tied to a company by symbol and ISIN. */
export function parseNseAnnouncements(payload: unknown, now = Date.now()): RawHeadline[] {
  invariant(Array.isArray(payload), 'NSE announcements format changed');
  return payload.flatMap(raw => {
    const r = object(raw), at = nseTime(r.an_dt ?? r.sort_date), category = plain(r.desc, 160), company = plain(r.sm_name, 160);
    const url = safeLink(r.attchmntFile) ?? 'https://www.nseindia.com/companies-listing/corporate-filings-announcements';
    if (!at || Date.parse(at) > now + 10 * 60_000 || !r.symbol || !category) return [];
    return [{ title: `${company || r.symbol}: ${category}`, summary: plain(r.attchmntText, 600), url, publishedAt: at, publisher: 'NSE filing', category, symbol: String(r.symbol), isin: plain(r.sm_isin, 12) || undefined }];
  });
}
