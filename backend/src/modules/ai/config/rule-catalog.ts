// This is the editable rule-builder contract, intersected with engine capabilities at request time.
type Field = { label: string; category: string; unit: string; series?: boolean; categorical?: boolean };
const field = (label: string, category: string, unit: string, series = false): Field => ({ label, category, unit, series });
export const monthlyCatalog: Record<string, Field> = {
  ema5: field('Monthly EMA 5', 'technical', 'price', true), ema21: field('Monthly EMA 21', 'technical', 'price', true),
  sma50: field('Monthly SMA 50', 'technical', 'price', true), sma200: field('Monthly SMA 200', 'technical', 'price', true),
  rsi: field('Monthly RSI 14', 'technical', 'points', true), macd: field('Monthly MACD', 'technical', 'price', true),
  macdSignal: field('Monthly MACD signal', 'technical', 'price', true),
  close: field('Monthly close', 'price-volume', 'price', true), priceChange: field('Monthly price change', 'price-volume', 'percent', true),
  volume: field('Monthly volume', 'price-volume', 'shares', true), avgVolume6: field('Six-month average volume', 'price-volume', 'shares', true),
  volumeRatio: field('Monthly volume ratio', 'price-volume', 'ratio', true), delivery: field('Monthly delivery percentage', 'price-volume', 'percent'),
  tradedValue: field('Monthly traded value', 'price-volume', 'crore'), marketCap: field('Market capitalization', 'fundamentals', 'crore'),
  pe: field('P/E', 'fundamentals', 'ratio'), roe: field('Return on equity', 'fundamentals', 'percent'),
  roce: field('Return on capital employed', 'fundamentals', 'percent'), debtEquity: field('Debt to equity', 'fundamentals', 'ratio'),
  pledge: field('Promoter pledge', 'ownership', 'percent'), promoterHolding: field('Promoter holding', 'ownership', 'percent'),
  fiiChange: field('FII holding change', 'ownership', 'percent'), diiChange: field('DII holding change', 'ownership', 'percent'),
  sector: { ...field('Sector', 'sector-market', 'category'), categorical: true },
  index: { ...field('Index membership', 'sector-market', 'category'), categorical: true },
};
const technicalFrames = ['1m', '5m', '15m', '4h', '1d', '1w', '1mo'];
export const tradingCatalog: Record<string, { unit: string; frames: string[] }> = {
  marketCap: { unit: 'crore', frames: ['latest'] }, turnover: { unit: 'crore', frames: ['1d'] },
  debtEquity: { unit: 'ratio', frames: ['latest'] }, pledge: { unit: 'percent', frames: ['latest'] }, roe: { unit: 'percent', frames: ['latest'] },
  close: { unit: 'price', frames: technicalFrames }, volume: { unit: 'shares', frames: technicalFrames },
  avgVolume20: { unit: 'shares', frames: ['1d'] }, ema5: { unit: 'price', frames: technicalFrames },
  ema20: { unit: 'price', frames: technicalFrames }, sma200: { unit: 'price', frames: technicalFrames },
  vwap: { unit: 'price', frames: ['1m', '5m', '15m', '1d'] }, rvol: { unit: 'ratio', frames: technicalFrames },
  rsi: { unit: 'RSI', frames: technicalFrames },
};
