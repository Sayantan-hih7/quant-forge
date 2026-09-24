import type { IndexQuote } from '../types/indices';
import { indexNumber } from '../utils/indices';

export function IndexPrice({ quote, className = '' }: { quote: IndexQuote; className?: string }) {
  return <strong key={`${quote.last}:${quote.asOf}`} className={`${className} index-price${quote.tickDirection ? ` index-price--${quote.tickDirection}` : ''}`}>
    {indexNumber(quote.last)}
  </strong>;
}
