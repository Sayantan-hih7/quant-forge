export interface Company { isin: string; symbol: string; name: string }
export interface CompanyMatch { isin: string; symbol: string; name: string; confidence: number; method: 'filing' | 'name' | 'alias' | 'symbol' | 'ai' }

// Legal suffixes say nothing about identity.
const LEGAL = new Set(['ltd', 'limited', 'pvt', 'private', 'plc', 'inc', 'the', 'co', 'company', 'corp']);
// Generic trailing words: "Reliance Industries" may appear as "Reliance", but only when that is unambiguous.
const GENERIC = new Set(['industries', 'industry', 'india', 'indian', 'enterprises', 'enterprise', 'corporation', 'services', 'holdings', 'group', 'international', 'global',
  'products', 'solutions', 'technologies', 'technology', 'systems', 'ventures', 'infra', 'infrastructure', 'projects', 'and', 'of', 'national']);
// Single words that are too common in headlines to identify a company on their own.
const COMMON = new Set(['india', 'indian', 'bank', 'power', 'steel', 'gold', 'energy', 'finance', 'capital', 'global', 'future', 'value', 'prime', 'united', 'best',
  'apollo', 'premier', 'royal', 'super', 'smart', 'quality', 'market', 'markets', 'stock', 'stocks', 'share', 'shares', 'sensex', 'nifty', 'oil', 'gas', 'cement',
  'textiles', 'motors', 'auto', 'pharma', 'health', 'healthcare', 'insurance', 'housing', 'realty', 'media', 'foods', 'chemicals', 'metals', 'mining', 'paper',
  'sugar', 'tea', 'coffee', 'glass', 'agro', 'green', 'solar', 'wind', 'water', 'digital', 'data', 'network', 'logistics', 'shipping', 'airlines', 'aviation',
  'hotels', 'hospital', 'hospitals', 'labs', 'life', 'sciences', 'electric', 'electricals', 'cables', 'tubes', 'pipes', 'polymers', 'plastics', 'paints', 'tyres',
  'bharat', 'hindustan', 'tata', 'adani', 'reliance', 'birla', 'mahindra', 'bajaj', 'jindal', 'godrej', 'shree', 'sri', 'jai', 'om', 'new', 'first', 'one',
  'star', 'sun', 'moon', 'swan', 'eagle', 'tiger', 'lion', 'diamond', 'pearl', 'ruby', 'silver', 'crystal', 'unity', 'trust', 'wealth', 'money', 'credit', 'gujarat',
  'maharashtra', 'kerala', 'punjab', 'bengal', 'delhi', 'mumbai', 'chennai', 'kolkata', 'hyderabad', 'bangalore', 'karnataka', 'rajasthan', 'orient', 'eastern',
  'western', 'southern', 'northern', 'central', 'ultra', 'mega', 'modern', 'standard', 'general', 'universal', 'supreme', 'excel', 'advance', 'vision', 'focus']);
// Symbols that are ordinary words or acronyms used for other things in headlines.
const SYMBOL_STOP = new Set(['IT', 'ON', 'ALL', 'BEST', 'GOOD', 'IDEA', 'ONE', 'NEW', 'CEO', 'IPO', 'GDP', 'RBI', 'FII', 'DII', 'SEBI', 'NSE', 'BSE', 'US', 'UK',
  'EU', 'AI', 'EV', 'FY', 'Q1', 'Q2', 'Q3', 'Q4', 'OIL', 'GOLD', 'STAR', 'SUN', 'TIPS', 'ACE', 'HIGH', 'LOW', 'JUST', 'NOW', 'OK', 'MAX', 'POWER', 'ETF', 'NAV',
  'EPS', 'PAT', 'YOY', 'QOQ', 'MSCI', 'FTSE', 'IMF', 'GST', 'CPI', 'WPI', 'PMI', 'OPEC', 'CEA', 'MD', 'CFO', 'COO', 'AGM', 'EGM', 'NCLT', 'NCLAT', 'SAT', 'CCI', 'RIL']);

const NICKNAMES: [string, string][] = [
  ['RIL', 'RELIANCE'], ['Reliance Industries', 'RELIANCE'], ['SBI', 'SBIN'], ['State Bank', 'SBIN'], ['HUL', 'HINDUNILVR'], ['L&T', 'LT'], ['Larsen', 'LT'],
  ['M&M', 'M&M'], ['Mahindra & Mahindra', 'M&M'], ['Airtel', 'BHARTIARTL'], ['Bharti Airtel', 'BHARTIARTL'], ['Maruti', 'MARUTI'], ['Maruti Suzuki', 'MARUTI'],
  ['Zomato', 'ETERNAL'], ['IndiGo', 'INDIGO'], ['InterGlobe', 'INDIGO'], ['LIC', 'LICI'], ['Paytm', 'PAYTM'], ['Nykaa', 'NYKAA'],
  ['PB Fintech', 'POLICYBZR'], ['Policybazaar', 'POLICYBZR'], ['Kotak Bank', 'KOTAKBANK'], ['Kotak Mahindra Bank', 'KOTAKBANK'], ['Axis Bank', 'AXISBANK'],
  ['HDFC Bank', 'HDFCBANK'], ['ICICI Bank', 'ICICIBANK'], ['Infosys', 'INFY'], ['Wipro', 'WIPRO'], ['HCLTech', 'HCLTECH'], ['HCL Tech', 'HCLTECH'],
  ['Tech Mahindra', 'TECHM'], ['Bajaj Finance', 'BAJFINANCE'], ['Bajaj Finserv', 'BAJAJFINSV'], ['Asian Paints', 'ASIANPAINT'], ['Sun Pharma', 'SUNPHARMA'],
  ['Dr Reddy', 'DRREDDY'], ["Dr Reddy's", 'DRREDDY'], ['Tata Motors', 'TATAMOTORS'], ['Tata Steel', 'TATASTEEL'], ['Tata Power', 'TATAPOWER'],
  ['Adani Enterprises', 'ADANIENT'], ['Adani Ports', 'ADANIPORTS'], ['Adani Green', 'ADANIGREEN'], ['Adani Power', 'ADANIPOWER'], ['Vedanta', 'VEDL'],
  ['Hindalco', 'HINDALCO'], ['JSW Steel', 'JSWSTEEL'], ['UltraTech', 'ULTRACEMCO'], ['Nestle India', 'NESTLEIND'], ['Titan', 'TITAN'], ['Trent', 'TRENT'],
  ['Coal India', 'COALINDIA'], ['Power Grid', 'POWERGRID'], ['Hero MotoCorp', 'HEROMOTOCO'], ['Eicher', 'EICHERMOT'], ['Vodafone Idea', 'IDEA'],
  ['Yes Bank', 'YESBANK'], ['IndusInd Bank', 'INDUSINDBK'], ['Jio Financial', 'JIOFIN'], ['HAL', 'HAL'], ['BEL', 'BEL'], ['BHEL', 'BHEL'], ['IRCTC', 'IRCTC'],
];
const NICKNAME_KEYS = new Set(NICKNAMES.map(([nickname]) => nickname.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()));
export const normalize = (value: string) => value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (value: string) => normalize(value).split(' ').filter(Boolean);

export interface AliasIndex { aliases: Map<string, { company: Company; confidence: number; method: CompanyMatch['method'] }>; symbols: Map<string, Company>; maxWords: number }
export function buildAliasIndex(companies: Company[]): AliasIndex {
  const candidates = new Map<string, { company: Company; confidence: number; method: CompanyMatch['method'] }[]>();
  const add = (alias: string, company: Company, confidence: number, method: CompanyMatch['method']) => {
    if (!alias) return;
    const list = candidates.get(alias) ?? []; if (!list.some(x => x.company.isin === company.isin)) list.push({ company, confidence, method }); candidates.set(alias, list);
  };
  for (const company of companies) {
    const core = words(company.name).filter(w => !LEGAL.has(w));
    if (!core.length) continue;
    const full = core.join(' ');
    // Full legal names of one word must still be distinctive (e.g. "Infosys", not "Power").
    if (core.length > 1 || core[0].length >= 4 && !COMMON.has(core[0])) add(full, company, 0.95, 'name');
    const short = [...core]; while (short.length > 1 && GENERIC.has(short.at(-1)!)) short.pop();
    const shortAlias = short.join(' ');
    // A one-word short name ("Zydus", "Polycab") is weaker evidence than a full name.
    if (shortAlias !== full && (short.length > 1 || short[0].length >= 5 && !COMMON.has(short[0]))) add(shortAlias, company, short.length > 1 ? 0.8 : 0.65, 'alias');
  }
  const aliases = new Map<string, { company: Company; confidence: number; method: CompanyMatch['method'] }>();
  // An alias shared by two companies ("Apollo", "Reliance") identifies neither.
  for (const [alias, list] of candidates) if (list.length === 1) aliases.set(alias, list[0]);
  // Newsroom nicknames for heavily covered companies, resolved by exchange symbol.
  const bySymbol = new Map(companies.map(c => [c.symbol, c]));
  for (const [nickname, symbol] of NICKNAMES) { const company = bySymbol.get(symbol); if (company) aliases.set(normalize(nickname), { company, confidence: 0.85, method: 'alias' }); }
  const symbolCount = new Map<string, number>();
  for (const c of companies) symbolCount.set(c.symbol, (symbolCount.get(c.symbol) ?? 0) + 1);
  const symbols = new Map(companies.filter(c => c.symbol.length >= 3 && /^[A-Z][A-Z0-9&]+$/.test(c.symbol) && !SYMBOL_STOP.has(c.symbol) && symbolCount.get(c.symbol) === 1).map(c => [c.symbol, c]));
  return { aliases, symbols, maxWords: Math.max(1, ...[...aliases.keys()].map(a => a.split(' ').length)) };
}

/** Companies named in a headline/summary. Longest match wins, so "Tata Motors" never also matches "Tata". */
export function linkCompanies(index: AliasIndex, title: string, summary = ''): CompanyMatch[] {
  const found = new Map<string, CompanyMatch>();
  const keep = (match: CompanyMatch) => { const old = found.get(match.isin); if (!old || old.confidence < match.confidence) found.set(match.isin, match); };
  for (const [text, weight] of [[title, 1], [summary, 0.9]] as const) {
    const raw = text.replace(/&/g, ' and ').split(/[^A-Za-z0-9]+/).filter(Boolean);
    const tokens = raw.map(t => t.toLowerCase());
    for (let i = 0; i < tokens.length; i++) {
      for (let n = Math.min(index.maxWords, tokens.length - i); n >= 1; n--) {
        const hit = index.aliases.get(tokens.slice(i, i + n).join(' '));
        // A single word only names a company when written as a name (capitalised), so "storage" never matches "Storage Technologies".
        if (hit && n === 1 && !/^[A-Z]/.test(raw[i])) continue;
        // Shortened one-word names count only in the headline; summaries Title-Case ordinary words ("Energy Storage System").
        if (hit && n === 1 && hit.method === 'alias' && weight < 1 && !NICKNAME_KEYS.has(tokens[i])) continue;
        if (hit) { keep({ ...hit.company, confidence: Math.round(hit.confidence * weight * 100) / 100, method: hit.method }); i += n - 1; break; }
      }
    }
    // Ticker symbols only count when written in capitals, as tickers are in headlines.
    for (const token of text.match(/\b[A-Z][A-Z0-9&]{2,}\b/g) ?? []) {
      const company = index.symbols.get(token);
      if (company) keep({ ...company, confidence: Math.round(0.7 * weight * 100) / 100, method: 'symbol' });
    }
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}
/** Names the AI extracted, resolved through the same alias index (no fuzzy guessing). */
export function resolveNames(index: AliasIndex, names: string[]): CompanyMatch[] {
  return names.flatMap(name => {
    const key = words(name).filter(w => !LEGAL.has(w)).join(' ');
    const hit = index.aliases.get(key);
    const symbol = index.symbols.get(name.trim().toUpperCase());
    const company = hit?.company ?? symbol;
    return company ? [{ ...company, confidence: 0.75, method: 'ai' as const }] : [];
  });
}
