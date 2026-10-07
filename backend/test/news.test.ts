import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNseAnnouncements, parseRss, plain, headlineId, titleKey } from '../src/modules/news/parsers.js';
import { buildAliasIndex, linkCompanies, resolveNames } from '../src/modules/news/linker.js';
import { lexiconScore } from '../src/modules/news/lexicon.js';
import { classifyBatch } from '../src/modules/news/classifier.js';
import { newsAggregates, newsQuickSummary } from '../src/modules/news/aggregates.js';

const now = Date.parse('2026-10-01T09:00:00Z');
const companies = [
  { isin: 'INE002A01018', symbol: 'RELIANCE', name: 'RELIANCE INDUSTRIES LTD' }, { isin: 'INE036D01028', symbol: 'RPOWER', name: 'RELIANCE POWER LTD.' },
  { isin: 'INE155A01022', symbol: 'TATAMOTORS', name: 'TATA MOTORS LIMITED' }, { isin: 'INE081A01020', symbol: 'TATASTEEL', name: 'TATA STEEL LIMITED' },
  { isin: 'INE009A01021', symbol: 'INFY', name: 'INFOSYS LIMITED' }, { isin: 'INE154A01025', symbol: 'ITC', name: 'ITC LTD' },
  { isin: 'INE437A01024', symbol: 'APOLLOHOSP', name: 'APOLLO HOSPITALS ENTERPRISE LTD' }, { isin: 'INE438A01022', symbol: 'APOLLOTYRE', name: 'APOLLO TYRES LTD' },
  { isin: 'INE062A01020', symbol: 'SBIN', name: 'STATE BANK OF INDIA' }, { isin: 'INE0RGM01016', symbol: 'STAL', name: 'Storage Technologies and' }, { isin: 'INE860A01027', symbol: 'HCLTECH', name: 'HCL TECHNOLOGIES LTD' },
];
const index = buildAliasIndex(companies);

test('RSS headlines are plain text with real publishers, and undated or future stories are dropped', () => {
  const xml = `<rss><channel><title>x</title>
    <item><title><![CDATA[Tata Motors Q2: profit jumps 20% &amp; beats estimates]]></title><link>https://www.cnbctv18.com/a.htm?utm=1</link><pubDate>Thu, 1 Oct 2026 14:19:04 +0530</pubDate><description><![CDATA[<p>Strong <b>JLR</b> volumes</p>]]></description></item>
    <item><title>Infosys wins deal - Mint</title><link>https://news.google.com/x</link><pubDate>Thu, 01 Oct 2026 04:27:00 GMT</pubDate><source url="https://mint">Mint</source></item>
    <item><title>No date</title><link>https://a.b/c</link></item>
    <item><title>Future</title><link>https://a.b/d</link><pubDate>Fri, 2 Oct 2026 14:19:04 +0530</pubDate></item>
  </channel></rss>`;
  const rows = parseRss(xml, 'CNBC-TV18', now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Tata Motors Q2: profit jumps 20% & beats estimates');
  assert.equal(rows[0].summary, 'Strong JLR volumes');
  assert.equal(rows[0].publishedAt, '2026-10-01T08:49:04.000Z');
  assert.deepEqual([rows[1].title, rows[1].publisher], ['Infosys wins deal', 'Mint']);
  assert.equal(headlineId('https://x.com/a?utm=1'), headlineId('https://X.com/a'));
  assert.equal(titleKey('Infosys wins deal!'), titleKey('infosys  wins deal'));
  assert.equal(plain('<script>alert(1)</script>Hi &#8217; &amp;'), 'alert(1) Hi ’ &');
  assert.equal(plain('&lt;a href=&quot;https://news.google.com/x&quot;&gt;Story&lt;/a&gt;&amp;nbsp;&lt;font&gt;Mint&lt;/font&gt;'), 'Story Mint', 'entity-encoded HTML never shows as tags');
  const junk = parseRss('<rss><channel><item><title>Compare Madhucon Projects with Revathi - Equitymaster</title><link>https://a.b/1</link><pubDate>Thu, 01 Oct 2026 04:27:00 GMT</pubDate><source url="x">Equitymaster</source></item><item><title>MADHUCON PROJECTS Stock/Share price , NSE/BSE Forecast News and Live Quotes</title><link>https://a.b/2</link><pubDate>Thu, 01 Oct 2026 04:27:00 GMT</pubDate></item></channel></rss>', 'Google News', now);
  assert.equal(junk.length, 0, 'quote pages and comparison widgets are not news');
});

test('NSE filings keep symbol, ISIN and category and use the exchange time', () => {
  const [row] = parseNseAnnouncements([{ an_dt: '01-Oct-2026 14:27:13', symbol: 'IOC', sm_isin: 'INE242A01010', sm_name: 'Indian Oil Corporation Limited', desc: 'Bagging/Receiving of orders/contracts', attchmntText: 'IOC has received an order', attchmntFile: 'https://nsearchives.nseindia.com/corporate/x.pdf' }], now);
  assert.deepEqual([row.symbol, row.isin, row.category, row.publishedAt, row.publisher], ['IOC', 'INE242A01010', 'Bagging/Receiving of orders/contracts', '2026-10-01T08:57:13.000Z', 'NSE filing']);
  assert.throws(() => parseNseAnnouncements({}));
});

test('stock linking prefers full names, never guesses shared names, and accepts newsroom nicknames', () => {
  const symbols = (title: string, summary = '') => linkCompanies(index, title, summary).map(m => m.symbol).sort();
  assert.deepEqual(symbols('Tata Motors shares jump after JLR sales'), ['TATAMOTORS']);
  assert.deepEqual(symbols('Tata group stocks in focus'), [], '"Tata" alone names no single company');
  assert.deepEqual(symbols('Apollo shares rally'), [], '"Apollo" is shared by two companies');
  assert.deepEqual(symbols('Apollo Hospitals Q2 results'), ['APOLLOHOSP']);
  assert.deepEqual(symbols('RIL and SBI lead gains; Infosys slips'), ['INFY', 'RELIANCE', 'SBIN']);
  assert.deepEqual(symbols('Reliance Power falls 5%'), ['RPOWER']);
  assert.deepEqual(symbols('ITC hotels demerger: what ITC shareholders get'), ['ITC']);
  assert.deepEqual(symbols('it is a good day'), [], 'lower-case words are not tickers');
  assert.deepEqual(symbols('Adani Green expands BESS', 'battery energy storage system capacity'), [], 'an ordinary word never names a truncated company');
  assert.deepEqual(symbols('Storage Technologies IPO subscribed'), ['STAL']);
  assert.deepEqual(resolveNames(index, ['HCLTech', 'Unknown Co', 'Infosys Ltd']).map(m => m.symbol).sort(), ['HCLTECH', 'INFY']);
});

test('keyword scoring reads direction from the headline and filing category', () => {
  assert.equal(lexiconScore('L&T bags order worth ₹5,000 crore').label, 'positive');
  assert.equal(lexiconScore('Paytm net loss widens in Q2').label, 'negative');
  assert.equal(lexiconScore('SEBI probe into company accounts').eventType, 'regulatory');
  assert.equal(lexiconScore('Board meeting on October 15').label, 'neutral');
  assert.equal(lexiconScore('Company update', '', 'Pendency of Litigation(s)/dispute(s)').label, 'negative');
  assert.ok(lexiconScore('X', 'net profit rises sharply').score < lexiconScore('Net profit rises sharply').score, 'summary words count half');
});

test('AI output is validated: unknown ids, out-of-range numbers and bad rows are dropped', async () => {
  const generate = async () => ({ items: [
    { id: 'a', score: 0.8, confidence: 0.9, eventType: 'orders', reason: 'Large order', companies: [{ name: 'Infosys', score: 0.8 }] },
    { id: 'b', score: 5, confidence: 2, eventType: 'weird', reason: 'x', companies: [{ name: '', score: 1 }] },
    { id: 'zzz', score: 0.1, confidence: 0.5, eventType: 'other', reason: '', companies: [] },
    { id: 'c', score: 'NaN', confidence: 0.5 },
  ] });
  const out = await classifyBatch([{ id: 'a', title: 't', summary: '', publisher: 'p', companies: [] }, { id: 'b', title: 't', summary: '', publisher: 'p', companies: [] }, { id: 'c', title: 't', summary: '', publisher: 'p', companies: [] }], generate);
  assert.deepEqual(out.map(x => [x.id, x.score, x.confidence, x.eventType, x.companies.length]), [['a', 0.8, 0.9, 'orders', 1], ['b', 1, 1, 'other', 0]]);
});

test('aggregates count each story once, skip routine filings and give explicit "no coverage"', () => {
  const isin = 'INE009A01021', at = (hours: number) => new Date(now - hours * 3600_000).toISOString();
  const story = (key: string, hours: number, score: number, kind: 'news' | 'filing' = 'news', confidence = 0.9) => ({ titleKey: key, kind, publishedAt: at(hours),
    sentiment: { score, label: 'neutral' as const, confidence: 0.8, method: 'ai' as const, eventType: 'other' as const, reason: '', scoredAt: at(0) },
    companies: [{ isin, symbol: 'INFY', name: 'Infosys', confidence, method: 'name' as const }] });
  const items = [story('a', 2, 0.8), story('a', 3, 0.8), story('b', 30, -0.6), story('c', 10, 0, 'filing'), story('d', 24 * 20, -0.5), story('e', 5, 0.9, 'news', 0.5)];
  const result = newsAggregates(items, isin, now);
  assert.equal(result.newsCount7d, 3, 'duplicate story and routine filing excluded');
  assert.equal(result.newsPositive30d, 1, 'low-confidence links never count as positive/negative');
  assert.equal(result.newsNegative30d, 2);
  assert.ok(result.newsSentiment7d! > 0 && result.newsSentiment7d! <= 100);
  assert.equal(result.newsMood7d, result.newsSentiment7d! >= 20 ? 'Positive' : 'Neutral');
  const roundup = { ...story('r', 1, -0.6), companies: ['A', 'B', 'C'].map(x => ({ isin: x, symbol: x, name: x, confidence: 0.95, method: 'name' as const })).concat(story('r', 1, -0.6).companies) };
  assert.equal(newsAggregates([roundup], isin, now).newsNegative30d, 0, 'a live blog naming many companies is not negative news for each');
  assert.deepEqual(newsAggregates([], isin, now), { newsSentiment7d: null, newsSentiment30d: null, newsCount7d: 0, newsPositive30d: 0, newsNegative30d: 0, newsMood7d: 'No coverage' });
});


test('quick news summary explains only eligible deduplicated company coverage',()=>{
 const item={_id:'1',titleKey:'profit',kind:'news',title:'Profit rises',url:'https://example.com/story',publisher:'Example',publishedAt:new Date(now-3600000).toISOString(),knownAt:new Date(now-3600000).toISOString(),companies:[{isin:'A',symbol:'A',name:'Company A',confidence:1,method:'name',sentiment:-0.6}],sentiment:{score:0.8,label:'positive',confidence:0.9,method:'ai',eventType:'results',reason:'Mixed results',scoredAt:new Date(now).toISOString()}} as Parameters<typeof newsQuickSummary>[0][number];
 const future={...item,_id:'future',titleKey:'future',knownAt:new Date(now+1000).toISOString()};
 const routine={...item,_id:'routine',titleKey:'routine',kind:'filing' as const,companies:[{...item.companies[0],sentiment:0}]};
 const summary=newsQuickSummary([item,{...item,_id:'duplicate'},future,routine], 'A',now);
 assert.equal(summary.score,-60);assert.equal(summary.label,'Negative');assert.equal(summary.count,1);assert.equal(summary.stories[0].score,-60);
 assert.equal(summary.aiCount,1);assert.equal(summary.stories[0].title,'Profit rises');
 assert.equal(newsQuickSummary([item],'B',now).score,null);
});
