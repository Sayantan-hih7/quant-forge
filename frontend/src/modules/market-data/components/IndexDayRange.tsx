import type { IndexQuote } from "../types/indices";
import { directionOf, indexNumber } from "../utils/indices";

export function IndexDayRange({ quote }: { quote: IndexQuote }) {
  if (quote.last === null || quote.high === null || quote.low === null) return <span className="index-data-empty">Not supplied</span>;
  const position =
    quote.high === quote.low
      ? 50
      : Math.max(
          0,
          Math.min(
            100,
            ((quote.last - quote.low) / (quote.high - quote.low)) * 100,
          ),
        );
  return (
    <div
      className="index-day-range"
      role="img"
      aria-label={`Day low ${indexNumber(quote.low)}, high ${indexNumber(quote.high)}, last ${indexNumber(quote.last)}`}
    >
      <div className="index-range-values">
        <span>
          <small>L</small> {indexNumber(quote.low)}
        </span>
        <span>
          <small>H</small> {indexNumber(quote.high)}
        </span>
      </div>
      <div className="index-range-track">
        <i
          className={`index-change--${directionOf(quote.change)}`}
          style={{ left: `${position}%` }}
        />
      </div>
    </div>
  );
}
